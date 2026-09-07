"use client";

/* One Term. Issue-tracker detail idiom: breadcrumb, title, description,
   sub-items, activity — with every scalar fact in a right-hand rail rather
   than inline. Obligations are the sub-items; deals are a property. */

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ExternalLink, AlertCircle, Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ARMS, NOW, money, shortDate, daysBetween, noticeDeadline, isLive,
  obligationProgress, type Term, type Obligation,
} from "../data";
import { StateIcon, ProgressIcon, Who, Prop, RailGroup } from "../ui";

function ObligationRow({ o }: { o: Obligation }) {
  const complete = o.quantity != null ? o.done >= o.quantity : o.done > 0;
  const overdue = !!o.due && o.due < NOW && !complete;
  return (
    <div className="flex h-[34px] items-center gap-2.5 border-b border-border-subtle px-2 transition-colors last:border-b-0 hover:bg-bg-subtle">
      <ProgressIcon done={o.done} total={o.quantity} />
      {/* The name owns the flexible space; the cadence chip yields before it. */}
      <span className="min-w-0 flex-1 truncate font-body text-[13px] text-fg">{o.label}</span>
      {o.cadence && (
        <span className="hidden min-w-0 max-w-[14rem] shrink truncate rounded-[3px] border border-border px-1.5 font-body text-[11px] text-fg-muted 2xl:block">
          {o.cadence}
        </span>
      )}
      {o.consequence && (
        <span className="hidden shrink-0 font-body text-[11.5px] text-warning-fg 2xl:block">{o.consequence}</span>
      )}
      {!o.milestoneId && o.due && (
        <span title="No milestone is delivering this" className="shrink-0 text-danger-fg">
          <AlertCircle size={12} />
        </span>
      )}
      {o.due && (
        <span className={cn("tabular hidden w-[4.6rem] shrink-0 text-right font-body text-[11.5px] sm:block", overdue ? "text-danger-fg" : "text-fg-subtle")}>
          {shortDate(o.due)}
        </span>
      )}
      <span className="tabular w-[3rem] shrink-0 text-right font-body text-[12px] text-fg-subtle">
        {o.quantity != null ? `${o.done}/${o.quantity}` : complete ? "done" : "open"}
      </span>
    </div>
  );
}

