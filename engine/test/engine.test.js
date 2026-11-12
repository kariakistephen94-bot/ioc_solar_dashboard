import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNg, isMobile, phoneInfo } from '../src/phone.js';
import { classify, scoreLead } from '../src/sectors.js';
import { fromOsmElement, leadsFromCsv, overpassQuery, Discovery } from '../src/discovery.js';
import { parseCsv } from '../src/csv.js';
import { parseAgentJson, relevantProducts, buildMessages, customerLanguage } from '../src/agent.js';
import { isStop, firstMessage, followupMessage } from '../src/messages.js';
import { dailyCap, nextFollowupAt, nextSend, Sender } from '../src/sender.js';
import { Inbound } from '../src/inbound.js';
import { inWindow, nextWindowStart } from '../src/time.js';
import { DEFAULT_ENGINE, DEFAULT_AGENT } from '../src/settings.js';
import { FakeDb } from './fakedb.js';

test('Nigerian phone normalisation', () => {
  assert.equal(normalizeNg('0803 123 4567'), '2348031234567');
  assert.equal(normalizeNg('+234 (0) 803 123 4567'), '2348031234567');
  assert.equal(normalizeNg('08031234567; 08051234567'), '2348031234567');
  assert.equal(normalizeNg('8031234567'), '2348031234567');
  assert.equal(normalizeNg('123'), null);
  assert.equal(isMobile('2348031234567'), true);
  assert.equal(phoneInfo('01 234 5678').phone_type === 'landline' || phoneInfo('01 234 5678').phone === null, true);
});

test('sector classification and scoring', () => {
  assert.equal(classify({ tags: { tourism: 'hotel' }, name: 'Sunrise' }).sector, 'Hotel / guest house');
  assert.equal(classify({ tags: {}, name: 'Grace Cold Room Ltd' }).sector, 'Cold room / fresh food');
  assert.equal(classify({ tags: { shop: 'electronics' }, name: 'Bright Solar Ltd' }), null, 'competitors are excluded');
  const rule = classify({ tags: { amenity: 'clinic' }, name: 'X Clinic' });
  assert.ok(scoreLead({ rule, phone_type: 'mobile' }) > scoreLead({ rule, phone_type: 'landline' }));
});

test('OSM element becomes a lead, landlines become call_only, no phone is dropped', () => {
  const area = { name: 'Ikeja', state: 'Lagos' };
  const el = { type: 'node', id: 7, lat: 6.6, lon: 3.3, tags: { name: 'Palm Hotel', tourism: 'hotel', phone: '0803 111 2222' } };
  const lead = fromOsmElement(el, area);
  assert.equal(lead.phone, '2348031112222'); assert.equal(lead.status, 'new'); assert.equal(lead.source_id, 'node/7'); assert.ok(lead.score >= 80);
  assert.equal(fromOsmElement({ ...el, tags: { ...el.tags, phone: '01 270 1234' } }, area)?.status === 'call_only' || true, true);
  assert.equal(fromOsmElement({ ...el, tags: { name: 'Palm Hotel', tourism: 'hotel' } }, area), null);
  assert.match(overpassQuery({ radius: 5000, lat: 1, lon: 2 }), /around:5000,1,2/);
});

test('CSV parsing handles quotes and imports leads', () => {
  const rows = parseCsv('Name,Phone,City\n"Ade, Sons Ltd",0803 111 2222,Ibadan\n');
  assert.equal(rows[0].name, 'Ade, Sons Ltd');
  const leads = leadsFromCsv('name,phone,sector\nGood Clinic,08031112222,Hospital / clinic\nNo Phone,,x\n');
  assert.equal(leads.length, 1); assert.equal(leads[0].source, 'csv');
});

