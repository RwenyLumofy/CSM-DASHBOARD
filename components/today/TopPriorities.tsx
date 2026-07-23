"use client";

/* Today — the ranked attention list (artifact parity). Three dimensions stay
   separate: PRIORITY (tier chip), TYPE (what kind of work), DATA CONFIDENCE (a
   flag object, never a priority). Ranking is inspectable (tooltip explains the
   model). Rows aren't "tasks" — the explicit actions are Mark reviewed / Snooze /
   Open / Add task, and the recommended verb opens a prefilled drawer to review.
   The section title adapts to scope: Do today / Team priorities / Focus now. */

import { useEffect, useMemo, useRef, useState } from "react";
import { Info, ArrowRight, Flag, AlertTriangle, ChevronDown, MoreHorizontal, Eye, BellOff, Building2, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Priority, PortfolioScope } from "@/lib/today/types";
import { getPriorities, getSignalsForPriority, getFocusRelated, getAccount, getUser, getToday } from "@/lib/today/repo";
import { priorityLevel, priorityTypeFromTag, dataFlag, tagForSignalCategory, PRIORITY_CTA_LABEL, formatMoney, formatDate } from "@/lib/today/format";
import { useToday as useTodayCtx } from "./TodayContext";

const RANKING_EXPLAINER = "Ranked by commercial exposure, urgency, signal severity, trend, open mitigation and data confidence. It organises work — it does not predict churn.";
const HEADING: Record<PortfolioScope, string> = { my_portfolio: "Do today", my_team: "Team priorities", company: "Focus now" };
// tier chip — filled, quiet, by severity.
const TIER: Record<string, string> = {
  danger: "bg-danger-bg text-danger-fg", warning: "bg-warning-bg text-warning-fg", info: "bg-info-bg text-info-fg", neutral: "bg-bg-muted text-fg-muted",
};

type Sort = "recommended" | "arr" | "urgent";
const SORTS: { key: Sort; label: string }[] = [
  { key: "recommended", label: "Recommended" }, { key: "arr", label: "Highest ARR" }, { key: "urgent", label: "Most urgent" },
];
type Filter = "act" | "review" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "act", label: "Act now" }, { key: "review", label: "Review" }, { key: "all", label: "All" },
];

function tagsFor(p: Priority): string[] {
  const set = new Set<string>();
  if (p.valueKind === "expansion") set.add("Expansion");
  if (p.timing && /renew|overdue/i.test(p.timing)) set.add("Renewal");
  for (const s of getSignalsForPriority(p)) set.add(tagForSignalCategory(s.category));
  return [...set];
}
function actionDue(p: Priority, today: string): { text: string; tone?: "danger" | "warning" } {
  if (!p.dueDate) return { text: "no date set" };
  if (p.dueDate < today) return { text: "overdue", tone: "danger" };
  if (p.dueDate.slice(0, 10) === today.slice(0, 10)) return { text: "due today", tone: "warning" };
  return { text: `due ${formatDate(p.dueDate)}` };
}

/** "Act now" = urgent severity, an urgent due state, or an open escalation.
 *  Everything else is "Review" (lower-tier, data-needed, no pressing clock). */
function isActNow(p: Priority, today: string): boolean {
  const tone = priorityLevel(p).tone;
  if (tone === "danger" || tone === "warning") return true;
  const d = actionDue(p, today);
  if (d.tone === "danger" || d.tone === "warning") return true;
  return getFocusRelated(p.accountId).escalationOpen;
}

