/* Server-only auth helpers. Resolves the signed-in user's email and role, and
   scopes client data to what that role may see. */

import { cache } from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { authEnabled, env, hasDatabase } from "@/lib/config";
import { DEFAULT_ROLE, isRole, permissionTier, defaultScopeForRole, type AccessScope, type Role } from "@/lib/roles";
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
      // Self-bounding + cancelling now (see its own comment) — no outer
      // withDbTimeout wrap needed; a stall here frees its connection instead
      // of racing a second, redundant timeout on top of the same query.
      const r = await getAppUserRoleFromDb(email);
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
 * Does `email` own `client`? An operator owns a client when they're named on
 * EITHER owner slot (CSM or Implementation) — permission no longer branches on
 * team, so a flat operator sees/edits whatever they're on. Single source of
 * truth for both scoping helpers so the list filter and the single-client gate
 * can never diverge.
 */
function ownsClient(client: Client, email: string): boolean {
  return (client.csm?.email ?? "").toLowerCase() === email
    || (client.implementationOwner?.email ?? "").toLowerCase() === email;
}

/** super_admin or admin — the two management tiers. Admin runs the workspace;
 *  the crown (managing admins, integrations, destructive actions) stays gated
 *  by isSuperAdmin(). */
export async function isAdminOrSuper(): Promise<boolean> {
  const role = await getCurrentUserRole();
  return role === "super_admin" || role === "admin";
}

/* -------------------------------------------------------------------------
   Effective access scope — what slice of the account book the current user may
   reach. Independent of role: the role sets the default (admin/guest/super →
   all, operator → assigned), but a per-user override in app_users.scope can
   narrow it, and 'selected' pins an explicit set of client ids. super_admin is
   ALWAYS all-accounts and can't be narrowed.
   ------------------------------------------------------------------------- */

export type EffectiveScope =
  | { mode: "none" } // not signed in / unresolved
  | { mode: "all" }
  | { mode: "assigned" }
  | { mode: "selected"; clientIds: Set<string> };

/** Resolve the signed-in user's effective scope. Cached per request. Reads are
 *  resilient — if the scope column / grants table aren't migrated yet, this
 *  falls back to the role default so nothing breaks. */
export const getCurrentUserScope = cache(async (): Promise<EffectiveScope> => {
  const role = await getCurrentUserRole();
  if (!role) return { mode: "none" };
  if (permissionTier(role) === "super_admin") return { mode: "all" }; // never narrowed

  const email = await getCurrentUserEmail();
  let override: string | null = null;
  if (hasDatabase() && email) {
    try {
      const { getUserScopeFromDb } = await import("@/lib/repo/drizzle");
      override = await getUserScopeFromDb(email);
    } catch { /* fall back to role default */ }
  }

  const scope: AccessScope = override && ["all", "assigned", "selected"].includes(override)
    ? (override as AccessScope)
    : defaultScopeForRole(role);

  if (scope === "all") return { mode: "all" };
  if (scope === "assigned") return { mode: "assigned" };

  let ids: string[] = [];
  if (hasDatabase() && email) {
    try {
      const { getGrantsForUserDb } = await import("@/lib/repo/drizzle");
      ids = await getGrantsForUserDb(email);
    } catch { /* no grants readable → empty selected set */ }
  }
  return { mode: "selected", clientIds: new Set(ids) };
});

/** Does `scope` admit `client` for `email`? Pure — the shared predicate behind
 *  the single-client gate and the list filter, so they can never diverge. */
function scopeAdmits(client: Client, scope: EffectiveScope, email: string | null): boolean {
  switch (scope.mode) {
    case "none": return false;
    case "all": return true;
    case "assigned": return !!email && ownsClient(client, email);
    case "selected": return scope.clientIds.has(client.id);
  }
}

/** True when the given client is visible (read) to the current user. */
export async function canSeeClient(client: Client | null): Promise<boolean> {
  if (!client) return false;
  const scope = await getCurrentUserScope();
  if (scope.mode === "all") return true;
  const email = await getCurrentUserEmail();
  return scopeAdmits(client, scope, email);
}

/** True when the current user may EDIT the given client. The WRITE gate —
 *  distinct from canSeeClient so read-only guests can view what they can't
 *  change. A member may edit anything IN THEIR SCOPE unless their role is
 *  view-only (guest). Every client mutation must gate on THIS. */
export async function canEditClient(client: Client | null): Promise<boolean> {
  if (!client) return false;
  const role = await getCurrentUserRole();
  if (!role || permissionTier(role) === "guest") return false; // guest = read-only
  const scope = await getCurrentUserScope();
  if (scope.mode === "all") return true;
  const email = await getCurrentUserEmail();
  return scopeAdmits(client, scope, email);
}

/** Restrict a client list to what the current user may see, honouring scope
 *  (all / assigned / selected). */
export async function scopeClientsToUser(clients: Client[]): Promise<Client[]> {
  const scope = await getCurrentUserScope();
  if (scope.mode === "all") return clients;
  if (scope.mode === "none") return [];
  const email = await getCurrentUserEmail();
  return clients.filter((c) => scopeAdmits(c, scope, email));
}
