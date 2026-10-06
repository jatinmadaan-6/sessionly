import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const seed = () => ({
  therapist: { id: 'therapist-demo', name: 'Dr. Maya Shah', timezone: 'Asia/Kolkata', sessionMinutes: 60, fee: 1500, hours: { start: 10, end: 19 }, googleRefreshToken: null, googleCalendarId: 'primary' },
  clients: [{ id: 'client-demo', therapistId: 'therapist-demo', name: 'Aarav Mehta', phone: '+15551234567' }], bookings: [], payments: [], conversations: {}, webhookEvents: []
});

/** Free local development store. Its API is intentionally shared with PostgresStore. */
export class LocalStore {
  constructor(file = path.resolve('data/sessionly.json')) { this.file = file; this.db = this.load(); }
  load() { fs.mkdirSync(path.dirname(this.file), { recursive: true }); if (!fs.existsSync(this.file)) fs.writeFileSync(this.file, JSON.stringify(seed(), null, 2)); return JSON.parse(fs.readFileSync(this.file, 'utf8')); }
  save() { fs.writeFileSync(this.file, JSON.stringify(this.db, null, 2)); }
  async dashboard() { return { therapist: this.db.therapist, clients: this.db.clients, bookings: this.db.bookings, payments: this.db.payments, escalations: Object.values(this.db.conversations).filter(c => c.escalated) }; }
  async client(id) { return this.db.clients.find(c => c.id === id); }
  async clientByPhone(phone) { return this.db.clients.find(c => c.phone === phone); }
  async ensureClient(phone) { let c = await this.clientByPhone(phone); if (!c) { c = { id: randomUUID(), therapistId: this.db.therapist.id, name: 'WhatsApp Client', phone }; this.db.clients.push(c); this.save(); } return c; }
  async conversation(clientId) { if (!this.db.conversations[clientId]) { this.db.conversations[clientId] = { clientId, state: 'START', messages: [], escalated: false, updatedAt: new Date().toISOString(), pendingDate: null }; this.save(); } return this.db.conversations[clientId]; }
  async message(clientId, role, content) { const c = await this.conversation(clientId); c.messages.push({ id: randomUUID(), role, content, timestamp: new Date().toISOString() }); c.updatedAt = new Date().toISOString(); this.save(); return c; }
  async setConversation(clientId, changes) { Object.assign(await this.conversation(clientId), changes, { updatedAt: new Date().toISOString() }); this.save(); }
  async bookings(clientId) { return this.db.bookings.filter(b => !clientId || b.clientId === clientId); }
  async booking(id) { return this.db.bookings.find(b => b.id === id); }
  async createBooking(values) { const booking = { id: randomUUID(), status: 'confirmed', createdAt: new Date().toISOString(), ...values }; this.db.bookings.push(booking); this.save(); return booking; }
  async updateBooking(id, changes) { const b = await this.booking(id); if (!b) return null; Object.assign(b, changes); this.save(); return b; }
  async createPayment(values) { const p = { id: randomUUID(), status: 'pending', createdAt: new Date().toISOString(), ...values }; this.db.payments.push(p); this.save(); return p; }
  async updatePaymentByProvider(id, changes) { const p = this.db.payments.find(x => x.providerPaymentId === id); if (p) { Object.assign(p, changes); this.save(); } return p; }
  async saveGoogleTokens(therapistId, tokens) { if (this.db.therapist.id !== therapistId) throw new Error('Therapist not found.'); this.db.therapist.googleRefreshToken = tokens.refresh_token || this.db.therapist.googleRefreshToken; this.save(); }
  async googleConnection(therapistId) { return this.db.therapist.id === therapistId ? { refreshToken: this.db.therapist.googleRefreshToken, calendarId: this.db.therapist.googleCalendarId || 'primary' } : null; }
  async claimWebhookEvent(provider, eventId) { if (this.db.webhookEvents.some(x => x.provider === provider && x.eventId === eventId)) return false; this.db.webhookEvents.push({ provider, eventId }); this.save(); return true; }
  async conversations() { return Object.values(this.db.conversations); }
}

export const store = new LocalStore();
