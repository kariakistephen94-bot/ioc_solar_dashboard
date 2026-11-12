import { AuthError, sameOrigin, signIn } from "../../../../lib/auth";

export async function POST(request) {
  if (!sameOrigin(request)) return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
  try {
    const { email, password } = await request.json().catch(() => ({}));
    return Response.json({ user: await signIn(email, password) });
  } catch (e) {
    return Response.json({ error: e instanceof AuthError ? e.message : "Sign-in failed. Try again." }, { status: e.status || 500 });
  }
}