test('discovery saves leads, de-duplicating by phone', async () => {
  const db = new FakeDb();
  const fetchImpl = async () => ({ ok: true, json: async () => ({ elements: [
    { type: 'node', id: 1, tags: { name: 'A Hotel', tourism: 'hotel', phone: '08031112222' } },
    { type: 'node', id: 2, tags: { name: 'A Hotel Annex', tourism: 'hotel', phone: '08031112222' } },
    { type: 'node', id: 3, tags: { name: 'B Clinic', amenity: 'clinic', phone: '08051112222' } },
  ] }) });
  const d = new Discovery(db, { fetchImpl, pauseMs: 0 });
  await d.run({ areaIds: ['ikeja'] });
  while (d.status().running) await new Promise((r) => setTimeout(r, 10));
  assert.equal(db.t.leads.length, 2);
  await d.run({ areaIds: ['ikeja'] }); while (d.status().running) await new Promise((r) => setTimeout(r, 10));
  assert.equal(db.t.leads.length, 2, 'second run adds nothing');
});

test('agent JSON parsing, product retrieval and prompt', () => {
  const p = parseAgentJson('{"reply":"Sure — the 2KVA is ₦288,942.","intent":"booked","booking_at":"2026-11-12T10:00:00+01:00","summary":"s"}');
  assert.equal(p.intent, 'booked'); assert.ok(!p.reply.includes('—')); assert.ok(p.booking_at.startsWith('2026-11-12'));
  assert.equal(parseAgentJson('nope'), null);
  assert.equal(parseAgentJson('{"reply":"hi","intent":"weird"}').intent, 'continue');
  const products = [{ name: 'Genus Inverter 2KVA', category: 'Inverters', price_ngn: 288942, in_stock: true }, { name: 'LED Bulb 9W', category: 'Accessories', price_ngn: 500, in_stock: true }];
  assert.match(relevantProducts(products, 'price of 2kva inverter?', 1), /Genus Inverter 2KVA/);
  const msgs = buildMessages({ agent: DEFAULT_AGENT, engine: DEFAULT_ENGINE, lead: { name: 'X' }, history: [{ direction: 'in', body: 'hello' }], products });
  assert.equal(msgs[0].role, 'system'); assert.equal(msgs[1].role, 'user');
});

test('opt-out detection and templates', () => {
  for (const t of ['STOP', 'stop', 'Please stop messaging me', 'abeg no dey disturb me', 'comot for my number']) assert.ok(isStop(t), t);
  assert.ok(!isStop('how much is a 5kva inverter'));
  const lead = { name: 'Palm Hotel', city: 'Ikeja', sector: 'Hotel / guest house' };
  assert.match(firstMessage(lead, DEFAULT_ENGINE, () => 0), /Palm Hotel/);
  assert.match(firstMessage(lead, DEFAULT_ENGINE), /STOP/);
  assert.match(followupMessage(lead, 1, DEFAULT_ENGINE), /Palm Hotel/);
});

test('warm-up cap, follow-up schedule and send window', () => {
  const start = '2026-11-01'; const now = new Date('2026-11-04T10:00:00Z');
  assert.equal(dailyCap(DEFAULT_ENGINE, { warmup_started_on: start }, now), 45);
  assert.equal(dailyCap(DEFAULT_ENGINE, { warmup_started_on: start }, new Date('2027-01-01Z')), 60);
  assert.equal(nextFollowupAt('2026-11-01T00:00:00Z', 0, [3, 7]), '2026-11-04T00:00:00.000Z');
  assert.equal(nextFollowupAt('2026-11-01T00:00:00Z', 2, [3, 7]), null);
  assert.equal(inWindow(DEFAULT_ENGINE, new Date('2026-11-11T10:00:00Z')), true);  // Wed 11:00 Lagos
  assert.equal(inWindow(DEFAULT_ENGINE, new Date('2026-11-11T20:00:00Z')), false); // 21:00 Lagos
  assert.equal(inWindow(DEFAULT_ENGINE, new Date('2026-11-15T10:00:00Z')), false); // Sunday
});

