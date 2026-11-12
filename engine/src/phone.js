// Nigerian phone handling. Output is digits only in international form, e.g. 2348031234567.
const MOBILE = /^234(70[0-9]|80[0-9]|81[0-9]|90[0-9]|91[0-9])\d{7}$/;

export function normalizeNg(raw) {
  if (!raw) return null;
  let s = String(raw).split(/[;,/]|\bor\b/i)[0];
  let d = s.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('2340')) d = '234' + d.slice(4);
  else if (d.startsWith('0')) d = '234' + d.slice(1);
  else if (/^(70|80|81|90|91)\d{8}$/.test(d)) d = '234' + d;
  if (!d.startsWith('234') || d.length < 12 || d.length > 13) return null;
  return d;
}
export const isMobile = (d) => MOBILE.test(d || '');
export function phoneInfo(raw) {
  const phone = normalizeNg(raw);
  if (!phone) return { phone: null, phone_type: 'unknown' };
  return { phone, phone_type: isMobile(phone) ? 'mobile' : 'landline' };
}
