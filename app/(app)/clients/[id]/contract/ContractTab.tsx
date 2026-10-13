"use client";

/* =========================================================================
   The contract tab — an account's contract history, read from contract
   records (docs/specs/revenue/contract-records-specification.md).

   PREVIEW, open to everyone who can see the account. Saves here are real —
   they write contract_records through ./actions.ts, audited — but nothing else
   in Signal reads those records yet. The account's live ARR, status and renewal
   date still come from HubSpot deals until the switch-over, and this screen says
   so rather than implying otherwise. A churn recorded here does not close
   Expansion opportunities yet.

   `canEdit` (the account's CSM, admins, super admins) only decides which
   controls render; without it the same screen is read-only. The server actions
   enforce the permission again.

   Only Closed Won sales come from HubSpot. Renewals, downgrades and churn are
   recorded here; expansions are recorded on the Expansion page, so every
   expansion control here is a link to it.
   ========================================================================= */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowDownRight, ArrowUpRight, CalendarClock, Check, ChevronDown, ClipboardList, ExternalLink, History,
  Lock, Pencil, Plus, Repeat, TrendingDown, TrendingUp, UserX, X,
} from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { CURRENCIES, USD_PER, contractValueUSD, toUSD, withArr, type Currency } from "@/lib/contracts/ledger";
import { changedFields, libraryTerm, toFields, type ContractView, type LibraryTerm } from "@/lib/contracts/view";
import {
  OVERRIDE_DAYS, RENEWAL_WINDOW, effectiveStatus, firstMilestone, nextTerm, type ContractStatus, type StatusOverride,
} from "@/lib/contracts/status";
import type { ContractFields, ContractKind, ContractSource } from "@/lib/contracts/validate";
import {
  clearStatusOverrideAction, recordContractChangeAction, setStatusOverrideAction, updateContractRecordAction, voidContractRecordAction,
  type ContractActionResult,
} from "./actions";

type Kind = ContractKind;
type Source = ContractSource;
type ContractRecord = ContractView;

/* ── Currency ──────────────────────────────────────────────────────────── */

const CURRENCY_LABEL: Record<Currency, string> = { USD: "US dollar", BHD: "Bahraini dinar", SAR: "Saudi riyal (KSA)" };
function fmtMoney(amount: number, ccy: Currency): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: ccy, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}
/** Formatters that take US dollars and show them in the chosen display currency. */
function moneyFns(ccy: Currency) {
  const money = (usd: number) => fmtMoney(usd / USD_PER[ccy], ccy);
  const signedMoney = (usd: number) => `${usd > 0 ? "+" : usd < 0 ? "−" : ""}${money(Math.abs(usd))}`;
  /** A record's own amount, shown in the display currency, with the original alongside when they differ. */
  const recordMoney = (amount: number, recCcy: Currency = "USD", signed = false) => {
    const shown = signed ? signedMoney(toUSD(amount, recCcy)) : money(toUSD(amount, recCcy));
    return recCcy === ccy ? shown : `${shown} (${fmtMoney(amount, recCcy)})`;
  };
  return { ccy, money, signedMoney, recordMoney };
}
const DisplayCurrency = createContext<Currency>("USD");
const useMoney = () => moneyFns(useContext(DisplayCurrency));

/** An opportunity from the Expansion page (expansion_opportunities). */
export type Opportunity = {
  id: string; name: string; stage: string; outcome: string | null;
  expectedArr: number | null; finalArr: number | null; product: string | null; arrRecorded: boolean;
  closeReason?: string | null;
};
/** A reason from Settings → Churn taxonomy. */
export type ChurnReasonOption = { id: string; label: string; category: string };

const ReasonLabels = createContext<Map<string, string>>(new Map());
/** Churn reasons are stored by id; show the label Settings gives them. */
const useReasonLabel = () => { const m = useContext(ReasonLabels); return (id: string) => m.get(id) ?? id; };

// Mirrors the HubSpot picklists (lib/deal-overrides.ts DEAL_FIELD_FALLBACK_OPTIONS). A value
// already on a record that isn't listed here is still shown and kept.
const MODULES = ["Perform", "Develop", "Engage", "Other"];
const LIBRARIES = ["Go1", "Opensesame", "Udemy", "Linkedin", "Almentor", "Entalaqa", "Pluralsight"];
const SUPPORT_LEVELS = ["Level 1", "Level 2", "Level 3"];
const IMPLEMENTATION_LEVELS = ["Self-Serve", "Guided", "White Glove"];
const STAGE_LABEL: Record<string, string> = { identified: "Identified", qualified: "Qualified", proposed: "Proposed", closed: "Closed" };
const MILESTONES: { key: string; label: string }[] = [
  { key: "invoice_sent_date", label: "Invoice sent" },
  { key: "kickoff_meeting_date", label: "Kick-off meeting" },
  { key: "launch_date", label: "Launch" },
  { key: "platform_start_date", label: "Platform start" },
  { key: "platform_end_date", label: "Platform end" },
];

const KIND: Record<Kind, { label: string; tone: BadgeTone; icon: typeof Repeat; verb: string }> = {
  sale: { label: "Sale", tone: "halo", icon: ArrowUpRight, verb: "Closed won" },
  renewal: { label: "Renewal", tone: "sirius", icon: Repeat, verb: "Renewal" },
  expansion: { label: "Expansion", tone: "aurora", icon: TrendingUp, verb: "Expansion" },
  downgrade: { label: "Downgrade", tone: "stellar", icon: TrendingDown, verb: "Downgrade" },
  churn: { label: "Churn", tone: "nova", icon: UserX, verb: "Churn" },
};

/* ── Helpers ───────────────────────────────────────────────────────────── */

/** Calendar dates are pinned to UTC so SSR and the browser agree. */
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
function addYears(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString().slice(0, 10);
}
function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export type ContractTabProps = {
  /** `status` and `arr` are the account's LIVE values, still read from deals. */
  client: { id: string; name: string; status: string; arr: number };
  records: ContractView[];
  opportunities: Opportunity[];
  churnReasons: ChurnReasonOption[];
  /** The status set by hand on this account, if one is stored (it may have expired). */
  override: StatusOverride | null;
  /** May this user change the account? Decides what renders; the actions enforce it. */
  canEdit: boolean;
  /** May this user see Expansion? Without it the Expansion card and links are left out. */
  showExpansion: boolean;
  superAdmin: boolean;
  /** True once Signal reads ARR, status and renewal date from contract records (the switch on the Contract check page). */
  live: boolean;
  /** Shown inside the client profile, in place of the Contracts & deals card: no page header, no page padding. */
  embedded?: boolean;
  today: string;
};

