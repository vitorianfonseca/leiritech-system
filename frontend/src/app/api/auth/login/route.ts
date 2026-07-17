import { NextResponse, type NextRequest } from "next/server";
import {
  backendApiBase,
  parseTokenResponse,
  writeAuthCookies,
} from "@/lib/api/server-auth";

/**
 * POST /api/auth/login
 * Exchanges email+password with the FastAPI backend, stores the token pair in
 * cookies (httpOnly refresh + browser-readable access), and returns the minimal
 * identity `{ userId, role }` the login form needs. Backend error envelopes are
 * proxied through verbatim so the client can map them to a typed AuthError.
 */
export async function POST(request: NextRequest) {
  let credentials: { email?: string; password?: string };
  try {
    credentials = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body." } },
      { status: 400 },
    );
  }

  const base = backendApiBase();
  const loginRes = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password,
    }),
  });

  const loginBody = await loginRes.json().catch(() => null);
  if (!loginRes.ok) {
    return NextResponse.json(loginBody ?? { error: { code: "NETWORK" } }, {
      status: loginRes.status,
    });
  }

  const tokens = parseTokenResponse(loginBody);
  await writeAuthCookies(tokens);

  // Resolve identity for the caller (role drives post-login routing/nav).
  const meRes = await fetch(`${base}/auth/me`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
  if (!meRes.ok) {
    return NextResponse.json(
      { error: { code: "NETWORK", message: "Could not load profile." } },
      { status: 502 },
    );
  }
  const me = (await meRes.json()) as { id: string; role: string };
  return NextResponse.json({ userId: me.id, role: me.role });
}
