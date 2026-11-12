// Free lead discovery. OpenStreetMap (Overpass) is the default source: no key, no billing.
// Google Places is optional and only used when GOOGLE_MAPS_API_KEY is set (it costs money past Google's free credit).
import { config } from './config.js';
import { phoneInfo } from './phone.js';
import { classify, scoreLead } from './sectors.js';
import { AREAS, areaById } from './areas.js';
import { parseCsv } from './csv.js';
import { logActivity } from './db.js';

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const UA = 'OICSolarLeadEngine/1.0';

export function overpassQuery(area) {
  const around = `(around:${area.radius},${area.lat},${area.lon})`;
  const keys = ['phone', 'contact:phone', 'mobile', 'contact:mobile'];
  const parts = keys.map((k) => `nwr["name"]["${k}"]${around};`).join('');
  return `[out:json][timeout:90];(${parts});out center tags 1500;`;
}

export function fromOsmElement(el, area) {
  const t = el.tags || {};
  const name = (t.name || '').trim();
  if (!name) return null;
  const rule = classify({ tags: t, name });
  if (!rule) return null;
  const info = phoneInfo(t['contact:mobile'] || t.mobile || t.phone || t['contact:phone']);
  if (!info.phone) return null;
  const website = t.website || t['contact:website'] || null;
  const email = (t.email || t['contact:email'] || '').split(';')[0].trim().toLowerCase() || null;
  const address = [t['addr:housenumber'], t['addr:street'], t['addr:suburb'] || t['addr:city']].filter(Boolean).join(' ') || null;
  const lead = {
    name, sector: rule.sector, power_signal: rule.signal, ...info, email, website, address,
    city: t['addr:city'] || area.name, state: t['addr:state'] || area.state,
    lat: el.lat ?? el.center?.lat ?? null, lon: el.lon ?? el.center?.lon ?? null,
    source: 'osm', source_id: `${el.type}/${el.id}`,
    status: info.phone_type === 'mobile' ? 'new' : 'call_only',
  };
  lead.score = scoreLead({ rule, phone_type: info.phone_type, website, email });
  return lead;
}

async function overpass(query, fetchImpl) {
  let lastErr;
  for (const url of [...OVERPASS, ...OVERPASS]) {
    try {
      const res = await fetchImpl(url, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: AbortSignal.timeout(120_000) });
      if (res.ok) return (await res.json()).elements || [];
      lastErr = new Error(`Overpass ${res.status}`);
    } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, overpass.backoffMs));
  }
  throw lastErr;
}

overpass.backoffMs = 4000;

export async function discoverOsm(area, fetchImpl = fetch) {
  const elements = await overpass(overpassQuery(area), fetchImpl);
  const seen = new Set(); const leads = [];
  for (const el of elements) {
    const lead = fromOsmElement(el, area);
    if (lead && !seen.has(lead.phone)) { seen.add(lead.phone); leads.push(lead); }
  }
  return { fetched: elements.length, leads };
}

const GOOGLE_QUERIES = ['hotels', 'clinics and hospitals', 'supermarkets', 'restaurants', 'schools', 'pharmacies', 'factories', 'cold rooms and frozen food', 'banks', 'event centres', 'fuel stations', 'offices'];

