import { sameOrigin, signOut } from "../../../../lib/auth";

export async function POST(request) {
  if (!sameOrigin(request)) return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
  const { everywhere } = await request.json().catch(() => ({}));
  await signOut({ everywhere: everywhere === true });
  return Response.json({ ok: true });
}
