// Paced outbound sending and the follow-up system, per WhatsApp account.
// Order of work per tick: due follow-ups, quiet-conversation nudges, then new leads (highest score first).
import { firstMessage, followupMessage } from './messages.js';
import { loadEngine, loadAgent } from './settings.js';
import { inWindow, nextWindowStart, startOfLocalDay } from './time.js';
import { runAgent } from './agent.js';
import { logActivity } from './db.js';

const rand = (a, b) => a + Math.random() * (b - a);
const DAY = 86_400_000;

export function dailyCap(engine, account, now = new Date()) {
  const start = account?.warmup_started_on ? new Date(account.warmup_started_on) : now;
  const days = Math.max(0, Math.floor((now - start) / DAY));
  return Math.min(account?.daily_cap || engine.dailyCapMax, engine.dailyCapMax, engine.warmupStart + engine.warmupStep * days);
}
export function nextFollowupAt(firstAt, sentSoFar, followupDays) {
  const d = followupDays[sentSoFar]; return d == null ? null : new Date(new Date(firstAt).getTime() + d * DAY).toISOString();
}
export function gapMs(engine, sentCount) {
  const breather = sentCount > 0 && sentCount % Math.round(rand(8, 14)) === 0 ? rand(10, 25) * 60_000 : 0;
  return rand(engine.minGapSec, engine.maxGapSec) * 1000 + breather;
}

/**
 * When this number will send its next message, and why it is waiting.
 * `at` is an ISO time or null (waiting on you: paused or not connected).
 */
export function nextSend({ engine, acc = {}, connected, sentToday, cap, gapUntil = 0, lastTick = null, now = new Date() }) {
  const t = now.getTime();
  const win = (from) => nextWindowStart(engine, from)?.toISOString() || null;
  if (!connected) return { at: null, reason: 'Not connected' };
  if (engine.paused) return { at: null, reason: 'Sending is paused. Press Resume sending at the top of this page.' };
  if (acc.paused) return { at: null, reason: 'This number is paused' };
  if (sentToday >= cap) return { at: win(new Date(startOfLocalDay(now).getTime() + DAY)), reason: `Today's limit of ${cap} reached` };
  if (!inWindow(engine, now)) return { at: win(now), reason: 'Outside sending hours' };
  if (gapUntil > t) {
    const at = new Date(gapUntil);
    return inWindow(engine, at) ? { at: at.toISOString(), reason: 'Random pause between messages' } : { at: win(at), reason: 'Outside sending hours' };
  }
  const tick = lastTick ? new Date(lastTick).getTime() + 20_000 : t + 20_000;
  return { at: new Date(Math.max(t, tick)).toISOString(), reason: 'Sends at the next check (every 20 seconds) if a lead is ready' };
}

export class Sender {
  constructor({ db, wa, run = runAgent }) {
    this.db = db; this.wa = wa; this.run = run; this.next = new Map(); this.sent = new Map(); this.timer = null; this.busy = false; this.lastTick = null;
  }
  start() { this.timer = setInterval(() => this.tick().catch((e) => logActivity(this.db, 'sender_error', e.message)), 20_000); }
  stop() { clearInterval(this.timer); }

  async tick(now = new Date()) {
    if (this.busy) return; this.busy = true;
    try {
      this.lastTick = now.toISOString();
      const engine = await loadEngine(this.db);
      if (engine.paused || !inWindow(engine, now)) return;
      const accounts = Object.fromEntries((await this.db.select('accounts')).map((a) => [a.id, a]));
      for (const wa of this.wa.accounts.values()) {
        if (wa.state !== 'open') continue;
        const acc = accounts[wa.id] || { id: wa.id };
        if (acc.paused) continue;
        if ((this.next.get(wa.id) || 0) > now.getTime()) continue;
        const sentToday = await this.db.count('messages', { account_id: `eq.${wa.id}`, direction: 'eq.out', kind: 'in.(first,followup,nudge)', created_at: `gte.${startOfLocalDay(now).toISOString()}` });
        if (sentToday >= dailyCap(engine, acc, now)) continue;
        const did = await this.sendOne(wa, engine, now);
        if (did) { const n = (this.sent.get(wa.id) || 0) + 1; this.sent.set(wa.id, n); this.next.set(wa.id, Date.now() + gapMs(engine, n)); }
      }
    } finally { this.busy = false; }
  }

