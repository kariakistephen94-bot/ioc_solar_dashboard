import { authMode, requireUser } from "../../../../lib/auth";

export async function GET() {
  try {
    return Response.json({ user: await requireUser(), mode: authMode() });
  } catch (e) {
    return Response.json({ error: e.message, mode: authMode(), ...(e.extra || {}) }, { status: e.status || 401 });
  }
}
