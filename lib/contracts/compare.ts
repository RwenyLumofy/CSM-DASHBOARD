/* =========================================================================
   Side by side: what an account shows today (from HubSpot deals) against what
   its contract records give. Read-only; used by the contract check page
   (app/(app)/reports/contract-check) while both run in parallel, before the
   switch-over. Pure, tested in compare.test.ts.

   The records side is what the switch would give the account
   (lib/contracts/live.ts): a churned account is zero ARR whatever its churn
   record's amount says, and "Renewal overdue" — which the client row can't
   store — counts as the same status as "Renewal due". So after the switch an
   account with records shows no difference here.

   ARR differs when the two are more than a dollar apart.
   ========================================================================= */

import { arrOn } from "./ledger";
import { statusFromRecords, type ContractStatus } from "./status";
import type { ContractView } from "./view";

export interface CompareRow {
  id: string;
  name: string;
  liveArr: number;
  recordArr: number;
  arrDiff: number;
  arrDiffers: boolean;
  liveStatus: string;
  recordStatus: ContractStatus;
  statusDiffers: boolean;
  /** Counted records, and all records including history and voided ones. */
  counted: number;
  total: number;
}

export function compareAccount(client: { id: string; name: string; status: string; arr: number }, records: ContractView[], today: string): CompareRow {
  const recordStatus = statusFromRecords(records, today).key;
  const recordArr = recordStatus === "churned" ? 0 : arrOn(records, today);
  const arrDiff = recordArr - client.arr;
  return {
    id: client.id, name: client.name, liveArr: client.arr, recordArr, arrDiff, arrDiffers: Math.abs(arrDiff) > 1,
    liveStatus: client.status, recordStatus, statusDiffers: (recordStatus === "overdue" ? "renewal" : recordStatus) !== client.status,
    counted: records.filter((r) => r.counted !== false).length, total: records.length,
  };
}

export interface CompareSummary {
  accounts: number;
  withoutRecords: number;
  arrDiffers: number;
  statusDiffers: number;
  /** Accounts not churned today. */
  liveArr: number;
  recordArrForLive: number;
  /** Accounts churned today: ARR still counted today, and what the records give. */
  churnedLiveArr: number;
  churnedRecordArr: number;
}

export function summarize(rows: CompareRow[]): CompareSummary {
  const live = rows.filter((r) => r.liveStatus !== "churned");
  const churned = rows.filter((r) => r.liveStatus === "churned");
  const sum = (rs: CompareRow[], k: "liveArr" | "recordArr") => rs.reduce((t, r) => t + r[k], 0);
  return {
    accounts: rows.length, withoutRecords: rows.filter((r) => r.total === 0).length,
    arrDiffers: rows.filter((r) => r.arrDiffers).length, statusDiffers: rows.filter((r) => r.statusDiffers).length,
    liveArr: sum(live, "liveArr"), recordArrForLive: sum(live, "recordArr"),
    churnedLiveArr: sum(churned, "liveArr"), churnedRecordArr: sum(churned, "recordArr"),
  };
}

/** Biggest ARR differences first, then status-only differences, then the rest by name. */
export function sortForReview(rows: CompareRow[]): CompareRow[] {
  const rank = (r: CompareRow) => (r.arrDiffers ? 0 : r.statusDiffers ? 1 : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b) || Math.abs(b.arrDiff) - Math.abs(a.arrDiff) || a.name.localeCompare(b.name));
}