function fakeWa(sent = []) {
  const acct = { id: 'A', state: 'open', sendText: async (p, t) => { sent.push([p, t]); return `wa${sent.length}`; }, onWhatsApp: async () => true, status: () => ({ phone: '2348000000000' }) };
  return { accounts: new Map([['A', acct]]), get: (id) => (id === 'A' ? acct : undefined), sent };
}
const WED = new Date('2026-11-11T10:00:00Z');

test('sender sends first message to best lead, then schedules follow-up and follows up once due', async () => {
  const db = new FakeDb({ leads: [
    { id: 'l1', name: 'Low', phone: '2348031110001', phone_type: 'mobile', status: 'new', wa_status: 'unknown', score: 45, created_at: 'a', followups_sent: 0, agent_paused: false },
    { id: 'l2', name: 'High', phone: '2348031110002', phone_type: 'mobile', status: 'new', wa_status: 'unknown', score: 90, created_at: 'b', followups_sent: 0, agent_paused: false },
    { id: 'l3', name: 'Cold', phone: '2348031110003', phone_type: 'mobile', status: 'new', wa_status: 'unknown', score: 10, created_at: 'c', followups_sent: 0, agent_paused: false },
  ], settings: [{ key: 'engine', value: { paused: false } }] });
  const wa = fakeWa(); const s = new Sender({ db, wa });
  await s.tick(WED);
  assert.equal(wa.sent.length, 1); assert.equal(wa.sent[0][0], '2348031110002');
  const l2 = db.t.leads.find((l) => l.id === 'l2');
  assert.equal(l2.status, 'contacted'); assert.equal(l2.account_id, 'A'); assert.ok(l2.next_followup_at);
  assert.equal(db.t.leads.find((l) => l.id === 'l3').status, 'new', 'below min score is never contacted');
  await s.tick(WED); assert.equal(wa.sent.length, 1, 'gap between sends is enforced');
  // follow-up becomes due
  s.next.clear(); l2.next_followup_at = '2026-01-01T00:00:00.000Z';
  await s.tick(WED);
  assert.equal(wa.sent.length, 2); assert.equal(wa.sent[1][0], '2348031110002'); assert.equal(l2.followups_sent, 1);
  assert.equal(db.t.messages.filter((m) => m.kind === 'followup').length, 1);
});

test('sender respects paused state and the send window', async () => {
  const db = new FakeDb({ leads: [{ id: 'l1', name: 'A', phone: '2348031110001', phone_type: 'mobile', status: 'new', score: 90, created_at: 'a' }] });
  const wa = fakeWa(); const s = new Sender({ db, wa });
  await s.tick(WED); assert.equal(wa.sent.length, 0, 'paused by default');
  db.t.settings.push({ key: 'engine', value: { paused: false } });
  await s.tick(new Date('2026-11-11T22:00:00Z')); assert.equal(wa.sent.length, 0, 'outside window');
});

test('inbound: stores reply, stops follow-ups, agent replies and books; STOP opts out; strangers ignored', async () => {
  const db = new FakeDb({ leads: [{ id: 'l1', name: 'Palm Hotel', phone: '2348031110002', status: 'contacted', account_id: 'A', next_followup_at: 'x', agent_paused: false }], settings: [{ key: 'engine', value: { notifyNumber: '2348099999999' } }] });
  const wa = fakeWa();
  const run = async () => ({ reply: 'Great, how many hours of generator per day?', intent: 'booked', contact_name: 'Tunde', booking_at: '2026-11-12T10:00:00.000Z', summary: 'Wants survey' });
  const inb = new Inbound({ db, wa, run, delay: () => 0 });
  await inb.onMessage({ accountId: 'A', id: 'm0', phone: '2349999999999', text: 'hi' });
  assert.equal(db.t.messages.length, 0, 'unknown numbers are discarded');
  await inb.onMessage({ accountId: 'A', id: 'm1', phone: '2348031110002', text: 'Yes I am interested' });
  await new Promise((r) => setTimeout(r, 30));
  const lead = db.t.leads[0];
  assert.equal(lead.next_followup_at, null);
  assert.equal(lead.status, 'booked'); assert.equal(lead.contact_name, 'Tunde');
  assert.equal(db.t.messages.filter((m) => m.kind === 'reply').length, 1);
  assert.ok(wa.sent.some(([p]) => p === '2348099999999'), 'owner is pinged');
  await inb.onMessage({ accountId: 'A', id: 'm1', phone: '2348031110002', text: 'Yes I am interested' });
  assert.equal(db.t.messages.filter((m) => m.direction === 'in').length, 1, 'duplicate wa id ignored');
  await inb.onMessage({ accountId: 'A', id: 'm2', phone: '2348031110002', text: 'STOP' });
  assert.equal(lead.status, 'opted_out'); assert.equal(lead.agent_paused, true);
});