  async sendOne(wa, engine, now) {
    const iso = now.toISOString();
    // 1. Follow-ups that are due, from the account that sent the first message.
    const [due] = await this.db.select('leads', { filters: { account_id: `eq.${wa.id}`, status: 'eq.contacted', next_followup_at: `lte.${iso}`, followups_sent: `lt.${engine.followupDays.length}`, agent_paused: 'eq.false' }, order: 'next_followup_at.asc', limit: 1 });
    if (due) return this.followup(wa, due, engine, now);
    // 2. Quiet-conversation nudge: replied/interested, we spoke last, 24h+ ago, never nudged yet.
    const [quiet] = await this.db.select('leads', { filters: { account_id: `eq.${wa.id}`, status: 'in.(replied,interested)', last_contacted_at: `lt.${new Date(now - DAY).toISOString()}`, agent_paused: 'eq.false' }, order: 'last_contacted_at.asc', limit: 1 });
    if (quiet && engine.agentEnabled && await this.nudge(wa, quiet, engine)) return true;
    // 3. New lead.
    for (let tries = 0; tries < 5; tries++) {
      const [lead] = await this.db.select('leads', { filters: { status: 'eq.new', phone_type: 'eq.mobile', wa_status: 'neq.no', score: `gte.${engine.minScore}` }, order: 'score.desc,created_at.asc', limit: 1 });
      if (!lead) return false;
      const claimed = await this.db.update('leads', { id: `eq.${lead.id}`, status: 'eq.new' }, { status: 'contacted', account_id: wa.id });
      if (!claimed?.length) continue;
      try {
        if (lead.wa_status !== 'yes' && !(await wa.onWhatsApp(lead.phone))) {
          await this.db.update('leads', { id: `eq.${lead.id}` }, { status: 'call_only', wa_status: 'no', account_id: null }); continue;
        }
        const text = firstMessage(lead, engine);
        const waId = await wa.sendText(lead.phone, text);
        await this.db.insert('messages', { lead_id: lead.id, account_id: wa.id, direction: 'out', kind: 'first', body: text, wa_id: waId });
        await this.db.update('leads', { id: `eq.${lead.id}` }, { wa_status: 'yes', first_contacted_at: iso, last_contacted_at: iso, next_followup_at: nextFollowupAt(iso, 0, engine.followupDays) });
        return true;
      } catch (e) {
        await this.db.update('leads', { id: `eq.${lead.id}` }, { status: 'new', account_id: null, notes: `send failed: ${e.message}`.slice(0, 200) });
        this.next.set(wa.id, Date.now() + 5 * 60_000); logActivity(this.db, 'send_failed', `${lead.name}: ${e.message}`); return false;
      }
    }
    return false;
  }

  async followup(wa, lead, engine, now) {
    const text = followupMessage(lead, lead.followups_sent, engine);
    try {
      const waId = await wa.sendText(lead.phone, text);
      await this.db.insert('messages', { lead_id: lead.id, account_id: wa.id, direction: 'out', kind: 'followup', body: text, wa_id: waId });
      const n = lead.followups_sent + 1;
      await this.db.update('leads', { id: `eq.${lead.id}` }, { followups_sent: n, last_contacted_at: now.toISOString(), next_followup_at: nextFollowupAt(lead.first_contacted_at, n, engine.followupDays) });
      return true;
    } catch (e) { this.next.set(wa.id, Date.now() + 5 * 60_000); logActivity(this.db, 'send_failed', `${lead.name} follow-up: ${e.message}`); return false; }
  }

  async nudge(wa, lead, engine) {
    const history = (await this.db.select('messages', { filters: { lead_id: `eq.${lead.id}` }, order: 'created_at.desc', limit: 40 })).reverse().filter((m) => m.kind !== 'auto');
    if (!history.length || history[history.length - 1].direction !== 'out' || history.some((m) => m.kind === 'nudge')) return false;
    const out = await this.run({ agent: await loadAgent(this.db), engine, lead, history, products: await this.db.select('products', { limit: 500 }),
      extra: 'The customer has gone quiet for a day. Write ONE short, friendly nudge that adds value (for example offers a quick quote or survey slot). Do not repeat your last message. intent must be "continue".' });
    if (!out.reply) return false;
    const waId = await wa.sendText(lead.phone, out.reply);
    await this.db.insert('messages', { lead_id: lead.id, account_id: wa.id, direction: 'out', kind: 'nudge', body: out.reply, wa_id: waId });
    await this.db.update('leads', { id: `eq.${lead.id}` }, { last_contacted_at: new Date().toISOString() });
    return true;
  }
}
