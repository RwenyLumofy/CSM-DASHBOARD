"use client";

/* Contracts — the list. Issue-tracker idiom: a breadcrumb, a filter bar, and
   grouped single-line rows. No cards, no headline paragraph, no prose. The
   rows are the page. */

import Link from "next/link";
import { useState } from "react";
import { Plus, AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ARMS, NOW, money, shortDate, daysBetween, noticeDeadline, isLive,
  currentArr, obligationProgress, type Term,
} from "./data";
import { StateIcon, Who } from "./ui";

type GroupBy = "status" | "value";

function Row({ term }: { term: Term }) {
  const notice = noticeDeadline(term);
  const toEnd = term.end ? daysBetween(NOW, term.end) : null;
  const ob = obligationProgress(term);
  const gap = term.project ? term.project.milestonesTotal - term.project.milestonesPresent : 0;
  const noticeSoon = notice && term.state !== "ended" && daysBetween(NOW, notice) <= 120;

  return (
    <Link
      href={`/scratch-contracts/${term.id}`}
      className="group flex h-[38px] items-center gap-2.5 border-b border-border-subtle px-4 transition-colors hover:bg-bg-subtle"
    >
      <StateIcon state={term.state === "confirmed" && isLive(term) ? "confirmed" : term.state} />

      <span className="tabular w-[3.6rem] shrink-0 font-body text-[12px] text-fg-subtle">{term.key}</span>

      <span className="truncate font-body text-[13px] text-fg">{term.name}</span>

      {term.illustrative && (
        <span className="shrink-0 rounded-[3px] border border-border px-1 font-body text-[9.5px] font-semibold uppercase tracking-[0.04em] text-fg-subtle">
          sample
        </span>
      )}

      <span className="flex-1" />

      {/* Right-aligned metadata, densest first. Everything optional. */}
      {gap > 0 && (
        <span title={`${gap} contractual milestone missing`} className="hidden shrink-0 items-center gap-1 font-body text-[11.5px] text-danger-fg sm:inline-flex">
          <AlertCircle size={11} /> {gap}
        </span>
      )}

      {ob.contracted > 0 && (
        <span className="tabular hidden w-[3rem] shrink-0 text-right font-body text-[11.5px] text-fg-subtle md:block">
          {ob.done}/{ob.contracted}
        </span>
      )}

      {term.state === "proposed" && (
        <span className="hidden shrink-0 rounded-[3px] bg-warning-bg px-1.5 font-body text-[11px] font-medium text-warning-fg sm:block">
          unconfirmed
        </span>
      )}

      {noticeSoon && (
        <span className="hidden shrink-0 font-body text-[11.5px] text-warning-fg lg:block">
          notice {shortDate(notice)}
        </span>
      )}

      <span className="tabular hidden w-[5.2rem] shrink-0 text-right font-body text-[11.5px] text-fg-subtle md:block">
        {term.state === "ended" ? shortDate(term.end) : toEnd != null ? `${toEnd}d left` : "—"}
      </span>

      <span className="tabular w-[4.6rem] shrink-0 text-right font-body text-[12.5px] text-fg">
        {money(term.value)}
      </span>

      <Who name={term.confirmedBy} />
    </Link>
  );
}

function GroupHeader({ label, count, sum }: { label: string; count: number; sum: number }) {
  return (
    <div className="sticky top-0 z-10 flex h-[30px] items-center gap-2 border-b border-border bg-bg-subtle px-4">
      <span className="font-body text-[12px] font-semibold text-fg">{label}</span>
      <span className="tabular font-body text-[11.5px] text-fg-subtle">{count}</span>
      <span className="flex-1" />
      <span className="tabular font-body text-[11.5px] text-fg-subtle">{money(sum)}</span>
    </div>
  );
}

export function Contracts() {
  const [group, setGroup] = useState<GroupBy>("status");
  const r = ARMS;
  const arr = currentArr(r);

  const proposed = r.terms.filter((t) => t.state === "proposed");
  const live = r.terms.filter((t) => t.state === "confirmed" && isLive(t));
  const ended = r.terms.filter((t) => t.state === "ended");

  const groups =
    group === "status"
      ? [
          { label: "Unconfirmed", terms: proposed },
          { label: "Live", terms: live },
          { label: "Ended", terms: ended },
        ]
      : [{ label: "All terms", terms: [...r.terms].sort((a, b) => b.value - a.value) }];

  return (
    <div className="flex h-full flex-col">
      {/* Header — breadcrumb and actions, one line. */}
      <div className="flex h-[44px] shrink-0 items-center gap-2 border-b border-border px-4">
        <Link href="/clients" className="font-body text-[13px] text-fg-muted hover:text-fg">
          {r.accountName}
        </Link>
        <span className="font-body text-[13px] text-fg-subtle">/</span>
        <span className="font-body text-[13px] font-medium text-fg">Contracts</span>

        <span className="flex-1" />

        <span className="tabular hidden font-body text-[12px] text-fg-subtle sm:block">
          {money(arr.total)}/yr
          {arr.unconfirmed > 0 && <span className="text-warning-fg"> · {money(arr.unconfirmed)} unconfirmed</span>}
        </span>

        <button className="inline-flex h-[26px] items-center gap-1 rounded-[6px] border border-border px-2 font-body text-[12.5px] font-medium text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg">
          <Plus size={13} /> New term
        </button>
      </div>

      {/* Filter bar. */}
      <div className="flex h-[34px] shrink-0 items-center gap-1 border-b border-border px-4">
        <span className="mr-1 font-body text-[12px] text-fg-subtle">Group by</span>
        {(["status", "value"] as GroupBy[]).map((g) => (
          <button
            key={g}
            onClick={() => setGroup(g)}
            className={cn(
              "h-[22px] rounded-[5px] px-2 font-body text-[12px] capitalize transition-colors",
              group === g ? "bg-bg-muted font-medium text-fg" : "text-fg-muted hover:bg-bg-subtle hover:text-fg",
            )}
          >
            {g}
          </button>
        ))}
      </div>

      {/* The rows. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map((g) =>
          g.terms.length === 0 ? null : (
            <div key={g.label}>
              <GroupHeader
                label={g.label}
                count={g.terms.length}
                sum={g.terms.reduce((s, t) => s + t.value, 0)}
              />
              {g.terms.map((t) => <Row key={t.id} term={t} />)}
            </div>
          ),
        )}

        <p className="px-4 py-3 font-body text-[11.5px] text-fg-subtle">
          Prototype. Only ARMS-4 is real data; rows marked sample show the unconfirmed and ended states.
        </p>
      </div>
    </div>
  );
}