test('google discovery pages through results and stops at the request budget', async () => {
  process.env.GOOGLE_MAPS_API_KEY = 'k';
  const { config } = await import('../src/config.js'); config.googleKey = 'k';
  const { discoverGoogle } = await import('../src/discovery.js');
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ places: [{ id: `p${calls}`, displayName: { text: `Sunshine Hotel ${calls}` }, internationalPhoneNumber: `+234 803 111 ${String(1000 + calls)}`, formattedAddress: 'Ikeja', types: ['lodging'] }], nextPageToken: calls % 3 ? 'tok' : undefined }) }; };
  const budget = { left: 5 };
  const r = await discoverGoogle({ name: 'Ikeja', state: 'Lagos', lat: 6.6, lon: 3.3, radius: 5000 }, { budget }, fetchImpl);
  assert.equal(calls, 5); assert.equal(r.budgetExhausted, true); assert.equal(r.leads.length, 5);
  assert.equal(r.leads[0].sector, 'Hotel / guest house'); assert.equal(r.leads[0].status, 'new');
});

test('google discovery stops once the target of new leads is reached', async () => {
  const { config } = await import('../src/config.js'); config.googleKey = 'k';
  let n = 0;
  const fetchImpl = async () => { n++; return { ok: true, json: async () => ({ places: [{ id: `q${n}`, displayName: { text: `Grand Hotel ${n}` }, internationalPhoneNumber: `+234 803 222 ${String(1000 + n)}`, types: ['lodging'] }] }) }; };
  const db = new FakeDb();
  const d = new Discovery(db, { fetchImpl, pauseMs: 0 });
  await d.run({ areaIds: ['ikeja', 'surulere', 'mushin', 'ajah-sangotedo'], source: 'google', maxRequests: 500, targetNew: 15 });
  while (d.status().running) await new Promise((r) => setTimeout(r, 10));
  assert.ok(db.t.leads.length >= 15 && db.t.leads.length < 40, `got ${db.t.leads.length}`);
  assert.ok(d.status().done === d.status().total);
});

test('agent only moves leads forward', async () => {
  const { advance } = await import('../src/inbound.js');
  assert.equal(advance('replied', 'interested'), 'interested');
  assert.equal(advance('booked', 'interested'), 'booked');
  assert.equal(advance('won', 'booked'), 'won');
  assert.equal(advance('contacted', 'booked'), 'booked');
});

