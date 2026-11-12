// Staff roles for the dashboard. Only the engine (service key) can read or change them.
import { logActivity } from './db.js';

export const ROLES = ['user', 'admin', 'blocked'];
export const ownerEmails = (env = process.env.ADMIN_EMAILS) => (env || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

const httpError = (message, status = 400) => Object.assign(new Error(message), { status });
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

/** Finds or creates the staff row for a signed-in Supabase user. ADMIN_EMAILS are always admins. */
export async function ensureStaff(db, { user_id, email, name }, owners = ownerEmails()) {
  if (!isUuid(user_id) || !email) throw httpError('user_id and email are required');
  const mail = String(email).toLowerCase();
  const [row] = await db.select('staff', { filters: { user_id: `eq.${user_id}` }, limit: 1 });
  const owner = owners.includes(mail);
  if (!row) {
    // Same email but a new account id means the old Supabase user was deleted and re-created: start again as a plain user.
    const [old] = await db.select('staff', { filters: { email: `eq.${mail}` }, limit: 1 });
    if (old) return (await db.update('staff', { email: `eq.${mail}` }, { user_id, name: name || old.name, role: owner ? 'admin' : 'user', updated_at: new Date().toISOString(), updated_by: 'account re-created' }))[0];
    const [created] = await db.insert('staff', { user_id, email: mail, name: name || null, role: owner ? 'admin' : 'user', updated_by: owner ? 'ADMIN_EMAILS' : 'sign-up' });
    if (!owner) logActivity(db, 'staff_signup', `${mail} created an account and is waiting for approval`);
    return created;
  }
  if (owner && row.role !== 'admin') return (await db.update('staff', { user_id: `eq.${user_id}` }, { role: 'admin', updated_at: new Date().toISOString(), updated_by: 'ADMIN_EMAILS' }))[0];
  if (name && !row.name) return (await db.update('staff', { user_id: `eq.${user_id}` }, { name }))[0];
  return row;
}

/** Admin changes another person's role. Guards: not yourself, not an ADMIN_EMAILS owner, never the last admin. */
export async function setRole(db, { targetId, role, actor }, owners = ownerEmails()) {
  if (!ROLES.includes(role)) throw httpError('Role must be user, admin or blocked');
  if (!actor?.id) throw httpError('Missing signed-in admin', 401);
  const [me] = await db.select('staff', { filters: { user_id: `eq.${actor.id}` }, limit: 1 });
  if (me?.role !== 'admin') throw httpError('Only admins can change access', 403);
  if (targetId === actor.id) throw httpError('You cannot change your own access. Ask another admin.', 403);
  const [target] = await db.select('staff', { filters: { user_id: `eq.${targetId}` }, limit: 1 });
  if (!target) throw httpError('No such team member', 404);
  if (owners.includes(target.email) && role !== 'admin') throw httpError(`${target.email} is an owner (ADMIN_EMAILS) and always stays admin`, 403);
  if (target.role === 'admin' && role !== 'admin' && (await db.count('staff', { role: 'eq.admin' })) <= 1) throw httpError('There must always be at least one admin', 409);
  const [row] = await db.update('staff', { user_id: `eq.${targetId}` }, { role, updated_at: new Date().toISOString(), updated_by: actor.email || actor.id });
  logActivity(db, 'staff_role', `${actor.email} set ${target.email} to ${role}`);
  return row;
}