export function TopPriorities({ id }: { id?: string }) {
  const { scope, openAccount, openAddTask } = useTodayCtx();
  const today = getToday();
  const all = getPriorities(scope, null);
  const [sort, setSort] = useState<Sort>("recommended");
  const [filter, setFilter] = useState<Filter>("act");
  const [showAll, setShowAll] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [snoozed, setSnoozed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const active = useMemo(() => {
    let list = all.filter((p) => !snoozed.has(p.id));
    if (filter === "act") list = list.filter((p) => isActNow(p, today));
    else if (filter === "review") list = list.filter((p) => !isActNow(p, today));
    const arr = [...list];
    if (sort === "arr") arr.sort((a, b) => b.valueAtStake - a.valueAtStake);
    else if (sort === "urgent") arr.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
    return arr;
  }, [all, snoozed, sort, filter, today]);

  // Counts for the segmented control (independent of the active filter).
  const notSnoozed = useMemo(() => all.filter((p) => !snoozed.has(p.id)), [all, snoozed]);
  const actCount = useMemo(() => notSnoozed.filter((p) => isActNow(p, today)).length, [notSnoozed, today]);
  const countFor = (f: Filter) => (f === "act" ? actCount : f === "review" ? notSnoozed.length - actCount : notSnoozed.length);

  const shown = showAll ? active : active.slice(0, 6);
  const act = (fn: () => void) => { fn(); setMenuFor(null); };

  return (
    <section id={id} aria-label="Focus now" className="flex flex-col">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-body text-[12px] font-bold uppercase tracking-[0.06em] text-fg-muted">{HEADING[scope]}</h2>
          <span tabIndex={0} role="img" aria-label={RANKING_EXPLAINER} title={RANKING_EXPLAINER} className="grid size-4 translate-y-0.5 cursor-help place-items-center rounded-full text-fg-subtle hover:text-fg"><Info size={12} /></span>
          <span className="font-body text-[12px] font-semibold text-fg-subtle">{active.length} item{active.length === 1 ? "" : "s"}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-bg-muted/50 p-0.5" role="tablist" aria-label="Filter priorities">
            {FILTERS.map((f) => (
              <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => { setFilter(f.key); setShowAll(false); }}
                className={cn("rounded-md px-2 py-1 font-body text-[11.5px] font-semibold transition-colors", filter === f.key ? "bg-surface text-sirius shadow-sm" : "text-fg-muted hover:text-fg")}>
                {f.label} <span className="tabular-nums opacity-70">{countFor(f.key)}</span>
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-1.5">
            <span className="font-body text-[11.5px] text-fg-subtle">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort priorities" className="cursor-pointer rounded-md bg-transparent py-0.5 font-body text-[12px] font-semibold text-fg-muted outline-none hover:text-fg">
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      {active.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center font-body text-[13px] text-fg-subtle">
          {filter === "act" ? "Nothing needs immediate action." : filter === "review" ? "Nothing waiting for review." : "Nothing needs your attention today."}
          {filter === "act" && countFor("review") > 0 && <> <button onClick={() => setFilter("review")} className="font-semibold text-sirius hover:underline">Review {countFor("review")} more →</button></>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          {shown.map((p, i) => {
            const level = priorityLevel(p);
            const type = p.valueKind === "expansion" ? "Expansion" : priorityTypeFromTag(tagsFor(p)[0]);
            const flag = dataFlag(p);
            const acct = getAccount(p.accountId);
            const owner = getUser(p.suggestedActionOwnerId);
            const due = actionDue(p, today);
            const rel = getFocusRelated(p.accountId);
            const isRev = reviewed.has(p.id);
            const verb = PRIORITY_CTA_LABEL[p.primaryCta] ?? "Take action";
            const soft = level.tone === "info" || level.tone === "neutral";
            const arrLine = `${formatMoney(p.valueAtStake)}${p.valueKind === "expansion" ? " potential" : " ARR"}${p.timing ? ` · ${p.timing}` : ""}`;

            return (
              <div key={p.id} className={cn("flex items-start gap-3 px-4 py-3", i > 0 && "border-t border-border-subtle", isRev && "opacity-45")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("rounded px-1.5 py-0.5 font-body text-[9px] font-bold uppercase tracking-[0.05em]", TIER[level.tone])}>{level.label}</span>
                    <span className="font-body text-[10.5px] font-medium uppercase tracking-[0.03em] text-fg-subtle">{type}</span>
                    <button onClick={() => openAccount(p.accountId)} title={acct?.name ?? p.accountId} className="max-w-[15rem] truncate font-body text-[14px] font-semibold text-fg hover:text-sirius">{acct?.name ?? p.accountId}</button>
                    <span className="font-body text-[12px] tabular-nums text-fg-subtle">{arrLine}</span>
                    {isRev && <span className="font-body text-[11px] text-fg-subtle">· Reviewed</span>}
                  </div>

                  <p className="mt-1 line-clamp-1 font-body text-[12.5px] text-fg-muted">{p.reason}</p>

                  {/* one concise meta line — due state, owner, exceptions; no "next
                      action" (the button already names it), no pills */}
                  <div className="mt-1 flex flex-wrap items-center font-body text-[11px] text-fg-subtle">
                    <span className={cn("font-medium capitalize", due.tone === "danger" ? "text-danger-fg" : due.tone === "warning" ? "text-warning-fg" : "text-fg-muted")}>{due.text}</span>
                    {scope !== "my_portfolio" && <><span className="px-1.5 text-fg-subtle/50">·</span><span>Owner <span className="font-medium text-fg-muted">{owner?.name ?? "Unassigned"}</span></span></>}
                    {rel.escalationOpen && <><span className="px-1.5 text-fg-subtle/50">·</span><span className="inline-flex items-center gap-1 text-warning-fg"><Flag size={9} /> Escalation</span></>}
                    {rel.overdueTasks > 0 && <><span className="px-1.5 text-fg-subtle/50">·</span><span className="inline-flex items-center gap-1 text-danger-fg"><AlertTriangle size={9} /> {rel.overdueTasks} overdue</span></>}
                    {flag && <><span className="px-1.5 text-fg-subtle/50">·</span><span>{flag}</span></>}
                  </div>
                </div>

                <div className="relative flex shrink-0 flex-col items-end gap-1.5">
                  <button onClick={() => openAddTask({ accountId: p.accountId, title: p.recommendedAction, ...(p.signalIds[0] ? { sourceType: "signal" as const, sourceId: p.signalIds[0] } : {}) })}
                    title={`${p.recommendedAction} — opens a prefilled task to review`}
                    className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 font-body text-[12px] font-semibold", soft ? "bg-accent-soft text-sirius hover:bg-sirius hover:text-white" : "bg-sirius text-white hover:opacity-90")}>
                    {verb} <ArrowRight size={12} />
                  </button>
                  <button onClick={() => setMenuFor((m) => (m === p.id ? null : p.id))} aria-label="More actions" className="grid size-7 place-items-center rounded-lg border border-border text-fg-subtle hover:text-fg"><MoreHorizontal size={14} /></button>
                  {menuFor === p.id && (
                    <RowMenu
                      onClose={() => setMenuFor(null)}
                      onReviewed={() => act(() => setReviewed((s) => new Set(s).add(p.id)))}
                      onSnooze={() => act(() => setSnoozed((s) => new Set(s).add(p.id)))}
                      onOpen={() => act(() => openAccount(p.accountId))}
                      onAddTask={() => act(() => openAddTask({ accountId: p.accountId, title: p.recommendedAction }))}
                    />
                  )}
                </div>
              </div>
            );
          })}

          {active.length > 6 && (
            <button onClick={() => setShowAll((v) => !v)} className="flex w-full items-center justify-center gap-1 border-t border-border-subtle px-4 py-2.5 font-body text-[12px] font-semibold text-sirius hover:bg-accent-soft/40">
              {showAll ? "Show less" : `View all ${active.length}`} <ChevronDown size={13} className={cn("transition-transform", showAll && "rotate-180")} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/* Explicit per-row actions — clear semantics, no ambiguous "done". */
function RowMenu({ onClose, onReviewed, onSnooze, onOpen, onAddTask }: {
  onClose: () => void; onReviewed: () => void; onSnooze: () => void; onOpen: () => void; onAddTask: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  const Item = ({ icon: Icon, label, onClick, hint }: { icon: typeof Eye; label: string; onClick: () => void; hint?: string }) => (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left font-body text-[12.5px] text-fg hover:bg-bg-muted">
      <Icon size={14} className="text-fg-subtle" /> <span>{label}</span>{hint && <span className="ml-auto font-body text-[10.5px] text-fg-subtle">{hint}</span>}
    </button>
  );
  return (
    <div ref={ref} className="pm-in absolute right-0 top-9 z-20 w-52 rounded-lg border border-border bg-surface p-1 shadow-lg">
      <Item icon={Eye} label="Mark reviewed" onClick={onReviewed} hint="seen" />
      <Item icon={BellOff} label="Snooze" onClick={onSnooze} />
      <div className="my-1 border-t border-border-subtle" />
      <Item icon={Plus} label="Add task" onClick={onAddTask} />
      <Item icon={Building2} label="Open account" onClick={onOpen} />
    </div>
  );
}