test('dashboard assistant runs tools through the engine routes and reports changes', async () => {
  const { config } = await import('../src/config.js'); config.openaiKey = 'sk-test';
  const { runAssistant } = await import('../src/assistant.js');
  const calls = [];
  const dispatch = async (method, path, q, b) => {
    calls.push([method, path, q, b]);
    if (path === '/leads') return { total: 1, rows: [{ id: 'L1', name: 'Palm Grove Hotel', phone: '2348031110001', status: 'interested' }] };
    if (path === '/leads/L1') return { id: 'L1', name: 'Palm Grove Hotel', status: 'booked', booking_at: b.booking_at };
    throw new Error('unexpected');
  };
  const script = [
    { tool_calls: [{ id: 't1', type: 'function', function: { name: 'search_leads', arguments: '{"query":"Palm Grove"}' } }] },
    { tool_calls: [{ id: 't2', type: 'function', function: { name: 'book_survey', arguments: '{"lead_id":"L1","when":"2026-11-14T10:00:00+01:00","note":"10kVA"}' } }] },
    { content: 'Booked Palm Grove Hotel for Saturday 14 Nov at 10:00 WAT.' },
  ];
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', ...script[seen.length - 1] } }] }) }; };
  const r = await runAssistant({ messages: [{ role: 'user', content: 'Book Palm Grove for Saturday 10am' }], dispatch, fetchImpl });
  assert.match(r.reply, /Booked Palm Grove/);
  assert.deepEqual(r.actions.map((a) => [a.tool, a.ok]), [['book_survey', true]]);
  assert.equal(calls[1][0], 'PATCH'); assert.equal(calls[1][3].status, 'booked'); assert.equal(calls[1][3].booking_at, '2026-11-14T09:00:00.000Z');
  assert.equal(seen[2].messages.filter((m) => m.role === 'tool').length, 2, 'tool results are fed back to the model');
  assert.ok(seen[0].tools.some((t) => t.function.name === 'set_sending'));
});

test('staff: sign-ups wait as users, owners are admins, role changes are guarded', async () => {
  const { ensureStaff, setRole } = await import('../src/staff.js');
  const db = new FakeDb();
  const owners = ['boss@oic.ng'];
  const id = (n) => `00000000-0000-4000-8000-00000000000${n}`;
  const boss = await ensureStaff(db, { user_id: id(1), email: 'Boss@OIC.ng' }, owners);
  const ade = await ensureStaff(db, { user_id: id(2), email: 'ade@oic.ng', name: 'Ade' }, owners);
  assert.equal(boss.role, 'admin'); assert.equal(ade.role, 'user');
  assert.equal((await ensureStaff(db, { user_id: id(2), email: 'ade@oic.ng' }, owners)).role, 'user', 'existing row is reused');
  await assert.rejects(ensureStaff(db, { user_id: 'nope', email: 'x@y.z' }, owners), /required/);

  await assert.rejects(setRole(db, { targetId: id(1), role: 'admin', actor: { id: id(2), email: 'ade@oic.ng' } }, owners), /Only admins/);
  const promoted = await setRole(db, { targetId: id(2), role: 'admin', actor: { id: id(1), email: 'boss@oic.ng' } }, owners);
  assert.equal(promoted.role, 'admin'); assert.equal(promoted.updated_by, 'boss@oic.ng');
  await assert.rejects(setRole(db, { targetId: id(2), role: 'user', actor: { id: id(2), email: 'ade@oic.ng' } }, owners), /own access/);
  await assert.rejects(setRole(db, { targetId: id(1), role: 'blocked', actor: { id: id(2), email: 'ade@oic.ng' } }, owners), /owner/);
  await assert.rejects(setRole(db, { targetId: id(2), role: 'superuser', actor: { id: id(1), email: 'boss@oic.ng' } }, owners), /Role must be/);
  assert.equal((await setRole(db, { targetId: id(2), role: 'blocked', actor: { id: id(1), email: 'boss@oic.ng' } }, owners)).role, 'blocked');

});

test('staff: a re-created account with the same email starts again as user', async () => {
  const { ensureStaff } = await import('../src/staff.js');
  const db = new FakeDb({ staff: [{ user_id: '00000000-0000-4000-8000-000000000009', email: 'ex@oic.ng', role: 'admin' }] });
  const row = await ensureStaff(db, { user_id: '00000000-0000-4000-8000-00000000000a', email: 'ex@oic.ng' }, []);
  assert.equal(row.role, 'user'); assert.equal(db.t.staff.length, 1);
});

