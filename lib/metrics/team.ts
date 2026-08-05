/* =========================================================================
   Team book balance — how the account book is actually distributed across the
   people who own it.

   The question this answers is a CS leader's, not a CSM's: is the load fair,
   who carries the revenue, and who is behind on pulses? Deliberately NOT the
   same as headcount — one person can hold 36 accounts worth less than another's
   14, which is invisible everywhere else in the product.

   Churned accounts are excluded from every metric: they aren't work anyone is
   carrying. They're counted separately so a book that looks small isn't
   mistaken for a light load.
   ========================================================================= */

import type { Client } from "@/lib/types";
import { isAtRisk } from "@/lib/health/status";

/** Days until renewal, or null when the account has no renewal date. */
function daysToRenewal(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** A pulse counts as covering the account only while it's inside the 30-day
 *  validity window — the same rule the health engine scores on. */
function hasFreshPulse(c: Client, now: number): boolean {
  const p = c.properties?.cs_pulse as { updatedAt?: string } | undefined;
  if (!p?.updatedAt) return false;
  const age = (now - new Date(p.updatedAt).getTime()) / 86_400_000;
  return Number.isFinite(age) && age <= 30;
}

export interface TeamMemberBook {
  /** Lower-cased email, or "unassigned". */
  id: string;
  name: string;
  email: string | null;
  roleLabel: string | null;
  /** Accounts where this person is the CSM (the "book"). */
  accounts: number;
  /** Accounts where they're the implementation owner — real work that would
   *  otherwise make an implementation-only owner look idle. */
  implAccounts: number;
  arr: number;
  /** Share of the whole visible book's ARR, 0–1. */
  arrShare: number;
  atRisk: number;
  renewing90: number;
  churned: number;
  pulseFresh: number;
  /** Accounts eligible for a pulse (active/renewal) — the coverage denominator. */
  pulseEligible: number;
}

export interface TeamBook {
  members: TeamMemberBook[];
  totals: { accounts: number; arr: number; atRisk: number; renewing90: number; pulseFresh: number; pulseEligible: number };
  /** True when at least one visible account has no CSM. */
  hasUnassigned: boolean;
}

/**
 * Build the per-owner book from the already-scoped client list.
 *
 * `roleLabelByEmail` lets the caller supply display labels from app_users
 * without this module importing the auth/roles layer.
 */
export function buildTeamBook(
  clients: Client[],
  roleLabelByEmail: Map<string, string> = new Map(),
  now = Date.now(),
): TeamBook {
  const byId = new Map<string, TeamMemberBook>();
  const blank = (id: string, name: string, email: string | null): TeamMemberBook => ({
    id, name, email, roleLabel: email ? roleLabelByEmail.get(email) ?? null : null,
    accounts: 0, implAccounts: 0, arr: 0, arrShare: 0,
    atRisk: 0, renewing90: 0, churned: 0, pulseFresh: 0, pulseEligible: 0,
  });
  const get = (id: string, name: string, email: string | null): TeamMemberBook => {
    let m = byId.get(id);
    if (!m) { m = blank(id, name, email); byId.set(id, m); }
    return m;
  };

  let hasUnassigned = false;

  for (const c of clients) {
    // ---- implementation ownership is tracked on its own, for anyone ----
    const impl = c.implementationOwner;
    if (impl) {
      const iid = (impl.email ?? "").toLowerCase() || impl.id;
      if (iid) get(iid, impl.name, impl.email ?? null).implAccounts += c.status === "churned" ? 0 : 1;
    }

    // ---- the CSM book ----
    const csm = c.csm;
    const id = csm ? (csm.email ?? "").toLowerCase() || csm.id : "unassigned";
    if (!csm) hasUnassigned = true;
    const m = get(id, csm?.name ?? "Unassigned", csm?.email ?? null);

    if (c.status === "churned") { m.churned += 1; continue; }

    m.accounts += 1;
    m.arr += c.arr;
    // Applied status, not a re-band of the score: an account capped to At
    // Risk despite scoring 83 is at risk, and one scoring 0 because it
    // churned is not.
    if (isAtRisk(c.health)) m.atRisk += 1;
    const d = daysToRenewal(c.renewalDate);
    if (d != null && d >= 0 && d <= 90) m.renewing90 += 1;
    if (c.status === "active" || c.status === "renewal") {
      m.pulseEligible += 1;
      if (hasFreshPulse(c, now)) m.pulseFresh += 1;
    }
  }

  const members = [...byId.values()];
  const totalArr = members.reduce((s, m) => s + m.arr, 0);
  for (const m of members) m.arrShare = totalArr > 0 ? m.arr / totalArr : 0;

  // Heaviest book first — the imbalance is the point, so lead with it.
  members.sort((a, b) => b.accounts - a.accounts || b.arr - a.arr);

  return {
    members,
    totals: {
      accounts: members.reduce((s, m) => s + m.accounts, 0),
      arr: totalArr,
      atRisk: members.reduce((s, m) => s + m.atRisk, 0),
      renewing90: members.reduce((s, m) => s + m.renewing90, 0),
      pulseFresh: members.reduce((s, m) => s + m.pulseFresh, 0),
      pulseEligible: members.reduce((s, m) => s + m.pulseEligible, 0),
    },
    hasUnassigned,
  };
}

/** Average ARR per account — the number that exposes "many small accounts"
 *  vs "few large ones". Null when they own nothing. */
export function arrPerAccount(m: TeamMemberBook): number | null {
  return m.accounts > 0 ? m.arr / m.accounts : null;
}
