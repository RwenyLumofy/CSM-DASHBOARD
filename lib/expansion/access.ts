/* =========================================================================
   Expansion — who may reach it, and who may change it.

   READ: everyone EXCEPT `guest`. A guest has no access to Expansion at all —
   not the board, not the client-profile card, not the Action list rows, not
   the Today lane, not the nav entry.

   THIS SUPERSEDES THE BUILD BRIEF. The brief's §4 says "`guest` is read-only",
   which would have let a guest read this board. The product owner ruled
   otherwise on 2026-08-16: "guests shouldn't have access to this, everyone
   else does/will have access." That is a product decision and it is made — do
   not restore the read-only-guest reading by citing §4 at this file.

   The reason, recorded so the rule survives the next reader: an expansion
   pipeline is UNANNOUNCED COMMERCIAL INTENT about live customers — what we are
   about to try to sell, to whom, for how much, and how confident we are. That
   is a different class of information from the account facts a guest is given
   to look at, and it does its damage by being seen rather than by being
   changed. A write gate cannot address that, which is why this is a read gate.

   WRITE: the same set, and then only on the accounts they may edit. The
   feature-level tier check here runs BEFORE the per-account gate; it never
   replaces it. `denyClientWrite` is still what every mutation calls.

   ONE PREDICATE PAIR, imported by the read layer, the route, the nav and the
   write gate. Unit tested in ./access.test.ts — a permission re-expressed as
   `!== "guest"` at five call sites is a permission that will eventually
   disagree with itself at one of them. Pure and import-safe from client and
   server alike, so the nav can ask it without touching a database.
   ========================================================================= */

import { permissionTier, type Role } from "@/lib/roles";

/**
 * May this role read Expansion at all?
 *
 * Everyone except `guest`. A null role means unresolved or not signed in,
 * which is never access — the safe direction, and the same stance
 * `getCurrentUserScope` takes.
 *
 * This is NOT the whole read rule, only the tier gate. What a permitted reader
 * actually sees is still scoped account by account by `scopeClientsToUser`: an
 * operator sees opportunities on their own accounts and no others.
 */
export function canSeeExpansion(role: Role | null): boolean {
  if (!role) return false;
  return permissionTier(role) !== "guest";
}

/**
 * May this role CHANGE anything in Expansion?
 *
 * The same set as `canSeeExpansion` today, and deliberately a separate function
 * rather than an alias: read and write are different questions, and this repo
 * has already been bitten once by a read gate standing in for a write gate (see
 * the note on `denyClientWrite` in lib/auth.ts). If a look-but-don't-touch tier
 * is ever added, only this one changes.
 *
 * Per-ACCOUNT write permission remains `denyClientWrite`; this is only the tier
 * check that runs before it.
 */
export function canEditExpansion(role: Role | null): boolean {
  if (!role) return false;
  return permissionTier(role) !== "guest";
}
