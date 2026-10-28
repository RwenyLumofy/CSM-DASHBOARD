/* =========================================================================
   The renewal date an account's contract records give, and the record it
   lives on: the renewal date of the contract in force, or of a renewal
   already recorded for the term after it. None once churned.

   The Contract tab's summary and the client header both read this, so they
   can't disagree, and both edit the date on the record named here.
   Pure, tested in renewal-date.test.ts.
   ========================================================================= */

import { contractInForce, nextTerm, type StatusRecord } from "./status";

export interface RenewalDateRecord extends StatusRecord {
  id: string;
}

export function renewalFromRecords<T extends RenewalDateRecord>(all: T[], today: string): { date: string; recordId: string } | null {
  const counted = all.filter((r) => r.counted !== false);
  const current = contractInForce(counted, today);
  if (!current?.renewal) return null;
  const churned = counted.some((r) => r.kind === "churn" && r.start && r.start <= today && r.start >= (current.start ?? ""));
  if (churned) return null;
  const next = nextTerm(counted, current, today);
  const holder = next?.renewal ? next : current;
  return { date: holder.renewal!, recordId: holder.id };
}
