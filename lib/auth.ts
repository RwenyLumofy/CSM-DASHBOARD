/* Server-only auth helpers. Resolves the signed-in user's email and role, and
   scopes client data to what that role may see. */

import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { authEnabled, env, hasDatabase } from "@/lib/config";
import { withDbTimeout } from "@/lib/db/client";
import { DEFAULT_ROLE, isRole, teamForRole, type Role, type Team } from "@/lib/roles";
import type { Client } from "@/lib/types";

/** Lower-cased primary email of the signed-in user, or null. Cached per request. */
export const getCurrentUserEmail = cache(async (): Promise<string | null> => {
  if (!authEnabled()) return null;

  // Fast path: read the email straight off the already-verified session JWT.
  // auth() is LOCAL (cookie + signature check) — no network call — unlike
  // currentUser() below. This is the actual fix for baseline per-page latency:
  // previously EVERY page paid a live round-trip to Clerk's Backend API before
  // anything else could render, because there was no other way to get the
  // email. Requires a custom "email" claim added in the Clerk Dashboard
  // (Sessions -> Customize session token, e.g. {"email":
  // "{{user.primary_email_address}}"}). Until that's configured — or for a
  // session token issued before it was added — sessionClaims.email is just
  // undefined and this falls through to the live lookup below, so it's purely
  // additive and never a behavior change on its own.
  try {
    const { sessionClaims } = await auth();
    const claimEmail = (sessionClaims as { email?: string } | null)?.email;
    if (claimEmail) return claimEmail.toLowerCase();
  } catch {
    /* fall through to the live lookup */
  }

  // Slow path (fallback). currentUser() is a live call to Clerk's Backend API
  // (unlike auth(), which just reads the already-verified session JWT) and has
  // no built-in timeout.
  // Seen hanging in prod right after a fresh OAuth/SSO sign-in — the exact
  // moment Clerk's backend is doing the most extra work on that session — which
  // froze the whole page for the full 300s Vercel ceiling, so each attempt is
  // raced against a timeout.
  //
  // A null return here cascades badly: the caller's role resolves to null,
  // which makes canSeeClient / scopeClientsToUser treat even a super-admin as
  // "no access" — a spurious 404 on a profile, or an EMPTY clients list on the
  // way back to it. A single slow attempt used to fall straight through to
  // null; retry once first, since a transient hiccup almost always clears on
  // the second call. Worst case is 2×6s, still comfortably under the ceiling.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const u = await Promise.race([
        currentUser(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Clerk currentUser() timed out")), 6_000)),
      ]);
      const email = u?.primaryEmailAddress?.emailAddress ?? u?.emailAddresses?.[0]?.emailAddress;
      return email ? email.toLowerCase() : null; // resolved (email or genuinely none)
    } catch {
      // timed out / backend hiccup — fall through to one retry, then null
    }
  }
  return null;
});

/**
 * The signed-in user's role. Cached per request.
 *  - auth disabled (local/sample): everyone is super-admin (dev bypass).
 *  - email in SUPER_ADMIN_EMAILS: always super-admin (bootstrap — survives an
 *    empty/wiped app_users table so the owner can never be locked out).
 *  - otherwise: the app_users role, or the lowest CSM tier by default.
 *  - not signed in (auth on): null (no access).
 */
export const getCurrentUserRole = cache(async (): Promise<Role | null> => {
  if (!authEnabled()) return "super_admin";
  const email = await getCurrentUserEmail();
  if (!email) return null;
  if (env.superAdminEmails.includes(email)) return "super_admin";
  if (hasDatabase()) {
    try {
      const { getAppUserRoleFromDb } = await import("@/lib/repo/drizzle");
      const r = await withDbTimeout(getAppUserRoleFromDb(email));
      if (isRole(r)) return r;
    } catch {
      /* app_users missing or DB down — fall through to the default tier */
    }
  }
  return DEFAULT_ROLE;
});

/** True when the current user may edit default props, manage users, etc. */
export async function isSuperAdmin(): Promise<boolean> {
  return (await getCurrentUserRole()) === "super_admin";
}

/**
 * Does `email` own `client` for the given team? CSM-team users own clients
 * where they are the CSM; Implementation-team users own clients where they are
 * the implementation owner. Single source of truth for both scoping helpers so
 * the list filter and the single-client gate can never diverge.
 */
function ownsClient(client: Client, email: string, team: Team | null): boolean {
  if (team === "implementation") {
    return (client.implementationOwner?.email ?? "").toLowerCase() === email;
  }
  // default / csm team
  return (client.csm?.email ?? "").toLowerCase() === email;
}

/** Roles that see every client rather than only the ones they own. Unlike
 *  super_admin this doesn't grant admin actions (user/property management,
 *  owner reassignment) — it only widens which clients scopeClientsToUser()/
 *  canSeeClient() let through. */
function hasFullClientVisibility(role: Role | null): boolean {
  return role === "super_admin" || role === "csm_officer";
}

/** True when the given client is visible to the current user (own client / admin). */
export async function canSeeClient(client: Client | null): Promise<boolean> {
  if (!client) return false;
  const role = await getCurrentUserRole();
  if (hasFullClientVisibility(role)) return true;
  if (!role) return false;
  const email = await getCurrentUserEmail();
  return !!email && ownsClient(client, email, teamForRole(role));
}

/**
 * Restrict a client list to what the current user may see. Super-admins and
 * CSM Officers (dev bypass too) see everything; other CSM-team roles see only
 * clients they're the CSM of; Implementation-team roles see only clients they
 * implement.
 */
export async function scopeClientsToUser(clients: Client[]): Promise<Client[]> {
  const role = await getCurrentUserRole();
  if (hasFullClientVisibility(role)) return clients;
  if (!role) return [];
  const email = await getCurrentUserEmail();
  if (!email) return [];
  const team = teamForRole(role);
  return clients.filter((c) => ownsClient(c, email, team));
}