export function ContractTab({ client, records, opportunities: opps, churnReasons, override, canEdit, showExpansion, superAdmin, live, embedded, today: startDay }: ContractTabProps) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [displayCcy, setDisplayCcy] = useState<Currency>("USD");
  const { money } = moneyFns(displayCcy);
  const reasonLabels = useMemo(() => new Map(churnReasons.map((r) => [r.id, r.label])), [churnReasons]);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), toast.bad ? 9000 : 3500); return () => clearTimeout(t); }, [toast]);

  /** "See status on" — move the date to see what the records give on another day. */
  const [today, setToday] = useState(startDay);
  const [drawer, setDrawer] = useState<{ kind: Kind } | null>(null);
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  // Records take effect on their start date, so ARR and status are read as of `today`.
  const effective = useMemo(() => records.filter((r) => r.counted !== false && (!r.start || r.start <= today)), [records, today]);
  const ledger = useMemo(() => withArr(effective, today), [effective, today]);
  const effectiveAll = useMemo(() => records.filter((r) => r.counted !== false), [records]);
  const latest = ledger[ledger.length - 1];
  // The contract in force is the latest sale or renewal; expansions and downgrades co-term onto it.
  const current = useMemo(() => [...effective].filter((r) => (r.kind === "sale" || r.kind === "renewal") && r.renewal).sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""))[0], [effective]);
  const churned = latest?.r.kind === "churn";
  // A status set by hand wins while it applies; a churn record always wins over it.
  const status = useMemo(() => effectiveStatus(records, override, today), [records, override, today]);
  // What the account has right now: the contract in force, plus what was added or removed on top of it.
  const inForce = useMemo(() => {
    if (!current) return { modules: [] as string[], library: [] as string[] };
    const since = effective.filter((r) => (r.start ?? "") >= (current.start ?? "") && r.id !== current.id);
    const modules = new Set(current.modules);
    const library = new Set(current.library);
    for (const r of since.sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""))) {
      if (r.kind === "expansion") { r.modules.forEach((m) => modules.add(m)); r.library.forEach((l) => library.add(l)); }
      if (r.kind === "downgrade") { r.modules.forEach((m) => modules.delete(m)); r.library.forEach((l) => library.delete(l)); }
    }
    return { modules: [...modules], library: [...library] };
  }, [effective, current]);
  const renewalDate = churned ? null : (current && nextTerm(effectiveAll, current, today)?.renewal) ?? current?.renewal ?? null;
  const daysToRenewal = renewalDate ? daysBetween(today, renewalDate) : null;

  // The history shows every record, including ones kept as history, voided ones and ones that start later.
  const fullLedger = useMemo(() => withArr(records), [records]);
  const shown = [...fullLedger].reverse().filter((x) => !x.step && (filter === "all" || x.r.kind === filter));
  const counts = (k: Kind) => records.filter((r) => r.kind === k).length;
  const expansionAccountHref = `/expansion?account=${encodeURIComponent(client.id)}`;

  /** Run a save; on success re-read the records from the server. */
  function run(action: () => Promise<ContractActionResult>, done: string, after?: (res: ContractActionResult) => void) {
    startSaving(async () => {
      let res: ContractActionResult;
      try { res = await action(); } catch { res = { ok: false, error: "That didn't save. Check your connection and try again." }; }
      if (!res.ok) { setToast({ text: res.error ?? "That didn't save.", bad: true }); return; }
      setToast(res.warning ? { text: `${done} ${res.warning}`, bad: true } : { text: done });
      after?.(res);
      router.refresh();
    });
  }
  function viewRecord(id: string) {
    setOpenId(id); setFilter("all");
    setTimeout(() => document.getElementById(`rec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  }
  function openDrawer(kind: Kind) {
    setMenu(false);
    if (!current) { setToast({ text: "There is no contract in force to change. A sale has to arrive from HubSpot first.", bad: true }); return; }
    setDrawer({ kind });
  }
  function saveRecord(rec: ContractRecord) {
    run(() => recordContractChangeAction(client.id, rec.kind, toFields(rec)), `Saved ${rec.name}.`, (res) => {
      setDrawer(null);
      if (res.id) viewRecord(res.id);
    });
  }

  const liveDiffers = Math.abs((latest?.after ?? 0) - client.arr) > 1;

  return (
    <DisplayCurrency.Provider value={displayCcy}>
    <ReasonLabels.Provider value={reasonLabels}>
    <div className={cn("flex w-full flex-col", embedded ? "gap-5" : "mx-auto max-w-[1080px] gap-7 px-4 py-6 sm:px-8 sm:py-10")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-dashed border-border bg-surface px-4 py-3 font-body text-[12.5px] leading-relaxed text-fg-muted">
        <Badge tone="sirius">{live ? "Live" : "Preview"}</Badge>
        <span className="min-w-0 flex-1 basis-80">
          {live ? (
            <>This account&apos;s ARR, status and renewal date across Signal come from these records. Saves are logged and take effect at once.</>
          ) : (
            <>Saves here are real and logged, but nothing else in Signal reads these records yet. The account&apos;s live ARR
            (<b className="text-fg">{money(client.arr)}</b>), status (<b className="text-fg">{client.status}</b>) and renewal date still come from HubSpot deals.</>
          )}
          {!canEdit && <> You can view this account&apos;s contract; only its CSM and admins can change it.</>}
          {superAdmin && <>{" "}<Link href="/reports/contract-check" className="font-semibold text-sirius hover:underline">See every account side by side</Link></>}
        </span>
        <label className="flex items-center gap-1.5">
          <span className="font-semibold">Show amounts in</span>
          <select id="display-ccy" value={displayCcy} onChange={(e) => setDisplayCcy(e.target.value as Currency)}
            className="rounded-sm border border-border bg-surface px-2 py-1 text-[12.5px] text-fg outline-none focus:border-sirius">
            {CURRENCIES.map((c) => <option key={c} value={c}>{c} · {CURRENCY_LABEL[c]}</option>)}
          </select>
        </label>
      </div>

      <header className="flex flex-col gap-3">
        {!embedded && <Link href={`/clients/${encodeURIComponent(client.id)}`} className="eyebrow w-fit hover:text-sirius">← Client profile</Link>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {embedded
            ? <h2 className="font-display text-lg font-bold leading-tight text-fg">Contract</h2>
            : <h1 className="font-display text-2xl font-bold leading-tight text-fg">{client.name}</h1>}
          {!canEdit ? <StatusPill status={status.key} /> : <StatusControl status={status.key} auto={status.auto} manual={status.override} saving={saving}
            onSave={(next, reason) => {
              if (next === "churned") { openDrawer("churn"); return; } // churn needs a date and reasons
              if (next === "auto") run(() => clearStatusOverrideAction(client.id), "Status returned to automatic.");
              else run(() => setStatusOverrideAction(client.id, next, reason), `Status set to ${STATUS[next].label} for ${OVERRIDE_DAYS} days.`);
            }} />}
          <span className="font-body text-[11.5px] text-fg-subtle">{status.override ? (live ? "set by hand" : "set by hand · contract tab only") : "from contract records"}</span>
        </div>
      </header>

      {records.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border bg-surface px-5 py-8 text-center font-body text-[13px] text-fg-muted">
          No contract records for this account yet. Sales come from HubSpot at Closed Won and appear here after the next sync.
        </section>
      ) : (
      <>
      <StatusPanel records={effectiveAll} status={status} today={today} realToday={startDay} onToday={setToday} />

      {/* Contract summary */}
      <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface shadow-sm md:grid-cols-4">
        <Summary label="ARR from records" value={money(latest?.after ?? 0)} hint={live ? "This is the account's ARR across Signal" : liveDiffers ? `Live ARR today is ${money(client.arr)}` : "Same as live ARR today"} />
        <Summary label="Licences" value={churned ? "—" : formatNumber(latest?.licences ?? 0)}
          hint={churned ? "" : `${inForce.modules.join(", ") || "No modules"} · ${inForce.library.length ? `Library: ${inForce.library.join(", ")}` : "No global library"}`} />
        <Summary label="Current term" value={current && !churned ? `${fmtDate(current.start)} → ${fmtDate(current.end)}` : "—"} hint={current && !churned ? `From ${KIND[current.kind].label.toLowerCase()}` : churned ? "Account churned" : ""} small />
        <div className="flex flex-col gap-1 border-t border-border-subtle px-5 py-4 md:border-l md:border-t-0">
          <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Renewal date</span>
          <span className={cn("font-display text-lg font-bold", churned ? "text-fg-subtle" : "text-fg")}>{churned ? "—" : fmtDate(renewalDate)}</span>
          {daysToRenewal != null && (
            <span className={cn("font-body text-[12px] font-semibold", daysToRenewal <= 90 ? "text-warning-fg" : "text-fg-subtle")}>
              {daysToRenewal >= 0 ? `In ${daysToRenewal} days` : `${-daysToRenewal} days overdue`}
              {current && <> · <button onClick={() => viewRecord(current.id)} className="text-sirius hover:underline">{canEdit ? "Change on the contract" : "See the contract"}</button></>}
            </span>
          )}
        </div>
      </section>

      <OpenLoops
        status={status.key} current={current} renewalDate={renewalDate} daysToRenewal={daysToRenewal}
        records={records} opps={opps} expansionHref={expansionAccountHref} clientId={client.id} today={today} canEdit={canEdit} showExpansion={showExpansion} live={live}
        onRecord={(kind) => openDrawer(kind)} onView={viewRecord}
      />

      {/* Contracts & deals */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-5 py-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sirius text-white"><History size={17} /></span>
          <div className="min-w-0 flex-1">
            <div className="font-display text-sm font-bold text-fg">Contracts &amp; deals</div>
            <div className="caption">Every change to this account&apos;s contract, newest first. Each one moves ARR.</div>
          </div>
          {canEdit && <div className="relative">
            <button
              onClick={() => setMenu((m) => !m)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-sirius bg-sirius px-3.5 py-2 font-body text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover"
            >
              <Plus size={15} /> Record change <ChevronDown size={14} />
            </button>
            {menu && (
              <div className="absolute right-0 z-20 mt-1.5 w-60 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg">
                {(["renewal", "expansion", "downgrade", "churn"] as Kind[]).map((k) => {
                  const Icon = KIND[k].icon;
                  // Expansions are recorded in one place: the Expansion module.
                  if (k === "expansion" && !showExpansion) return null;
                  if (k === "expansion") return (
                    <Link key={k} href={expansionAccountHref}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left font-body text-[13px] text-fg transition-colors hover:bg-bg-subtle">
                      <Icon size={15} className="text-fg-muted" />
                      <span className="flex-1">Record expansion on the Expansion page</span><ExternalLink size={12} className="text-fg-subtle" />
                    </Link>
                  );
                  return (
                    <button key={k} onClick={() => openDrawer(k)}
                      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left font-body text-[13px] text-fg transition-colors hover:bg-bg-subtle">
                      <Icon size={15} className="text-fg-muted" />
                      <span className="flex-1">Record {KIND[k].label.toLowerCase()}</span>
                    </button>
                  );
                })}
                <div className="mt-1 border-t border-border-subtle px-3.5 py-2 font-body text-[11.5px] leading-snug text-fg-subtle">
                  Sales are never recorded here: they come from HubSpot at Closed Won. A new sale appears here after the next HubSpot sync.
                </div>
              </div>
            )}
          </div>}
        </div>

        <div className="flex flex-wrap gap-1.5 px-5 pt-4">
          {(["all", "sale", "renewal", "expansion", "downgrade", "churn"] as const).map((k) => (
            <button key={k} onClick={() => setFilter(k)}
              className={cn("rounded-pill px-3 py-1 font-body text-[12.5px] font-semibold transition-colors",
                filter === k ? "bg-cosmos text-white" : "bg-bg-muted text-fg-muted hover:text-fg")}>
              {k === "all" ? "All" : KIND[k].label}
              <span className="ml-1.5 tabular text-[11px] opacity-70">{k === "all" ? records.length : counts(k)}</span>
            </button>
          ))}
        </div>

        <ol className="flex flex-col gap-3 p-5">
          {shown.length === 0 && <li className="rounded-lg border border-dashed border-border px-4 py-6 text-center font-body text-[13px] text-fg-subtle">Nothing recorded of this type yet.</li>}
          {shown.map(({ r, before, after }) => (
            <RecordCard key={r.id} r={r} before={before} after={after} open={openId === r.id} saving={saving} canEdit={canEdit}
              onToggle={() => setOpenId((o) => (o === r.id ? null : r.id))}
              onSave={(patch) => run(() => updateContractRecordAction(r.id, patch), `Saved ${r.name}.`)}
              onVoid={(reason) => run(() => voidContractRecordAction(r.id, reason), `Voided ${r.name}.`)} />
          ))}
        </ol>
      </section>
      </>
      )}

      {drawer && current && (
        <RecordDrawer kind={drawer.kind} churnReasons={churnReasons} saving={saving}
          current={current} today={today} arrNow={latest?.after ?? 0} licencesNow={latest?.licences ?? 0}
          onClose={() => setDrawer(null)} onSave={saveRecord} />
      )}

      {toast && (
        <div role="status" className={cn("fixed bottom-5 left-1/2 z-[60] inline-flex max-w-[92vw] -translate-x-1/2 items-start gap-2 rounded-lg px-4 py-2.5 font-body text-[13px] shadow-lg",
          toast.bad ? "bg-danger-bg text-danger-fg" : "bg-cosmos text-white")}>
          {!toast.bad && <Check size={14} className="mt-0.5 shrink-0" />}{toast.text}
        </div>
      )}
    </div>
    </ReasonLabels.Provider>
    </DisplayCurrency.Provider>
  );
}

function Summary({ label, value, hint, small }: { label: string; value: string; hint?: string; small?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border-subtle px-5 py-4 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0 [&:nth-child(2)]:border-t-0">
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      <span className={cn("tabular font-display font-bold text-fg", small ? "text-[15px] leading-7" : "text-lg")}>{value}</span>
      {hint && <span className="font-body text-[12px] text-fg-subtle">{hint}</span>}
    </div>
  );
}

/* ── Status ────────────────────────────────────────────────────────────── */

type StatusKey = ContractStatus;
const STATUS: Record<StatusKey, { label: string; dot: string; chip: string; rule: string }> = {
  onboarding: { label: "Onboarding", dot: "bg-info", chip: "bg-info-bg text-info-fg", rule: "A contract is in force but no launch date has passed yet." },
  active: { label: "Active", dot: "bg-success", chip: "bg-success-bg text-success-fg", rule: "Launched, and the renewal date is more than 90 days away." },
  renewal: { label: "Renewal due", dot: "bg-warning", chip: "bg-warning-bg text-warning-fg", rule: "The renewal date is within the next 90 days, or passed in the last 14." },
  overdue: { label: "Renewal overdue", dot: "bg-danger", chip: "bg-danger-bg text-danger-fg", rule: "The renewal date passed more than 14 days ago and no renewal or churn is recorded." },
  churned: { label: "Churned", dot: "bg-neutral-500", chip: "bg-bg-muted text-fg-muted", rule: "A churn record has taken effect." },
};
const ORDER: StatusKey[] = ["onboarding", "active", "renewal", "overdue", "churned"];

/** The status in the header. It can be set by hand with a reason (Churned instead opens the
 *  churn form, which needs a date and reasons), or returned to automatic. */
function StatusControl({ status, auto, manual, saving, onSave }: {
  status: StatusKey; auto: StatusKey; manual: StatusOverride | null; saving: boolean; onSave: (s: StatusKey | "auto", reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<StatusKey | "auto">("auto");
  const [reason, setReason] = useState("");
  const needsReason = pick !== "auto" && pick !== "churned";
  return (
    <span className="relative inline-flex items-center gap-2">
      <button onClick={() => { setPick(manual ? status : "auto"); setReason(manual?.reason ?? ""); setOpen((o) => !o); }}
        className="inline-flex items-center gap-1 rounded-pill hover:opacity-90" aria-expanded={open} aria-label="Change status">
        <StatusPill status={status} /><ChevronDown size={14} className="text-fg-subtle" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[320px] rounded-lg border border-border bg-surface p-3 shadow-lg">
          <div className="mb-2 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Set status</div>
          <ul className="flex flex-col gap-1">
            {(["auto", ...ORDER] as (StatusKey | "auto")[]).map((k) => (
              <li key={k}>
                <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 font-body text-[13px]", pick === k ? "bg-accent-soft" : "hover:bg-bg-subtle")}>
                  <input type="radio" name="status-pick" checked={pick === k} onChange={() => setPick(k)} className="accent-sirius" />
                  {k === "auto" ? <span>Automatic <span className="text-fg-subtle">· now {STATUS[auto].label}</span></span> : <StatusPill status={k} />}
                </label>
              </li>
            ))}
          </ul>
          {pick === "churned" && <p className="mt-2 font-body text-[12px] text-fg-muted">Churn needs an effective date and reasons. Continue opens the churn form.</p>}
          {needsReason && (
            <label className="mt-2 flex flex-col gap-1.5">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Reason · required</span>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason for setting the status by hand"
                className="w-full resize-y rounded-sm border border-border bg-surface px-2 py-1.5 font-body text-[13px] text-fg outline-none focus:border-sirius" />
              <span className="font-body text-[11.5px] text-fg-subtle">Lasts {OVERRIDE_DAYS} days, or until a renewal or churn takes effect.</span>
            </label>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-sm px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted hover:text-fg">Cancel</button>
            <button disabled={saving || (needsReason && !reason.trim()) || (pick === "auto" && !manual)} onClick={() => { onSave(pick, reason); setOpen(false); }}
              className="rounded-sm bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50">
              {pick === "churned" ? "Continue" : "Save status"}
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

function StatusPill({ status }: { status: StatusKey }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 font-body text-[12px] font-semibold", STATUS[status].chip)}>
      <span className={cn("size-1.5 rounded-full", STATUS[status].dot)} />{STATUS[status].label}
    </span>
  );
}

function shiftDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function StatusPanel({ records, status, today, realToday, onToday }: {
  records: ContractRecord[]; realToday: string; status: { key: StatusKey; why: string }; today: string; onToday: (d: string) => void;
}) {
  const kickoff = firstMilestone(records, "kickoff_meeting_date");
  const launch = firstMilestone(records, "launch_date");
  const latestContract = [...records].filter((r) => (r.kind === "sale" || r.kind === "renewal") && r.renewal).sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""))[0];
  // Pinned to the latest contract so the timeline and presets stay put while previewing.
  const renewal = latestContract?.renewal ?? null;
  const firstStart = [...records].map((r) => r.start).filter((d): d is string => !!d).sort()[0] ?? today;
  const from = shiftDays(kickoff && kickoff < firstStart ? kickoff : firstStart, -30);
  const to = renewal ? shiftDays(renewal, 75) : shiftDays(today, 120);
  const span = Math.max(1, daysBetween(from, to));
  const pos = (d: string) => `${Math.min(100, Math.max(0, (daysBetween(from, d) / span) * 100))}%`;
  const windowStart = renewal ? shiftDays(renewal, -RENEWAL_WINDOW) : null;
  // A multi-year term renews once, at the end. Its yearly anniversaries are marked but don't trigger anything.
  const anniversaries: string[] = [];
  if (latestContract?.start && renewal) {
    for (let y = 1; y < 10; y++) {
      const d = addYears(latestContract.start, y);
      if (d >= shiftDays(renewal, -30)) break;
      anniversaries.push(d);
    }
  }

  const markers = ([
    kickoff && { d: kickoff, label: "Kick-off", dot: "bg-info" },
    launch && { d: launch, label: "Launch", dot: "bg-info" },
    ...anniversaries.map((d, k) => ({ d, label: `Year ${k + 2} starts`, dot: "bg-success", year: true })),
    windowStart && { d: windowStart, label: "Renewal window opens", dot: "bg-warning" },
    renewal && { d: renewal, label: "Renewal date", dot: "bg-danger" },
  ].filter(Boolean) as { d: string; label: string; dot: string; year?: boolean }[]).sort((a, b) => a.d.localeCompare(b.d));

  // Markers that land on (nearly) the same spot share one numbered pin, so the bar never
  // shows two lines on top of each other; the list below spells each one out.
  const pins = markers.reduce<{ d: string; n: number; dot: string; items: typeof markers }[]>((acc, m) => {
    const last = acc[acc.length - 1];
    if (last && (daysBetween(last.d, m.d) / span) * 100 < 4) last.items.push(m);
    else acc.push({ d: m.d, n: acc.length + 1, dot: m.dot, items: [m] });
    return acc;
  }, []);

  const presets: { label: string; date: string }[] = [
    { label: "Today", date: realToday },
    ...(launch ? [{ label: "Before launch", date: shiftDays(launch, -14) }] : []),
    ...(launch && windowStart ? [{ label: "Mid-contract", date: shiftDays(windowStart, -60) }] : []),
    ...(renewal ? [{ label: "60 days to renewal", date: shiftDays(renewal, -60) }, { label: "After renewal date", date: shiftDays(renewal, 21) }] : []),
  ];

  // Segments: onboarding until launch, active until the renewal window, then due, then overdue.
  const seg = (a: string, b: string, cls: string, key: string) =>
    b > a ? <div key={key} className={cn("absolute inset-y-0", cls)} style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` }} /> : null;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
      <div className="flex flex-col gap-2.5 px-6 pb-1 pt-5">
        <div className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Status from contract records on {fmtDate(today)}</div>
        <span className="w-fit"><StatusPill status={status.key} /></span>
        <p className="max-w-[60ch] font-body text-[14px] leading-relaxed text-fg">{status.why}</p>
      </div>

      {/* Lifecycle timeline — ticks on the bar, key dates listed underneath so nothing collides at any width */}
      <div className="px-6 pb-5 pt-6">
        <div className="relative">
          <div className="relative h-3 overflow-hidden rounded-full bg-bg-muted">
            {launch && seg(from, launch, "bg-info/50", "on")}
            {seg(launch ?? from, windowStart ?? to, "bg-success/50", "ac")}
            {windowStart && renewal && seg(windowStart, renewal, "bg-warning/60", "rn")}
            {renewal && seg(renewal, to, "bg-danger/40", "od")}
          </div>
          {pins.map((p) => (
            <span key={p.n} title={p.items.map((m) => `${m.label} · ${fmtDate(m.d)}`).join("\n")}
              className={cn("absolute top-1/2 grid size-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-surface font-body text-[9.5px] font-bold text-white shadow-sm", p.dot)}
              style={{ left: pos(p.d) }}>
              {p.n}
            </span>
          ))}
          <div className="absolute -top-2.5 z-10 h-[32px] w-0.5 -translate-x-1/2 rounded bg-cosmos" style={{ left: pos(today) }} aria-hidden>
            <span className="absolute -top-[18px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-sm bg-cosmos px-1.5 py-px font-body text-[10px] font-semibold text-white">
              {today === realToday ? "Today" : fmtDate(today)}
            </span>
          </div>
        </div>
        <ol className="mt-5 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          {pins.flatMap((p) => p.items.map((m) => (
            <li key={m.label} className={cn("flex items-center gap-2 font-body text-[12px]", m.d < today ? "text-fg-subtle" : "text-fg-muted")}>
              <span className={cn("grid size-[18px] shrink-0 place-items-center rounded-full font-body text-[9.5px] font-bold text-white", p.dot)}>{p.n}</span>
              <span className="font-semibold text-fg">{m.label}</span>
              <span className="tabular">{fmtDate(m.d)}</span>
            </li>
          )))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-6 py-4">
        <label htmlFor="see-status-on" className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">See status on</label>
        <input id="see-status-on" type="date" value={today} onChange={(e) => e.target.value && onToday(e.target.value)}
          className="rounded-sm border border-border bg-surface px-2 py-1 font-body text-[13px] text-fg outline-none focus:border-sirius focus:ring-2 focus:ring-sirius/15" />
        <span className="basis-full" />
        {presets.map((p) => (
          <button key={p.label} onClick={() => onToday(p.date)}
            className={cn("rounded-pill px-3 py-1 font-body text-[12px] font-semibold transition-colors",
              today === p.date ? "bg-cosmos text-white" : "bg-bg-muted text-fg-muted hover:text-fg")}>
            {p.label}
          </button>
        ))}
        <span className="basis-full font-body text-[11.5px] text-fg-subtle">Edit a date in the contract history and the status follows.</span>
      </div>

      <details className="border-t border-border-subtle">
        <summary className="cursor-pointer px-5 py-2.5 font-body text-[12.5px] font-semibold text-sirius">How status is worked out</summary>
        <ul className="grid gap-1.5 px-5 pb-4">
          {ORDER.map((k) => (
            <li key={k} className={cn("flex items-start gap-2.5 rounded-sm px-2 py-1.5", status.key === k && "bg-bg-subtle")}>
              <span className="w-[132px] shrink-0"><StatusPill status={k} /></span>
              <span className="font-body text-[12.5px] leading-relaxed text-fg-muted">{STATUS[k].rule}</span>
            </li>
          ))}
          <li className="px-2 pt-1 font-body text-[11.5px] text-fg-subtle">If more than one applies, the priority is Churned, then Renewal overdue, then Renewal due, then Onboarding, then Active. A status set by hand, with a reason, wins over all but Churned for 30 days or until a renewal or churn takes effect.</li>
        </ul>
      </details>
    </section>
  );
}

