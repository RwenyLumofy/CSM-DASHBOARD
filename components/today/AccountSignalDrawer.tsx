"use client";

/* Today page — account intelligence drawer. Opens without leaving Today.
   Tabs: Overview · Signals · Timeline · Notes.
   Signals can be accepted / snoozed / dismissed (local + analytics). */

import { useEffect, useState } from "react";
import { Building2, ExternalLink, Check, BellOff, XCircle, Plus, Loader2, StickyNote } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TimelineFilter, SignalStatus } from "@/lib/today/types";
import type { Note } from "@/lib/notes/types";
import {
  getAccount, getAccountSignals,
  getAccountTimeline, getAccountBand, getUser, relativeTime, getToday,
} from "@/lib/today/repo";
import { getAccountNotesAction } from "@/app/(app)/today/note-actions";
import { formatMoney, formatDate, DIRECTION_TONE } from "@/lib/today/format";
import { track } from "@/lib/today/analytics";
import type { AccountDrawerTab } from "./TodayContext";
import { useToday } from "./TodayContext";
import { Drawer } from "./Drawer";
import { UserRef } from "./refs";
import { StatusPill, ConfidenceIndicator, EvidenceFreshness } from "./primitives";

const TABS: { key: AccountDrawerTab; label: string }[] = [
  { key: "overview", label: "Overview" }, { key: "signals", label: "Signals" }, { key: "timeline", label: "Timeline" },
  { key: "notes", label: "Notes" },
];

