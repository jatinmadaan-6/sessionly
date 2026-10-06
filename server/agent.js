import { randomUUID } from 'node:crypto';

const safetyPattern = /hopeless|suicid|self.?harm|diagnos|medical advice|panic attack/i;
const datePattern = /20\d{2}-\d{2}-\d{2}/;
const hours = ['10:00', '11:00', '14:00', '17:00', '18:00'];
const hourPattern = /(?<![\d-])(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
function nextWeekday(day, now = new Date()) { const names = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']; const wanted = names.indexOf(day.toLowerCase()); const d = new Date(now); d.setHours(0,0,0,0); d.setDate(d.getDate() + ((wanted - d.getDay() + 7) % 7 || 7)); return d.toISOString().slice(0,10); }
function parseDate(text, now) { return text.match(datePattern)?.[0] || (text.match(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/i)?.[0] && nextWeekday(text.match(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/i)[0], now)); }
function parseTime(text) { const m = text.match(hourPattern); if (!m) return null; let h = Number(m[1]); if (m[3]?.toLowerCase() === 'pm' && h < 12) h += 12; if (m[3]?.toLowerCase() === 'am' && h === 12) h = 0; return `${String(h).padStart(2,'0')}:${m[2] || '00'}`; }
function slotEnd(time) { const [h,m] = time.split(':').map(Number); return `${String(h + 1).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }

/** Provider ports: real calendar/payment adapters can replace these free local implementations. */
export class CalendarGateway {
  constructor(store) { this.store = store; }
  async available(date) { const occupied = new Set((await this.store.bookings()).filter(b => b.status !== 'cancelled' && b.startTime.startsWith(date)).map(b => b.startTime.slice(11,16))); return hours.filter(slot => !occupied.has(slot)); }
  async createEvent(booking) { return `local-cal-${booking.id}`; }
  async deleteEvent() { return true; }
}
export class PaymentGateway { async createLink(payment) { return `https://pay.sessionly.local/${payment.id}`; } }

export function createAgent(store, { now = () => new Date(), calendar = new CalendarGateway(store), payments = new PaymentGateway(), intentProvider = null } = {}) {
  const tools = {
    checkAvailability: date => calendar.available(date),
    async createBooking(clientId, date, time) { if (!(await calendar.available(date)).includes(time)) throw new Error('That time was just booked. Please select another slot.'); const therapist = (await store.dashboard()).therapist; const booking = await store.createBooking({ clientId, therapistId: therapist.id, startTime: `${date}T${time}:00`, endTime: `${date}T${slotEnd(time)}:00`, calendarEventId: `pending-${randomUUID()}` }); await store.updateBooking(booking.id, { calendarEventId: await calendar.createEvent(booking) }); return booking; },
    async cancelBooking(clientId) { const booking = (await store.bookings(clientId)).find(b => ['confirmed','pending'].includes(b.status)); if (!booking) return null; await calendar.deleteEvent(booking.calendarEventId); return store.updateBooking(booking.id, { status: 'cancelled' }); },
    async rescheduleBooking(clientId, date, time) { const booking = (await store.bookings(clientId)).find(b => b.status === 'confirmed'); if (!booking) return null; if (!(await calendar.available(date)).includes(time)) throw new Error('That time is unavailable.'); return store.updateBooking(booking.id, { startTime: `${date}T${time}:00`, endTime: `${date}T${slotEnd(time)}:00` }); },
    async createPaymentLink(bookingId) { const booking = await store.booking(bookingId); if (!booking) throw new Error('Booking not found.'); const payment = await store.createPayment({ bookingId, amount: (await store.dashboard()).therapist.fee }); return { ...payment, link: await payments.createLink(payment) }; },
    escalateToTherapist: clientId => store.setConversation(clientId, { escalated: true, state: 'ESCALATED' })
  };
  async function reply(clientId, text) {
    await store.message(clientId, 'user', text); const lower = text.toLowerCase(); const finish = async content => { await store.message(clientId, 'assistant', content); return { content }; };
    if (safetyPattern.test(text)) { await tools.escalateToTherapist(clientId); return finish('I can help with scheduling and payments, but I can’t provide clinical support. I’ve notified your therapist so they can follow up.'); }
    if (/cancel/.test(lower)) return finish(await tools.cancelBooking(clientId) ? 'Your upcoming appointment has been cancelled.' : 'I could not find a confirmed upcoming appointment.');
    let intent = null, extracted = null;
    try { extracted = await intentProvider?.classify(text); intent = extracted?.intent; } catch { /* deterministic policy remains available if the LLM is unavailable */ }
    const date = extracted?.date || parseDate(text, now()), time = extracted?.time || parseTime(text);
    if (/resched/.test(lower) || intent === 'reschedule') { if (!date || !time) return finish('Please share the new date and time, for example: reschedule to 2026-10-10 at 17:00.'); try { return finish(await tools.rescheduleBooking(clientId,date,time) ? `Done — your appointment is now ${date} at ${time}.` : 'I could not find an appointment to reschedule.'); } catch (error) { return finish(error.message); } }
    const conversation = await store.conversation(clientId);
    if (conversation.state === 'WAITING_TIME' && time && !date) { const selectedDate = conversation.pendingDate; try { await tools.createBooking(clientId, selectedDate, time); await store.setConversation(clientId,{state:'START',pendingDate:null}); return finish(`Confirmed: your session is booked for ${selectedDate} at ${time}.`); } catch (error) { return finish(error.message); } }
    if (/book|appoint|available|slot/.test(lower) || intent === 'booking') { if (!date) return finish('Which date works for you? You can say “Friday evening” or “2026-10-10”.'); const slots = await tools.checkAvailability(date); if (!slots.length) return finish(`There are no slots available on ${date}. Please choose another day.`); if (!time || !slots.includes(time)) { await store.setConversation(clientId,{state:'WAITING_TIME',pendingDate:date}); return finish(`I have these times on ${date}: ${slots.join(', ')}. Reply with one (for example, “17:00”).`); } try { await tools.createBooking(clientId,date,time); await store.setConversation(clientId,{state:'START',pendingDate:null}); return finish(`Confirmed: your session is booked for ${date} at ${time}.`); } catch (error) { return finish(error.message); } }
    if (/pay|payment|receipt/.test(lower) || intent === 'payment') { const booking = (await store.bookings(clientId)).find(b => b.status === 'completed' || b.status === 'confirmed'); return booking ? finish(`Here is your payment link: ${(await tools.createPaymentLink(booking.id)).link}`) : finish('I could not find a session to bill.'); }
    return finish('I can help book, reschedule, cancel appointments, and send payment links. What would you like to do?');
  }
  return { reply, tools, paymentLink: tools.createPaymentLink };
}