/* ── Open loops ────────────────────────────────────────────────────────── */

/** The renewal, expansion and churn work that's open on this account, where each
 *  one lives in Signal today, and the contract record that closes it. */
function OpenLoops({ status, current, renewalDate, daysToRenewal, records, opps, expansionHref, clientId, today, canEdit, showExpansion, live, onRecord, onView }: {
  status: StatusKey; current: ContractRecord | undefined; renewalDate: string | null; daysToRenewal: number | null;
  records: ContractRecord[]; opps: Opportunity[]; expansionHref: string; clientId: string | null; today: string; canEdit: boolean; showExpansion: boolean; live: boolean;
  onRecord: (kind: Kind, opportunityId?: string) => void; onView: (id: string) => void;
}) {
  const { money } = useMoney();
  const reasonLabel = useReasonLabel();
  const churnRec = [...records].reverse().find((r) => r.kind === "churn" && r.counted !== false);
  // Setup belongs to the contract in force: the latest sale or renewal.
  const setupFor = status === "churned" ? undefined : current;
  const churned = status === "churned";
  // A renewal already recorded for the term after the one in force settles the coming renewal.
  const renewedNow = current ? nextTerm(records.filter((r) => r.counted !== false), current, today) : undefined;
  const open = opps.filter((o) => o.stage !== "closed");
  const won = opps.filter((o) => o.outcome === "won");

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-base font-bold text-fg">Open work</h2>
        <p className="font-body text-[13px] text-fg-muted">What&apos;s waiting on this account, where it lives in Signal, and the record that closes it.</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
      {/* Account setup — what CS fills in once a sale closes */}
      {setupFor && (() => {
        const items = setupChecklist(setupFor, records);
        const done = items.filter((i) => i.done).length;
        return (
          <Loop title="Account setup" icon={ClipboardList} where={`Contract history · ${setupFor.kind === "sale" ? "the Closed Won sale" : "the renewal"}`} href="#" linkLabel="" onLink={() => onView(setupFor.id)}
            state={done === items.length ? "done" : "open"}>
            <p><b className="text-fg">{done} of {items.length}</b> filled in for {setupFor.name}.</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {items.map((i) => (
                <li key={i.label} className={cn("flex items-center gap-1.5", i.done ? "text-fg-muted" : "text-warning-fg")}>
                  {i.done ? <Check size={13} className="text-success-fg" /> : <span className="size-[13px] rounded-full border-2 border-warning" />}{i.label}
                </li>
              ))}
            </ul>
            {done < items.length && <LoopButton onClick={() => onView(setupFor.id)} quiet={!canEdit}>{canEdit ? "Complete setup" : "See the contract"}</LoopButton>}
          </Loop>
        );
      })()}

      {/* Renewal */}
      <Loop title="Renewal" icon={Repeat} where="Today · “Confirm renewal decision”" href="/today" linkLabel="Open Today"
        state={churned ? "closed" : renewedNow ? "done" : status === "overdue" ? "overdue" : status === "renewal" ? "due" : "later"}>
        {churned ? (
          <p>Closed. The account churned{churnRec ? ` on ${fmtDate(churnRec.start)}` : ""}, so there is nothing to renew.</p>
        ) : (
          <>
            <p>
              {renewedNow ? <>Renewed{renewedNow.start ? `, new term from ${fmtDate(renewedNow.start)}` : ""}. Next renewal <b className="text-fg">{fmtDate(renewedNow.renewal)}</b>.</>
                : <>Renewal date <b className="text-fg">{fmtDate(renewalDate)}</b>{daysToRenewal != null && (daysToRenewal >= 0 ? `, in ${daysToRenewal} days.` : `, ${-daysToRenewal} days ago.`)}</>}
            </p>
            {renewedNow ? (
              <LoopButton onClick={() => onView(renewedNow.id)} quiet>View the renewal record</LoopButton>
            ) : canEdit && (
              <div className="flex flex-wrap gap-1.5">
                <LoopButton onClick={() => onRecord("renewal")}>Record renewal (1–5 years)</LoopButton>
                <LoopButton onClick={() => onRecord("downgrade")} quiet>Downgrade</LoopButton>
                <LoopButton onClick={() => onRecord("churn")} quiet>Churn</LoopButton>
              </div>
            )}
          </>
        )}
      </Loop>

      {/* Expansion */}
      {showExpansion && <Loop title="Expansion" icon={TrendingUp} where={`Expansion page · ${opps.length} opportunit${opps.length === 1 ? "y" : "ies"} for this account`} href={expansionHref} linkLabel="Open on Expansion"
        state={open.length ? "open" : won.length ? "done" : "none"}>
        {opps.length === 0 && <p>No opportunities on the Expansion page for this account.</p>}
        <ul className="flex flex-col gap-1.5">
          {opps.map((o) => {
            const rec = records.find((r) => r.opportunityId === o.id);
            return (
              <li key={o.id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-sm border border-border-subtle px-2.5 py-2">
                <span className="w-full font-semibold text-fg">{o.name}</span>
                {o.stage === "closed" ? (
                  <span className={cn("rounded-pill px-2 py-0.5 text-[11px] font-semibold", o.outcome === "won" ? "bg-success-bg text-success-fg" : "bg-bg-muted text-fg-muted")}>
                    {o.outcome === "won" ? (o.arrRecorded ? "Won · ARR recorded" : "Won · ARR not recorded") : `Closed · ${o.outcome ?? ""}${o.closeReason ? ` · ${o.closeReason.toLowerCase()}` : ""}`}
                  </span>
                ) : (
                  <span className="rounded-pill bg-bg-muted px-2 py-0.5 text-[11px] font-semibold text-fg-muted">{STAGE_LABEL[o.stage] ?? o.stage}{o.expectedArr ? ` · ${money(o.expectedArr)}` : ""}</span>
                )}

                {!churned && canEdit && o.stage !== "closed"
                  ? <LoopLink href={`/expansion?opportunity=${encodeURIComponent(o.id)}`}>Mark won on Expansion</LoopLink>
                  : <LoopLink href={`/expansion?opportunity=${encodeURIComponent(o.id)}`} quiet>Open on Expansion</LoopLink>}
                {rec && <LoopButton onClick={() => onView(rec.id)} quiet>View record</LoopButton>}
              </li>
            );
          })}
        </ul>
        <p className="text-[12.5px]">Expansions are recorded on the Expansion page, never here. When one is won there and its ARR is added, it is listed in this history; if that ARR is removed again, the record is voided.</p>
        {!churned && <LoopLink href={expansionHref} quiet>New expansion on the Expansion page</LoopLink>}
        {clientId && (
          <Link href={`/clients/${encodeURIComponent(clientId)}`} className="inline-flex w-fit items-center gap-1 font-semibold text-sirius hover:underline">
            Same opportunities on the client profile&apos;s Expansion card <ExternalLink size={11} />
          </Link>
        )}
      </Loop>}

      {/* Churn */}
      <Loop title="Churn" icon={UserX} where="Client profile status · Churn report" href="/reports/churn" linkLabel="Open Churn report"
        state={churned ? "done" : "none"}>
        {churned && churnRec ? (
          <>
            <p>Churned <b className="text-fg">{fmtDate(churnRec.start)}</b>.</p>
            <p>Reasons: <b className="text-fg">{churnRec.reasons?.length ? churnRec.reasons.map(reasonLabel).join(", ") : "not set yet"}</b>.</p>
            {!churnRec.reasons?.length && <p className="text-warning-fg">Without reasons it shows as unclassified in the Churn report.</p>}
            <LoopButton onClick={() => onView(churnRec.id)} quiet>View the churn record</LoopButton>
          </>
        ) : (
          <>
            <p>Not churned{current ? ` · ${money(contractValueUSD(current))} contract in force` : ""}.</p>
            <p>{live
              ? "Recording churn marks the account churned from the date you pick, takes its ARR to zero, and closes any open expansion opportunities as lost."
              : "Recording churn ends the contract in this history from the date you pick, with its reasons. During the preview it does not change the account's live status or ARR, and does not close open opportunities."}</p>
            {canEdit && <LoopButton onClick={() => onRecord("churn")} quiet>Record churn</LoopButton>}
          </>
        )}
      </Loop>
      </div>
    </section>
  );
}