export function AccountSignalDrawer({ accountId, initialTab, onClose }: { accountId: string; initialTab: AccountDrawerTab; onClose: () => void }) {
  const [tab, setTab] = useState<AccountDrawerTab>(initialTab);
  const account = getAccount(accountId);
  const { openAddTask } = useToday();
  if (!account) return null;
  const csm = getUser(account.csmUserId);

  return (
    <Drawer
      eyebrow="Account"
      title={<span className="inline-flex items-center gap-2"><Building2 size={16} className="text-sirius" /> {account.name}</span>}
      subtitle={`${account.tier} · ${formatMoney(account.arr)} ARR${account.renewalDate ? ` · ${account.renewalDate < getToday() ? "renewal was due" : "renews"} ${formatDate(account.renewalDate)}` : ""}`}
      onClose={onClose}
      width="xl"
      headerAccessory={<a href={account.route} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-body text-[12px] font-semibold text-sirius hover:bg-accent-soft"><ExternalLink size={13} /> Full page</a>}
      footer={<div className="flex justify-end"><button onClick={() => openAddTask({ accountId })} className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-2 font-body text-[13px] font-semibold text-white"><Plus size={14} /> Add task</button></div>}
    >
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 font-body text-[12.5px] font-semibold transition-colors", tab === t.key ? "border-sirius text-sirius" : "border-transparent text-fg-muted hover:text-fg")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview accountId={accountId} csmName={csm?.name} />}
      {tab === "signals" && <SignalsTab accountId={accountId} />}
      {tab === "timeline" && <TimelineTab accountId={accountId} />}
      {tab === "notes" && <NotesTab accountId={accountId} route={account.route} />}
    </Drawer>
  );
}

const BAND_META: Record<"healthy" | "watch" | "atrisk", { label: string; cls: string }> = {
  healthy: { label: "Healthy", cls: "border-[color:var(--success-fg)]/25 bg-success-bg text-success-fg" },
  watch: { label: "Watch", cls: "border-[color:var(--warning-fg)]/25 bg-warning-bg text-warning-fg" },
  atrisk: { label: "At risk", cls: "border-[color:var(--danger-fg)]/25 bg-danger-bg text-danger-fg" },
};

function Overview({ accountId, csmName }: { accountId: string; csmName?: string }) {
  const account = getAccount(accountId)!;
  const signals = getAccountSignals(accountId);
  const risk = signals.filter((s) => s.direction === "negative" || s.direction === "systemic");
  const upside = signals.filter((s) => s.direction === "positive");
  const band = getAccountBand(accountId);
  const meta = band ? BAND_META[band] : null;
  const topRisk = risk[0];
  return (
    <div className="flex flex-col gap-4">
      {meta && (
        <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", meta.cls)}>
          <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          <span className="font-body text-[12.5px] font-semibold">{meta.label}</span>
          <span className="truncate font-body text-[12px] opacity-80">· {topRisk ? topRisk.type : "No open risks"}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Fact label="Tier" value={account.tier} />
        <Fact label="ARR" value={formatMoney(account.arr)} />
        <Fact label="Renewal" value={account.renewalDate ? formatDate(account.renewalDate) : "—"} />
        <Fact label="CSM" value={csmName ?? "—"} />
        <Fact label="Industry" value={account.industry ?? "—"} />
        <Fact label="Region" value={account.region ?? "—"} />
      </div>
      {/* Risk and expansion kept as SEPARATE dimensions */}
      <div className="grid grid-cols-2 gap-3">
        <Dimension title="Risk" tone="danger" count={risk.length} value={risk.reduce((s, x) => s + x.commercialImpact, 0)} />
        <Dimension title="Expansion" tone="success" count={upside.length} value={upside.reduce((s, x) => s + x.commercialImpact, 0)} />
      </div>
    </div>
  );
}

function Dimension({ title, tone, count, value }: { title: string; tone: "danger" | "success"; count: number; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="font-body text-[11.5px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">{title}</div>
      <div className={cn("mt-1 font-display text-[18px] font-semibold", tone === "danger" ? "text-danger-fg" : "text-success-fg")}>{count === 0 ? "None" : formatMoney(value)}</div>
      <div className="font-body text-[11px] text-fg-subtle">{count} signal{count === 1 ? "" : "s"}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-muted/30 px-2.5 py-1.5">
      <div className="font-body text-[10.5px] uppercase tracking-[0.04em] text-fg-subtle">{label}</div>
      <div className="font-body text-[13px] font-medium capitalize text-fg">{value}</div>
    </div>
  );
}

function SignalsTab({ accountId }: { accountId: string }) {
  const { openAddTask } = useToday();
  const signals = getAccountSignals(accountId);
  const [status, setStatus] = useState<Record<string, SignalStatus>>({});
  const act = (id: string, s: SignalStatus, ev: "signal_accepted" | "signal_snoozed" | "signal_dismissed") => { setStatus((p) => ({ ...p, [id]: s })); track(ev, { signalId: id }); };
  if (signals.length === 0) return <Empty>No signals detected for this account.</Empty>;
  return (
    <ul className="flex flex-col gap-3">
      {signals.map((s) => {
        const st = status[s.id] ?? s.status;
        return (
          <li key={s.id} className="rounded-lg border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={DIRECTION_TONE[s.direction]} dot>{s.category.replace(/_/g, " ")}</StatusPill>
                  <ConfidenceIndicator confidence={s.confidence} showLabel={false} />
                </div>
                <p className="mt-1 font-body text-[13px] font-medium text-fg">{s.type}</p>
              </div>
              <span className={cn("font-display text-[14px] font-semibold", s.direction === "positive" ? "text-success-fg" : "text-danger-fg")}>{formatMoney(s.commercialImpact)}</span>
            </div>
            <ul className="mt-2 flex flex-col gap-1 border-l-2 border-border-subtle pl-2.5">
              {s.evidence.map((e) => (
                <li key={e.id} className="font-body text-[11.5px] text-fg-muted">{e.label} <span className="text-fg-subtle">· {e.source} · {relativeTime(e.observedAt)}</span></li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <EvidenceFreshness freshness={s.dataFreshness} />
              {st === "accepted" || st === "snoozed" || st === "dismissed" ? (
                <StatusPill tone="neutral">{st}</StatusPill>
              ) : (
                <div className="flex items-center gap-1">
                  <IconBtn icon={Check} label="Accept" onClick={() => act(s.id, "accepted", "signal_accepted")} />
                  <IconBtn icon={BellOff} label="Snooze" onClick={() => act(s.id, "snoozed", "signal_snoozed")} />
                  <IconBtn icon={XCircle} label="Dismiss" onClick={() => act(s.id, "dismissed", "signal_dismissed")} />
                </div>
              )}
            </div>
            {s.recommendedAction && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-accent-soft/40 px-2.5 py-1.5">
                <span className="min-w-0 font-body text-[12px] text-fg"><span className="font-semibold">Recommended:</span> {s.recommendedAction}</span>
                <button onClick={() => openAddTask({ accountId, title: s.recommendedAction, sourceType: "signal", sourceId: s.id })} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-sirius px-2 py-1 font-body text-[11.5px] font-semibold text-white"><Plus size={11} /> Add as task</button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function IconBtn({ icon: Icon, label, onClick }: { icon: typeof Check; label: string; onClick: () => void }) {
  return <button onClick={onClick} title={label} aria-label={label} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-body text-[11.5px] font-semibold text-fg-muted hover:border-sirius hover:text-sirius"><Icon size={12} /> {label}</button>;
}

function TimelineTab({ accountId }: { accountId: string }) {
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const all = getAccountTimeline(accountId, "all");
  // Only offer filters that actually have events — no dead chips that always
  // return "nothing here" (the timeline can't yet produce support/pages/etc.).
  const present = new Set(all.map((e) => e.filter));
  const filters: TimelineFilter[] = ["all", ...(["commercial", "relationship", "adoption", "product", "support", "actions", "commitments", "pages", "user_activity"] as const).filter((f) => present.has(f))];
  const active = filters.includes(filter) ? filter : "all";
  const events = active === "all" ? all : all.filter((e) => e.filter === active);
  return (
    <div className="flex flex-col gap-3">
      {all.length === 0 ? <Empty>No timeline events for this account yet.</Empty> : (<>
      {filters.length > 2 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn("rounded-md border px-2 py-0.5 font-body text-[11.5px] capitalize transition-colors", active === f ? "border-sirius bg-accent-soft text-sirius" : "border-border text-fg-muted hover:text-fg")}>{f.replace(/_/g, " ")}</button>
          ))}
        </div>
      )}
      {events.length === 0 ? <Empty>No timeline events for this filter.</Empty> : (
        <ul className="flex flex-col">
          {events.map((e, i) => (
            <li key={e.id} className={cn("flex gap-3 py-2.5", i > 0 && "border-t border-border-subtle")}>
              <div className="mt-1 size-2 shrink-0 rounded-full bg-border-strong" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body text-[12.5px] font-medium text-fg">{e.title}</span>
                  <span className="shrink-0 font-body text-[11px] text-fg-subtle">{formatDate(e.occurredAt)}</span>
                </div>
                {(e.previousState || e.newState) && (
                  <div className="mt-0.5 font-body text-[11.5px] text-fg-muted">{e.previousState && <span className="text-fg-subtle line-through">{e.previousState}</span>}{e.previousState && " → "}<span className="font-medium">{e.newState}</span></div>
                )}
                <div className="mt-0.5 font-body text-[11px] text-fg-subtle">
                  {e.evidenceSource}{e.actorId && <> · <span className="inline-flex"><UserRef id={e.actorId} /></span></>} · recorded {relativeTime(e.recordedAt)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      </>)}
    </div>
  );
}

/* The account's real CSM notes (client_notes) — the same notes authored on the
   full account page. Read-only here; `body` is sanitized HTML at write time. */
function NotesTab({ accountId, route }: { accountId: string; route: string }) {
  const [state, setState] = useState<{ loading: boolean; notes: Note[]; error: string | null }>({ loading: true, notes: [], error: null });
  useEffect(() => {
    let alive = true;
    getAccountNotesAction(accountId).then((r) => {
      if (!alive) return;
      if (r.ok) setState({ loading: false, notes: r.notes ?? [], error: null });
      else setState({ loading: false, notes: [], error: r.error ?? "Couldn't load notes." });
    });
    return () => { alive = false; };
  }, [accountId]);

  if (state.loading) return <div className="flex items-center justify-center gap-2 py-8 font-body text-[12.5px] text-fg-subtle"><Loader2 size={14} className="animate-spin" /> Loading notes…</div>;
  if (state.error) return <Empty>{state.error}</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {state.notes.length === 0 ? (
        <Empty>No notes on this account yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {state.notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="note-body font-body text-[12.5px] leading-relaxed text-fg" dangerouslySetInnerHTML={{ __html: n.body }} />
              <div className="mt-2 flex items-center gap-1.5 border-t border-border-subtle pt-1.5 font-body text-[11px] text-fg-subtle">
                <StickyNote size={11} /> {n.createdByName ?? "Someone"} · {formatDate(n.createdAt)}
              </div>
            </li>
          ))}
        </ul>
      )}
      <a href={route} className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted hover:border-sirius hover:text-sirius"><ExternalLink size={13} /> Add or edit notes on the full page</a>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center font-body text-[12.5px] text-fg-subtle">{children}</div>;
}
