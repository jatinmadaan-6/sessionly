import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const file = path.resolve('data/sessionly.json');
const initial = () => ({
  therapist: { id: 'therapist-demo', name: 'Dr. Maya Shah', timezone: 'Asia/Kolkata', sessionMinutes: 60, fee: 1500, hours: { start: 10, end: 19 } },
  clients: [{ id: 'client-demo', name: 'Aarav Mehta', phone: '+15551234567' }],
  bookings: [], payments: [], conversations: {}, webhookEvents: []
});
function load() { fs.mkdirSync(path.dirname(file), { recursive: true }); if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(initial(), null, 2)); return JSON.parse(fs.readFileSync(file, 'utf8')); }
let db = load();
function save() { fs.writeFileSync(file, JSON.stringify(db, null, 2)); }
export const store = {
  dashboard() { return { therapist: db.therapist, clients: db.clients, bookings: db.bookings, payments: db.payments, escalations: Object.values(db.conversations).filter(c => c.escalated) }; },
  client(id) { return db.clients.find(c => c.id === id); },
  clientByPhone(phone) { return db.clients.find(c => c.phone === phone); },
  ensureClient(phone) { let c = this.clientByPhone(phone); if (!c) { c = { id: randomUUID(), name: 'WhatsApp Client', phone }; db.clients.push(c); save(); } return c; },
  conversation(clientId) { if (!db.conversations[clientId]) { db.conversations[clientId] = { clientId, state: 'START', messages: [], escalated: false, updatedAt: new Date().toISOString() }; save(); } return db.conversations[clientId]; },
  message(clientId, role, content) { const c = this.conversation(clientId); c.messages.push({ id: randomUUID(), role, content, timestamp: new Date().toISOString() }); c.updatedAt = new Date().toISOString(); save(); return c; },
  setConversation(clientId, changes) { Object.assign(this.conversation(clientId), changes, { updatedAt: new Date().toISOString() }); save(); },
  bookings(clientId) { return db.bookings.filter(b => !clientId || b.clientId === clientId); },
  booking(id) { return db.bookings.find(b => b.id === id); },
  createBooking(values) { const booking = { id: randomUUID(), status: 'confirmed', createdAt: new Date().toISOString(), ...values }; db.bookings.push(booking); save(); return booking; },
  updateBooking(id, changes) { const b = this.booking(id); if (!b) return null; Object.assign(b, changes); save(); return b; },
  createPayment(values) { const p = { id: randomUUID(), status: 'pending', createdAt: new Date().toISOString(), ...values }; db.payments.push(p); save(); return p; },
  paymentByEvent(eventId) { return db.webhookEvents.includes(eventId); },
  recordEvent(eventId) { db.webhookEvents.push(eventId); save(); },
  conversations() { return Object.values(db.conversations); }
};
