/* =========================================================================
   Assignment engine — pure decision functions (no DB / no notifications).
   These are deterministic and unit-testable; the orchestrator (run.ts) feeds
   them clients, candidates, and load metrics, then acts on the decision.
   ========================================================================= */

import type { Role, Team } from "@/lib/roles";
import type { Deal } from "@/lib/types";
import type {
  AssignmentDecision,
  CsmAssignmentConfig,
  ImplementationAssignmentConfig,
} from "@/lib/assignment/types";

/* ----------------------------------------------------- implementation level */

/** Canonical implementation levels, highest-touch first. */
export const IMPLEMENTATION_LEVELS = ["White Glove", "Guided", "Self-Serve"] as const;

const LEVEL_RANK: Record<string, number> = {
  "white glove": 3,
  guided: 2,
  "self-serve": 1,
  "self serve": 1,
};

export function normalizeLevel(level: string | null | undefined): string {
  return (level ?? "").trim().toLowerCase();
}

/** Higher = more hands-on (more capacity-heavy). Unknown levels rank 0. */
export function rankLevel(level: string | null | undefined): number {
  return LEVEL_RANK[normalizeLevel(level)] ?? 0;
}

export function sameLevel(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizeLevel(a) === normalizeLevel(b) && normalizeLevel(a) !== "";
}

/**
 * A client's single implementation level = the highest-touch level among its
 * tracked deals (White Glove > Guided > Self-Serve). Null when no tracked deal
 * carries a level.
 */
export function clientImplementationLevel(deals: Deal[]): string | null {
  let best: string | null = null;
  let bestRank = 0;
  for (const d of deals) {
    if (d.tracked === false) continue;
    const r = rankLevel(d.implementationLevel);
    if (d.implementationLevel && r > bestRank) {
      best = d.implementationLevel;
      bestRank = r;
    }
  }
  return best;
}

/* --------------------------------------------------------- tier resolution */

/** CSM tier from ARR: the band with the largest minArr ≤ arr. */
export function resolveCsmTier(arr: number, config: CsmAssignmentConfig): Role | null {
  let chosen: Role | null = null;
  let chosenMin = -Infinity;
  for (const band of config.bands) {
    if (arr >= band.minArr && band.minArr >= chosenMin) {
      chosen = band.role;
      chosenMin = band.minArr;
    }
  }
  return chosen;
}

/** Implementation tier from the client's implementation level. */
export function resolveImplementationTier(
  level: string | null,
  config: ImplementationAssignmentConfig,
): Role | null {
  if (level) {
    for (const rule of config.rules) {
      if (sameLevel(rule.level, level)) return rule.role;
    }
  }
  return config.defaultRole ?? null;
}

/* ------------------------------------------------------- least-loaded pick */

export interface Candidate {
  email: string;
  role: Role;
}

/**
 * Choose the least-loaded candidate. `loadOf` returns the candidate's current
 * load (managed ARR for CSM, level-account count for Implementation) — lower is
 * better. Exactly one minimum → that candidate. Two or more share the minimum →
 * a tie the super-admin must break.
 */
export function pickLeastLoaded(
  candidates: Candidate[],
  loadOf: (email: string) => number,
): { winner: string | null; tied: string[] } {
  if (candidates.length === 0) return { winner: null, tied: [] };
  let min = Infinity;
  for (const c of candidates) min = Math.min(min, loadOf(c.email));
  const atMin = candidates.filter((c) => loadOf(c.email) === min).map((c) => c.email);
  if (atMin.length === 1) return { winner: atMin[0], tied: [] };
  return { winner: null, tied: atMin };
}

/* --------------------------------------------------------------- decisions */

function decideForTier(
  team: Team,
  role: Role | null,
  candidates: Candidate[],
  loadOf: (email: string) => number,
  describeTie: (tied: string[]) => string,
): AssignmentDecision {
  if (!role) {
    return { team, status: "no_candidates", role: null, ownerEmail: null, reason: "No rule matched the client.", tied: [] };
  }
  const inTier = candidates.filter((c) => c.role === role);
  if (inTier.length === 0) {
    return { team, status: "no_candidates", role, ownerEmail: null, reason: `No team member holds the ${role} role.`, tied: [] };
  }
  const { winner, tied } = pickLeastLoaded(inTier, loadOf);
  if (winner) {
    return { team, status: "assigned", role, ownerEmail: winner, reason: `Least-loaded ${role}.`, tied: [] };
  }
  return { team, status: "needs_admin", role, ownerEmail: null, reason: describeTie(tied), tied };
}

/** Decide the CSM owner for a client given its ARR. */
export function decideCsm(
  arr: number,
  candidates: Candidate[],
  config: CsmAssignmentConfig,
  managedArrOf: (email: string) => number,
): AssignmentDecision {
  if (!config.enabled) {
    return { team: "csm", status: "disabled", role: null, ownerEmail: null, reason: "CSM assignment is off.", tied: [] };
  }
  const role = resolveCsmTier(arr, config);
  return decideForTier(
    "csm",
    role,
    candidates,
    managedArrOf,
    (tied) => `${tied.length} ${role}s manage equal ARR — pick one.`,
  );
}

/** Decide the Implementation owner for a client given its implementation level. */
export function decideImplementation(
  level: string | null,
  candidates: Candidate[],
  config: ImplementationAssignmentConfig,
  levelAccountCountOf: (email: string) => number,
): AssignmentDecision {
  if (!config.enabled) {
    return { team: "implementation", status: "disabled", role: null, ownerEmail: null, reason: "Implementation assignment is off.", tied: [] };
  }
  const role = resolveImplementationTier(level, config);
  const levelLabel = level ?? "unknown-level";
  return decideForTier(
    "implementation",
    role,
    candidates,
    levelAccountCountOf,
    (tied) => `${tied.length} ${role}s hold equal ${levelLabel} load — pick one.`,
  );
}
