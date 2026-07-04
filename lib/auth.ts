/* Server-only auth helpers. Resolves the signed-in user's email and role, and
   scopes client data to what that role may see. */

import { cache } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { authEnabled, env, hasDatabase } from "@/lib/config";
import { DEFAULT_ROLE, isRole, teamForRole, type Role, type Team } from "@/lib/roles";
import type { Client } from "@/lib/types";

/** Lower-cased primary email of the signed-in user, or null. Cached per request. */
export const getCurrentUserEmail = cache(async (): Promise<string | null> => {
  if (!authEnabled()) return null;
  try {
    const u = await currentUser();
    const email = u?.primaryEmailAddress?.emailAddress ?? u?.emailAddresses?.[0]?.emailAddress;
    return email ? email.toLowerCase() : null;
  } catch {
    return null;
  }
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

/** True when the given client is visible to the current user (own client / admin). */
export async function canSeeClient(client: Client | null): Promise<boolean> {
  if (!client) return false;
  const role = await getCurrentUserRole();
  if (role === "super_admin") return true;
  if (!role) return false;
  const email = await getCurrentUserEmail();
  return !!email && ownsClient(client, email, teamForRole(role));
}

/**
 * Restrict a client list to what the current user may see. Super-admins (and
 * dev bypass) see everything; a CSM-team user sees only clients they are the
 * CSM of; an Implementation-team user sees only clients they implement.
 */
export async function scopeClientsToUser(clients: Client[]): Promise<Client[]> {
  const role = await getCurrentUserRole();
  if (role === "super_admin") return clients;
  if (!role) return [];
  const email = await getCurrentUserEmail();
  if (!email) return [];
  const team = teamForRole(role);
  return clients.filter((c) => ownsClient(c, email, team));
}
