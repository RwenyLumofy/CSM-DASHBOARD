"use client";

/* =========================================================================
   Prototype — the deal card as a record that notices things.

   The previous pass was still a form: every field rendered, the empty ones
   marked. This one inverts it. The deal is stated in a sentence, the system
   says what it found, and the full field list is there for the times you
   actually want it.

   The findings are live — adding a date or dismissing an item updates the
   card, the timeline and the count. That interaction is the point; the
   persistence behind it is not built.
   ========================================================================= */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Tag, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DEALS, NOW, money, shortDate, daysBetween, renewalOf, findingsOf, summarise,
  type Deal, type Finding, type Level, type Milestone,
} from "./data";

/* ------------------------------------------------------------------ atoms */

const LEVEL_DOT: Record<Level, string> = {
  act: "bg-danger-fg",
  soon: "bg-warning-fg",
  note: "bg-border-strong",
};

/** Editing a single date, inline, where the thing that needs it is. */
function DateEntry({ onSet, onCancel }: { onSet: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState("");
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="date"
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        className="rounded-md border border-border bg-surface px-2 py-1 font-body text-[12.5px] text-fg outline-none focus:border-sirius"
      />
      <button
        disabled={!v}
        onClick={() => v && onSet(v)}
        className="rounded-md bg-sirius px-2.5 py-1 font-body text-[12px] font-semibold text-white disabled:opacity-40"
      >
        Save
      </button>
      <button onClick={onCancel} className="font-body text-[12px] font-semibold text-fg-subtle hover:text-fg">
        Cancel
      </button>
    </span>
  );
}

/* --------------------------------------------------------------- findings */