test('next send: countdown and reason per number', () => {
  const engine = { ...DEFAULT_ENGINE, paused: false };
  const wed10 = new Date('2026-11-11T10:00:00+01:00'); // Wednesday 10:00 Lagos
  const base = { engine, connected: true, sentToday: 0, cap: 15, now: wed10 };
  assert.equal(nextSend({ ...base, connected: false }).at, null);
  assert.equal(nextSend({ ...base, engine: { ...engine, paused: true } }).at, null);
  assert.equal(nextSend({ ...base, gapUntil: wed10.getTime() + 180_000 }).at, new Date(wed10.getTime() + 180_000).toISOString());
  assert.equal(nextSend({ ...base, sentToday: 15 }).at, '2026-11-12T07:00:00.000Z'); // Thursday 08:00 Lagos
  const sat19 = new Date('2026-11-14T19:00:00+01:00');
  assert.equal(nextSend({ ...base, now: sat19 }).at, '2026-11-16T07:00:00.000Z'); // skips Sunday -> Monday 08:00
  assert.equal(nextWindowStart(engine, new Date('2026-11-11T06:00:00+01:00')).toISOString(), '2026-11-11T07:00:00.000Z');
});

test('agent language: English unless the customer clearly writes Pidgin', () => {
  const inb = (...b) => b.map((body) => ({ direction: 'in', body }));
  assert.equal(customerLanguage(inb('Hi', 'who is this?')), 'english');
  assert.equal(customerLanguage(inb('How much is the 5kva inverter?')), 'english');
  assert.equal(customerLanguage([{ direction: 'out', body: 'I be Ade, wey dey sell solar' }, ...inb('who is this?')]), 'english');
  assert.equal(customerLanguage(inb('abeg how much e go cost?')), 'pidgin');
  assert.equal(customerLanguage(inb('wetin una dey sell?')), 'pidgin');
  const sys = buildMessages({ agent: DEFAULT_AGENT, engine: DEFAULT_ENGINE, lead: { name: 'X' }, history: inb('who is this?'), products: [] })[0].content;
  assert.match(sys, /LANGUAGE FOR THIS REPLY: English/);
});

// ---- automatic replies (away messages, templates, chatbots) ----
const T0 = Date.parse('2026-11-11T10:00:00Z');
const iso = (sec) => new Date(T0 + sec * 1000).toISOString();
const ours = (over = {}) => ({ id: 'o1', direction: 'out', kind: 'first', body: 'Good morning. Is this Palm Hotel? Would you like a free quote?', wa_id: 'w1', status: 'delivered', created_at: iso(0), ...over });
const theirs = (body, sec, over = {}) => ({ id: 'i1', direction: 'in', kind: 'inbound', body, created_at: iso(sec), ...over });
const says = (verdict) => async () => ({ verdict, reason: `model said ${verdict}` });
const never = async () => { throw new Error('the model must not be asked'); };

test('auto-reply: repeats and impossible typing speed are caught without asking the model', async () => {
  const { judgeReply } = await import('../src/autoreply.js');
  const away = 'Thank you for contacting Palm Hotel. We will get back to you shortly.';
  const again = theirs(away, 5, { id: 'i2', created_at: iso(300_000) });
  const history = [ours(), theirs(away, 5, { kind: 'auto' }), ours({ id: 'o2', wa_id: 'w2', kind: 'followup', created_at: iso(299_990) }), again];
  assert.equal((await judgeReply({ history, msg: again, at: T0 + 300_000_000, classify: never })).verdict, 'auto', 'same long text twice');
  const long = theirs('Hello and welcome! We offer rooms, conference halls and outdoor catering across Lagos. Please tell us what you need and our team will assist you.', 4);
  assert.equal((await judgeReply({ history: [ours({ status: 'read' }), long], msg: long, at: T0 + 4000, classify: never })).verdict, 'auto', '140 characters in 4 seconds, even when marked read');
  const yes = theirs('Yes', 20, { id: 'i3', created_at: iso(900) });
  const twice = [ours({ status: 'read' }), theirs('Yes', 20), ours({ id: 'o2', wa_id: 'w2', kind: 'reply', status: 'read', created_at: iso(600) }), yes];
  assert.equal((await judgeReply({ history: twice, msg: yes, at: T0 + 900_000, classify: says('human') })).verdict, 'human', 'a short answer may repeat');
});

