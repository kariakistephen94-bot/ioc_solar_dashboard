// In-memory stand-in for the Supabase client, supporting the filter operators the engine uses.
export class FakeDb {
  constructor(seed = {}) { this.t = { leads: [], messages: [], accounts: [], products: [], settings: [], activity: [], staff: [], ...seed }; this.n = 0; }
  match(row, filters) {
    for (const [k, expr] of Object.entries(filters)) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
      const [op, ...rest] = String(expr).split('.'); const val = rest.join('.'); const v = row[k];
      if (op === 'eq' && String(v) !== val) return false;
      if (op === 'neq' && String(v) === val) return false;
      if (op === 'lt' && !(v != null && (isNaN(val) ? v < val : Number(v) < Number(val)))) return false;
      if (op === 'lte' && !(v != null && v <= val)) return false;
      if (op === 'gte' && !(v != null && (isNaN(val) ? v >= val : Number(v) >= Number(val)))) return false;
      if (op === 'in' && !val.replace(/[()]/g, '').split(',').includes(String(v))) return false;
      if (op === 'not' && val === 'is.null' && v == null) return false;
    }
    return true;
  }
  async select(table, { filters = {}, order, limit } = {}) {
    let rows = this.t[table].filter((r) => this.match(r, filters));
    if (order) { const keys = order.split(',').map((o) => o.split('.')); rows = [...rows].sort((a, b) => { for (const [k, d] of keys) { if (a[k] === b[k]) continue; return (a[k] > b[k] ? 1 : -1) * (d === 'desc' ? -1 : 1); } return 0; }); }
    return limit != null ? rows.slice(0, limit) : rows;
  }
  async count(table, filters = {}) { return this.t[table].filter((r) => this.match(r, filters)).length; }
  async insert(table, rows) { const arr = [].concat(rows).map((r) => ({ id: `id${++this.n}`, created_at: new Date().toISOString(), ...r })); this.t[table].push(...arr); return arr; }
  async insertIgnore(table, rows, key) { const out = []; for (const r of [].concat(rows)) if (!this.t[table].some((x) => x[key] === r[key])) out.push(...(await this.insert(table, r))); return out; }
  async upsert(table, rows, key) { const out = []; for (const r of [].concat(rows)) { const e = this.t[table].find((x) => x[key] === r[key]); if (e) { Object.assign(e, r); out.push(e); } else out.push(...(await this.insert(table, r))); } return out; }
  async update(table, filters, patch) { const rows = this.t[table].filter((r) => this.match(r, filters)); rows.forEach((r) => Object.assign(r, patch)); return rows; }
}
