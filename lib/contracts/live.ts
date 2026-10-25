/* =========================================================================
   An account's LIVE numbers, read from its contract records.

   This is what recomputeClient (lib/repo/drizzle.ts) writes onto the client
   row — and so what Today, Clients and Insights show — once the workspace is
   switched to contract records. While the switch is off nothing calls it.
   Pure, tested in live.test.ts.

     - ARR: the ledger as of today (lib/contracts/ledger.ts). Zero once churned.
     - Previous ARR: the ledger as of the first day of the current quarter.
     - Renewal date: the renewal date of the contract in force, or of a renewal
       already recorded for the term after it. None once churned.
     - Status: the records' status (lib/contracts/status.ts), with a status set
       by hand applied. The client row's status has no "Renewal overdue" value,
       so an overdue account is stored as "renewal"; the contract tab still
       shows it as overdue.
     - An account marked churned the old way (the "Mark as churned" button,
       properties.__status_override) stays churned, with zero ARR, even if no
       churn record exists yet — the old button must not silently stop working.
   ========================================================================= */

import type { AccountStatus } from "@/lib/types";
import { arrOn, type Currency, type LedgerKind } from "./ledger";
import { contractInForce, effectiveStatus, nextTerm, type StatusOverride } from "./status";

/** The columns of a contract record the live numbers read. */
export interface LiveRecord {
  id: string;
  kind: LedgerKind;
  startDate: string | null;
  renewalDate: string | null;
  amount: number;
  currency: string;
  yearAmounts: number[] | null;
  supportAmount: number | null;
  licences: number | null;
  milestones: Record<string, string | null> | null;
  counted: boolean;
  voidedAt: unknown;
}

export interface LiveNumbers {
  arr: number;
  previousArr: number;
  /** YYYY-MM-DD */
  renewalDate: string | null;
  status: AccountStatus;
}

function toLedger(rows: LiveRecord[]) {
  return rows.map((r) => ({
    id: r.id, kind: r.kind, start: r.startDate, renewal: r.renewalDate, amount: r.amount,
    currency: (r.currency === "BHD" || r.currency === "SAR" ? r.currency : "USD") as Currency,
    yearAmounts: r.yearAmounts ?? undefined, supportAmount: r.supportAmount, licences: r.licences,
    milestones: r.milestones ?? {}, counted: r.counted && !r.voidedAt,
  }));
}

/**
 * The ARR in USD a renewal starting on `start` replaces: the ledger as of the
 * day before, leaving out the renewal itself (`excludeId`, when editing one).
 */
export function arrReplacedBy(rows: LiveRecord[], start: string, excludeId?: string): number {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return arrOn(toLedger(rows.filter((r) => r.id !== excludeId)), d.toISOString().slice(0, 10));
}

export function liveFromRecords(
  rows: LiveRecord[],
  opts: { override: StatusOverride | null; legacyChurned: boolean; today: string; quarterStart: string },
): LiveNumbers {
  const records = toLedger(rows);
  const status = effectiveStatus(records, opts.override, opts.today);
  if (status.key === "churned" || opts.legacyChurned) {
    // A churned account carries no ARR, whatever its churn record's amount says. (An imported
    // HubSpot churn deal can be for less than the contract; the ledger then shows a remainder on
    // the contract tab and the Contract check page, for someone to settle. It is not live ARR.)
    return { arr: 0, previousArr: arrOn(records, opts.quarterStart), renewalDate: null, status: "churned" };
  }
  const current = contractInForce(records, opts.today);
  const renewalDate = current ? nextTerm(records, current, opts.today)?.renewal ?? current.renewal : null;
  return {
    arr: arrOn(records, opts.today),
    previousArr: arrOn(records, opts.quarterStart),
    renewalDate,
    status: status.key === "overdue" ? "renewal" : status.key,
  };
}
