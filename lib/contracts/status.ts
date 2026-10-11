/* =========================================================================
   Account status as read from contract records, and a status set by hand.

   Used by the contract tab (a super-admin preview). The account's LIVE status
   still comes from lib/status.ts until the switch-over. Pure, tested in
   status.test.ts. The rules (decided 2026-10-04 … 10-08):

     - Highest wins: churned → renewal overdue → renewal due → onboarding → active.
     - Churned: a counted churn record has taken effect.
     - Renewal due: the renewal date is within 90 days, or passed in the last 14.
     - Renewal overdue: the renewal date passed more than 14 days ago with no
       renewal or churn recorded.
     - A renewal recorded ahead of time settles the coming renewal: the date
       is read from the new term.
     - Launch is a fact about the account: a launch date on any counted record.
     - A status set by hand needs a reason, lasts 30 days, and ends early when
       a renewal or churn takes effect after it was set. Churned can't be set
       by hand: it needs a churn record (date and reasons).
   ========================================================================= */

export type ContractStatus = "onboarding" | "active" | "renewal" | "overdue" | "churned";
export const CONTRACT_STATUSES: ContractStatus[] = ["onboarding", "active", "renewal", "overdue", "churned"];
export const STATUS_LABEL: Record<ContractStatus, string> = {
  onboarding: "Onboarding", active: "Active", renewal: "Renewal due", overdue: "Renewal overdue", churned: "Churned",
};

export const RENEWAL_WINDOW = 90;
/** Days after the renewal date before "Renewal due" becomes "Renewal overdue". */
export const OVERDUE_GRACE = 14;
/** How long a status set by hand lasts. */
export const OVERRIDE_DAYS = 30;

/** The fields of a contract record the status reads. */
export interface StatusRecord {
  kind: "sale" | "renewal" | "expansion" | "downgrade" | "churn";
  start: string | null;
  renewal: string | null;
  milestones: Record<string, string | null>;
  /** false = history only or voided. */
  counted?: boolean;
}

const fmt = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The contract in force on `today`: the latest counted sale or renewal that has started. */
export function contractInForce<T extends StatusRecord>(records: T[], today: string): T | undefined {
  return records
    .filter((r) => r.counted !== false && (r.kind === "sale" || r.kind === "renewal") && r.renewal && (!r.start || r.start <= today))
    .sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""))[0];
}

/** A renewal recorded for the term after the one in force, if there is one. */
export function nextTerm<T extends StatusRecord>(records: T[], current: T, today: string): T | undefined {
  return records
    .filter((r) => r.kind === "renewal" && r.counted !== false && r.start && r.start > today && r.start >= (current.start ?? ""))
    .sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""))[0];
}

/** The earliest date recorded for a milestone on any counted record. */
export function firstMilestone(records: StatusRecord[], key: string): string | null {
  return records.filter((r) => r.counted !== false).map((r) => r.milestones[key]).filter((d): d is string => !!d).sort()[0] ?? null;
}

/** The status the records give on `today`, and the date that decided it. */
export function statusFromRecords(all: StatusRecord[], today: string): { key: ContractStatus; why: string } {
  const records = all.filter((r) => r.counted !== false);
  const churn = records.find((r) => r.kind === "churn" && r.start && r.start <= today);
  if (churn) return { key: "churned", why: `Churn recorded, effective ${fmt(churn.start!)}.` };
  const current = contractInForce(records, today);
  if (!current) return { key: "onboarding", why: "No contract has started yet." };
  const launch = firstMilestone(records, "launch_date");
  const signedAhead = nextTerm(records, current, today);
  const renewal = signedAhead?.renewal ?? current.renewal;
  if (signedAhead && launch && launch <= today && renewal && daysBetween(today, renewal) > RENEWAL_WINDOW) {
    return { key: "active", why: `Renewed. The new term starts ${fmt(signedAhead.start!)}; next renewal ${fmt(renewal)}.` };
  }
  if (renewal) {
    const days = daysBetween(today, renewal);
    if (days < -OVERDUE_GRACE) return { key: "overdue", why: `Renewal date ${fmt(renewal)} passed ${-days} days ago with no renewal or churn recorded.` };
    if (days < 0) return { key: "renewal", why: `Renewal date ${fmt(renewal)} passed ${-days} days ago. It becomes overdue after ${OVERDUE_GRACE} days.` };
    if (days <= RENEWAL_WINDOW) return { key: "renewal", why: `Renewal date ${fmt(renewal)} is in ${days} days.` };
  }
  if (!launch || launch > today) {
    const kickoff = firstMilestone(records, "kickoff_meeting_date");
    return { key: "onboarding", why: launch ? `Launch is planned for ${fmt(launch)}.` : kickoff ? `Kicked off ${fmt(kickoff)}; no launch date yet.` : "No launch date yet." };
  }
  return { key: "active", why: `Launched ${fmt(launch)}. Renewal date ${renewal ? `${fmt(renewal)}, ${daysBetween(today, renewal)} days away` : "not set"}.` };
}

/* ── Status set by hand ────────────────────────────────────────────────── */

export interface StatusOverride {
  status: ContractStatus;
  reason: string;
  setBy: string | null;
  /** YYYY-MM-DD */
  setOn: string;
  expiresOn: string;
}

export type OverrideCheck = { ok: true } | { ok: false; error: string };

export function validateOverride(status: string, reason: string): OverrideCheck {
  if (status === "churned") return { ok: false, error: "Churned can't be set by hand. Record a churn, with its date and reasons." };
  if (!CONTRACT_STATUSES.includes(status as ContractStatus)) return { ok: false, error: "That isn't a status." };
  if (!reason.trim()) return { ok: false, error: "Say why the status is being set by hand." };
  return { ok: true };
}

export const overrideExpiry = (setOn: string) => addDays(setOn, OVERRIDE_DAYS);

/** The override if it still applies on `today`: not expired, and no renewal or churn has taken effect since it was set. */
export function activeOverride(o: StatusOverride | null, records: StatusRecord[], today: string): StatusOverride | null {
  if (!o || today >= o.expiresOn || today < o.setOn) return null;
  const ended = records.some((r) => r.counted !== false && (r.kind === "renewal" || r.kind === "churn") && r.start && r.start > o.setOn && r.start <= today);
  return ended ? null : o;
}

/** The status to show: the one set by hand while it applies, else the one the records give. */
export function effectiveStatus(records: StatusRecord[], override: StatusOverride | null, today: string): {
  key: ContractStatus; why: string; auto: ContractStatus; override: StatusOverride | null;
} {
  const auto = statusFromRecords(records, today);
  const o = auto.key === "churned" ? null : activeOverride(override, records, today);
  if (!o) return { ...auto, auto: auto.key, override: null };
  return {
    key: o.status, auto: auto.key, override: o,
    why: `Set by hand${o.setBy ? ` by ${o.setBy}` : ""} on ${fmt(o.setOn)}: ${o.reason} Returns to automatic on ${fmt(o.expiresOn)}, or when a renewal or churn takes effect. The records give ${STATUS_LABEL[auto.key]}: ${auto.why}`,
  };
}
