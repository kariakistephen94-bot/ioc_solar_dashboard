// Handles every inbound WhatsApp message: store it, honour STOP, screen out automatic replies, then let the agent reply.
import { runAgent } from './agent.js';
import { classifyReply, judgeReply, signals } from './autoreply.js';
import { isStop } from './messages.js';
import { loadAgent, loadEngine } from './settings.js';
import { logActivity } from './db.js';
import { startOfLocalDay } from './time.js';
import { nextFollowupAt } from './sender.js';

const RANK = { new: 0, contacted: 1, replied: 2, needs_human: 2, interested: 3, booked: 4, won: 5 };
export const advance = (from, to) => ((RANK[to] ?? 0) > (RANK[from] ?? -1) ? to : from);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86_400_000;
/** A lead's latest messages, oldest first. */
export const recentMessages = async (db, leadId, n = 40) => (await db.select('messages', { filters: { lead_id: `eq.${leadId}` }, order: 'created_at.desc', limit: n })).reverse();

export class Inbound {
  constructor({ db, wa, run = runAgent, classify = classifyReply, delay = () => 15_000 + Math.random() * 30_000, grace = 4000, sleepImpl = sleep }) {
    this.db = db; this.wa = wa; this.run = run; this.classify = classify; this.delay = delay; this.grace = grace; this.sleep = sleepImpl;
    this.timers = new Map(); this.marks = new Map();
  }

  /** Remember when each of our messages was delivered and read, to time replies against. */
  onReceipt({ id, status, at = Date.now() }) {
    if (!id || !['delivered', 'read'].includes(status)) return;
    const mark = this.marks.get(id) || {};
    mark[status] ??= at; if (status === 'read') mark.delivered ??= at;
    this.marks.set(id, mark);
    if (this.marks.size > 5000) this.marks.delete(this.marks.keys().next().value);
  }

  async onMessage(m) {
    if (!m.phone) { if (m.rawJid && /@lid$/.test(m.rawJid)) logActivity(this.db, 'inbound_unresolved', `Message from unresolved id ${m.rawJid} ignored`); return; }
    const [lead] = await this.db.select('leads', { filters: { phone: `eq.${m.phone}` }, limit: 1 });
    if (!lead) return; // only people we contacted are stored
    const body = m.text || (m.hasMedia ? '[media message]' : null); if (!body) return;
    const dup = m.id ? await this.db.select('messages', { filters: { wa_id: `eq.${m.id}` }, limit: 1 }) : [];
    if (dup.length) return;
    const now = Date.now();
    const at = m.at > 0 && m.at <= now ? m.at : now; // WhatsApp's own time for the message, when it is sane
    const [row] = await this.db.insert('messages', { lead_id: lead.id, account_id: m.accountId, direction: 'in', kind: 'inbound', body, wa_id: m.id || null, status: 'delivered' });
    const accountId = lead.account_id || m.accountId;
    const seen = { last_inbound_at: new Date().toISOString(), account_id: accountId };
    if (isStop(body)) { // STOP is honoured at once, whoever or whatever sent it
      await this.db.update('leads', { id: `eq.${lead.id}` }, { ...seen, next_followup_at: null, status: 'opted_out', agent_paused: true });
      try { await this.wa.get(accountId)?.sendText(m.phone, 'Understood, I will not message you again. Sorry for the interruption.'); } catch { /* best effort */ }
      logActivity(this.db, 'opt_out', lead.name); return;
    }
    const engine = await loadEngine(this.db);
    const verdict = engine.screenAutoReplies === false ? { verdict: 'human' } : await this.screen(lead, row, at);
    if (verdict.verdict === 'auto') {
      // Not a response: the lead stays where it is, its follow-up stays scheduled and the agent says nothing.
      await this.db.update('messages', { id: `eq.${row.id}` }, { kind: 'auto' });
      await this.db.update('leads', { id: `eq.${lead.id}` }, seen);
      logActivity(this.db, 'auto_reply', `${lead.name}: ${verdict.reason}`); return;
    }
    const [fresh = lead] = await this.db.select('leads', { filters: { id: `eq.${lead.id}` }, limit: 1 });
    const patch = { ...seen, next_followup_at: null };
    if (['new', 'contacted'].includes(fresh.status)) patch.status = 'replied';
    await this.db.update('leads', { id: `eq.${lead.id}` }, patch);
    if (!engine.agentEnabled || fresh.agent_paused || ['opted_out', 'needs_human'].includes(fresh.status)) return;
    // Wait a little (and batch quick follow-up messages) so the reply looks human and costs one OpenAI call.
    clearTimeout(this.timers.get(lead.id));
    this.timers.set(lead.id, setTimeout(() => this.reply(lead.id).catch((e) => logActivity(this.db, 'agent_error', `${lead.name}: ${e.message}`)), this.delay()));
  }

  /** Real person or automatic reply? See autoreply.js for the rules. */
  async screen(lead, row, at) {
    let history = await recentMessages(this.db, lead.id, 60);
    const first = signals({ history, msg: row, marks: this.marks, at });
    // A read mark can land a moment after the reply (answering from the notification), so give it a few seconds.
    if (first.prevOut && !first.read && this.grace > 0) { await this.sleep(this.grace); history = await recentMessages(this.db, lead.id, 60); }
    return judgeReply({ lead, history, msg: row, marks: this.marks, at, classify: this.classify });
  }

