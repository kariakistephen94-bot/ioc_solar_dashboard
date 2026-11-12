// Up to 4 WhatsApp accounts linked as devices (Baileys). Free: no Meta Business API fees.
// The number is a normal WhatsApp account, so send slowly (see sender.js). Unofficial linking can be banned if abused.
import { rm } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, Browsers } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { config } from './config.js';

const phoneJid = (v) => { const m = /^([1-9]\d{6,14})(?::\d+)?@s\.whatsapp\.net$/.exec(typeof v === 'string' ? v : ''); return m ? `${m[1]}@s.whatsapp.net` : null; };

/** Resolve an inbound chat id to a phone number. Never guesses: unresolved @lid ids return null. */
export async function inboundPhone(key = {}, lidMapping) {
  const jid = typeof key.remoteJid === 'string' ? key.remoteJid : '';
  if (key.participant || !jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return null;
  let j = phoneJid(jid) || phoneJid(key.remoteJidAlt);
  if (!j && /@lid$/.test(jid)) { try { j = phoneJid(await lidMapping?.getPNForLID?.(jid)); } catch { /* unresolved */ } }
  return j ? j.split('@')[0] : null;
}

export function textOf(m) {
  const x = m?.message; if (!x) return null;
  return x.conversation || x.extendedTextMessage?.text || x.imageMessage?.caption || x.videoMessage?.caption || x.buttonsResponseMessage?.selectedDisplayText || x.listResponseMessage?.title || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class WaAccount extends EventEmitter {
  constructor(id) {
    super();
    this.id = id; this.dir = join(config.authDir, id);
    this.sock = null; this.state = 'idle'; this.qrDataUrl = null; this.me = null; this.retries = 0; this.stopping = false;
  }
  status() { return { id: this.id, state: this.state, connected: this.state === 'open', phone: this.me?.id ? this.me.id.split(/[:@]/)[0] : null, name: this.me?.name || null, qr: this.state === 'qr' }; }

  async start() {
    this.stopping = false;
    const { state, saveCreds } = await useMultiFileAuthState(this.dir);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
    const sock = makeWASocket({ version, auth: state, logger: pino({ level: 'silent' }), browser: Browsers.macOS('Desktop'), markOnlineOnConnect: false, syncFullHistory: false });
    this.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async (u) => {
      if (this.sock !== sock) return;
      const { connection, lastDisconnect, qr } = u;
      if (qr) { this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, width: 300 }); this.state = 'qr'; }
      if (connection === 'connecting' && this.state !== 'qr') this.state = 'connecting';
      if (connection === 'open') { this.state = 'open'; this.qrDataUrl = null; this.retries = 0; this.me = sock.user; this.emit('open'); }
      if (connection === 'close') {
        this.me = null;
        if (this.stopping) { this.state = 'idle'; return; }
        if (lastDisconnect?.error?.output?.statusCode === DisconnectReason.loggedOut) { this.state = 'logged_out'; this.emit('logged_out'); return; }
        this.state = 'connecting';
        setTimeout(() => this.start().catch(() => {}), Math.min(30_000, 1000 * 2 ** Math.min(this.retries++, 5)));
      }
    });
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const m of messages) {
        if (m.key.fromMe) continue;
        const phone = await inboundPhone(m.key, sock.signalRepository?.lidMapping);
        const ts = Number(m.messageTimestamp?.toNumber?.() ?? m.messageTimestamp);
        this.emit('message', { accountId: this.id, id: m.key.id, phone, at: ts > 0 ? ts * 1000 : null, rawJid: m.key.remoteJid, pushName: m.pushName || null, text: textOf(m), hasMedia: !!m.message && !textOf(m) });
      }
    });
    sock.ev.on('messages.update', (updates) => {
      for (const { key, update } of updates || []) if (key?.fromMe && key.id && update?.status != null) this.emit('receipt', { id: key.id, code: Number(update.status) });
    });
  }

  /** Human-like send: show "typing…" for a length-based delay first. */
  async sendText(phone, text) {
    if (this.state !== 'open') throw new Error(`Account ${this.id} is not connected`);
    const jid = `${phone}@s.whatsapp.net`;
    try { await this.sock.presenceSubscribe(jid); await this.sock.sendPresenceUpdate('composing', jid); await sleep(Math.min(9000, 1200 + text.length * 35)); await this.sock.sendPresenceUpdate('paused', jid); } catch { /* presence is best effort */ }
    const res = await this.sock.sendMessage(jid, { text });
    return res.key.id;
  }
  async onWhatsApp(phone) {
    if (this.state !== 'open') throw new Error('not connected');
    const [r] = (await this.sock.onWhatsApp(`${phone}@s.whatsapp.net`)) || [];
    return !!r?.exists;
  }
  async relink() {
    this.stopping = true;
    const old = this.sock;
    try { await old?.logout(); } catch { /* already gone */ }
    try { old?.end?.(undefined); } catch { /* closed */ }
    this.sock = null; await rm(this.dir, { recursive: true, force: true });
    this.state = 'starting'; this.qrDataUrl = null; this.me = null; this.retries = 0;
    await this.start();
  }
  async logout() { this.stopping = true; try { await this.sock?.logout(); } catch { /* ignore */ } this.state = 'logged_out'; }
}

export class WaManager extends EventEmitter {
  constructor(count = config.accountCount) {
    super();
    this.accounts = new Map();
    for (const id of 'ABCD'.slice(0, count)) {
      const a = new WaAccount(id);
      a.on('message', (m) => this.emit('message', m));
      a.on('receipt', (r) => this.emit('receipt', { ...r, accountId: id }));
      a.on('open', () => this.emit('open', id));
      this.accounts.set(id, a);
    }
  }
  get(id) { return this.accounts.get(String(id).toUpperCase()); }
  async startAll() { for (const a of this.accounts.values()) a.start().catch((e) => { a.state = 'error'; console.error(`WhatsApp ${a.id}: ${e.message}`); }); }
  statuses() { return [...this.accounts.values()].map((a) => a.status()); }
}
