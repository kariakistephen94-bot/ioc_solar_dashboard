// Minimal Supabase (PostgREST) client over fetch: no SDK, no extra dependency.
import { config } from './config.js';

export class Supabase {
  constructor(url = config.supabaseUrl, key = config.supabaseKey, fetchImpl = fetch) {
    this.url = url; this.key = key; this.fetch = fetchImpl;
  }
  async req(path, { method = 'GET', body, prefer, query } = {}) {
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    const res = await this.fetch(`${this.url}/rest/v1/${path}${qs}`, {
      method,
      headers: {
        apikey: this.key, Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Supabase ${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
  /** filters: { status: 'eq.new', score: 'gte.50' } */
  select(table, { filters = {}, order, limit, offset, columns = '*' } = {}) {
    const query = { select: columns, ...filters };
    if (order) query.order = order;
    if (limit != null) query.limit = String(limit);
    if (offset) query.offset = String(offset);
    return this.req(table, { query });
  }
  async count(table, filters = {}) {
    const qs = new URLSearchParams({ select: 'id', limit: '1', ...filters }).toString();
    const res = await this.fetch(`${this.url}/rest/v1/${table}?${qs}`, {
      headers: { apikey: this.key, Authorization: `Bearer ${this.key}`, Prefer: 'count=exact', Range: '0-0' },
    });
    const range = res.headers.get('content-range') || '*/0';
    return Number(range.split('/')[1]) || 0;
  }
  insert(table, rows) { return this.req(table, { method: 'POST', body: rows, prefer: 'return=representation' }); }
  upsert(table, rows, onConflict) {
    return this.req(table, { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=representation', query: onConflict ? { on_conflict: onConflict } : undefined });
  }
  /** Insert and silently skip rows that collide with a unique index. */
  insertIgnore(table, rows, onConflict) {
    return this.req(table, { method: 'POST', body: rows, prefer: 'resolution=ignore-duplicates,return=representation', query: onConflict ? { on_conflict: onConflict } : undefined });
  }
  update(table, filters, patch) { return this.req(table, { method: 'PATCH', body: patch, prefer: 'return=representation', query: filters }); }
  remove(table, filters) { return this.req(table, { method: 'DELETE', query: filters }); }
}

/** Settings helpers: JSON values keyed by name. */
export async function getSetting(db, key, fallback) {
  const rows = await db.select('settings', { filters: { key: `eq.${key}` }, limit: 1 });
  return rows[0] ? rows[0].value : fallback;
}
export const setSetting = (db, key, value) => db.upsert('settings', { key, value, updated_at: new Date().toISOString() }, 'key');
export const logActivity = (db, kind, detail) => db.insert('activity', { kind, detail: String(detail).slice(0, 500) }).catch(() => {});
