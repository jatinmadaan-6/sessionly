import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { LocalStore } from '../server/store.js';
import { createApp } from '../server/index.js';

async function server(config = {}) { const store = new LocalStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sessionly-http-')), 'db.json')); const app = createApp({ store, config }); const listener = await new Promise(resolve => { const s = app.listen(0, () => resolve(s)); }); return { store, url: `http://127.0.0.1:${listener.address().port}`, close: () => new Promise(resolve => listener.close(resolve)) }; }
test('messages API validates input and completes a booking conversation', async () => {
  const s = await server(); try {
    assert.equal((await fetch(`${s.url}/api/messages`, {method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status, 400);
    const first = await fetch(`${s.url}/api/messages`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientId:'client-demo',text:'book 2026-10-12'})}); assert.match((await first.json()).content,/these times/);
    const second = await fetch(`${s.url}/api/messages`, {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientId:'client-demo',text:'10:00'})}); assert.match((await second.json()).content,/Confirmed/);
  } finally { await s.close(); }
});
test('WhatsApp webhooks require valid signatures and are idempotent', async () => {
  const secret = 'test-secret', s = await server({ WHATSAPP_APP_SECRET: secret }); try {
    const body = JSON.stringify({from:'+15556667777',text:'book 2026-10-12',messageId:'wamid.1'});
    assert.equal((await fetch(`${s.url}/webhook/whatsapp`,{method:'POST',headers:{'content-type':'application/json'},body})).status,401);
    const signature = `sha256=${createHmac('sha256',secret).update(body).digest('hex')}`;
    const first = await fetch(`${s.url}/webhook/whatsapp`,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signature},body}); assert.equal(first.status,200);
    const duplicate = await fetch(`${s.url}/webhook/whatsapp`,{method:'POST',headers:{'content-type':'application/json','x-hub-signature-256':signature},body}); assert.deepEqual(await duplicate.json(),{duplicate:true});
  } finally { await s.close(); }
});
test('Google Calendar connection exposes a safe OAuth redirect', async () => {
  const s = await server({ GOOGLE_CLIENT_ID:'client-id', GOOGLE_CLIENT_SECRET:'client-secret', GOOGLE_REDIRECT_URI:'http://localhost:3001/api/integrations/google/callback' }); try {
    const status = await (await fetch(`${s.url}/api/integrations/google/status`)).json(); assert.deepEqual(status, { configured:true, connected:false, redirectUri:'http://localhost:3001/api/integrations/google/callback' });
    const connect = await fetch(`${s.url}/api/integrations/google/connect`, { redirect:'manual' }); assert.equal(connect.status,302); assert.match(connect.headers.get('location'), /^https:\/\/accounts\.google\.com\//);
  } finally { await s.close(); }
});