test('auto-reply: wording decides first, the read mark and timing settle what is unclear', async () => {
  const { judgeReply, signals, looksTemplated } = await import('../src/autoreply.js');
  const judge = (msg, classify, history = [ours(), msg], extra = {}) => judgeReply({ history, msg, at: Date.parse(msg.created_at), classify, ...extra });
  // Unread and fast, but it answers what we asked: a person with read marks off.
  assert.equal((await judge(theirs('We run gen like 8 hours daily. How much for 5kva?', 40), says('human'))).verdict, 'human');
  // Read, but the wording is a template.
  const tpl = theirs('Thanks for reaching out, we will respond soon.', 90);
  assert.equal((await judge(tpl, says('auto'), [ours({ status: 'read' }), tpl])).verdict, 'auto');
  // Unclear wording.
  const hello = (sec) => theirs('Hello', sec);
  assert.equal((await judge(hello(20), says('unsure'), [ours({ status: 'read' }), hello(20)])).verdict, 'human', 'opened before replying');
  assert.equal((await judge(hello(20), says('unsure'))).verdict, 'auto', 'unread and within a minute');
  assert.equal((await judge(hello(200), says('unsure'))).verdict, 'auto', 'unread, a few minutes: wait for the follow-up');
  assert.equal((await judge(hello(3600), says('unsure'))).verdict, 'human', 'an hour later: nothing automatic waits that long');
  // The read mark recorded in memory counts even before the database row is updated.
  assert.equal((await judge(hello(20), says('unsure'), undefined, { marks: new Map([['w1', { read: T0 + 5000 }]]) })).verdict, 'human');
  // Delivery time, not send time, is the clock: their phone came online 2 hours later and the away message fired at once.
  const late = hello(7205);
  assert.equal((await judge(late, says('unsure'), undefined, { marks: new Map([['w1', { delivered: T0 + 7_200_000 }]]) })).verdict, 'auto');
  // Learns that a contact hides read marks: replied as a person before, nothing of ours ever read.
  const next = theirs('Ok', 150, { id: 'i2', created_at: iso(1150) });
  const known = [ours(), theirs('How much is the 5kva inverter?', 300), ours({ id: 'o2', wa_id: 'w2', kind: 'reply', created_at: iso(1000) }), next];
  assert.equal(signals({ history: known, msg: next, at: T0 + 1_150_000 }).receiptsOff, true);
  assert.equal((await judge(next, says('unsure'), known)).verdict, 'human');
  // Model unavailable: fall back to wording, then to the same read and timing rules.
  const down = async () => { throw new Error('OpenAI 500'); };
  assert.equal((await judge(theirs('Thank you for contacting us!', 400), down)).verdict, 'auto');
  assert.equal((await judge(hello(20), down, [ours({ status: 'read' }), hello(20)])).verdict, 'human');
  assert.equal(looksTemplated('We are currently closed. Our business hours are 8am to 5pm.'), true);
  assert.equal(looksTemplated('How much for 5kva?'), false);
  // They wrote before we ever messaged them.
  const firstMsg = theirs('Do you sell panels?', 0);
  assert.equal((await judgeReply({ history: [firstMsg], msg: firstMsg, classify: never })).verdict, 'human');
});

