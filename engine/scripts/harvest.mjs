// One-off: harvest real leads from OpenStreetMap for every area and write data/seed-leads.json
import { writeFileSync } from 'node:fs';
import { AREAS } from '../src/areas.js';
import { discoverOsm } from '../src/discovery.js';
const seen = new Map(); const log = [];
for (const area of AREAS) {
  let r; for (let t = 0; t < 3 && !r; t++) { try { r = await discoverOsm(area); } catch (e) { await new Promise((x) => setTimeout(x, 8000)); } }
  let added = 0; for (const l of r?.leads || []) if (!seen.has(l.phone)) { seen.set(l.phone, l); added++; }
  log.push(`${area.name}: ${r ? r.fetched : 'FAILED'} fetched, ${added} new`); console.log(log.at(-1), '| total', seen.size);
  await new Promise((x) => setTimeout(x, 4000));
}
writeFileSync(new URL('../data/seed-leads.json', import.meta.url), JSON.stringify([...seen.values()], null, 0));
console.log('DONE', seen.size);