const LOOP_STATE: Record<string, { label: string; cls: string }> = {
  due: { label: "Due", cls: "bg-warning-bg text-warning-fg" },
  overdue: { label: "Overdue", cls: "bg-danger-bg text-danger-fg" },
  later: { label: "Not yet due", cls: "bg-bg-muted text-fg-muted" },
  open: { label: "Open", cls: "bg-info-bg text-info-fg" },
  done: { label: "Closed", cls: "bg-success-bg text-success-fg" },
  closed: { label: "Closed", cls: "bg-bg-muted text-fg-muted" },
  none: { label: "Nothing open", cls: "bg-bg-muted text-fg-muted" },
};

function Loop({ title, icon: Icon, where, href, linkLabel, onLink, state, children }: {
  title: string; icon: typeof Repeat; where: string; href: string; linkLabel: string; onLink?: () => void; state: string; children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3.5 rounded-lg border border-border bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-fg-muted" />
        <span className="font-display text-sm font-bold text-fg">{title}</span>
        <span className={cn("ml-auto rounded-pill px-2 py-0.5 font-body text-[11px] font-semibold", LOOP_STATE[state].cls)}>{LOOP_STATE[state].label}</span>
      </div>
      <div className="flex flex-col gap-2.5 font-body text-[13px] leading-relaxed text-fg-muted">{children}</div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3 font-body text-[12px]">
        <span className="text-fg-subtle">Lives in: {where}</span>
        {onLink ? null : <Link href={href} className="inline-flex items-center gap-1 font-semibold text-sirius hover:underline">{linkLabel}<ExternalLink size={11} /></Link>}
      </div>
    </div>
  );
}

/** Same look as LoopButton, for actions that happen on another Signal page. */
function LoopLink({ href, quiet, children }: { href: string; quiet?: boolean; children: React.ReactNode }) {
  return (
    <Link href={href}
      className={cn("inline-flex w-fit items-center gap-1.5 rounded-sm px-3 py-1.5 font-body text-[12.5px] font-semibold transition-colors",
        quiet ? "border border-border text-fg hover:border-sirius-200 hover:text-sirius" : "bg-sirius text-white hover:bg-accent-hover")}>
      {children}<ExternalLink size={11} />
    </Link>
  );
}