export function TermView({ term }: { term: Term }) {
  const [briefOpen, setBriefOpen] = useState(false);
  const notice = noticeDeadline(term);
  const ob = obligationProgress(term);
  const toEnd = term.end ? daysBetween(NOW, term.end) : null;
  const gap = term.project ? term.project.milestonesTotal - term.project.milestonesPresent : 0;
  const displayState = term.state === "confirmed" && isLive(term) ? "confirmed" : term.state;
  const prev = term.supersedes ? ARMS.terms.find((t) => t.id === term.supersedes) : null;

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumb. */}
      <div className="flex h-[44px] shrink-0 items-center gap-1.5 border-b border-border px-4">
        <Link href="/scratch-contracts" className="font-body text-[13px] text-fg-muted hover:text-fg">
          Contracts
        </Link>
        <ChevronRight size={13} className="text-fg-subtle" />
        <span className="tabular font-body text-[13px] text-fg-subtle">{term.key}</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        {/* ── Main column ─────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 overflow-y-auto px-6 py-6 lg:px-10">
          <div className="mx-auto max-w-[46rem]">
            <h1 className="font-display text-[21px] font-bold leading-snug text-fg">{term.name}</h1>

            {term.state === "proposed" && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[7px] border border-border bg-bg-subtle px-3 py-2">
                <span className="font-body text-[12.5px] text-fg-muted">
                  Proposed from a closed-won deal. Counts toward ARR, unconfirmed.
                </span>
                <span className="flex-1" />
                <button className="h-[24px] rounded-[5px] bg-sirius px-2.5 font-body text-[12px] font-medium text-white hover:bg-accent-hover">
                  Confirm
                </button>
                <button className="h-[24px] rounded-[5px] px-2 font-body text-[12px] font-medium text-fg-muted hover:bg-bg-muted hover:text-fg">
                  Discard
                </button>
              </div>
            )}

            {term.brief && (
              <div className="mt-4">
                <p className={cn("whitespace-pre-wrap font-body text-[13.5px] leading-relaxed text-fg-muted", !briefOpen && "line-clamp-3")}>
                  {term.brief}
                </p>
                <button onClick={() => setBriefOpen((b) => !b)} className="mt-1 font-body text-[12.5px] text-fg-subtle hover:text-fg">
                  {briefOpen ? "Less" : "More"}
                </button>
              </div>
            )}

            {/* Sub-items. */}
            <div className="mt-7">
              <div className="flex h-[26px] items-center gap-2">
                <span className="font-body text-[12.5px] font-semibold text-fg">Obligations</span>
                {ob.contracted > 0 && (
                  <span className="tabular font-body text-[12px] text-fg-subtle">{ob.done}/{ob.contracted}</span>
                )}
                <span className="flex-1" />
                <button className="inline-flex h-[22px] items-center gap-1 rounded-[5px] px-1.5 font-body text-[12px] text-fg-subtle hover:bg-bg-subtle hover:text-fg">
                  <Plus size={12} /> Add
                </button>
              </div>

              {term.obligations.length === 0 ? (
                <p className="mt-1 font-body text-[12.5px] text-fg-subtle">None recorded.</p>
              ) : (
                <div className="mt-1 rounded-[7px] border border-border">
                  {term.obligations.map((o) => <ObligationRow key={o.id} o={o} />)}
                </div>
              )}

              {gap > 0 && (
                <p className="mt-2 inline-flex items-center gap-1.5 font-body text-[12px] text-danger-fg">
                  <AlertCircle size={12} />
                  {gap} contractual milestone missing from {term.project!.name}
                </p>
              )}
            </div>

            {/* Activity. */}
            <div className="mt-8">
              <span className="font-body text-[12.5px] font-semibold text-fg">Activity</span>
              <ul className="mt-2 flex flex-col gap-2">
                {term.activity.map((a) => (
                  <li key={a.id} className="flex items-baseline gap-2">
                    <Who name={a.who === "Signal" ? null : a.who} />
                    <span className="font-body text-[12.5px] leading-snug text-fg-muted">
                      <span className="font-medium text-fg">{a.who}</span> {a.what}
                    </span>
                    <span className="tabular ml-auto shrink-0 font-body text-[11.5px] text-fg-subtle">
                      {shortDate(a.when)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── Properties rail ─────────────────────────────────────────── */}
        <aside className="w-full shrink-0 border-t border-border px-5 py-3 lg:w-[16.5rem] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <RailGroup>
            <Prop label="Status">
              <span className="inline-flex items-center gap-1.5">
                <StateIcon state={displayState} size={12} />
                {term.state === "proposed" ? "Unconfirmed" : term.state === "ended" ? "Ended" : "Live"}
              </span>
            </Prop>
            <Prop label="Value"><span className="tabular">{money(term.value)}/yr</span></Prop>
            <Prop label="Owner">
              <span className="inline-flex items-center gap-1.5">
                <Who name={term.confirmedBy} />
                {term.confirmedBy ?? "Unassigned"}
              </span>
            </Prop>
          </RailGroup>

          <RailGroup>
            <Prop label="Starts"><span className="tabular">{shortDate(term.start)}</span></Prop>
            <Prop label="Ends">
              <span className="tabular">{shortDate(term.end)}</span>
              {toEnd != null && term.state !== "ended" && (
                <span className="ml-1.5 text-fg-subtle">{toEnd}d</span>
              )}
            </Prop>
            <Prop label="Notice">
              {notice ? (
                <span className={cn("tabular", daysBetween(NOW, notice) <= 120 && "text-warning-fg")}>
                  {shortDate(notice)}
                  <span className="ml-1 text-fg-subtle">· {term.noticeDays}d</span>
                </span>
              ) : (
                <button className="text-sirius hover:underline">Set</button>
              )}
            </Prop>
          </RailGroup>

          <RailGroup>
            <Prop label="Project">
              {term.project ? (
                <button className="text-left text-sirius hover:underline">{term.project.name}</button>
              ) : (
                <span className="text-fg-subtle">On confirmation</span>
              )}
            </Prop>
            {term.project && (
              <Prop label="Milestones">
                <span className={cn("tabular", gap > 0 && "text-danger-fg")}>
                  {term.project.milestonesPresent}/{term.project.milestonesTotal}
                </span>
              </Prop>
            )}
          </RailGroup>

          <RailGroup>
            {term.deals.map((d) => (
              <Prop key={d.id} label="Deal">
                <a href={d.hubspotUrl} className="inline-flex items-start gap-1 text-fg hover:text-sirius">
                  <span className="min-w-0 break-words">{d.name}</span>
                  <ExternalLink size={10} className="mt-1 shrink-0" />
                </a>
                <span className="tabular mt-0.5 block text-fg-subtle">
                  {money(d.amount)} · {d.role} {d.closedOn && shortDate(d.closedOn)}
                </span>
              </Prop>
            ))}
            {prev && (
              <Prop label="Follows">
                <Link href={`/scratch-contracts/${prev.id}`} className="text-sirius hover:underline">
                  {prev.key} {prev.name}
                </Link>
              </Prop>
            )}
          </RailGroup>

          {term.illustrative && (
            <p className="pt-2 font-body text-[11px] text-fg-subtle">Sample term, not your data.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
