// The WhatsApp reply agent. One OpenAI chat call per inbound burst; the answer is structured JSON.
import { config } from './config.js';
import { localParts } from './time.js';

const STOPWORDS = new Set('the a an and or for to of in on is are do you your how much what price cost can i we it me my with about need want have any'.split(' '));
export function relevantProducts(products, text, n = 12) {
  const words = String(text || '').toLowerCase().match(/[a-z0-9.]+/g)?.filter((w) => w.length > 1 && !STOPWORDS.has(w)) || [];
  const scored = products.map((p) => {
    const hay = `${p.name} ${p.category}`.toLowerCase();
    return { p, s: words.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0) + (/inverter|battery|panel/.test(hay) ? 0.1 : 0) };
  }).sort((a, b) => b.s - a.s || a.p.price_ngn - b.p.price_ngn);
  return scored.slice(0, n).map(({ p }) => `- ${p.name} (${p.category}): ₦${Number(p.price_ngn).toLocaleString('en-NG')}${p.in_stock ? '' : ' [out of stock]'}`).join('\n');
}

// Words that only appear in Nigerian Pidgin, never in ordinary English ("who is this?" is English).
const PIDGIN = /\b(dey|wetin|abeg|una|wahala|sabi|oya|comot|wan|abi|shey|pikin|wey|e don|no be|make we|na wa|na so|na im|how una|i go|we go|e go|una go|o jare|wahala|ehn)\b/i;
/** "pidgin" only when the customer's own recent messages clearly use Pidgin; otherwise "english". */
export function customerLanguage(history) {
  const recent = history.filter((m) => m.direction === 'in').slice(-3).map((m) => m.body).join(' ');
  return PIDGIN.test(recent) ? 'pidgin' : 'english';
}

export function buildMessages({ agent, engine, lead, history, products, extra = '' }) {
  const t = localParts();
  const lang = customerLanguage(history);
  const language = lang === 'pidgin'
    ? 'LANGUAGE FOR THIS REPLY: Nigerian Pidgin. The customer is writing in Pidgin, so reply in friendly, simple Pidgin. Keep prices and times in plain English.'
    : 'LANGUAGE FOR THIS REPLY: English. The customer is writing in English. Reply in clear, simple, polite English only. Do not use any Pidgin words (no "dey", "wey", "na", "I be"), even if your earlier messages did.';
  const system = `${agent.prompt.replaceAll('{sender}', engine.senderName).replaceAll('{company}', engine.company)}

${agent.knowledge ? `EXTRA KNOWLEDGE FROM THE TEAM\n${agent.knowledge}\n\n` : ''}RELEVANT SHOP PRODUCTS (prices in naira)
${relevantProducts(products, history.filter((m) => m.direction === 'in').slice(-3).map((m) => m.body).join(' '))}

LEAD: ${lead.name}${lead.contact_name ? ` (contact: ${lead.contact_name})` : ''}; sector: ${lead.sector || 'unknown'}; city: ${lead.city || 'unknown'}.
CURRENT TIME: ${t.date} ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')} WAT (Lagos).
${language}
${extra}
Return ONLY JSON: {"reply": string, "intent": "continue"|"interested"|"booked"|"not_interested"|"stop"|"human", "contact_name": string|null, "booking_at": ISO-8601 string|null, "summary": string}
"summary" is one short line for the sales team.`;
  const turns = history.slice(-20).map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.body }));
  return [{ role: 'system', content: system }, ...turns];
}

export function parseAgentJson(text) {
  let o; try { o = JSON.parse(text); } catch { const m = String(text).match(/\{[\s\S]*\}/); try { o = m && JSON.parse(m[0]); } catch { o = null; } }
  if (!o || typeof o.reply !== 'string') return null;
  const intents = ['continue', 'interested', 'booked', 'not_interested', 'stop', 'human'];
  const bt = o.booking_at && !Number.isNaN(Date.parse(o.booking_at)) ? new Date(o.booking_at).toISOString() : null;
  return { reply: o.reply.trim().replace(/—/g, ',').slice(0, 900), intent: intents.includes(o.intent) ? o.intent : 'continue', contact_name: o.contact_name || null, booking_at: bt, summary: String(o.summary || '').slice(0, 300) };
}

export async function runAgent(ctx, fetchImpl = fetch) {
  if (!config.openaiKey) throw new Error('OPENAI_API_KEY is not set');
  const res = await fetchImpl(`${config.openaiBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiKey}` },
    body: JSON.stringify({ model: ctx.agent.model || config.openaiModel, messages: buildMessages(ctx), response_format: { type: 'json_object' }, temperature: 0.5, max_tokens: 300 }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const parsed = parseAgentJson((await res.json()).choices?.[0]?.message?.content);
  if (!parsed) throw new Error('OpenAI returned an unusable reply');
  return parsed;
}