function LoopButton({ onClick, quiet, children }: { onClick: () => void; quiet?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={cn("w-fit rounded-sm px-3 py-1.5 font-body text-[12.5px] font-semibold transition-colors",
        quiet ? "border border-border text-fg hover:border-sirius-200 hover:text-sirius" : "bg-sirius text-white hover:bg-accent-hover")}>
      {children}
    </button>
  );
}

/* ── Account setup (CS-owned fields on a contract) ─────────────────────── */

/** What a CSM fills in once a sale closes, and how many are done. */
function setupChecklist(r: ContractRecord, records: ContractRecord[]) {
  const first = (k: string) => records.map((x) => x.milestones[k]).find(Boolean);
  return [
    { label: "Modules contracted", done: r.modules.length > 0 },
    { label: "Modules you start with", done: (r.startingModules?.length ?? 0) > 0 },
    { label: "Global library (or none)", done: !!r.libraryDecided || r.library.length > 0 },
    { label: "Support level", done: !!r.supportLevel },
    { label: "Support amount", done: !r.supportLevel || r.supportAmount != null },
    { label: "Implementation level", done: !!r.implementationLevel },
    { label: "Kick-off date", done: !!first("kickoff_meeting_date") },
    { label: "Launch date", done: !!first("launch_date") },
  ];
}

function SetupGroups({ r, onUpdate }: { r: ContractRecord; onUpdate: (p: Partial<ContractRecord>) => void }) {
  const starting = r.startingModules ?? [];
  return (
    <>
      <Group label="Modules & global library · set by CS">
        <EditField label="Modules contracted" wide>
          <Chips options={MODULES} value={r.modules}
            onChange={(v) => onUpdate({ modules: v, startingModules: starting.filter((m) => v.includes(m)) })} />
        </EditField>
        <EditField label="Starting with" hint="The modules the rollout begins with" wide>
          {r.modules.length ? (
            <Chips options={r.modules} value={starting} onChange={(v) => onUpdate({ startingModules: v })} />
          ) : <span className="font-body text-[12.5px] text-fg-subtle">Pick the contracted modules first.</span>}
        </EditField>
        <EditField label="Global library" wide>
          <Chips options={LIBRARIES} value={r.library} noneLabel="None" noneOn={!!r.libraryDecided && r.library.length === 0}
            onChange={(v) => onUpdate({
              library: v, libraryDecided: true,
              // Pin each kept provider's terms before the list changes, so removing the first one doesn't shift its dates onto another.
              libraryTerms: v.length ? Object.fromEntries(v.map((p) => [p, libraryTerm(r, p)])) : undefined,
            })} />
        </EditField>
        {r.library.length > 0 && (
          <EditField label={r.library.length > 1 ? "Terms per library" : "Library terms"} wide>
            <LibraryTermsEditor r={r} onUpdate={onUpdate} />
          </EditField>
        )}
      </Group>
      <Group label="Service levels · set by CS">
        <EditField label="Support level">
          <Select options={SUPPORT_LEVELS} value={r.supportLevel ?? null} onChange={(v) => onUpdate({ supportLevel: v, ...(v ? {} : { supportAmount: null }) })} />
        </EditField>
        {r.supportLevel && (
          <EditField label="Support amount" hint="per year · counts toward ARR">
            <div className="flex items-center gap-1.5">
              <span className="font-body text-[12px] text-fg-subtle">{r.currency ?? "USD"}</span>
              <input type="number" min={0} aria-label="Support amount per year" value={r.supportAmount ?? ""}
                onChange={(e) => onUpdate({ supportAmount: e.target.value === "" ? null : Number(e.target.value) })}
                className={cn("w-32 rounded-sm border bg-surface px-2 py-1 font-body text-[13px] text-fg outline-none focus:border-sirius", r.supportAmount == null ? "border-warning/50" : "border-border")} />
            </div>
          </EditField>
        )}
        <EditField label="Implementation level">
          <Select options={IMPLEMENTATION_LEVELS} value={r.implementationLevel ?? null} onChange={(v) => onUpdate({ implementationLevel: v })} />
        </EditField>
        <EditField label="AI course credits">
          <input type="number" min={0} value={r.aiCredits ?? ""} onChange={(e) => onUpdate({ aiCredits: e.target.value === "" ? null : Number(e.target.value) })}
            className="w-28 rounded-sm border border-border bg-surface px-2 py-1 font-body text-[13px] text-fg outline-none focus:border-sirius" />
        </EditField>
      </Group>
      <Group label="One-time fees · recorded, never counted toward ARR">
        <EditField label="Fees" hint="implementation, content development, AI course credits…" wide>
          <div className="flex flex-col gap-2">
            {r.oneTimeFees.length === 0 && <span className="font-body text-[12.5px] text-fg-subtle">None recorded.</span>}
            {r.oneTimeFees.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input aria-label={`Fee ${i + 1} label`} placeholder="What the fee is for" value={f.label}
                  onChange={(e) => onUpdate({ oneTimeFees: r.oneTimeFees.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                  className="w-60 rounded-sm border border-border bg-surface px-2 py-1 font-body text-[13px] text-fg outline-none focus:border-sirius" />
                <span className="font-body text-[12px] text-fg-subtle">{r.currency ?? "USD"}</span>
                <input type="number" min={0} aria-label={`Fee ${i + 1} amount`} value={f.amount}
                  onChange={(e) => onUpdate({ oneTimeFees: r.oneTimeFees.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)) })}
                  className="w-32 rounded-sm border border-border bg-surface px-2 py-1 font-body text-[13px] text-fg outline-none focus:border-sirius" />
                <button type="button" aria-label={`Remove fee ${i + 1}`} onClick={() => onUpdate({ oneTimeFees: r.oneTimeFees.filter((_, j) => j !== i) })}
                  className="rounded-sm p-1 text-fg-subtle hover:bg-bg-muted hover:text-danger-fg"><X size={14} /></button>
              </div>
            ))}
            <button type="button" onClick={() => onUpdate({ oneTimeFees: [...r.oneTimeFees, { label: "", amount: 0 }] })}
              className="inline-flex w-fit items-center gap-1 font-body text-[12.5px] font-semibold text-sirius hover:underline"><Plus size={13} /> Add a one-time fee</button>
          </div>
        </EditField>
      </Group>
    </>
  );
}

