/* =========================================================================
   Assignment workflow — configuration & decision types (pure data, no I/O).
   Import-safe from client and server.
   ========================================================================= */

import type { Role, Team } from "@/lib/roles";

/** CSM assignment: ARR bands → role tier. Inclusive lower bound, ascending —
 *  the band with the largest minArr that is ≤ the client's ARR wins. */
export interface ArrBand {
  minArr: number;
  role: Role; // a CSM-team role
}

export interface CsmAssignmentConfig {
  enabled: boolean;
  bands: ArrBand[];
  /** Optional helper client-property key. When set, a candidate is only eligible
   *  if their app_users helper value matches the client's value (soft filter).
   *  Empty/null = no helper filter (the common case for now). */
  helperProperty: string | null;
}

/** Implementation assignment: implementation level → role tier. */
export interface ImplementationLevelRule {
  level: string; // canonical level label, e.g. "White Glove"
  role: Role; // an implementation-team role
}

export interface ImplementationAssignmentConfig {
  enabled: boolean;
  rules: ImplementationLevelRule[];
  /** Tier used when the client's implementation level is unknown/unmapped. */
  defaultRole: Role;
}

/** Capacity thresholds powering the team-health indicator. */
export interface CapacityConfig {
  /** Max active clients a person of this role should hold before "over capacity". */
  maxClientsByRole: Partial<Record<Role, number>>;
  /** Max White-Glove accounts an implementer should hold before "over capacity". */
  maxWhiteGlove: number;
}

export type AssignmentStatus =
  | "assigned" // an owner was chosen and written
  | "needs_admin" // a tie (or helper conflict) — super-admin must choose
  | "no_candidates" // no team member holds the required role
  | "skipped" // already owned / nothing to do
  | "disabled"; // this team's workflow is turned off

export interface AssignmentDecision {
  team: Team;
  status: AssignmentStatus;
  role: Role | null; // the tier the rule selected
  ownerEmail: string | null; // the chosen owner (when assigned)
  reason: string; // human-readable explanation for the notification
  tied: string[]; // candidate emails, when needs_admin
}
