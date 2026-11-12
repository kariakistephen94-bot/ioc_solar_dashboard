import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Reads engine/.env.local first, then engine/.env. Real environment variables always win.
for (const file of ['.env.local', '.env']) {
  if (!existsSync(join(root, file))) continue;
  for (const line of readFileSync(join(root, file), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const num = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);

export const config = {
  root,
  port: num('PORT', 3310),
  apiToken: process.env.ENGINE_API_TOKEN || '',
  supabaseUrl: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  supabaseKey: process.env.SUPABASE_SERVICE_KEY || '',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  openaiBase: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  accountCount: Math.min(4, Math.max(1, num('ACCOUNT_COUNT', 4))),
  timezone: process.env.TIMEZONE || 'Africa/Lagos',
  authDir: process.env.AUTH_DIR || join(root, 'data', 'auth'),
  googleKey: process.env.GOOGLE_MAPS_API_KEY || '', // optional
  company: process.env.COMPANY_NAME || 'OIC Solar',
  senderName: process.env.SENDER_NAME || 'Ade',
};

export function assertConfigured() {
  const missing = [];
  if (!config.apiToken) missing.push('ENGINE_API_TOKEN');
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.supabaseKey) missing.push('SUPABASE_SERVICE_KEY');
  if (!config.openaiKey) missing.push('OPENAI_API_KEY');
  return missing;
}