  /** You say this lead's automatic replies were a real person: count them as a reply and let the agent answer. */
  async markHuman(leadId) {
    const [lead] = await this.db.select('leads', { filters: { id: `eq.${leadId}` }, limit: 1 });
    if (!lead) throw Object.assign(new Error('Lead not found'), { status: 404 });
    await this.db.update('messages', { lead_id: `eq.${leadId}`, kind: 'eq.auto' }, { kind: 'inbound' });
    const patch = { next_followup_at: null };
    if (['new', 'contacted'].includes(lead.status)) patch.status = 'replied';
    await this.db.update('leads', { id: `eq.${leadId}` }, patch);
    logActivity(this.db, 'marked_real_person', lead.name);
    this.reply(leadId).catch((e) => logActivity(this.db, 'agent_error', `${lead.name}: ${e.message}`));
    return { ok: true };
  }

  /** You say this lead's replies came from a bot: stop counting them and put the lead back in line for a follow-up. */
  async markAuto(leadId) {
    const [lead] = await this.db.select('leads', { filters: { id: `eq.${leadId}` }, limit: 1 });
    if (!lead) throw Object.assign(new Error('Lead not found'), { status: 404 });
    clearTimeout(this.timers.get(leadId)); this.timers.delete(leadId);
    await this.db.update('messages', { lead_id: `eq.${leadId}`, kind: 'eq.inbound' }, { kind: 'auto' });
    const patch = {};
    if (['replied', 'needs_human'].includes(lead.status)) {
      const engine = await loadEngine(this.db);
      const due = lead.first_contacted_at ? nextFollowupAt(lead.first_contacted_at, lead.followups_sent || 0, engine.followupDays) : null;
      // Never follow up within a day of a bot exchange.
      Object.assign(patch, { status: 'contacted', agent_paused: false, next_followup_at: due ? new Date(Math.max(new Date(due).getTime(), Date.now() + DAY)).toISOString() : null });
    }
    if (Object.keys(patch).length) await this.db.update('leads', { id: `eq.${leadId}` }, patch);
    logActivity(this.db, 'marked_auto_reply', lead.name);
    return { ok: true };
  }

  async reply(leadId) {
    this.timers.delete(leadId);
    const [lead] = await this.db.select('leads', { filters: { id: `eq.${leadId}` }, limit: 1 });
    if (!lead || lead.agent_paused || lead.status === 'opted_out') return;
    const engine = await loadEngine(this.db); if (!engine.agentEnabled) return;
    const today = await this.db.count('messages', { lead_id: `eq.${leadId}`, direction: 'eq.out', kind: 'eq.reply', created_at: `gte.${startOfLocalDay().toISOString()}` });
    if (today >= engine.agentMaxRepliesPerDay) return;
    const history = (await recentMessages(this.db, leadId)).filter((x) => x.kind !== 'auto'); // the agent never sees automatic replies
    if (!history.length || history[history.length - 1].direction !== 'in') return; // already answered
    const out = await this.run({ agent: await loadAgent(this.db), engine, lead, history, products: await this.db.select('products', { limit: 500 }) });
    const accountId = lead.account_id;
    const acct = this.wa.get(accountId) || [...this.wa.accounts.values()].find((a) => a.state === 'open');
    if (!acct || acct.state !== 'open') throw new Error('No connected WhatsApp account to reply from');
    if (out.intent !== 'stop' && out.reply) {
      const waId = await acct.sendText(lead.phone, out.reply);
      await this.db.insert('messages', { lead_id: leadId, account_id: acct.id, direction: 'out', kind: 'reply', body: out.reply, wa_id: waId, status: 'sent' });
    }
    const patch = { last_contacted_at: new Date().toISOString() };
    if (out.contact_name && !lead.contact_name) patch.contact_name = out.contact_name;
    // The agent only moves leads forward; a booked or won lead never slides back to "interested".
    if (out.intent === 'interested') patch.status = advance(lead.status, 'interested');
    if (out.intent === 'booked') { patch.status = advance(lead.status, 'booked'); patch.booking_at = out.booking_at || lead.booking_at; patch.booking_note = out.summary; patch.next_followup_at = null; }
    if (out.intent === 'not_interested' && lead.status !== 'won') patch.status = 'lost';
    if (out.intent === 'stop') { patch.status = 'opted_out'; patch.agent_paused = true; }
    if (out.intent === 'human') { patch.status = 'needs_human'; patch.agent_paused = true; patch.notes = out.summary; }
    await this.db.update('leads', { id: `eq.${leadId}` }, patch);
    if (['interested', 'booked', 'human'].includes(out.intent) && engine.notifyNumber) {
      try { await acct.sendText(engine.notifyNumber.replace(/\D/g, ''), `${out.intent === 'booked' ? 'BOOKED' : out.intent === 'human' ? 'NEEDS YOU' : 'HOT LEAD'}: ${lead.name} (+${lead.phone}). ${out.summary}`); } catch { /* best effort */ }
    }
    logActivity(this.db, `agent_${out.intent}`, `${lead.name}: ${out.summary}`);
  }
}
