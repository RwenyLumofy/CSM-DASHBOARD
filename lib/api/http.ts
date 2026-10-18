/* =========================================================================
   Request plumbing shared by every /api/v1 route: key authentication, the
   error envelope, and a wrapper that turns thrown errors into a 500.

   /api/v1 is excluded from Clerk in middleware.ts — there is no session for a
   machine caller — so authenticate() below is the ONLY gate on these routes.
   Every handler must go through withApiKey().

   A valid key reads the whole book (all accounts), like a super-admin. That is
   the point of an integration key; it is also why only super-admins can issue
   one, and why v1 is read-only.
   ========================================================================= */

import { after, NextResponse } from "next/server";
import { hasDatabase } from "@/lib/config";
import { bearerToken, hashApiKey, looksLikeApiKey } from "@/lib/api/keys";

export interface ApiCaller {
  keyId: string;
  keyName: string;
}

export function apiError(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store", ...(status === 401 ? { "WWW-Authenticate": "Bearer" } : {}) } },
  );
}

export function apiJson(body: unknown) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

async function authenticate(req: Request): Promise<ApiCaller | NextResponse> {
  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return apiError(401, "unauthorized", "Send your API key as `Authorization: Bearer sig_…`.");
  // Same message for a malformed, unknown and revoked key — don't tell a
  // caller which one it was.
  if (!looksLikeApiKey(token)) return apiError(401, "unauthorized", "Invalid or revoked API key.");
  if (!hasDatabase()) return apiError(503, "unavailable", "Signal has no database configured.");

  const { findActiveApiKey, touchApiKey } = await import("@/lib/api/store");
  const key = await findActiveApiKey(hashApiKey(token));
  if (!key) return apiError(401, "unauthorized", "Invalid or revoked API key.");

  // Best-effort, after the response is sent: a failed stamp must never fail or
  // slow the read. after() keeps the function alive for it on Vercel, where a
  // bare un-awaited promise can be frozen mid-flight.
  after(() => touchApiKey(key.id).catch((err) => console.warn("[api/v1] last_used_at update failed:", err)));
  return { keyId: key.id, keyName: key.name };
}

type Handler<P> = (req: Request, ctx: { caller: ApiCaller; params: P }) => Promise<Response>;

/** Wraps a GET handler with key auth and a uniform 500. */
export function withApiKey<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      const caller = await authenticate(req);
      if (caller instanceof NextResponse) return caller;
      const params = ctx?.params ? await ctx.params : ({} as P);
      return await handler(req, { caller, params });
    } catch (err) {
      console.error("[api/v1] error:", err);
      return apiError(500, "internal_error", "Something went wrong reading from Signal.");
    }
  };
}

/** Today as YYYY-MM-DD in UTC — the reference date for days_to_renewal. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
