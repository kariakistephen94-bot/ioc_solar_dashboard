// "Imole", the dashboard assistant. It answers questions about the pipeline and can make changes,
// using OpenAI tool calls that go through the engine's own API routes (same rules, same validation).
import { config } from './config.js';
import { localParts } from './time.js';

const STATUSES = ['new', 'contacted', 'replied', 'interested', 'booked', 'won', 'lost', 'opted_out', 'call_only', 'needs_human'];
const obj = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const fn = (name, description, parameters = obj()) => ({ type: 'function', function: { name, description, parameters } });

export const TOOLS = [
  fn('get_overview', 'Lead counts per pipeline stage, messages sent and replies in the last 24 hours, whether sending is paused, and each WhatsApp number\'s connection state.'),
  fn('search_leads', 'Find leads. All filters optional. Returns at most `limit` rows plus the total that match.', obj({
    query: { type: 'string', description: 'Name, phone or city text' }, status: { type: 'string', enum: STATUSES },
    state: { type: 'string', description: 'Nigerian state, e.g. Lagos, Oyo, FCT' }, sector: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 25 },
  })),
  fn('get_lead', 'One lead with its recent WhatsApp conversation.', obj({ lead_id: { type: 'string' } }, ['lead_id'])),
  fn('update_lead', 'Change a lead: move it to a pipeline stage, add notes, or pause/resume the WhatsApp AI for it.', obj({
    lead_id: { type: 'string' }, status: { type: 'string', enum: STATUSES }, notes: { type: 'string' }, agent_paused: { type: 'boolean' },
  }, ['lead_id'])),
  fn('book_survey', 'Book (or reschedule) a site survey for a lead. Moves it to "booked" and stops its automatic follow-ups.', obj({
    lead_id: { type: 'string' }, when: { type: 'string', description: 'ISO 8601 date-time with offset, Lagos is +01:00, e.g. 2026-11-14T10:00:00+01:00' }, note: { type: 'string' },
  }, ['lead_id', 'when'])),
  fn('get_calendar', 'Site surveys and scheduled follow-ups between two dates.', obj({ from: { type: 'string', description: 'ISO date' }, to: { type: 'string', description: 'ISO date (exclusive), at most 100 days after from' } }, ['from', 'to'])),
  fn('get_whatsapp_stats', 'Per WhatsApp number: connection, today\'s sends vs warm-up cap, 30-day sent/delivered/read, reply rate, and leads by stage.'),
  fn('set_sending', 'Pause or resume all outbound WhatsApp sending.', obj({ paused: { type: 'boolean' } }, ['paused'])),
];
const WRITES = new Set(['update_lead', 'book_survey', 'set_sending']);

const slimLead = (l) => l && ({ id: l.id, name: l.name, sector: l.sector, city: l.city, state: l.state, phone: l.phone ? `+${l.phone}` : null, status: l.status, score: l.score, whatsapp_number: l.account_id, contact_name: l.contact_name, last_contacted_at: l.last_contacted_at, last_reply_at: l.last_inbound_at, booking_at: l.booking_at, booking_note: l.booking_note, notes: l.notes, ai_paused: l.agent_paused });

