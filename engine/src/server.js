import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { config, assertConfigured } from './config.js';
import { Supabase, getSetting, logActivity } from './db.js';
import { WaManager } from './wa.js';
import { Sender, dailyCap, nextSend } from './sender.js';
import { localParts, startOfLocalDay } from './time.js';
import { Inbound } from './inbound.js';
import { Discovery, leadsFromCsv, saveLeads } from './discovery.js';
import { AREAS } from './areas.js';
import { SECTOR_LIST } from './sectors.js';
import { loadEngine, saveEngine, loadAgent, saveAgent, DEFAULT_ENGINE } from './settings.js';
import { runAgent } from './agent.js';
import { runAssistant } from './assistant.js';
import { phoneInfo } from './phone.js';
import { ensureStaff, setRole } from './staff.js';

const missing = assertConfigured();
if (missing.length) { console.error(`Missing in engine/.env: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`); process.exit(1); }

const db = new Supabase();
const wa = new WaManager();
const sender = new Sender({ db, wa });
const inbound = new Inbound({ db, wa });
const discovery = new Discovery(db);

wa.on('message', (m) => inbound.onMessage(m).catch((e) => logActivity(db, 'inbound_error', e.message)));
wa.on('receipt', async ({ id, code }) => { // 3 = delivered, 4 = read
  const status = code >= 4 ? 'read' : code === 3 ? 'delivered' : null; if (!status) return;
  inbound.onReceipt({ id, status });
  await db.update('messages', { wa_id: `eq.${id}`, direction: 'eq.out' }, { status }).catch(() => {});
});
wa.on('open', async (id) => {
  const [row] = await db.select('accounts', { filters: { id: `eq.${id}` }, limit: 1 }).catch(() => []);
  const phone = wa.get(id).status().phone;
  await db.upsert('accounts', { id, phone, label: row?.label || `WhatsApp ${id}`, warmup_started_on: row?.warmup_started_on || new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }, 'id').catch(() => {});
});

