// Outbound copy. Fixed templates keep sending free (no OpenAI call per message). The AI agent only writes replies.
import { config } from './config.js';
import { greeting } from './time.js';

const WHO = {
  'Cold room / fresh food': 'cold rooms and food businesses', 'Hospital / clinic': 'clinics and hospitals', 'Hotel / guest house': 'hotels and guest houses',
  Pharmacy: 'pharmacies', 'Supermarket / mall': 'supermarkets', 'Restaurant / bar / event centre': 'restaurants and event centres', 'School / training centre': 'schools',
  'Bank / microfinance / ATM': 'banks and microfinance offices', 'Fuel station': 'filling stations', 'Factory / workshop': 'factories and workshops',
  'Office / ICT / business centre': 'offices and business centres', 'Salon / barber / laundry': 'salons and laundries', 'Church / mosque / worship centre': 'churches and mosques',
  'Farm / agro business': 'farms and agro businesses', 'Shop / retail': 'shops',
};
const vars = (lead, s = {}) => ({
  greet: greeting(), name: lead.name, city: lead.city || 'your area', who: WHO[lead.sector] || 'businesses',
  sender: s.senderName || config.senderName, company: s.company || config.company,
});
const fill = (t, v) => t.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const STOP = ' Reply STOP and I will not message again.';

export const FIRST = [
  '{greet}. Is this {name}? I am {sender} from {company} in Ibadan. We help {who} in {city} cut generator and fuel costs with solar and inverter backup, with nationwide delivery. Would you like a free quote?' + STOP,
  '{greet}, this is {sender} at {company}. How many hours a day does {name} run on a generator? We install solar and inverter systems that cut that bill and the noise. Happy to share options if useful.' + STOP,
  'Hello {name}, {sender} here from {company}. Many {who} in {city} are moving to solar plus battery to stop losing money to power cuts. Can I send you a quick idea of what that would look like for you?' + STOP,
];
export const FOLLOWUP = [
  '{greet}, {sender} from {company} again. Just checking you saw my note about cutting generator costs at {name}. A free quote takes two minutes. Shall I send one?',
  'Hi {name}, last note from me. If solar backup is not a priority now, no problem. If it is, I can share prices for inverters, batteries and panels today. Just reply YES.' + STOP,
];
export const FOLLOWUP_GAP_DAYS = [3, 7]; // days after the first message / previous follow-up

export function firstMessage(lead, s, rand = Math.random) { return fill(FIRST[Math.floor(rand() * FIRST.length)], vars(lead, s)); }
export function followupMessage(lead, n, s) { return fill(FOLLOWUP[Math.min(n, FOLLOWUP.length - 1)], vars(lead, s)); }
export const isStop = (t) => /^\s*(stop|unsubscribe|opt ?out|cancel)\b/i.test(t || '') || /\b(abeg )?(stop|no dey) (disturb|message|messaging|texting|texts?)|comot for my number|remove (me|my number)|don'?t (message|text|contact) me|leave me alone/i.test(t || '');
