import { randomUUID } from 'node:crypto';

const crisis = /hopeless|suicid|self.?harm|diagnos|medical advice|panic attack/i;
const datePattern = /20\d{2}-\d{2}-\d{2}/;
// Exclude digits embedded in an ISO date (for example, the “20” in 2026-09-10).
const hourPattern = /(?<![\d-])(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
function nextWeekday(day) { const names = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']; const wanted = names.indexOf(day.toLowerCase()); const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() + ((wanted - d.getDay() + 7) % 7 || 7)); return d.toISOString().slice(0,10); }
function parseDate(text) { const explicit = text.match(datePattern)?.[0]; if (explicit) return explicit; const weekday = text.match(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/i)?.[0]; return weekday ? nextWeekday(weekday) : null; }
function parseTime(text) { const m = text.match(hourPattern); if (!m) return null; let h = Number(m[1]); if (m[3]?.toLowerCase() === 'pm' && h < 12) h += 12; if (m[3]?.toLowerCase() === 'am' && h === 12) h = 0; return `${String(h).padStart(2,'0')}:${m[2] || '00'}`; }
export class CalendarGateway {
  constructor(store) { this.store = store; }
  available(date) { const occupied = new Set(this.store.bookings().filter(b => b.status !== 'cancelled' && b.startTime.startsWith(date)).map(b => b.startTime.slice(11,16))); return ['10:00','11:00','14:00','17:00','18:00'].filter(s => !occupied.has(s)); }
  createEvent(booking) { return `demo-cal-${booking.id}`; }
}
export class PaymentGateway { createLink(payment) { return `https://pay.sessionly.demo/${payment.id}`; } }
export function createAgent(store) {
  const calendar = new CalendarGateway(store), payments = new PaymentGateway();
  const tools = {
    checkAvailability(date) { return calendar.available(date); },
    createBooking(clientId, date, time) { if (!calendar.available(date).includes(time)) throw new Error('That time was just booked. Please select another slot.'); const booking = store.createBooking({ clientId, therapistId: store.dashboard().therapist.id, startTime: `${date}T${time}:00`, endTime: `${date}T${String(Number(time.slice(0,2)) + 1).padStart(2,'0')}${time.slice(2)}:00`, calendarEventId: `pending-${randomUUID()}` }); store.updateBooking(booking.id, { calendarEventId: calendar.createEvent(booking) }); return booking; },
    cancelBooking(clientId) { const b = store.bookings(clientId).find(x => x.status === 'confirmed'); return b && store.updateBooking(b.id, { status: 'cancelled' }); },
    rescheduleBooking(clientId, date, time) { const b = store.bookings(clientId).find(x => x.status === 'confirmed'); if (!b) return null; if (!calendar.available(date).includes(time)) throw new Error('That time is unavailable.'); return store.updateBooking(b.id, { startTime: `${date}T${time}:00`, endTime: `${date}T${String(Number(time.slice(0,2)) + 1).padStart(2,'0')}${time.slice(2)}:00`, status: 'confirmed' }); },
    createPaymentLink(bookingId) { const booking = store.booking(bookingId); if (!booking) throw new Error('Booking not found.'); const payment = store.createPayment({ bookingId, amount: store.dashboard().therapist.fee }); return store.createPayment ? store.createPayment : payment; },
    escalate(clientId) { store.setConversation(clientId, { escalated: true, state: 'ESCALATED' }); }
  };
  function reply(clientId, text) {
    store.message(clientId, 'user', text); const lower = text.toLowerCase();
    if (crisis.test(text)) { tools.escalate(clientId); return finish('I can help with scheduling and payments, but I can’t provide clinical support. I’ve notified your therapist so they can follow up.'); }
    if (/cancel/.test(lower)) { const b = tools.cancelBooking(clientId); return finish(b ? 'Your upcoming appointment has been cancelled.' : 'I could not find a confirmed upcoming appointment.'); }
    const date = parseDate(text), time = parseTime(text);
    if (/resched/.test(lower)) { if (!date || !time) return finish('Please share the new date and time, for example: reschedule to 2026-09-10 at 17:00.'); try { const b = tools.rescheduleBooking(clientId, date, time); return finish(b ? `Done — your appointment is now ${date} at ${time}.` : 'I could not find an appointment to reschedule.'); } catch (e) { return finish(e.message); } }
    const c = store.conversation(clientId);
    if (c.state === 'WAITING_TIME' && time && !date) {
      const selectedDate = c.pendingDate;
      try {
        tools.createBooking(clientId, selectedDate, time);
        store.setConversation(clientId, { state: 'START', pendingDate: null });
        return finish(`Confirmed: your session is booked for ${selectedDate} at ${time}.`);
      } catch (e) { return finish(e.message); }
    }
    if (/book|appoint|available|slot/.test(lower)) { if (!date) return finish('Which date works for you? You can say “Friday evening” or “2026-09-10”.'); const slots = tools.checkAvailability(date); if (!slots.length) return finish(`There are no slots available on ${date}. Please choose another day.`); if (!time || !slots.includes(time)) { store.setConversation(clientId, { state: 'WAITING_TIME', pendingDate: date }); return finish(`I have these times on ${date}: ${slots.join(', ')}. Reply with one (for example, “17:00”).`); } try { const b = tools.createBooking(clientId, date, time); store.setConversation(clientId, { state: 'START', pendingDate: null }); return finish(`Confirmed: your session is booked for ${date} at ${time}.`); } catch (e) { return finish(e.message); } }
    return finish('I can help book, reschedule, or cancel appointments, and send payment links. What would you like to do?');
    function finish(content) { store.message(clientId, 'assistant', content); return { content }; }
  }
  function paymentLink(bookingId) { const booking = store.booking(bookingId); if (!booking) throw new Error('Booking not found.'); const payment = store.createPayment({ bookingId, amount: store.dashboard().therapist.fee }); const link = payments.createLink(payment); store.createPayment; return { ...payment, link }; }
  return { reply, paymentLink };
}
