/* =========================================================================
   Account segment — derived from headcount, and kept derived.

   Enterprise ≥ 250 employees · Mid-market ≥ 50 · SMB below that. The
   thresholds are unchanged; what changed (2026-10-28) is that the answer now
   FOLLOWS the headcount instead of being decided once at sync time.

   Why. The segment used to be computed only inside the HubSpot sync, from
   HubSpot's own `numberofemployees`. A CSM correcting the headcount on the
   General Information tab wrote the new number and marked it overridden, so
   the sync never touched it again — and nothing ever revisited the segment.
   Three accounts were sitting in production with a corrected headcount and
   the segment HubSpot's original number had implied: 4,400 employees tagged
   SMB, 250 tagged SMB, 110 tagged SMB. Every one of them reads as a mistake
   to anyone looking at the row.

   A deliberate segment still wins. Setting Segment by hand marks it in
   __field_overrides, and an overridden segment is never recomputed — see
   nextSegment(). That is the escape hatch for an account whose headcount
   does not describe it: a local entity of a global company (its HubSpot
   record carries the GLOBAL headcount), a holding company, a joint venture.

   Pure and import-safe from client and server alike.
   ========================================================================= */

import type { Client } from "@/lib/types";

export type Segment = Client["segment"];

export const ENTERPRISE_MIN_EMPLOYEES = 250;
export const MID_MARKET_MIN_EMPLOYEES = 50;

/**
 * The segment a headcount implies.
 *
 * An unknown headcount yields "smb", which is what the sync has always done —
 * so 37 accounts with no headcount at all currently read as SMB rather than
 * as unknown. That is a real misreading, but it is the behaviour as it stands;
 * changing it means introducing an "unknown" segment, which every consumer
 * that groups by segment would have to understand.
 */
export function segmentForHeadcount(employees: number | null | undefined): Segment {
  if (employees == null) return "smb";
  if (employees >= ENTERPRISE_MIN_EMPLOYEES) return "enterprise";
  if (employees >= MID_MARKET_MIN_EMPLOYEES) return "mid_market";
  return "smb";
}

/**
 * The segment to store for an account, given its headcount and whether a human
 * has set the segment explicitly. Returns null when there is nothing to write
 * — the caller leaves the stored value alone.
 */
export function nextSegment(
  employees: number | null | undefined,
  segmentIsOverridden: boolean,
  current: Segment | null | undefined,
): Segment | null {
  if (segmentIsOverridden) return null; // a human's choice outranks the formula
  const derived = segmentForHeadcount(employees);
  return derived === current ? null : derived;
}

/**
 * What a save should do with the segment, given what the caller sent.
 *
 * `incoming` is undefined when the caller omitted the field, and otherwise the
 * value it posted — which is NOT evidence anyone chose it: the Edit account
 * drawer posts every core field on every save, changed or not. So a segment
 * counts as a human's choice only when it DIFFERS from what is stored. Marking
 * it otherwise would freeze the derivation for that account for good: here, in
 * recomputeClient, and in the backfill, without the Segment select ever being
 * opened.
 *
 * Returns the segment to write (null = leave it alone) and whether this save
 * should mark it overridden.
 */
export function segmentWriteFor(input: {
  incoming: Segment | undefined;
  stored: Segment | null | undefined;
  employees: number | null | undefined;
  employeesProvided: boolean;
  overridden: boolean;
}): { segment: Segment | null; markOverride: boolean } {
  const { incoming, stored, employees, employeesProvided, overridden } = input;
  if (incoming !== undefined && incoming !== stored) return { segment: incoming, markOverride: true };
  if (employeesProvided) return { segment: nextSegment(employees, overridden, stored), markOverride: false };
  return { segment: null, markOverride: false };
}