const ok = (res, data, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
const body = async (req) => { let s = ''; for await (const c of req) { s += c; if (s.length > 5e6) throw new Error('Body too large'); } return s ? JSON.parse(s) : {}; };
const authed = (req) => { const a = Buffer.from(req.headers.authorization || ''); const b = Buffer.from(`Bearer ${config.apiToken}`); return a.length === b.length && timingSafeEqual(a, b); };
const E = encodeURIComponent;
// The dashboard tells the engine which signed-in admin made a request. Trusted because only the dashboard holds ENGINE_API_TOKEN.
const actorOf = (req) => (req.headers['x-actor-id'] ? { id: String(req.headers['x-actor-id']), email: String(req.headers['x-actor-email'] || '') } : null);

async function overview() {
  const statuses = ['new', 'contacted', 'replied', 'interested', 'booked', 'won', 'lost', 'opted_out', 'call_only', 'needs_human'];
  const since = new Date(Date.now() - 864e5).toISOString();
  const [counts, total, sent24, replies24, engine, acc] = await Promise.all([
    Promise.all(statuses.map((s) => db.count('leads', { status: `eq.${s}` }))), db.count('leads'),
    db.count('messages', { direction: 'eq.out', created_at: `gte.${since}` }), db.count('messages', { direction: 'eq.in', kind: 'neq.auto', created_at: `gte.${since}` }),
    loadEngine(db), db.select('accounts'),
  ]);
  return { total, byStatus: Object.fromEntries(statuses.map((s, i) => [s, counts[i]])), sent24h: sent24, replies24h: replies24, paused: engine.paused, accounts: wa.statuses().map((s) => ({ ...s, ...(acc.find((a) => a.id === s.id) || {}) })), discovery: discovery.status(), sender: { lastTick: sender.lastTick } };
}

const routes = [
  ['GET', /^\/health$/, async () => ({ ok: true })],
  ['GET', /^\/overview$/, overview],
  ['GET', /^\/meta$/, async () => ({ areas: AREAS.map(({ id, name, state }) => ({ id, name, state })), sectors: SECTOR_LIST, googleConfigured: !!config.googleKey })],
  ['GET', /^\/leads$/, async (q) => {
    const f = {};
    if (q.status) f.status = `eq.${q.status}`; if (q.state) f.state = `eq.${q.state}`; if (q.sector) f.sector = `eq.${q.sector}`;
    if (q.q) f.or = `(name.ilike.*${q.q.replace(/[(),*]/g, ' ')}*,phone.ilike.*${q.q.replace(/\D/g, '') || 'x'}*,city.ilike.*${q.q.replace(/[(),*]/g, ' ')}*)`;
    const limit = Math.min(200, Number(q.limit) || 50), offset = Number(q.offset) || 0;
    const [rows, total] = await Promise.all([db.select('leads', { filters: f, order: q.order || 'score.desc,created_at.desc', limit, offset }), db.count('leads', f)]);
    return { rows, total };
  }],
  ['PATCH', /^\/leads\/([0-9a-f-]{36})$/, async (q, b, m) => {
    const allowed = ['status', 'notes', 'agent_paused', 'contact_name', 'booking_at', 'booking_note'];
    const patch = Object.fromEntries(Object.entries(b).filter(([k]) => allowed.includes(k)));
    if (patch.status === 'opted_out') patch.agent_paused = true;
    if (['interested', 'booked', 'won', 'lost', 'opted_out'].includes(patch.status)) patch.next_followup_at = null; // a decided lead never gets automatic follow-ups
    if ('booking_at' in patch && patch.booking_at && Number.isNaN(Date.parse(patch.booking_at))) throw Object.assign(new Error('Invalid booking date'), { status: 400 });
    return (await db.update('leads', { id: `eq.${m[1]}` }, patch))[0];
  }],
  ['POST', /^\/leads\/import$/, async (q, b) => {
    const leads = leadsFromCsv(b.csv || '', { city: b.city, state: b.state });
    return { parsed: leads.length, added: await saveLeads(db, leads) };
  }],
  ['POST', /^\/leads\/seed$/, async () => {
    const f = join(config.root, 'data', 'seed-leads.json');
    if (!existsSync(f)) throw Object.assign(new Error('No prefilled list found in engine/data'), { status: 404 });
    const leads = JSON.parse(readFileSync(f, 'utf8'));
    return { parsed: leads.length, added: await saveLeads(db, leads) };
  }],
  ['POST', /^\/leads\/manual$/, async (q, b) => {
    const info = phoneInfo(b.phone); if (!info.phone || !b.name) throw Object.assign(new Error('Name and a valid Nigerian phone number are required'), { status: 400 });
    const [row] = await db.insert('leads', { name: b.name, sector: b.sector || 'Business', city: b.city || null, state: b.state || null, ...info, source: 'manual', source_id: info.phone, score: 80, status: info.phone_type === 'mobile' ? 'new' : 'call_only' });
    return row;
  }],
  ['POST', /^\/discovery$/, async (q, b) => discovery.run({ areaIds: b.areaIds, source: b.source === 'google' ? 'google' : 'osm', maxRequests: Math.min(2000, Number(b.maxRequests) || 150), targetNew: Math.max(0, Number(b.targetNew) || 0) })],
  ['GET', /^\/discovery$/, async () => discovery.status()],
  ['GET', /^\/conversations$/, async () => {
    const rows = await db.select('leads', { filters: { last_inbound_at: 'not.is.null' }, order: 'last_inbound_at.desc', limit: 100 });
    // A lead that only ever sent automatic replies is listed, but flagged: it has not really replied.
    const open = rows.filter((r) => ['new', 'contacted'].includes(r.status)).map((r) => r.id);
    const autos = open.length ? await db.select('messages', { filters: { lead_id: `in.(${open.join(',')})`, kind: 'eq.auto' }, columns: 'lead_id', limit: 2000 }) : [];
    const flagged = new Set(autos.map((a) => a.lead_id));
    return { rows: rows.map((r) => ({ ...r, auto_reply: flagged.has(r.id) })) };
  }],
  ['GET', /^\/conversations\/([0-9a-f-]{36})$/, async (q, b, m) => ({
    lead: (await db.select('leads', { filters: { id: `eq.${m[1]}` }, limit: 1 }))[0],
    messages: await db.select('messages', { filters: { lead_id: `eq.${m[1]}` }, order: 'created_at.asc', limit: 200 }),
  })],
  ['POST', /^\/conversations\/([0-9a-f-]{36})\/human$/, async (q, b, m) => inbound.markHuman(m[1])],
  ['POST', /^\/conversations\/([0-9a-f-]{36})\/auto$/, async (q, b, m) => inbound.markAuto(m[1])],
  ['POST', /^\/conversations\/([0-9a-f-]{36})\/send$/, async (q, b, m) => {
    const [lead] = await db.select('leads', { filters: { id: `eq.${m[1]}` }, limit: 1 });
    const acct = wa.get(lead.account_id) || [...wa.accounts.values()].find((a) => a.state === 'open');
    if (!acct || acct.state !== 'open') throw Object.assign(new Error('No connected WhatsApp account'), { status: 409 });
    const waId = await acct.sendText(lead.phone, String(b.text).slice(0, 1500));
    await db.insert('messages', { lead_id: lead.id, account_id: acct.id, direction: 'out', kind: 'manual', body: b.text, wa_id: waId });
    await db.update('leads', { id: `eq.${lead.id}` }, { last_contacted_at: new Date().toISOString(), account_id: acct.id, agent_paused: true });
    return { ok: true };
  }],
  ['GET', /^\/followups$/, async () => ({
    due: await db.select('leads', { filters: { status: 'eq.contacted', next_followup_at: 'not.is.null' }, order: 'next_followup_at.asc', limit: 200 }),
  })],
  ['GET', /^\/pipeline$/, async (q) => {
    const stages = ['new', 'contacted', 'replied', 'needs_human', 'interested', 'booked', 'won', 'lost'];
    const acct = /^[A-D]$/.test(q.account || '') ? { account_id: `eq.${q.account}` } : {};
    const page = (st, offset = 0) => db.select('leads', { filters: { status: `eq.${st}`, ...acct }, order: `${st === 'new' ? 'score.desc' : 'last_contacted_at.desc.nullslast'},id.asc`, limit: 40, offset });
    // "Show more" on one column: the next 40 cards of that stage.
    if (q.stage) {
      if (!stages.includes(q.stage)) throw Object.assign(new Error('Unknown stage'), { status: 400 });
      return { rows: await page(q.stage, Math.max(0, Number(q.offset) || 0)) };
    }
    return { columns: await Promise.all(stages.map(async (st) => ({
      status: st,
      total: await db.count('leads', { status: `eq.${st}`, ...acct }),
      rows: await page(st),
    }))) };
  }],
  ['GET', /^\/calendar$/, async (q) => {
    const from = new Date(q.from), to = new Date(q.to);
    if (Number.isNaN(+from) || Number.isNaN(+to) || to - from > 100 * 864e5) throw Object.assign(new Error('Give from and to dates (max 100 days apart)'), { status: 400 });
    const within = (v) => v && new Date(v) >= from && new Date(v) < to;
    const [bookings, followups] = await Promise.all([
      db.select('leads', { filters: { booking_at: `gte.${from.toISOString()}` }, order: 'booking_at.asc', limit: 1000 }),
      db.select('leads', { filters: { status: 'eq.contacted', next_followup_at: `gte.${from.toISOString()}` }, order: 'next_followup_at.asc', limit: 2000 }),
    ]);
    const pick = ({ id, name, sector, city, state, phone, status, account_id, contact_name, address, lat, lon }) => ({ id, name, sector, city, state, phone, status, account_id, contact_name, address, lat, lon });
    return { events: [
      ...bookings.filter((l) => within(l.booking_at)).map((l) => ({ type: 'survey', at: l.booking_at, note: l.booking_note, lead: pick(l) })),
      ...followups.filter((l) => within(l.next_followup_at)).map((l) => ({ type: 'followup', at: l.next_followup_at, n: l.followups_sent + 1, lead: pick(l) })),
    ] };
  }],
  ['GET', /^\/accounts\/stats$/, async () => {
    const engine = await loadEngine(db);
    const accRows = await db.select('accounts');
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const msgs = await db.select('messages', { filters: { created_at: `gte.${since}` }, columns: 'account_id,direction,kind,status,created_at', limit: 50000 });
    const todayStart = startOfLocalDay().getTime();
    const days = [...Array(14)].map((_, i) => localParts(new Date(Date.now() - (13 - i) * 864e5)).date);
    const STATUSES = ['contacted', 'replied', 'needs_human', 'interested', 'booked', 'won', 'lost', 'opted_out'];
    return Promise.all(wa.statuses().map(async (s) => {
      const acc = accRows.find((a) => a.id === s.id) || { id: s.id };
      const mine = msgs.filter((m) => m.account_id === s.id);
      const outreach = mine.filter((m) => m.direction === 'out' && ['first', 'followup', 'nudge'].includes(m.kind));
      const out = mine.filter((m) => m.direction === 'out');
      const byDay = Object.fromEntries(days.map((d) => [d, { date: d, sent: 0, replies: 0 }]));
      for (const m of mine) { const d = byDay[localParts(new Date(m.created_at)).date]; if (d && m.kind !== 'auto') m.direction === 'out' ? d.sent++ : d.replies++; }
      const counts = await Promise.all(STATUSES.map((st) => db.count('leads', { account_id: `eq.${s.id}`, status: `eq.${st}` })));
      const leads = Object.fromEntries(STATUSES.map((st, i) => [st, counts[i]]));
      const contacted = counts.reduce((a, b) => a + b, 0);
      const engaged = leads.replied + leads.needs_human + leads.interested + leads.booked + leads.won;
      const warmupDay = acc.warmup_started_on ? Math.floor((Date.now() - new Date(acc.warmup_started_on)) / 864e5) + 1 : null;
      const cap = dailyCap(engine, acc);
      const sentToday = outreach.filter((m) => new Date(m.created_at).getTime() >= todayStart).length;
      return {
        ...s, label: acc.label, paused: !!acc.paused, warmupDay, cap, sentToday,
        next: nextSend({ engine, acc, connected: s.connected, sentToday, cap, gapUntil: sender.next.get(s.id) || 0, lastTick: sender.lastTick }),
        sent30: out.length, delivered30: out.filter((m) => ['delivered', 'read'].includes(m.status)).length, read30: out.filter((m) => m.status === 'read').length,
        failed30: out.filter((m) => m.status === 'failed').length, replies30: mine.filter((m) => m.direction === 'in' && m.kind !== 'auto').length, auto30: mine.filter((m) => m.kind === 'auto').length,
        leads, contacted, engaged, replyRate: contacted ? Math.round((engaged / contacted) * 100) : 0, days: Object.values(byDay),
      };
    }));
  }],
  ['GET', /^\/accounts$/, async () => { const acc = await db.select('accounts'); return wa.statuses().map((s) => ({ ...s, ...(acc.find((a) => a.id === s.id) || {}), state: s.state })); }],
  ['GET', /^\/accounts\/([A-D])\/qr$/, async (q, b, m) => ({ qr: wa.get(m[1])?.qrDataUrl || null, state: wa.get(m[1])?.state })],
  ['POST', /^\/accounts\/([A-D])\/link$/, async (q, b, m) => { await wa.get(m[1]).relink(); return { ok: true }; }],
  ['POST', /^\/accounts\/([A-D])\/logout$/, async (q, b, m) => { await wa.get(m[1]).logout(); return { ok: true }; }],
  ['PATCH', /^\/accounts\/([A-D])$/, async (q, b, m) => {
    const patch = { id: m[1], updated_at: new Date().toISOString() };
    for (const k of ['label', 'paused', 'daily_cap']) if (k in b) patch[k] = b[k];
    return (await db.upsert('accounts', patch, 'id'))[0];
  }],
  ['GET', /^\/settings$/, async () => ({ engine: await loadEngine(db), agent: await loadAgent(db), defaults: DEFAULT_ENGINE })],
  ['PUT', /^\/settings\/engine$/, async (q, b) => { const v = { ...(await loadEngine(db)), ...b }; await saveEngine(db, v); return v; }],
  ['PUT', /^\/settings\/agent$/, async (q, b) => { const v = { ...(await loadAgent(db)), ...b }; await saveAgent(db, v); return v; }],
  ['POST', /^\/control$/, async (q, b) => { const v = { ...(await loadEngine(db)), paused: !!b.paused }; await saveEngine(db, v); logActivity(db, 'control', v.paused ? 'Sending paused' : 'Sending resumed'); return { paused: v.paused }; }],
  ['GET', /^\/products$/, async () => ({ rows: await db.select('products', { order: 'category.asc,name.asc', limit: 500 }) })],
  ['POST', /^\/products\/seed$/, async () => {
    const items = JSON.parse(readFileSync(join(config.root, 'data', 'products.json'), 'utf8'));
    await db.upsert('products', items, 'name'); return { count: items.length };
  }],
  ['PATCH', /^\/products\/([0-9a-f-]{36})$/, async (q, b, m) => (await db.update('products', { id: `eq.${m[1]}` }, Object.fromEntries(Object.entries(b).filter(([k]) => ['price_ngn', 'in_stock'].includes(k)))))[0]],
  ['POST', /^\/agent\/test$/, async (q, b) => {
    const history = (b.messages || []).map((t) => ({ direction: t.from === 'customer' ? 'in' : 'out', body: String(t.text) }));
    return runAgent({ agent: { ...(await loadAgent(db)), ...(b.agent || {}) }, engine: await loadEngine(db), lead: { name: b.businessName || 'Test Business', sector: b.sector || 'Hotel / guest house', city: b.city || 'Lagos' }, history, products: await db.select('products', { limit: 500 }) });
  }],
  ['POST', /^\/assistant$/, async (q, b) => {
    const r = await runAssistant({ messages: Array.isArray(b.messages) ? b.messages : [], dispatch });
    if (r.actions.some((a) => a.ok)) logActivity(db, 'assistant', r.actions.filter((a) => a.ok).map((a) => a.tool).join(', '));
    return r;
  }],
  // Staff access. The dashboard server calls /staff/ensure on every sign-in check; only admins can reach the others.
  ['POST', /^\/staff\/ensure$/, async (q, b) => ensureStaff(db, b)],
  ['GET', /^\/staff$/, async () => ({ rows: await db.select('staff', { order: 'created_at.asc', limit: 500 }) })],
  ['PATCH', /^\/staff\/([0-9a-f-]{36})$/, async (q, b, m, actor) => setRole(db, { targetId: m[1], role: b.role, actor })],
  ['GET', /^\/activity$/, async () => ({ rows: await db.select('activity', { order: 'at.desc', limit: 60 }) })],
];

/** Lets the dashboard assistant call routes in-process, with the same validation as HTTP callers. */
async function dispatch(method, path, q = {}, b = {}) {
  for (const [m, re, fn] of routes) { const mm = re.exec(path); if (mm && m === method) return fn(q, b, mm); }
  throw new Error(`No route ${method} ${path}`);
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const q = Object.fromEntries(url.searchParams);
  try {
    if (url.pathname !== '/health' && !authed(req)) return ok(res, { error: 'Unauthorized' }, 401);
    for (const [method, re, fn] of routes) {
      const m = re.exec(url.pathname);
      if (m && req.method === method) return ok(res, await fn(q, method === 'GET' ? {} : await body(req), m, actorOf(req)));
    }
    ok(res, { error: 'Not found' }, 404);
  } catch (e) { ok(res, { error: e.message }, e.status || 500); }
}).listen(config.port, '127.0.0.1', async () => {
  console.log(`OIC Solar engine on http://127.0.0.1:${config.port}`);
  const items = JSON.parse(readFileSync(join(config.root, 'data', 'products.json'), 'utf8'));
  if (!(await db.count('products').catch(() => 1))) await db.upsert('products', items, 'name').catch((e) => console.error('Product seed failed:', e.message));
  const seedFile = join(config.root, 'data', 'seed-leads.json');
  if (existsSync(seedFile) && !(await db.count('leads').catch(() => 1))) {
    const n = await saveLeads(db, JSON.parse(readFileSync(seedFile, 'utf8'))).catch((e) => { console.error('Seed failed:', e.message); return 0; });
    console.log(`Loaded ${n} prefilled leads`);
  }
  await wa.startAll(); sender.start();
});