export const IMPL = {
  get_overview: async (a, d) => { const o = await d('GET', '/overview'); return { total: o.total, byStatus: o.byStatus, sent24h: o.sent24h, replies24h: o.replies24h, sendingPaused: o.paused, numbers: o.accounts.map((x) => ({ id: x.id, label: x.label, connected: x.connected, state: x.state, paused: !!x.paused })) }; },
  search_leads: async (a, d) => {
    const q = { limit: String(Math.min(25, a.limit || 10)) };
    for (const [k, v] of [['q', a.query], ['status', a.status], ['state', a.state], ['sector', a.sector]]) if (v) q[k] = v;
    const r = await d('GET', '/leads', q); return { total: r.total, rows: r.rows.map(slimLead) };
  },
  get_lead: async (a, d) => { const r = await d('GET', `/conversations/${a.lead_id}`); if (!r.lead) throw new Error('No lead with that id'); return { lead: slimLead(r.lead), messages: r.messages.slice(-15).map((m) => ({ from: m.direction === 'in' ? (m.kind === 'auto' ? 'automatic reply (not a person)' : 'customer') : m.kind, text: m.body.slice(0, 300), at: m.created_at })) }; },
  update_lead: async (a, d) => { const b = {}; for (const k of ['status', 'notes', 'agent_paused']) if (a[k] !== undefined) b[k] = a[k]; return slimLead(await d('PATCH', `/leads/${a.lead_id}`, {}, b)); },
  book_survey: async (a, d) => { const t = Date.parse(a.when); if (Number.isNaN(t)) throw new Error('Invalid date'); return slimLead(await d('PATCH', `/leads/${a.lead_id}`, {}, { status: 'booked', booking_at: new Date(t).toISOString(), ...(a.note ? { booking_note: a.note } : {}) })); },
  get_calendar: async (a, d) => { const r = await d('GET', '/calendar', { from: new Date(a.from).toISOString(), to: new Date(a.to).toISOString() }); return r.events.slice(0, 60).map((e) => ({ type: e.type, at: e.at, note: e.note, lead: { id: e.lead.id, name: e.lead.name, city: e.lead.city, phone: `+${e.lead.phone}` } })); },
  get_whatsapp_stats: async (a, d) => (await d('GET', '/accounts/stats')).map(({ days, qr, name, ...s }) => s),
  set_sending: async (a, d) => d('POST', '/control', {}, { paused: !!a.paused }),
};

function systemPrompt() {
  const t = localParts();
  return `You are Imole, the friendly assistant inside OIC Solar's lead dashboard. OIC Solar (Ibadan) sells and installs solar panels, inverters and batteries. The dashboard finds Nigerian businesses that suffer from power cuts, messages them from up to 4 WhatsApp numbers, follows up automatically, and a separate WhatsApp AI agent chats with leads and books site surveys.
You help the team: answer questions about leads, the pipeline, the calendar and each WhatsApp number's performance, and make changes when asked.
Rules:
- Always use tools for facts and numbers. Never invent leads, counts or dates.
- When a request needs a lead id, search for the lead first. If several match, ask which one.
- Before pausing all sending, or moving more than 3 leads at once, confirm with the user unless they were explicit.
- After changing something, say plainly what you changed.
- Short answers: a sentence or two, or a compact list. Plain text, no markdown tables. Use naira and Lagos time (WAT).
- Today is ${t.date} (weekday ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][t.dow]}), ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')} WAT.`;
}

export async function runAssistant({ messages, dispatch, model = config.openaiModel, fetchImpl = fetch, maxSteps = 6 }) {
  if (!config.openaiKey) throw new Error('OPENAI_API_KEY is not set in engine/.env');
  const convo = [{ role: 'system', content: systemPrompt() },
    ...messages.slice(-14).filter((m) => m && typeof m.content === 'string').map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content.slice(0, 2000) }))];
  const actions = [];
  for (let step = 0; step < maxSteps; step++) {
    const res = await fetchImpl(`${config.openaiBase}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiKey}` },
      body: JSON.stringify({ model, messages: convo, tools: TOOLS, tool_choice: 'auto', temperature: 0.3, max_tokens: 500 }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const msg = (await res.json()).choices?.[0]?.message;
    if (!msg) throw new Error('OpenAI returned no message');
    convo.push(msg);
    if (!msg.tool_calls?.length) return { reply: (msg.content || '').trim(), actions };
    for (const call of msg.tool_calls) {
      const name = call.function?.name; let result;
      try {
        if (!IMPL[name]) throw new Error(`Unknown tool ${name}`);
        const args = JSON.parse(call.function.arguments || '{}');
        result = await IMPL[name](args, dispatch);
        if (WRITES.has(name)) actions.push({ tool: name, args, ok: true });
      } catch (e) {
        result = { error: e.message };
        if (WRITES.has(name)) actions.push({ tool: name, ok: false, error: e.message });
      }
      convo.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 8000) });
    }
  }
  return { reply: 'That took more steps than I allow. Try a narrower question.', actions };
}