function FindingRow({
  f, onSetMilestone, onSetWindow, onSetNotice, onDismiss,
}: {
  f: Finding;
  onSetMilestone: (key: string, v: string) => void;
  onSetWindow: (key: string, start: string, end: string) => void;
  onSetNotice: (days: number | null) => void;
  onDismiss: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [noticeDraft, setNoticeDraft] = useState("30");
  const [winStart, setWinStart] = useState("");
  const [winEnd, setWinEnd] = useState("");

  return (
    <li className="flex gap-3 py-2.5">
      <span className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", LEVEL_DOT[f.level])} />
      <div className="min-w-0 flex-1">
        <p className="font-body text-[13.5px] font-semibold leading-snug text-fg">{f.title}</p>
        {f.detail && <p className="mt-0.5 font-body text-[12.5px] leading-snug text-fg-muted">{f.detail}</p>}

        {f.group && (
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {f.group.map((g) => (
              <GroupItem
                key={g.id}
                label={g.label}
                action={g.action}
                onSetMilestone={onSetMilestone}
                onSetWindow={onSetWindow}
                onDismiss={() => onDismiss(g.id)}
              />
            ))}
          </ul>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {!editing && f.action && (
            <button
              onClick={() => setEditing(true)}
              className="font-body text-[12.5px] font-semibold text-sirius hover:underline"
            >
              {f.action.kind === "notice" ? "Set notice period" : f.action.kind === "window" ? "Set dates" : "Add date"}
            </button>
          )}

          {editing && f.action?.kind === "date" && (
            <DateEntry
              onSet={(v) => { onSetMilestone(f.action!.kind === "date" ? f.action!.milestoneKey : "", v); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          )}

          {editing && f.action?.kind === "window" && (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <input type="date" autoFocus value={winStart} onChange={(e) => setWinStart(e.target.value)}
                className="rounded-md border border-border bg-surface px-2 py-1 font-body text-[12.5px] text-fg outline-none focus:border-sirius" />
              <span className="caption">to</span>
              <input type="date" value={winEnd} onChange={(e) => setWinEnd(e.target.value)}
                className="rounded-md border border-border bg-surface px-2 py-1 font-body text-[12.5px] text-fg outline-none focus:border-sirius" />
              <button disabled={!winStart || !winEnd}
                onClick={() => { onSetWindow((f.action as { windowKey: string }).windowKey, winStart, winEnd); setEditing(false); }}
                className="rounded-md bg-sirius px-2.5 py-1 font-body text-[12px] font-semibold text-white disabled:opacity-40">
                Save
              </button>
              <button onClick={() => setEditing(false)} className="font-body text-[12px] font-semibold text-fg-subtle hover:text-fg">Cancel</button>
            </span>
          )}

          {editing && f.action?.kind === "notice" && (
            <span className="inline-flex items-center gap-1.5">
              <input type="number" autoFocus min={0} value={noticeDraft} onChange={(e) => setNoticeDraft(e.target.value)}
                className="w-20 rounded-md border border-border bg-surface px-2 py-1 font-body text-[12.5px] text-fg outline-none focus:border-sirius" />
              <span className="caption">days before expiry</span>
              <button onClick={() => { onSetNotice(Number(noticeDraft) || null); setEditing(false); }}
                className="rounded-md bg-sirius px-2.5 py-1 font-body text-[12px] font-semibold text-white">Save</button>
              <button onClick={() => setEditing(false)} className="font-body text-[12px] font-semibold text-fg-subtle hover:text-fg">Cancel</button>
            </span>
          )}

          {!editing && f.dismissable && (
            <button
              onClick={() => onDismiss(f.id)}
              className="font-body text-[12.5px] text-fg-subtle hover:text-fg-muted hover:underline"
            >
              Not needed here
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** One field inside a grouped finding — its own name and its own action,
 *  without repeating the condition sentence for every instance. */
function GroupItem({
  label, action, onSetMilestone, onSetWindow, onDismiss,
}: {
  label: string;
  action: Finding["action"];
  onSetMilestone: (key: string, v: string) => void;
  onSetWindow: (key: string, start: string, end: string) => void;
  onDismiss: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [a, setA] = useState("");
  const [b, setB] = useState("");

  if (editing && action?.kind === "date")
    return (
      <li className="flex flex-wrap items-center gap-2">
        <span className="font-body text-[13px] text-fg-muted">{label}</span>
        <DateEntry onSet={(v) => { onSetMilestone(action.milestoneKey, v); setEditing(false); }} onCancel={() => setEditing(false)} />
      </li>
    );

  if (editing && action?.kind === "window")
    return (
      <li className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 font-body text-[13px] text-fg-muted">{label}</span>
        <input type="date" autoFocus value={a} onChange={(e) => setA(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1 font-body text-[12.5px] text-fg outline-none focus:border-sirius" />
        <span className="caption">to</span>
        <input type="date" value={b} onChange={(e) => setB(e.target.value)}
          className="rounded-md border border-border bg-surface px-2 py-1 font-body text-[12.5px] text-fg outline-none focus:border-sirius" />
        <button disabled={!a || !b} onClick={() => { onSetWindow(action.windowKey, a, b); setEditing(false); }}
          className="rounded-md bg-sirius px-2.5 py-1 font-body text-[12px] font-semibold text-white disabled:opacity-40">Save</button>
        <button onClick={() => setEditing(false)} className="font-body text-[12px] font-semibold text-fg-subtle hover:text-fg">Cancel</button>
      </li>
    );

  return (
    <li className="flex flex-wrap items-baseline gap-x-3">
      <span className="font-body text-[13px] text-fg-muted">{label}</span>
      <button onClick={() => setEditing(true)} className="font-body text-[12.5px] font-semibold text-sirius hover:underline">
        {action?.kind === "window" ? "Set dates" : "Add date"}
      </button>
      <button onClick={onDismiss} className="font-body text-[12.5px] text-fg-subtle hover:text-fg-muted hover:underline">
        Not needed here
      </button>
    </li>
  );
}

/* --------------------------------------------------------------- timeline */

function Timeline({ deal }: { deal: Deal }) {
  const renewal = renewalOf(deal);
  const nodes: Milestone[] = [
    ...[...deal.milestones].sort((a, b) =>
      a.date && b.date ? (a.date < b.date ? -1 : 1) : deal.milestones.indexOf(a) - deal.milestones.indexOf(b),
    ),
    { key: "renewal", label: "Renewal", date: renewal, phase: "signed", need: "required" },
  ];

  return (
    <div className="overflow-x-auto">
      <ol className="grid min-w-[34rem] grid-cols-6">
        {nodes.map((m, i) => {
          const set = !!m.date;
          const past = set && m.date! <= NOW;
          return (
            <li key={m.key} className="flex min-w-0 flex-col gap-1.5 pr-3">
              <div className="flex items-center">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    !set ? "border border-dashed border-fg-subtle bg-transparent" : past ? "bg-fg" : "border border-fg-subtle bg-surface",
                  )}
                />
                {i < nodes.length - 1 && (
                  <span className={cn("h-px flex-1", set ? "bg-border-strong" : "border-t border-dashed border-border")} />
                )}
              </div>
              <span className="truncate font-body text-[11.5px] text-fg-subtle">{m.label}</span>
              <span className={cn("tabular font-body text-[12.5px]", set ? (past ? "font-semibold text-fg" : "text-fg-muted") : "text-fg-subtle")}>
                {set ? shortDate(m.date) : "—"}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------- card */

function DealCard({ deal: initial, defaultOpen }: { deal: Deal; defaultOpen?: boolean }) {
  const [deal, setDeal] = useState(initial);
  const [open, setOpen] = useState(!!defaultOpen);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [showEveryFinding, setShowEveryFinding] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);

  const findings = useMemo(
    () =>
      findingsOf(deal)
        .filter((f) => !dismissed.has(f.id))
        .map((f) => (f.group ? { ...f, group: f.group.filter((g) => !dismissed.has(g.id)) } : f))
        // A grouped finding whose every field was dismissed has nothing left to say.
        .filter((f) => !f.group || f.group.length > 0)
        .map((f) =>
          f.group && f.group.length === 1
            ? { ...f, title: `${f.group[0].label} has no date` }
            : f.group
              ? { ...f, title: `${f.group.length} dates aren't recorded` }
              : f,
        ),
    [deal, dismissed],
  );
  const acting = findings.filter((f) => f.level === "act").length;
  const shown = showEveryFinding ? findings : findings.slice(0, 3);

  const renewal = renewalOf(deal);
  const days = renewal ? daysBetween(NOW, renewal) : null;

  const setMilestone = (key: string, v: string) =>
    setDeal((d) => ({ ...d, milestones: d.milestones.map((m) => (m.key === key ? { ...m, date: v } : m)) }));
  const setWindow = (key: string, start: string, end: string) =>
    setDeal((d) => ({ ...d, windows: d.windows.map((w) => (w.key === key ? { ...w, start, end } : w)) }));
  const setNotice = (n: number | null) => setDeal((d) => ({ ...d, noticeDays: n }));

  return (
    <li className={cn("border-b border-border-subtle last:border-b-0", !deal.tracked && "opacity-60")}>
      {/* Collapsed row — the deal, its value, and when it renews. Nothing else. */}
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex cursor-pointer items-baseline gap-4 px-5 py-3.5 transition-colors hover:bg-bg-subtle"
      >
        <ChevronRight size={15} className={cn("mt-0.5 shrink-0 text-fg-subtle transition-transform", open && "rotate-90")} />

        <div className="min-w-0 flex-1">
          <span className="block truncate font-body text-[14px] font-semibold text-fg">{deal.name}</span>
          <span className="caption">
            {deal.pipeline}
            {!deal.tracked && " · not counted toward ARR"}
          </span>
        </div>

        {acting > 0 && (
          <span className="shrink-0 font-body text-[12.5px] font-semibold text-danger-fg">
            {acting} to act on
          </span>
        )}

        <span className="hidden shrink-0 text-right sm:block">
          <span className={cn("tabular block font-body text-[13px]", days != null && days < 0 ? "font-semibold text-warning-fg" : "text-fg-muted")}>
            {days == null ? "no renewal date" : days < 0 ? `renewed ${Math.abs(days)}d ago?` : `renews in ${days}d`}
          </span>
        </span>

        <span className={cn("tabular shrink-0 font-display text-[17px] font-bold", deal.tracked ? "text-fg" : "text-fg-subtle line-through")}>
          {money(deal.amount.value)}
        </span>
      </div>

      {/* Expanded */}
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="space-y-5 px-5 pb-5 pl-[3.1rem]">

            {/* The deal in a sentence — what twelve label/value cells were for. */}
            <p className="max-w-[62ch] font-body text-[13.5px] leading-relaxed text-fg-muted">
              {summarise(deal)}{" "}
              <button
                onClick={() => setShowAll((s) => !s)}
                className="font-semibold text-sirius hover:underline"
              >
                {showAll ? "Hide fields" : "All fields"}
              </button>
            </p>

            {showAll && (
              <dl className="grid max-w-[62ch] grid-cols-2 gap-x-8 gap-y-2 border-l border-border-subtle pl-4 sm:grid-cols-3">
                {([
                  ["Amount", money(deal.amount.value)],
                  ["Term", `${deal.termYears.value ?? 1} year`],
                  ["Licences", String(deal.licences.value ?? "—")],
                  ["Complimentary", String(deal.complementary.value ?? "—")],
                  ["User price", money(deal.pricePerUser.value)],
                  ["Modules", deal.modules.value?.join(", ") || "—"],
                  ["Global library", deal.globalLibrary.value?.join(", ") || "—"],
                  ["Library seats", String(deal.globalLibraryLicences.value ?? "—")],
                  ["Support", deal.supportLevel.value ?? "—"],
                  ["Implementation", deal.implementationLevel.value ?? "—"],
                  ["Acquisition channel", deal.acquisitionChannel.value ?? "—"],
                  ["Account executive", deal.accountExecutive.value ?? "—"],
                  ["Use case", deal.useCases.value?.join(", ") || "—"],
                  ["AI course credits", String(deal.aiCourseCredits.value ?? "—")],
                  ["Notice period", deal.noticeDays != null ? `${deal.noticeDays} days` : "—"],
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="caption">{k}</dt>
                    <dd className="truncate font-body text-[13px] text-fg">{v}</dd>
                  </div>
                ))}
              </dl>
            )}

            {/* What the system found. The dynamic half of the card. */}
            <div>
              <div className="flex items-baseline gap-2">
                <h4 className="font-body text-[13px] font-bold text-fg">
                  {findings.length === 0 ? "Nothing needs you" : `${findings.length} thing${findings.length > 1 ? "s" : ""} to look at`}
                </h4>
                {findings.length > 3 && !showEveryFinding && (
                  <button onClick={() => setShowEveryFinding(true)} className="font-body text-[12.5px] font-semibold text-sirius hover:underline">
                    show all
                  </button>
                )}
              </div>

              {findings.length === 0 ? (
                <p className="mt-1 font-body text-[13px] text-fg-muted">
                  Dates are complete and the renewal is more than 120 days out.
                </p>
              ) : (
                <ul className="mt-0.5 divide-y divide-border-subtle">
                  {shown.map((f) => (
                    <FindingRow
                      key={f.id}
                      f={f}
                      onSetMilestone={setMilestone}
                      onSetWindow={setWindow}
                      onSetNotice={setNotice}
                      onDismiss={(id) => setDismissed((s) => new Set(s).add(id))}
                    />
                  ))}
                </ul>
              )}
            </div>

            {/* The sequence, once, small. */}
            <div>
              <h4 className="mb-2 font-body text-[13px] font-bold text-fg">Timeline</h4>
              <Timeline deal={deal} />
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
                {deal.windows.map((w) => (
                  <span key={w.key} className="caption">
                    {w.label}:{" "}
                    {w.need === "n/a"
                      ? <span className="text-fg-subtle">not on this deal</span>
                      : w.start && w.end
                        ? <span className="tabular text-fg-muted">{shortDate(w.start)} → {shortDate(w.end)}</span>
                        : <span className="text-fg-subtle">no dates</span>}
                  </span>
                ))}
              </div>
            </div>

            {deal.brief && (
              <div>
                <button
                  onClick={() => setBriefOpen((b) => !b)}
                  className="flex items-center gap-1.5 font-body text-[13px] font-bold text-fg hover:text-sirius"
                >
                  Brief <ChevronDown size={13} className={cn("transition-transform", !briefOpen && "-rotate-90")} />
                </button>
                {briefOpen && (
                  <p className="mt-1.5 max-w-[68ch] whitespace-pre-wrap font-body text-[13px] leading-relaxed text-fg-muted">
                    {deal.brief}
                  </p>
                )}
              </div>
            )}

            {deal.hubspotUrl && (
              <a href={deal.hubspotUrl} className="inline-flex items-center gap-1.5 font-body text-[12.5px] text-fg-subtle hover:text-sirius">
                <ExternalLink size={12} /> Open in HubSpot
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------- page */

export function DealCardRedesign() {
  const tracked = DEALS.filter((d) => d.tracked);
  const arr = tracked.reduce((s, d) => s + (d.amount.value ?? 0), 0);
  const toActOn = DEALS.reduce((n, d) => n + findingsOf(d).filter((f) => f.level === "act").length, 0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-7">
        <p className="caption uppercase tracking-[0.1em] text-sirius">Prototype · not production</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-fg">Contracts &amp; deals</h1>
        <p className="mt-1.5 max-w-[62ch] font-body text-[13.5px] leading-relaxed text-fg-muted">
          The card states the deal in a sentence and lets the system say what it found. Findings
          are live — add a date or dismiss one and the card, the timeline and the counts follow.
          Fixed &ldquo;today&rdquo;: {shortDate(NOW)}.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-3.5 border-b border-border px-5 py-3.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-sirius">
            <Tag size={15} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[13.5px] font-bold text-fg">Contracts &amp; deals</span>
            <span className="caption">{tracked.length} tracked · {money(arr)} toward ARR</span>
          </span>
          {toActOn > 0 && (
            <span className="shrink-0 font-body text-[12.5px] font-semibold text-danger-fg">{toActOn} to act on</span>
          )}
        </div>

        <ul>
          {DEALS.map((d, i) => (
            <DealCard key={d.id} deal={d} defaultOpen={i === 0} />
          ))}
        </ul>
      </div>

      <p className="caption mt-4 max-w-[62ch] leading-relaxed">
        Try it: set the notice period on the pilot deal, or add the missing invoice date on ARMS —
        the finding clears and the timeline fills in. &ldquo;Not needed here&rdquo; exists because a
        rule that can never be wrong becomes noise the first time it is.
      </p>
    </div>
  );
}
