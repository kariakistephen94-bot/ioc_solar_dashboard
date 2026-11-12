// Time-of-day helpers in the business timezone (Africa/Lagos, no DST).
import { config } from './config.js';
export function localParts(date = new Date(), tz = config.timezone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }).formatToParts(date).map((x) => [x.type, x.value]));
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute), dow };
}
export const startOfLocalDay = (date = new Date()) => new Date(`${localParts(date).date}T00:00:00+01:00`); // Lagos is UTC+1 year-round
export function greeting(date = new Date()) { const h = localParts(date).hour; return h < 12 ? 'Good morning' : h < 16 ? 'Good afternoon' : 'Good evening'; }
/** The next moment (after `date`) the sending window opens. */
export function nextWindowStart(settings, date = new Date()) {
  const h = Math.floor(settings.sendStart), m = Math.round((settings.sendStart - h) * 60);
  const pad = (n) => String(n).padStart(2, '0');
  for (let d = 0; d < 15; d++) {
    const day = localParts(new Date(date.getTime() + d * 86_400_000)).date;
    const at = new Date(`${day}T${pad(h)}:${pad(m)}:00+01:00`);
    if (at > date && settings.sendDays.includes(localParts(at).dow)) return at;
  }
  return null;
}
export function inWindow(settings, date = new Date()) {
  const t = localParts(date); const hm = t.hour + t.minute / 60;
  return settings.sendDays.includes(t.dow) && hm >= settings.sendStart && hm < settings.sendEnd;
}