export async function discoverGoogle(area, { budget = { left: 150 } } = {}, fetchImpl = fetch) {
  if (!config.googleKey) throw new Error('GOOGLE_MAPS_API_KEY is not set');
  const leads = []; let requests = 0;
  for (const q of GOOGLE_QUERIES) {
    let pageToken;
    for (let page = 0; page < 3; page++) {            // Google returns at most 3 pages (60 results) per query
      if (budget.left <= 0) return { fetched: leads.length, leads, requests, budgetExhausted: true };
      budget.left--; requests++;
      const res = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.googleKey, 'X-Goog-FieldMask': 'places.id,places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber,places.formattedAddress,places.websiteUri,places.location,places.types,nextPageToken' },
        body: JSON.stringify({ textQuery: `${q} in ${area.name}, ${area.state}, Nigeria`, pageSize: 20, ...(pageToken ? { pageToken } : { locationBias: { circle: { center: { latitude: area.lat, longitude: area.lon }, radius: Math.min(area.radius, 50000) } } }) }),
      });
      if (!res.ok) throw new Error(`Google Places ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const json = await res.json();
      for (const p of json.places || []) {
        const name = p.displayName?.text; if (!name) continue;
        const typeHit = (p.types || []).join(' ');
        const info = phoneInfo(p.internationalPhoneNumber || p.nationalPhoneNumber);
        if (!info.phone) continue;
        const r = classify({ tags: {}, name }) || (/hotel|lodging/.test(typeHit) ? classify({ tags: { tourism: 'hotel' } }) : /hospital|doctor|health|pharmacy/.test(typeHit) ? classify({ tags: { amenity: 'clinic' } }) : /supermarket|grocery/.test(typeHit) ? classify({ tags: { shop: 'supermarket' } }) : /school/.test(typeHit) ? classify({ tags: { amenity: 'school' } }) : /bank/.test(typeHit) ? classify({ tags: { amenity: 'bank' } }) : /restaurant|bar|cafe/.test(typeHit) ? classify({ tags: { amenity: 'restaurant' } }) : /gas_station/.test(typeHit) ? classify({ tags: { amenity: 'fuel' } }) : null);
        if (!r) continue;
        const lead = { name, sector: r.sector, power_signal: r.signal, ...info, website: p.websiteUri || null, address: p.formattedAddress || null, city: area.name, state: area.state, lat: p.location?.latitude ?? null, lon: p.location?.longitude ?? null, source: 'google', source_id: p.id, status: info.phone_type === 'mobile' ? 'new' : 'call_only' };
        lead.score = scoreLead({ rule: r, phone_type: info.phone_type, website: lead.website });
        leads.push(lead);
      }
      pageToken = json.nextPageToken; if (!pageToken) break;
    }
  }
  return { fetched: leads.length, leads, requests };
}

export function leadsFromCsv(text, defaults = {}) {
  const out = [];
  for (const r of parseCsv(text)) {
    const name = r.name || r.business || r.business_name || r.company; if (!name) continue;
    const info = phoneInfo(r.phone || r.mobile || r.whatsapp || r.phone_number); if (!info.phone) continue;
    const rule = classify({ tags: {}, name: `${name} ${r.sector || r.category || ''}` });
    const lead = { name, sector: r.sector || r.category || rule?.sector || 'Business', power_signal: rule?.signal || 'Backup power need to be confirmed', ...info,
      email: r.email || null, website: r.website || null, address: r.address || null, city: r.city || defaults.city || null, state: r.state || defaults.state || null,
      source: 'csv', source_id: info.phone, status: info.phone_type === 'mobile' ? 'new' : 'call_only' };
    lead.score = scoreLead({ rule, phone_type: info.phone_type, website: lead.website, email: lead.email });
    out.push(lead);
  }
  return out;
}

export async function saveLeads(db, leads) {
  let inserted = 0;
  for (let i = 0; i < leads.length; i += 200) {
    const rows = await db.insertIgnore('leads', leads.slice(i, i + 200), 'phone');
    inserted += rows?.length || 0;
  }
  return inserted;
}

/** Runs discovery over areas one at a time (Overpass is a shared free service) and records progress for the dashboard. */
export class Discovery {
  constructor(db, { fetchImpl = fetch, pauseMs = 4000 } = {}) { this.db = db; this.fetch = fetchImpl; this.pauseMs = pauseMs; this.state = { running: false, done: 0, total: 0, added: 0, current: null, errors: [], finishedAt: null }; }
  status() { return this.state; }
  async run({ areaIds, source = 'osm', maxRequests = 150, targetNew = 0 } = {}) {
    if (source === 'google' && !config.googleKey) throw new Error('Set GOOGLE_MAPS_API_KEY in engine/.env and restart the engine first');
    if (this.state.running) throw new Error('Discovery is already running');
    const areas = (areaIds?.length ? areaIds.map(areaById) : AREAS).filter(Boolean);
    this.state = { running: true, done: 0, total: areas.length, added: 0, current: null, errors: [], finishedAt: null, requestsLeft: source === 'google' ? maxRequests : null, targetNew };
    const budget = { left: maxRequests };
    (async () => {
      for (const area of areas) {
        if (targetNew && this.state.added >= targetNew) { this.state.done = areas.length; break; }
        this.state.current = area.name;
        try {
          const r = source === 'google' ? await discoverGoogle(area, { budget }, this.fetch) : await discoverOsm(area, this.fetch);
          this.state.added += await saveLeads(this.db, r.leads);
          if (source === 'google') { this.state.requestsLeft = budget.left; if (r.budgetExhausted) { this.state.errors.push(`Stopped at ${area.name}: request budget used up`); this.state.done = areas.length; break; } }
        } catch (e) { this.state.errors.push(`${area.name}: ${e.message}`); }
        this.state.done++;
        await new Promise((r) => setTimeout(r, this.pauseMs));
      }
      this.state.running = false; this.state.current = null; this.state.finishedAt = new Date().toISOString();
      logActivity(this.db, 'discovery', `Finished ${areas.length} areas, ${this.state.added} new leads`);
    })();
    return this.state;
  }
}
