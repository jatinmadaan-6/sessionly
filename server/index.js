import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createStore } from './postgres-store.js';
import { createAgent } from './agent.js';
import { validHmac } from './security.js';
import { sendDayBeforeConfirmations } from './jobs.js';
import { GeminiIntentProvider, GoogleCalendarGateway, RazorpayGateway } from './providers.js';

export function createApp({ store, agent, config = process.env } = {}) {
  const calendar = new GoogleCalendarGateway(store, config);
  agent ||= createAgent(store, { calendar, payments: new RazorpayGateway(config), intentProvider: new GeminiIntentProvider(config) });
  const oauthStates = new Map();
  const app = express();
  app.use(cors({ origin: config.CLIENT_ORIGIN || true }));
  app.use(express.json({ verify: (req, _, buffer) => { req.rawBody = buffer.toString('utf8'); } }));
  app.get('/api/health', (_, res) => res.json({ ok: true, storage: config.DATABASE_URL ? 'postgres' : 'local' }));
  app.get('/api/dashboard', async (_, res, next) => { try { res.json(await store.dashboard()); } catch (e) { next(e); } });
  app.get('/api/conversations', async (_, res, next) => { try { res.json(await store.conversations()); } catch (e) { next(e); } });
  app.get('/api/conversations/:clientId', async (req, res, next) => { try { res.json(await store.conversation(req.params.clientId)); } catch (e) { next(e); } });
  app.post('/api/messages', async (req, res, next) => { try { const { clientId, text } = req.body; if (!await store.client(clientId) || !text?.trim()) return res.status(400).json({ error: 'clientId and text are required' }); res.json(await agent.reply(clientId, text.trim())); } catch (e) { next(e); } });
  app.post('/api/bookings/:id/payment-link', async (req, res, next) => { try { res.status(201).json(await agent.paymentLink(req.params.id)); } catch (e) { next(e); } });
  app.post('/api/jobs/send-confirmations', async (_, res, next) => { try { res.json({ sent: await sendDayBeforeConfirmations(store, async () => {}, new Date()) }); } catch (e) { next(e); } });
  app.get('/api/integrations/google/status', async (_, res, next) => { try { const therapist = (await store.dashboard()).therapist; res.json({ configured: calendar.configured(), connected: Boolean((await store.googleConnection(therapist.id))?.refreshToken), redirectUri: calendar.redirectUri() }); } catch (e) { next(e); } });
  app.get('/api/integrations/google/connect', async (_, res, next) => { try { if (!calendar.configured()) return res.status(503).json({ error: 'Google OAuth is not configured.' }); const therapist = (await store.dashboard()).therapist; const state = crypto.randomUUID(); oauthStates.set(state, { therapistId: therapist.id, expires: Date.now() + 600000 }); res.redirect(calendar.authorizationUrl(state)); } catch (e) { next(e); } });
  app.get('/api/integrations/google/callback', async (req, res, next) => { try { const pending = oauthStates.get(req.query.state); oauthStates.delete(req.query.state); if (!pending || pending.expires < Date.now() || !req.query.code) return res.status(400).send('Invalid or expired Google OAuth state.'); await store.saveGoogleTokens(pending.therapistId, await calendar.exchangeCode(req.query.code)); res.redirect(config.CLIENT_ORIGIN || '/'); } catch (e) { next(e); } });
  app.get('/webhook/whatsapp', (req,res) => req.query['hub.verify_token'] === config.WHATSAPP_VERIFY_TOKEN ? res.send(req.query['hub.challenge']) : res.sendStatus(403));
  app.post('/webhook/whatsapp', async (req,res,next) => { try { if (config.WHATSAPP_APP_SECRET && !validHmac(req.rawBody, req.get('x-hub-signature-256'), config.WHATSAPP_APP_SECRET)) return res.sendStatus(401); const { from, text, messageId } = req.body; if (!from || !text || !messageId) return res.status(400).json({ error: 'from, text, and messageId are required' }); if (!await store.claimWebhookEvent('whatsapp', messageId)) return res.status(200).json({ duplicate: true }); const client = await store.ensureClient(from); res.json({ reply: (await agent.reply(client.id, text)).content }); } catch (e) { next(e); } });
  app.post('/webhook/razorpay', async (req,res,next) => { try { if (config.RAZORPAY_WEBHOOK_SECRET && !validHmac(req.rawBody, req.get('x-razorpay-signature'), config.RAZORPAY_WEBHOOK_SECRET)) return res.sendStatus(401); const { eventId, paymentId, status } = req.body; if (!eventId) return res.status(400).json({ error: 'eventId required' }); if (!await store.claimWebhookEvent('razorpay', eventId)) return res.json({ duplicate: true }); if (paymentId && status === 'paid') await store.updatePaymentByProvider(paymentId, { status: 'paid' }); res.json({ processed: true }); } catch (e) { next(e); } });
  app.use((error, _, res, __) => { console.error(error); res.status(error.code === '23505' ? 409 : 500).json({ error: 'Request could not be completed.' }); });
  return app;
}

if (process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).pathname) {
  const store = await createStore();
  createApp({ store }).listen(process.env.PORT || 3001, () => console.log(`Sessionly API on :${process.env.PORT || 3001}`));
}
