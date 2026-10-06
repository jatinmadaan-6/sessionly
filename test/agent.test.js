import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalStore } from '../server/store.js';
import { createAgent } from '../server/agent.js';

function setup() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessionly-')); const store = new LocalStore(path.join(dir, 'db.json')); return { store, agent: createAgent(store, { now: () => new Date('2026-10-06T08:00:00Z') }) }; }

test('booking is stateful and does not double-book a slot', async () => {
  const { store, agent } = setup();
  assert.match((await agent.reply('client-demo', 'book Friday evening')).content, /I have these times/);
  assert.match((await agent.reply('client-demo', '17:00')).content, /Confirmed/);
  const bookings = await store.bookings('client-demo'); assert.equal(bookings.length, 1); assert.match(bookings[0].startTime, /T17:00:00$/);
  const second = await store.ensureClient('+15550001111');
  const unavailable = await agent.reply(second.id, `book ${bookings[0].startTime.slice(0,10)} at 17:00`);
  assert.doesNotMatch(unavailable.content.split('. Reply')[0], /17:00/); assert.equal((await store.bookings()).length, 1);
});

test('safety-sensitive messages are escalated without clinical advice', async () => {
  const { store, agent } = setup(); const reply = await agent.reply('client-demo', 'I feel hopeless and need a diagnosis');
  assert.match(reply.content, /can’t provide clinical support/); assert.equal((await store.conversation('client-demo')).escalated, true);
});

test('cancellation, rescheduling, and payment link are deterministic tools', async () => {
  const { store, agent } = setup(); await agent.reply('client-demo', 'book 2026-10-12 at 10:00');
  assert.match((await agent.reply('client-demo', 'reschedule to 2026-10-13 at 14:00')).content, /2026-10-13 at 14:00/);
  assert.match((await agent.reply('client-demo', 'send a payment link')).content, /pay.sessionly.local/);
  assert.match((await agent.reply('client-demo', 'cancel my appointment')).content, /cancelled/);
  assert.equal((await store.bookings('client-demo'))[0].status, 'cancelled');
});
