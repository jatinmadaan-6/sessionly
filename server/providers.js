import { CalendarGateway, PaymentGateway } from './agent.js';

const calendarScope = 'https://www.googleapis.com/auth/calendar';
const tokenUrl = 'https://oauth2.googleapis.com/token';

export class GeminiIntentProvider {
  constructor(config = process.env) { this.key = config.GEMINI_API_KEY; this.model = config.GEMINI_MODEL || 'gemini-flash-latest'; }
  async classify(text) {
    if (!this.key) return null;
    const instruction = 'You are an intent extractor for a therapy-practice administrative assistant. Return JSON only: {"intent":"booking|reschedule|cancel|payment|escalate|other","date":"YYYY-MM-DD or null","time":"HH:MM or null"}. Never provide medical advice.';
    const request = () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`, { method:'POST', headers:{'x-goog-api-key':this.key,'content-type':'application/json'}, body:JSON.stringify({systemInstruction:{parts:[{text:instruction}]},contents:[{role:'user',parts:[{text}]}],generationConfig:{responseMimeType:'application/json',temperature:0}}) });
    let response = await request();
    if (response.status === 429 || response.status >= 500) { await new Promise(resolve => setTimeout(resolve, 500)); response = await request(); }
    if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
    const body = await response.json();
    return JSON.parse(body.candidates?.[0]?.content?.parts?.[0]?.text || 'null');
  }
}

export class GoogleCalendarGateway extends CalendarGateway {
  constructor(store, config = process.env) { super(store); this.config = config; }
  configured() { return Boolean(this.config.GOOGLE_CLIENT_ID && this.config.GOOGLE_CLIENT_SECRET); }
  redirectUri() { return this.config.GOOGLE_REDIRECT_URI || `http://localhost:${this.config.PORT || 3001}/api/integrations/google/callback`; }
  authorizationUrl(state) { const params = new URLSearchParams({ client_id:this.config.GOOGLE_CLIENT_ID, redirect_uri:this.redirectUri(), response_type:'code', access_type:'offline', prompt:'consent', scope:calendarScope, state }); return `https://accounts.google.com/o/oauth2/v2/auth?${params}`; }
  async exchangeCode(code) { const response = await fetch(tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:this.config.GOOGLE_CLIENT_ID,client_secret:this.config.GOOGLE_CLIENT_SECRET,redirect_uri:this.redirectUri(),grant_type:'authorization_code'})}); if (!response.ok) throw new Error('Google OAuth token exchange failed.'); return response.json(); }
  async accessToken(therapistId) { const connection=await this.store.googleConnection(therapistId); if (!connection?.refreshToken) return null; const response=await fetch(tokenUrl,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:this.config.GOOGLE_CLIENT_ID,client_secret:this.config.GOOGLE_CLIENT_SECRET,refresh_token:connection.refreshToken,grant_type:'refresh_token'})}); if (!response.ok) throw new Error('Google Calendar token refresh failed. Reconnect Google Calendar.'); return (await response.json()).access_token; }
  async available(date) { const dashboard=await this.store.dashboard(); const token=await this.accessToken(dashboard.therapist.id); if (!token) return super.available(date); const slots=await super.available(date); const start=`${date}T00:00:00+05:30`, end=`${date}T23:59:59+05:30`; const response=await fetch('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({timeMin:start,timeMax:end,items:[{id:dashboard.therapist.googleCalendarId || 'primary'}]})}); if (!response.ok) throw new Error('Google Calendar availability check failed.'); const busy=(await response.json()).calendars?.[dashboard.therapist.googleCalendarId || 'primary']?.busy || []; return slots.filter(time => !busy.some(block => `${date}T${time}:00+05:30` < block.end && `${date}T${String(Number(time.slice(0,2))+1).padStart(2,'0')}${time.slice(2)}:00+05:30` > block.start)); }
  async createEvent(booking) { const dashboard=await this.store.dashboard(), token=await this.accessToken(dashboard.therapist.id); if (!token) return super.createEvent(booking); const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(dashboard.therapist.googleCalendarId || 'primary')}/events`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({summary:'Sessionly therapy session',start:{dateTime:booking.startTime,timeZone:dashboard.therapist.timezone},end:{dateTime:booking.endTime,timeZone:dashboard.therapist.timezone}})}); if (!response.ok) throw new Error('Google Calendar event creation failed.'); return (await response.json()).id; }
  async deleteEvent(eventId) { const dashboard=await this.store.dashboard(), token=await this.accessToken(dashboard.therapist.id); if (!token || !eventId || eventId.startsWith('local-cal-')) return true; const response=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(dashboard.therapist.googleCalendarId || 'primary')}/events/${encodeURIComponent(eventId)}`,{method:'DELETE',headers:{authorization:`Bearer ${token}`}}); if (!response.ok && response.status !== 404) throw new Error('Google Calendar event deletion failed.'); return true; }
}

export class RazorpayGateway extends PaymentGateway {
  constructor(config = process.env) { super(); this.config=config; }
  async createLink(payment) {
    if (!this.config.RAZORPAY_KEY_ID || !this.config.RAZORPAY_KEY_SECRET) return super.createLink(payment);
    const basic=Buffer.from(`${this.config.RAZORPAY_KEY_ID}:${this.config.RAZORPAY_KEY_SECRET}`).toString('base64');
    const response=await fetch('https://api.razorpay.com/v1/payment_links',{method:'POST',headers:{authorization:`Basic ${basic}`,'content-type':'application/json'},body:JSON.stringify({amount:Math.round(payment.amount*100),currency:'INR',reference_id:payment.id,description:'Sessionly therapy session',accept_partial:false,reminder_enable:true,notes:{sessionly_payment_id:payment.id}})});
    if (!response.ok) throw new Error('Razorpay payment link creation failed.'); const link=await response.json(); return link.short_url;
  }
}