/** One row per selected provider: its own licences, start and expiry. */
function LibraryTermsEditor({ r, onUpdate }: { r: ContractRecord; onUpdate: (p: Partial<ContractRecord>) => void }) {
  const set = (provider: string, patch: Partial<LibraryTerm>) =>
    onUpdate({ libraryTerms: { ...Object.fromEntries(r.library.map((p) => [p, libraryTerm(r, p)])), [provider]: { ...libraryTerm(r, provider), ...patch } } });
  const input = "rounded-sm border border-border bg-surface px-2 py-1 font-body text-[13px] text-fg outline-none focus:border-sirius";
  return (
    <div className="overflow-x-auto rounded-lg border border-border-subtle">
      <table className="w-full min-w-[440px] font-body text-[12.5px]">
        <thead>
          <tr className="text-left text-[10.5px] uppercase tracking-[0.05em] text-fg-subtle">
            <th className="px-3 py-2 font-semibold">Library</th><th className="px-3 py-2 font-semibold">Licences</th>
            <th className="px-3 py-2 font-semibold">Start</th><th className="px-3 py-2 font-semibold">Expiry</th>
          </tr>
        </thead>
        <tbody>
          {r.library.map((p) => {
            const t = libraryTerm(r, p);
            return (
              <tr key={p} className="border-t border-border-subtle">
                <td className="px-3 py-2 font-semibold text-fg">{p}</td>
                <td className="px-3 py-2"><input type="number" min={0} aria-label={`${p} licences`} value={t.licences ?? ""} className={cn(input, "w-24")}
                  onChange={(e) => set(p, { licences: e.target.value === "" ? null : Number(e.target.value) })} /></td>
                <td className="px-3 py-2"><input type="date" aria-label={`${p} start`} value={t.start ?? ""} className={input} onChange={(e) => set(p, { start: e.target.value || null })} /></td>
                <td className="px-3 py-2"><input type="date" aria-label={`${p} expiry`} value={t.expiry ?? ""} className={input} onChange={(e) => set(p, { expiry: e.target.value || null })} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EditField({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1.5", wide && "col-span-2 sm:col-span-3")}>
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
        {label}{hint && <span className="ml-1.5 normal-case tracking-normal text-fg-subtle/80">· {hint}</span>}
      </span>
      {children}
    </div>
  );
}

function Chips({ options, value, onChange, noneLabel, noneOn }: { options: string[]; value: string[]; onChange: (v: string[]) => void; noneLabel?: string; noneOn?: boolean }) {
  const chip = (on: boolean) => cn("inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 font-body text-[12px] font-semibold transition-colors",
    on ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:text-fg");
  return (
    <div className="flex flex-wrap gap-1.5">
      {noneLabel && <button type="button" onClick={() => onChange([])} className={chip(!!noneOn)}>{noneOn && <Check size={11} />}{noneLabel}</button>}
      {[...new Set([...options, ...value])].map((o) => {
        const on = value.includes(o);
        return (
          <button key={o} type="button" onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} className={chip(on)}>
            {on && <Check size={11} />}{o}
          </button>
        );
      })}
    </div>
  );
}

function Select({ options, value, onChange }: { options: string[]; value: string | null; onChange: (v: string | null) => void }) {
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}
      className={cn("w-fit rounded-sm border bg-surface px-2 py-1 font-body text-[13px] outline-none focus:border-sirius", value ? "border-border text-fg" : "border-warning/50 text-fg-subtle")}>
      <option value="">Not set</option>
      {[...new Set([...options, ...(value ? [value] : [])])].map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

/* ── Record card ───────────────────────────────────────────────────────── */

/** A record in the contract history. Edits go into a draft and only apply on Save,
 *  which sends just the fields that changed. */
function RecordCard({ r, before, after, open, saving, canEdit, onToggle, onSave, onVoid }: {
  r: ContractRecord; before: number; after: number; open: boolean; saving: boolean; canEdit: boolean; onToggle: () => void;
  onSave: (patch: Partial<ContractFields> & { counted?: boolean }) => void; onVoid: (reason: string) => void;
}) {
  // Reset the draft only when the stored record really changes, not on every re-read,
  // so saving one card never throws away unsaved edits on another.
  const stored = JSON.stringify(r);
  const [draft, setDraft] = useState<ContractRecord>(r);
  useEffect(() => { setDraft(JSON.parse(stored) as ContractRecord); }, [stored]);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const patch = {
    ...changedFields(toFields(r), toFields(draft)),
    ...((draft.counted !== false) !== (r.counted !== false) ? { counted: draft.counted !== false } : {}),
  };
  const dirty = Object.keys(patch).length > 0;
  const footer = r.voided || !canEdit ? null : (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle pt-3 font-body text-[12.5px] text-fg-muted">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="accent-sirius" checked={draft.counted !== false} onChange={(e) => setDraft((d) => ({ ...d, counted: e.target.checked }))} />
          Counts toward ARR <span className="text-fg-subtle">· untick to keep it as history only</span>
        </label>
        {r.source !== "hubspot" && !voiding && (
          <button onClick={() => setVoiding(true)} className="ml-auto font-semibold text-fg-subtle hover:text-danger-fg">Void this record…</button>
        )}
      </div>
      {voiding && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-danger-bg px-3 py-2.5">
          <input autoFocus aria-label="Why is this record being voided?" placeholder="Why is this record being voided?" value={reason} onChange={(e) => setReason(e.target.value)}
            className="min-w-0 flex-1 basis-56 rounded-sm border border-border bg-surface px-2 py-1.5 font-body text-[13px] text-fg outline-none focus:border-sirius" />
          <button onClick={() => { setVoiding(false); setReason(""); }} className="rounded-sm px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted hover:text-fg">Cancel</button>
          <button disabled={!reason.trim() || saving} onClick={() => onVoid(reason.trim())}
            className="rounded-sm bg-danger px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">Void record</button>
          <span className="basis-full font-body text-[11.5px] text-danger-fg">A voided record stays in the history, struck through, and stops counting. It can&apos;t be undone here.</span>
        </div>
      )}
      {dirty && (
        <div className="sticky bottom-0 -mx-4 -mb-4 mt-4 flex flex-wrap items-center gap-2 rounded-b-lg border-t border-border bg-warning-bg px-4 py-3">
          <span className="flex-1 font-body text-[12.5px] font-semibold text-warning-fg">Unsaved changes</span>
          <button onClick={() => setDraft(r)} className="rounded-sm px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted hover:text-fg">Cancel</button>
          <button disabled={saving} onClick={() => onSave(patch)} className="inline-flex items-center gap-1.5 rounded-sm bg-sirius px-3.5 py-1.5 font-body text-[12.5px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50">
            <Check size={13} /> {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </>
  );
  return (
    <RecordCardView r={draft} before={before} after={after} open={open} onToggle={onToggle} dirty={dirty} readOnly={!canEdit || !!r.voided}
      onUpdate={(p) => setDraft((d) => ({ ...d, ...p }))} footer={footer} />
  );
}

function NumCell({ label, value, onChange, prefix }: { label: string; value: number | null; onChange: (v: number | null) => void; prefix?: string }) {
  return (
    <EditField label={label}>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="font-body text-[12px] text-fg-subtle">{prefix}</span>}
        <input type="number" aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className="w-32 rounded-sm border border-border bg-surface px-2 py-1 font-body text-[13px] text-fg outline-none focus:border-sirius" />
      </div>
    </EditField>
  );
}

function RecordCardView({ r, before, after, open, onToggle, onUpdate, dirty, footer, readOnly }: {
  r: ContractRecord; before: number; after: number; open: boolean; onToggle: () => void; onUpdate: (p: Partial<ContractRecord>) => void;
  dirty: boolean; footer: React.ReactNode;
  /** Fields are shown but can't be changed (no edit right, or a voided record). */
  readOnly: boolean;
}) {
  const { money, signedMoney, recordMoney } = useMoney();
  const k = KIND[r.kind];
  const Icon = k.icon;
  const fromHubspot = r.source === "hubspot";
  const delta = after - before;
  const history = r.counted === false;
  const reasonLabel = useReasonLabel();
  const term = r.kind === "sale" || r.kind === "renewal";
  const amountLabel = term ? (r.yearAmounts && r.yearAmounts.length > 1 ? "Licence ARR · year 1" : r.supportAmount ? "Licence ARR" : "Contract ARR") : "ARR change";

  const setDate = (field: "start" | "end" | "renewal", v: string | null) => onUpdate({ [field]: v });

  return (
    <li id={`rec-${r.id}`} className={cn("scroll-mt-24 rounded-lg border border-border-subtle", history && "border-dashed")}>
      <button onClick={onToggle} className="flex w-full items-start gap-3 rounded-lg p-4 text-left transition-colors hover:bg-bg-subtle">
        <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
          r.kind === "sale" ? "bg-bg-muted text-fg" : r.kind === "renewal" ? "bg-info-bg text-info-fg" : r.kind === "expansion" ? "bg-success-bg text-success-fg" : r.kind === "downgrade" ? "bg-warning-bg text-warning-fg" : "bg-danger-bg text-danger-fg")}>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1 basis-56">
              <span className={cn("block break-words font-body text-sm font-semibold text-fg", r.voided && "text-fg-subtle line-through")}>{r.name}</span>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone={k.tone}>{k.label}</Badge>
                <SourceBadge source={r.source} />
                {r.channel && <span className="rounded-sm bg-bg-muted px-1.5 py-0.5 font-body text-[10.5px] font-semibold text-fg-muted">{r.channel}</span>}
                {dirty && <span className="rounded-sm bg-warning-bg px-1.5 py-0.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.05em] text-warning-fg">Unsaved</span>}
                {history && <span className="rounded-sm bg-bg-muted px-1.5 py-0.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">{r.voided ? "Voided" : "History · not counted"}</span>}
                <span className="font-body text-[12px] text-fg-subtle">
                  {r.kind === "churn" ? `Effective ${fmtDate(r.start)}` : `${fmtDate(r.start)} → ${fmtDate(r.end)}`}
                </span>
              </div>
            </div>
            <div className="shrink-0 sm:text-right">
              <div className={cn("tabular font-display text-base font-bold", history ? "text-fg-subtle line-through" : "text-fg")}>
                {history || r.kind === "sale" || r.kind === "renewal" ? money(contractValueUSD(r)) : signedMoney(delta)}
              </div>
              <div className="tabular font-body text-[11.5px] text-fg-subtle">
                {history ? "Doesn't count toward ARR" : <>ARR {money(before)} → <span className="font-semibold text-fg-muted">{money(after)}</span></>}
              </div>
            </div>
          </div>
        </div>
        <ChevronDown size={16} className={cn("mt-1 shrink-0 text-fg-subtle transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <fieldset disabled={readOnly} className="min-w-0 border-0 border-t border-border-subtle px-4 pb-4 pt-3">
          {fromHubspot && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-bg-subtle px-3 py-2 font-body text-[12.5px] text-fg-muted">
              <Lock size={13} className="shrink-0" />
              <span className="flex-1">Closed Won in HubSpot{r.channel ? ` via ${r.channel}` : ""}. Amount, licences, price and currency are HubSpot&apos;s and can&apos;t be changed here; change them in HubSpot. They are refreshed on every HubSpot sync. Modules, global library, service levels and dates are set here by CS.</span>
              {r.hubspotUrl && (
                <a className="inline-flex items-center gap-1 font-semibold text-sirius hover:underline" href={r.hubspotUrl} target="_blank" rel="noreferrer">
                  Open in HubSpot <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}
          {r.source === "imported" && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-bg-subtle px-3 py-2 font-body text-[12.5px] text-fg-muted">
              <History size={13} className="shrink-0" /> Imported once from the HubSpot CS pipeline. It now lives in Signal and is fully editable.
            </div>
          )}

          <Group label={r.kind === "churn" ? "Churn" : "Commercials"}>
            {r.kind === "churn" ? (
              <>
                <Cell label="ARR lost" value={r.amount ? recordMoney(Math.abs(r.amount), r.currency) : "All remaining ARR"} />
                <Cell label="Reasons" value={(r.reasons ?? []).map(reasonLabel).join(", ") || "—"} wide />
              </>
            ) : (
              <>
                {fromHubspot ? (
                  <>
                    <Cell label={amountLabel} value={recordMoney(r.amount, r.currency)} locked />
                    <Cell label="Currency" value={r.currency ?? "USD"} locked />
                    <Cell label="Licences" value={r.licences == null ? "—" : formatNumber(r.licences)} locked />
                    <Cell label="Complementary" value={r.complementary == null ? "—" : formatNumber(r.complementary)} locked />
                    <Cell label="User price" value={r.pricePerUser == null ? "—" : recordMoney(r.pricePerUser, r.currency)} locked />
                  </>
                ) : (
                  <>
                    <NumCell label={amountLabel} prefix={r.currency ?? "USD"} value={r.amount}
                      onChange={(v) => onUpdate({ amount: v ?? 0, ...(r.yearAmounts ? { yearAmounts: [v ?? 0, ...r.yearAmounts.slice(1)] } : {}) })} />
                    <EditField label="Currency">
                      <select value={r.currency ?? "USD"} onChange={(e) => onUpdate({ currency: e.target.value as Currency })}
                        className="w-fit rounded-sm border border-border bg-surface px-2 py-1 font-body text-[13px] text-fg outline-none focus:border-sirius">
                        {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </EditField>
                    <NumCell label={term ? "Licences" : "Licence change"} value={r.licences} onChange={(v) => onUpdate({ licences: v })} />
                    <NumCell label="Complementary" value={r.complementary} onChange={(v) => onUpdate({ complementary: v })} />
                    <NumCell label="User price" prefix={r.currency ?? "USD"} value={r.pricePerUser} onChange={(v) => onUpdate({ pricePerUser: v })} />
                  </>
                )}
                {term && !!r.supportAmount && (
                  <>
                    <Cell label={`Support · ${r.supportLevel ?? "level not set"}`} value={recordMoney(r.supportAmount, r.currency)} />
                    <Cell label="Contract ARR" value={money(contractValueUSD(r))} />
                  </>
                )}
                {!term && <Cell label="In US dollars" value={signedMoney(delta)} />}
                {r.yearAmounts && r.yearAmounts.length > 1 && (
                  <>
                    <Cell label="ARR by year" value={r.yearAmounts.map((a, i) => `Y${i + 1} ${fmtMoney(a, r.currency ?? "USD")}`).join(" · ")} wide />
                    <Cell label="Total contract value" value={recordMoney(r.yearAmounts.reduce((x, y) => x + y, 0), r.currency)} />
                  </>
                )}
              </>
            )}
          </Group>

          {r.kind !== "churn" && (
            r.kind === "sale" || r.kind === "renewal" ? (
              <SetupGroups r={r} onUpdate={onUpdate} />
            ) : (
            <Group label="Modules & global library">
              <Cell label={r.kind === "expansion" ? "Modules added" : r.kind === "downgrade" ? "Modules removed" : "Modules"} value={r.modules.join(", ") || "No change"} locked={fromHubspot} />
              <Cell label="Global library" value={r.library.length ? r.library.join(", ") : "No change"} locked={fromHubspot} />
              {r.library.length > 0 && (
                <EditField label={r.library.length > 1 ? "Terms per library" : "Library terms"} wide>
                  <LibraryTermsEditor r={r} onUpdate={onUpdate} />
                </EditField>
              )}
            </Group>
            )
          )}

          <Group label="Dates">
            <DateCell label={r.kind === "churn" ? "Effective" : "Contract start"} value={r.start} onCommit={(v) => setDate("start", v)} />
            {r.kind !== "churn" && <DateCell label="Contract end" value={r.end} onCommit={(v) => setDate("end", v)} />}
            {r.kind !== "churn" && r.start && r.renewal && <Cell label="Contract length" value={termLabel(r.start, r.renewal)} />}
            {r.kind !== "churn" && <DateCell label="Renewal date" value={r.renewal} hint={r.end && r.renewal === addOne(r.end) ? "Day after end" : undefined} onCommit={(v) => setDate("renewal", v)} />}
          </Group>

          {(r.kind === "sale" || r.kind === "renewal") && (
            <Group label="Onboarding milestones">
              {MILESTONES.map((m) => (
                <DateCell key={m.key} label={m.label} value={r.milestones[m.key] ?? null}
                  onCommit={(v) => onUpdate({ milestones: { ...r.milestones, [m.key]: v } })} />
              ))}
            </Group>
          )}

          {(r.opportunityId || r.note || r.recordedBy || r.voided) && (
            <div className="mt-3 flex flex-col gap-1.5 border-t border-border-subtle pt-3 font-body text-[12.5px] text-fg-muted">
              {r.opportunityId && (
                <span>Won on the Expansion page ·{" "}
                  <Link href={`/expansion?opportunity=${encodeURIComponent(r.opportunityId)}`} className="inline-flex items-center gap-0.5 font-semibold text-sirius hover:underline">Open the opportunity <ExternalLink size={11} /></Link>
                </span>
              )}
              {r.note && <span>{r.note}</span>}
              {r.recordedBy && <span className="text-fg-subtle">Recorded by {r.recordedBy}{r.recordedOn ? ` · ${fmtDate(r.recordedOn)}` : ""}</span>}
              {r.voided && <span className="font-semibold text-danger-fg">Voided {fmtDate(r.voided.on)}{r.voided.by ? ` by ${r.voided.by}` : ""}{r.voided.reason ? `: ${r.voided.reason}` : ""}</span>}
            </div>
          )}
          {footer}
        </fieldset>
      )}
    </li>
  );
}

/** "3 years", "1 year", "18 months" — the term between start and renewal. */
function termLabel(start: string, renewal: string): string {
  const months = Math.round(daysBetween(start, renewal) / 30.44);
  if (months % 12 === 0) return `${months / 12} year${months > 12 ? "s" : ""}`;
  return `${months} months`;
}

function addOne(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function SourceBadge({ source }: { source: Source }) {
  if (source === "hubspot") return <span className="inline-flex items-center gap-1 rounded-sm bg-bg-muted px-1.5 py-0.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-muted"><Lock size={10} />HubSpot</span>;
  if (source === "expansion") return <span className="rounded-sm bg-success-bg px-1.5 py-0.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.05em] text-success-fg">Expansion page</span>;
  if (source === "imported") return <span className="rounded-sm bg-bg-muted px-1.5 py-0.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.05em] text-fg-muted">Imported</span>;
  return <span className="rounded-sm bg-accent-soft px-1.5 py-0.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.05em] text-sirius">Signal</span>;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 border-t border-border-subtle pt-3 first:mt-0 first:border-t-0 first:pt-0">
      <div className="eyebrow mb-2">{label}</div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">{children}</dl>
    </div>
  );
}

function Cell({ label, value, locked, wide }: { label: string; value: string; locked?: boolean; wide?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1", wide && "col-span-2")}>
      <dt className="flex items-center gap-1 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
        {label}{locked && <Lock size={10} aria-label="From HubSpot" />}
      </dt>
      <dd className={cn("font-body text-[13px] font-semibold leading-snug", value === "—" ? "text-fg-subtle" : "text-fg")}>{value}</dd>
    </div>
  );
}

function DateCell({ label, value, onCommit, locked, edited, hint }: {
  label: string; value: string | null; onCommit?: (v: string | null) => void; locked?: boolean; edited?: boolean; hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
        {label}{locked && <Lock size={10} aria-label="From HubSpot" />}
        {edited && <span className="rounded-sm bg-accent-soft px-1 font-body text-[9.5px] tracking-[0.05em] text-sirius">Edited by CS</span>}
      </dt>
      <dd className="flex items-baseline gap-1.5">
        {locked || !onCommit ? (
          <span className={cn("font-body text-[13px] leading-snug", value ? "font-semibold text-fg" : "text-fg-subtle")}>{fmtDate(value)}</span>
        ) : (
          <InlineDate value={value} onCommit={onCommit} />
        )}
        {hint && <span className="font-body text-[10px] uppercase tracking-[0.05em] text-fg-subtle">{hint}</span>}
      </dd>
    </div>
  );
}

function InlineDate({ value, onCommit, big }: { value: string | null; onCommit: (v: string | null) => void; big?: boolean }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input type="date" autoFocus defaultValue={value ?? ""}
        onBlur={(e) => { onCommit(e.target.value || null); setEditing(false); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
        className="w-fit rounded-sm border border-sirius-200 bg-surface px-2 py-1 font-body text-[13px] text-fg outline-none focus:border-sirius focus:ring-2 focus:ring-sirius/15" />
    );
  }
  return (
    <button onClick={() => setEditing(true)}
      className={cn("group inline-flex w-fit items-center gap-1.5 rounded-sm text-left transition-colors hover:text-sirius",
        big ? "font-display text-lg font-bold text-fg" : cn("font-body text-[13px] leading-snug", value ? "font-semibold text-fg" : "text-fg-subtle"))}>
      {fmtDate(value)}
      <Pencil size={big ? 13 : 11} className="text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

/* ── Record drawer ─────────────────────────────────────────────────────── */

function RecordDrawer({ kind, churnReasons, saving, current, today, arrNow, licencesNow, onClose, onSave }: {
  kind: Kind; churnReasons: ChurnReasonOption[]; saving: boolean;
  current: ContractRecord; today: string; arrNow: number; licencesNow: number;
  onClose: () => void; onSave: (r: ContractRecord) => void;
}) {
  const { money, signedMoney } = useMoney();
  const k = KIND[kind];
  const isRenewal = kind === "renewal";
  const isChurn = kind === "churn";
  // Prefill from the contract in force: a renewal starts the day after the
  // current term ends; an expansion or downgrade starts today and co-terms.
  const defaultStart = isRenewal ? (current.renewal ?? today) : today;
  const [name, setName] = useState(isRenewal ? "Renewal" : kind === "downgrade" ? "Downgrade" : "Churn");
  // A renewal starts from the licence part of today's ARR (support is entered separately),
  // in the contract's own currency; arrNow is in dollars and includes support.
  const startCcy: Currency = current.currency ?? "USD";
  const licenceNowUSD = arrNow - (isRenewal ? toUSD(current.supportAmount ?? 0, startCcy) : 0);
  const [amount, setAmount] = useState<number>(isRenewal ? Math.round(licenceNowUSD / USD_PER[startCcy]) : 0);
  const [licences, setLicences] = useState<number>(isRenewal ? licencesNow : 0);
  const [price, setPrice] = useState<number>(current.pricePerUser ?? 0);
  const [modules, setModules] = useState<string[]>(isRenewal ? current.modules : []);
  const [library, setLibrary] = useState<string[]>(isRenewal ? current.library : []);
  // Licences per library provider; each provider runs for the contract's term.
  const [libLicences, setLibLicences] = useState<Record<string, number>>(
    isRenewal ? Object.fromEntries(current.library.map((p) => [p, libraryTerm(current, p).licences ?? 0])) : {});
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(isRenewal ? dayBefore(addYears(defaultStart, 1)) : current.end ?? "");
  const [renewal, setRenewal] = useState(isRenewal ? addYears(defaultStart, 1) : current.renewal ?? "");
  // Renewals default to the length of the contract they replace, so a 3-year deal renews as 3 years.
  const currentYears = current.start && current.renewal ? Math.max(1, Math.round(daysBetween(current.start, current.renewal) / 365)) : 1;
  const [years, setYears] = useState<number>(isRenewal ? currentYears : 0);
  function applyTerm(from: string, y: number) {
    if (!from || !y) return;
    setEnd(dayBefore(addYears(from, y))); setRenewal(addYears(from, y));
  }
  const [termSet, setTermSet] = useState(false);
  if (isRenewal && !termSet) { setTermSet(true); applyTerm(defaultStart, currentYears); }
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  // Amounts are entered in the contract's currency, defaulting to the contract in force.
  const [ccy, setCcy] = useState<Currency>(startCcy);
  // Renewals carry the support level and its annual fee forward; both count toward the new contract's ARR.
  const [supportLevel, setSupportLevel] = useState<string | null>(isRenewal ? current.supportLevel ?? null : null);
  const [supportAmount, setSupportAmount] = useState<number>(isRenewal ? current.supportAmount ?? 0 : 0);
  // Multi-year: optionally a different ARR for each year of the term.
  const [perYear, setPerYear] = useState(false);
  const [yearAmounts, setYearAmounts] = useState<number[]>([]);
  const termYears = isRenewal && years > 1 ? years : 0;
  const yearsShown = Array.from({ length: termYears }, (_, i) => (i === 0 ? amount : yearAmounts[i] ?? amount));
  const amountUSD = toUSD(amount, ccy);
  const supportUSD = isRenewal && supportLevel ? toUSD(supportAmount, ccy) : 0;
  const after = isRenewal ? amountUSD + supportUSD : isChurn ? 0 : kind === "expansion" ? arrNow + Math.abs(amountUSD) : arrNow - Math.abs(amountUSD);
  const delta = after - arrNow;
  const valid = name.trim() && start && (isChurn ? reasons.length > 0 : amount !== 0 || isRenewal);

  function save() {
    // A churn takes all remaining ARR (amount 0). A downgrade is stored as a negative change.
    const signed = kind === "downgrade" ? -Math.abs(amount) : isChurn ? 0 : amount;
    const signedLic = kind === "downgrade" ? -Math.abs(licences) : licences;
    onSave({
      id: "new", kind, source: "signal", name: name.trim(), amount: signed,
      licences: isChurn ? null : signedLic, complementary: null, pricePerUser: isChurn ? null : price,
      modules: isChurn ? [] : modules, library: isChurn ? [] : library,
      libraryTerms: library.length && !isChurn
        ? Object.fromEntries(library.map((p) => [p, { licences: libLicences[p] ?? null, start, expiry: end || null }]))
        : undefined,
      libraryDecided: isRenewal,
      start, end: isChurn ? null : end || null, renewal: isChurn ? null : renewal || null,
      milestones: {}, reasons: isChurn ? reasons : undefined, note: note || undefined, oneTimeFees: [],
      currency: isChurn ? "USD" : ccy,
      ...(isRenewal ? { supportLevel, supportAmount: supportLevel ? supportAmount : null, implementationLevel: current.implementationLevel ?? null } : {}),
      yearAmounts: termYears && perYear ? yearsShown : undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-cosmos/30" />
      <aside className="relative flex h-full w-full max-w-[480px] flex-col bg-surface shadow-xl">
        <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
          <Badge tone={k.tone}>{k.label}</Badge>
          <span className="flex-1 font-display text-base font-bold text-fg">Record {k.label.toLowerCase()}</span>
          <button onClick={onClose} className="rounded-sm p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg"><X size={18} /></button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          <p className="font-body text-[12.5px] leading-relaxed text-fg-muted">
            {isRenewal && "Prefilled from the current contract. Change what was renegotiated."}
            {kind === "expansion" && "Added to the current contract. Co-terms with the current renewal date unless you change it."}
            {kind === "downgrade" && "Taken off the current contract from the start date."}
            {isChurn && "Ends the contract. ARR from records drops to zero from the effective date."}
          </p>

          <Field label="Name"><TextInput value={name} onChange={setName} /></Field>

          {!isChurn && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Currency">
                <select value={ccy} onChange={(e) => setCcy(e.target.value as Currency)} className={inputCls}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c} · {CURRENCY_LABEL[c]}</option>)}
                </select>
              </Field>
              <Field label={isRenewal ? (perYear && termYears ? "Licence ARR · year 1" : "Licence ARR") : kind === "expansion" ? "ARR added" : "ARR removed"}>
                <NumberInput value={amount} onChange={setAmount} prefix={ccy} />
              </Field>
              <Field label={isRenewal ? "Licences" : kind === "expansion" ? "Licences added" : "Licences removed"}>
                <NumberInput value={licences} onChange={(v) => { setLicences(v); setAmount(v * price); }} />
              </Field>
              <Field label="User price"><NumberInput value={price} onChange={(v) => { setPrice(v); setAmount(licences * v); }} prefix={ccy} /></Field>
              {isRenewal && (
                <>
                  <Field label="Support level">
                    <select value={supportLevel ?? ""} onChange={(e) => setSupportLevel(e.target.value || null)} className={inputCls}>
                      <option value="">No support package</option>
                      {SUPPORT_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </Field>
                  {supportLevel && <Field label="Support amount · per year"><NumberInput value={supportAmount} onChange={setSupportAmount} prefix={ccy} /></Field>}
                </>
              )}
              <p className="col-span-2 -mt-1 font-body text-[11.5px] text-fg-subtle">ARR fills in from licences × user price. Override it for discounts or bundles.</p>
            </div>
          )}

          {!isChurn && (
            <Field label={isRenewal ? "Modules" : kind === "expansion" ? "Modules added" : "Modules removed"}>
              <div className="flex flex-wrap gap-1.5">
                {MODULES.map((m) => {
                  const on = modules.includes(m);
                  return (
                    <button key={m} type="button" onClick={() => setModules((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]))}
                      className={cn("inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 font-body text-[12px] font-semibold transition-colors",
                        on ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:text-fg")}>
                      {on && <Check size={11} />}{m}
                    </button>
                  );
                })}
              </div>
            </Field>
          )}

          {!isChurn && (
            <Field label={isRenewal ? "Global library" : kind === "expansion" ? "Global library added" : "Global library removed"}>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setLibrary([])}
                  className={cn("inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 font-body text-[12px] font-semibold transition-colors",
                    library.length === 0 ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:text-fg")}>
                  {library.length === 0 && <Check size={11} />}{isRenewal ? "None" : "No change"}
                </button>
                {LIBRARIES.map((m) => {
                  const on = library.includes(m);
                  return (
                    <button key={m} type="button" onClick={() => setLibrary((ls) => (ls.includes(m) ? ls.filter((x) => x !== m) : [...ls, m]))}
                      className={cn("inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 font-body text-[12px] font-semibold transition-colors",
                        on ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:text-fg")}>
                      {on && <Check size={11} />}{m}
                    </button>
                  );
                })}
              </div>
              {library.length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-2.5">
                  {library.map((p) => (
                    <div key={p} className="flex flex-col gap-1.5">
                      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{p} licences</span>
                      <NumberInput value={libLicences[p] ?? 0} onChange={(v) => setLibLicences((m) => ({ ...m, [p]: v }))} />
                    </div>
                  ))}
                  <p className="col-span-2 font-body text-[11.5px] text-fg-subtle">Each library runs for the contract&apos;s term. Change a library&apos;s own dates on the record after saving.</p>
                </div>
              )}
            </Field>
          )}

          {isChurn && (
            <Field label="Reasons (pick all that apply)">
              {/* Grouped exactly as Settings → Churn taxonomy defines them. */}
              <div className="flex flex-col gap-3">
                {[...new Set(churnReasons.map((r) => r.category))].map((cat) => (
                  <div key={cat} className="flex flex-col gap-1.5">
                    <span className="font-body text-[11.5px] font-semibold text-fg-muted">{cat}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {churnReasons.filter((r) => r.category === cat).map(({ id, label }) => {
                        const on = reasons.includes(id);
                        return (
                          <button key={id} type="button" onClick={() => setReasons((rs) => (rs.includes(id) ? rs.filter((x) => x !== id) : [...rs, id]))}
                            className={cn("inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 font-body text-[12px] font-semibold transition-colors",
                              on ? "border-danger bg-danger-bg text-danger-fg" : "border-border text-fg-muted hover:text-fg")}>
                            {on && <Check size={11} />}{label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={isChurn ? "Effective date" : "Contract start"}><DateInput value={start} onChange={(v) => {
              setStart(v);
              if (isRenewal && v) applyTerm(v, years);
            }} /></Field>
            {isRenewal && (
              <Field label="Contract length">
                <select value={years} onChange={(e) => { const y = Number(e.target.value); setYears(y); applyTerm(start, y); }}
                  className="w-full rounded-sm border border-border bg-surface px-3 py-2 font-body text-[13px] text-fg outline-none focus:border-sirius">
                  {[1, 2, 3, 4, 5].map((y) => <option key={y} value={y}>{y} year{y > 1 ? "s" : ""}</option>)}
                  <option value={0}>Custom (set the end date)</option>
                </select>
              </Field>
            )}
            {!isChurn && <Field label="Contract end"><DateInput value={end} onChange={(v) => { setEnd(v); setYears(0); if (v) setRenewal(addOne(v)); }} /></Field>}
            {!isChurn && <Field label="Renewal date"><DateInput value={renewal} onChange={setRenewal} /></Field>}
          </div>

          {termYears > 0 && (
            <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
              <label className="flex items-center gap-2 font-body text-[13px] font-semibold text-fg">
                <input type="checkbox" checked={perYear} onChange={(e) => setPerYear(e.target.checked)} className="accent-sirius" />
                Different ARR each year
              </label>
              {perYear ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {yearsShown.map((a, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Year {i + 1} · from {fmtDate(addYears(start, i))}</span>
                      <NumberInput value={a} prefix={ccy}
                        onChange={(v) => (i === 0 ? setAmount(v) : setYearAmounts(() => { const n = [...yearsShown]; n[i] = v; return n; }))} />
                    </div>
                  ))}
                </div>
              ) : <p className="font-body text-[12px] text-fg-muted">The same ARR applies for all {termYears} years.</p>}
              <p className="font-body text-[12px] text-fg-muted">
                Total contract value <b className="text-fg">{fmtMoney((perYear ? yearsShown : yearsShown.map(() => amount)).reduce((x, y) => x + y, 0) + (supportLevel ? supportAmount * termYears : 0), ccy)}</b> over {termYears} years{supportLevel && supportAmount ? `, including ${fmtMoney(supportAmount, ccy)} support a year` : ""}. ARR steps to each year's figure on the anniversary.
              </p>
            </div>
          )}

          <Field label="Note (optional)">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              className="w-full resize-y rounded-sm border border-border bg-surface px-3 py-2 font-body text-[13px] text-fg outline-none focus:border-sirius focus:ring-2 focus:ring-sirius/15" />
          </Field>
        </div>

        {/* ARR impact preview */}
        <div className="border-t border-border-subtle bg-bg-subtle px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">ARR impact</span>
              <span className="tabular font-display text-base font-bold text-fg">
                {money(arrNow)} → {money(after)}
              </span>
            </div>
            <span className={cn("tabular inline-flex items-center gap-1 rounded-pill px-2.5 py-1 font-body text-[12.5px] font-semibold",
              delta > 0 ? "bg-success-bg text-success-fg" : delta < 0 ? "bg-danger-bg text-danger-fg" : "bg-bg-muted text-fg-muted")}>
              {delta > 0 ? <ArrowUpRight size={13} /> : delta < 0 ? <ArrowDownRight size={13} /> : null}{signedMoney(delta)}
            </span>
          </div>
          {!isChurn && renewal && (
            <div className="mt-2 flex items-center gap-1.5 font-body text-[12px] text-fg-muted">
              <CalendarClock size={13} /> This contract&apos;s renewal date becomes {fmtDate(renewal)}
            </div>
          )}
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-sm px-3.5 py-2 font-body text-[13px] font-semibold text-fg-muted hover:text-fg">Cancel</button>
            <button disabled={!valid || saving} onClick={save}
              className="inline-flex items-center gap-1.5 rounded-sm bg-sirius px-3.5 py-2 font-body text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50">
              <Check size={14} /> Save {k.label.toLowerCase()}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // A div, not a <label>: a label wrapping chip buttons forwards every click
    // inside it to the first button.
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </div>
  );
}
const inputCls = "w-full rounded-sm border border-border bg-surface px-3 py-2 font-body text-[13px] text-fg outline-none focus:border-sirius focus:ring-2 focus:ring-sirius/15";
function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
}
function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
}
function NumberInput({ value, onChange, prefix }: { value: number; onChange: (v: number) => void; prefix?: string }) {
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-body text-[13px] text-fg-subtle">{prefix}</span>}
      <input type="number" min={0} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))}
        className={cn(inputCls, "tabular", prefix && (prefix.length > 1 ? "pl-12" : "pl-6"))} />
    </div>
  );
}