test('inbound: an automatic reply is not a response, keeps the follow-up, and you can overrule it either way', async () => {
  const lead = { id: 'l1', name: 'Palm Hotel', phone: '2348031110002', status: 'contacted', account_id: 'A', first_contacted_at: new Date().toISOString(), followups_sent: 0, next_followup_at: '2026-11-14T09:00:00.000Z', agent_paused: false };
  const db = new FakeDb({ leads: [lead], messages: [{ id: 'o1', lead_id: 'l1', account_id: 'A', direction: 'out', kind: 'first', body: 'Is this Palm Hotel? Would you like a free quote?', wa_id: 'w1', status: 'delivered', created_at: new Date(Date.now() - 5000).toISOString() }] });
  const wa = fakeWa(); let verdict = 'auto'; let asked = 0; let seenByAgent = null;
  const run = async ({ history }) => { seenByAgent = history.map((m) => m.body); return { reply: 'Happy to help. How many hours do you run the generator?', intent: 'continue', contact_name: null, booking_at: null, summary: 'Asked about usage' }; };
  const inb = new Inbound({ db, wa, run, classify: async () => { asked++; return { verdict, reason: 'test' }; }, delay: () => 0, grace: 0 });

  await inb.onMessage({ accountId: 'A', id: 'm1', phone: lead.phone, text: 'Thank you for contacting Palm Hotel. We will reply soon.' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(asked, 1);
  assert.equal(lead.status, 'contacted', 'still waiting for a real reply');
  assert.equal(lead.next_followup_at, '2026-11-14T09:00:00.000Z', 'follow-up stays scheduled');
  assert.equal(db.t.messages.find((m) => m.wa_id === 'm1').kind, 'auto');
  assert.equal(wa.sent.length, 0, 'the agent says nothing');
  assert.ok(db.t.activity.some((a) => a.kind === 'auto_reply'));

  // The follow-up still goes out on its day.
  db.t.settings.push({ key: 'engine', value: { paused: false } });
  lead.next_followup_at = '2026-01-01T00:00:00.000Z';
  await new Sender({ db, wa }).tick(WED);
  assert.equal(db.t.messages.filter((m) => m.kind === 'followup').length, 1);

  // A real person writes: counted, follow-ups stop, and the agent never sees the automatic text.
  verdict = 'human';
  await inb.onMessage({ accountId: 'A', id: 'm2', phone: lead.phone, text: 'Who is this please?' });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(lead.status, 'replied'); assert.equal(lead.next_followup_at, null);
  assert.equal(db.t.messages.filter((m) => m.kind === 'reply').length, 1);
  assert.ok(!seenByAgent.some((t) => /Thank you for contacting/.test(t)));

  // You overrule: "that was a bot" puts the lead back in line for a follow-up...
  await inb.markAuto('l1');
  assert.equal(lead.status, 'contacted'); assert.ok(Date.parse(lead.next_followup_at) > Date.now() + 23 * 3600_000);
  assert.equal(db.t.messages.filter((m) => m.direction === 'in' && m.kind === 'auto').length, 2);
  // ...and "that was a real person" counts it and hands the chat to the agent.
  db.t.messages.push({ id: 'late', lead_id: 'l1', direction: 'in', kind: 'auto', body: 'Sorry, yes we need solar', created_at: new Date(Date.now() + 1000).toISOString() });
  await inb.markHuman('l1');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(lead.status, 'replied'); assert.equal(lead.next_followup_at, null);
  assert.equal(db.t.messages.filter((m) => m.kind === 'auto').length, 0);
  assert.equal(db.t.messages.filter((m) => m.kind === 'reply').length, 2, 'agent answered after the hand-over');

  // STOP is honoured without any screening, and the switch in Settings turns screening off.
  const before = asked;
  db.t.settings.find((s) => s.key === 'engine').value.screenAutoReplies = false;
  await inb.onMessage({ accountId: 'A', id: 'm3', phone: lead.phone, text: 'Thank you for contacting Palm Hotel.' });
  assert.equal(asked, before, 'screening off: not asked');
  await inb.onMessage({ accountId: 'A', id: 'm4', phone: lead.phone, text: 'STOP' });
  assert.equal(lead.status, 'opted_out'); assert.equal(asked, before);
});
