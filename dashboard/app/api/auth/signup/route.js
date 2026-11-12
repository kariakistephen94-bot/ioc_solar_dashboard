import { AuthError, sameOrigin, signUp } from "../../../../lib/auth";

export async function POST(request) {
  if (!sameOrigin(request)) return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
  try {
    const body = await request.json().catch(() => ({}));
    return Response.json(await signUp(body));
  } catch (e) {
    return Response.json({ error: e instanceof AuthError ? e.message : "Sign-up failed. Try again." }, { status: e.status || 500 });
  }
}
