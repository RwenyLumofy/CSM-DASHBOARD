"use client";

/* Today page — header: greeting, portfolio scope, CSM drill-in (admins),
   Ask Signal, Add task. The board is a live operating surface, so there's no
   historical date control here. */

import { useEffect, useState } from "react";
import { Sparkles, Plus, CalendarDays } from "lucide-react";
import { cn } from "@/lib/cn";
import type { PortfolioScope } from "@/lib/today/types";
import { getViewerUser, getViewer, getOwners, getPulse, getPriorities, getToday } from "@/lib/today/repo";
import { formatMoney, formatDate } from "@/lib/today/format";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
import { useToday } from "./TodayContext";

/** Evidence-based subtitle for the active scope — carries the two things that
 *  matter most (attention + overdue work), not a renewal-only framing. */
function subtitleFor(scope: PortfolioScope): string {
  const n = getPriorities(scope, null).length;
  if (n === 0) return "Your portfolio has no critical items today.";
  const pulse = getPulse(scope);
  const overdue = pulse.overdueCount ? `, with ${pulse.overdueCount} overdue action${pulse.overdueCount === 1 ? "" : "s"}` : "";
  if (scope === "company") {
    return pulse.attentionCount > 0
      ? `${formatMoney(pulse.arrAttention)} in at-risk ARR needs attention across ${pulse.attentionCount} account${pulse.attentionCount === 1 ? "" : "s"}${overdue}.`
      : `${n} item${n === 1 ? "" : "s"} need attention across the company${overdue}.`;
  }
  if (scope === "my_team") return `${n} account${n === 1 ? "" : "s"} across your team need attention today${overdue}.`;
  return `${n} account${n === 1 ? "" : "s"} need you today${overdue}.`;
}

const SCOPES: { key: PortfolioScope; label: string }[] = [
  { key: "my_portfolio", label: "My portfolio" },
  { key: "my_team", label: "My team" },
  { key: "company", label: "Company" },
];

export function TodayHeader() {
  const { scope, setScope, ownerFilter, setOwnerFilter, openAskSignal, openAddTask } = useToday();
  const canSeeAll = getViewer().canSeeAll;
  const rawName = getViewerUser()?.name || getViewer().email || "there";
  const firstName = rawName.includes("@") ? rawName.split("@")[0] : rawName.split(" ")[0];
  const subtitle = subtitleFor(scope);

  // Greeting is time-of-day; compute on the client only to avoid an SSR/client
  // hydration mismatch (server hour ≠ viewer hour).
  const [greeting, setGreeting] = useState("Good day");
  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening");
  }, []);

  // Today's date from the snapshot (stable, UTC-derived → no hydration mismatch).
  const today = getToday();
  const dateLabel = `${WEEKDAYS[new Date(`${today.slice(0, 10)}T00:00:00Z`).getUTCDay()]}, ${formatDate(today)}`;

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="mb-1 inline-flex items-center gap-1.5 font-body text-[11.5px] font-medium text-fg-subtle"><CalendarDays size={13} /> {dateLabel}</div>
        <h1 className="font-display text-[22px] font-semibold text-fg">{greeting}, {firstName}</h1>
        <p className="mt-0.5 font-body text-[13.5px] text-fg-muted">{subtitle}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ScopeSelector scope={scope} onChange={setScope} canSeeAll={canSeeAll} />
        {canSeeAll && <CsmPicker value={ownerFilter} onChange={setOwnerFilter} />}
        <button onClick={() => openAskSignal()} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 font-body text-[13px] font-semibold text-fg-muted transition-colors hover:border-sirius-200 hover:text-sirius">
          <Sparkles size={15} /> Ask Signal
        </button>
        <button onClick={() => openAddTask()} className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-2 font-body text-[13px] font-semibold text-white transition-opacity hover:opacity-90">
          <Plus size={15} /> Add task
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- scope selector */

function ScopeSelector({ scope, onChange, canSeeAll }: { scope: PortfolioScope; onChange: (s: PortfolioScope) => void; canSeeAll: boolean }) {
  // Individual CSMs get only "My portfolio"; team/company are management scopes.
  const visible = canSeeAll ? SCOPES : SCOPES.filter((s) => s.key === "my_portfolio");
  if (visible.length === 1) return null;
  return (
    <div className="inline-flex rounded-lg border border-border bg-bg-muted/50 p-0.5" role="tablist" aria-label="Portfolio scope">
      {visible.map((s) => (
        <button key={s.key} role="tab" aria-selected={scope === s.key} onClick={() => onChange(s.key)}
          className={cn("rounded-md px-2.5 py-1.5 font-body text-[12.5px] font-semibold transition-colors", scope === s.key ? "bg-surface text-sirius shadow-sm" : "text-fg-muted hover:text-fg")}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ CSM picker */

/** Admin drill-in: view a specific CSM's portfolio. Only rendered for viewers
 *  who can see the whole book; a CSM has nothing to drill into. */
function CsmPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const owners = getOwners();
  if (owners.length === 0) return null;
  return (
    <label className="inline-flex items-center rounded-lg border border-border bg-surface">
      <span className="sr-only">View a CSM's portfolio</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="View a CSM's portfolio"
        className={cn("rounded-lg bg-transparent px-2.5 py-2 font-body text-[12.5px] font-semibold outline-none ring-sirius focus:ring-2", value ? "text-sirius" : "text-fg-muted")}
      >
        <option value="">All CSMs</option>
        {owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
    </label>
  );
}
