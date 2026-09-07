"use client";

/* Prototype — Client Profile → Work.

   One surface. A compact header, two tabs (Projects | Tasks), a projects table,
   a unified tasks table, and the existing project drawer for milestones and
   project tasks.

   Deliberately NOT here: portfolio views, scopes, capacity, summary cards,
   filters, timelines. This is one place to see the work on one client.

   Sample data only (./data.ts). Nothing reads or writes the database. */

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DELIVERY, LIFECYCLE, PROJECTS, TASK_STATUS, allTasks, fmt, name, nextMilestone,
  type WorkProject,
} from "./data";

const TH = "px-3 py-2.5 text-left font-body text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle";
const TD = "px-3 py-3 align-top font-body text-[13px] text-fg";

function Pill({ label, tone }: { label: string; tone: string }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 font-body text-[11.5px] font-medium", tone)}>{label}</span>;
}

function Health({ k }: { k: WorkProject["delivery"] }) {
  const d = DELIVERY[k];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap font-body text-[12.5px] font-medium", d.text)}>
      <span className={cn("size-1.5 rounded-full", d.dot)} />{d.label}
    </span>
  );
}

export function WorkPreview() {
  const [tab, setTab] = useState<"projects" | "tasks">("projects");
  const [openId, setOpenId] = useState<string | null>(null);
  const open = PROJECTS.find((p) => p.id === openId) ?? null;
  const tasks = allTasks();

  return (
    <div className="min-h-screen bg-bg p-6 md:p-10">
      <div className="mx-auto flex max-w-[980px] flex-col gap-5">

        <div>
          <span className="font-body text-[11px] font-semibold uppercase tracking-[0.09em] text-sirius">Prototype</span>
          <p className="mt-1 font-body text-[12.5px] text-fg-muted">
            Client Profile → Work, on Bank of Bahrain &amp; Kuwait. Sample data.
          </p>
        </div>

        {/* Header — tabs with counts on the left, actions on the right. */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex gap-1">
            {([["projects", "Projects", PROJECTS.length], ["tasks", "Tasks", tasks.length]] as const).map(([id, label, count]) => (
              <button key={id} onClick={() => setTab(id)}
                className={cn("rounded-lg px-3 py-1.5 font-body text-[13.5px] font-semibold transition-colors",
                  tab === id ? "bg-accent-soft text-sirius" : "text-fg-muted hover:bg-bg-muted hover:text-fg")}>
                {label}
                <span className={cn("tabular ml-1.5 font-normal", tab === id ? "text-sirius/70" : "text-fg-subtle")}>{count}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
              <Plus size={13} /> Add task
            </button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white transition-colors hover:bg-sirius/90">
              <Plus size={13} /> Add project
            </button>
          </div>
        </div>

        {tab === "projects" ? (
          <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Project</th>
                  <th className={TH}>Lifecycle</th>
                  <th className={TH}>Delivery</th>
                  <th className={TH}>Owner</th>
                  <th className={TH}>Next milestone</th>
                  <th className={TH}>Forecast</th>
                </tr>
              </thead>
              <tbody>
                {PROJECTS.map((p) => {
                  const nm = nextMilestone(p);
                  return (
                    <tr key={p.id} onClick={() => setOpenId(p.id)}
                      className="cursor-pointer border-b border-border-subtle last:border-b-0 hover:bg-bg-muted/60">
                      <td className={TD}>
                        <span className="font-medium">{p.name}</span>
                        {p.useCase && <span className="mt-0.5 block font-body text-[11.5px] text-fg-subtle">{p.useCase}</span>}
                      </td>
                      <td className={TD}><Pill label={LIFECYCLE[p.lifecycle].label} tone={LIFECYCLE[p.lifecycle].tone} /></td>
                      <td className={TD}><Health k={p.delivery} /></td>
                      <td className={cn(TD, "whitespace-nowrap text-fg-muted")}>{name(p.ownerEmail)}</td>
                      <td className={TD}>
                        {nm ? (
                          <>
                            <span className="block font-body text-[12.5px]">{nm.name}</span>
                            <span className="font-body text-[11.5px] text-fg-subtle">{fmt(nm.dueDate)}</span>
                          </>
                        ) : <span className="text-fg-subtle">—</span>}
                      </td>
                      <td className={cn(TD, "whitespace-nowrap text-fg-muted")}>{fmt(p.forecastDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border-subtle bg-surface">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className={TH}>Task</th>
                  <th className={TH}>Context</th>
                  <th className={TH}>Owner</th>
                  <th className={TH}>Due</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id} className="border-b border-border-subtle last:border-b-0 hover:bg-bg-muted/60">
                    <td className={TD}>
                      <span className={cn("font-medium", t.status === "done" && "text-fg-subtle line-through")}>{t.title}</span>
                    </td>
                    <td className={cn(TD, "text-fg-muted")}>
                      {t.project
                        ? <><span className="block font-body text-[12.5px]">{t.project}</span><span className="font-body text-[11.5px] text-fg-subtle">{t.milestone}</span></>
                        : <><span className="block font-body text-[12.5px]">Standalone</span>{t.origin && <span className="font-body text-[11.5px] text-fg-subtle">{t.origin}</span>}</>}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-fg-muted")}>{name(t.ownerEmail)}</td>
                    <td className={cn(TD, "whitespace-nowrap text-fg-muted")}>{fmt(t.dueDate)}</td>
                    <td className={TD}><Pill label={TASK_STATUS[t.status].label} tone={TASK_STATUS[t.status].tone} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {open && <Drawer p={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────── drawer ── */

function Drawer({ p, onClose }: { p: WorkProject; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="pm-slide-in relative flex h-full w-full flex-col overflow-y-auto bg-surface shadow-2xl sm:w-[620px]">

        <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill label={LIFECYCLE[p.lifecycle].label} tone={LIFECYCLE[p.lifecycle].tone} />
              <Health k={p.delivery} />
              <span className="font-body text-[11.5px] text-fg-subtle">{p.type}</span>
            </div>
            <h2 className="mt-2.5 font-display text-[17px] font-bold tracking-[-0.01em] text-fg">{p.name}</h2>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="grid size-8 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-bg-muted hover:text-fg"><X size={17} /></button>
        </div>

        <div className="flex flex-col gap-5 px-6 py-5">

          {/* Why it exists, before anything else. */}
          <div>
            <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Intended outcome</span>
            <p className="mt-1.5 font-body text-[13.5px] leading-relaxed text-fg">{p.outcome}</p>
          </div>

          <dl className="grid grid-cols-2 gap-x-5 gap-y-3.5 border-t border-border-subtle pt-4">
            <Field label="Linked use case" value={p.useCase ?? "None linked"} muted={!p.useCase} />
            <Field label="Owner" value={name(p.ownerEmail)} />
            <Field label="Implementer" value={name(p.implementerEmail)} muted={!p.implementerEmail} />
            <Field label="Baseline delivery" value={fmt(p.baselineDate)} />
            <Field label="Forecast delivery" value={fmt(p.forecastDate)} />
          </dl>

          <div className="border-t border-border-subtle pt-4">
            <span className="font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Milestones and tasks</span>
            <div className="mt-3 flex flex-col gap-4">
              {p.milestones.map((m) => {
                const done = m.tasks.filter((t) => t.status === "done").length;
                return (
                  <div key={m.name}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-body text-[13px] font-semibold text-fg">{m.name}</span>
                      <span className="font-body text-[11.5px] text-fg-subtle">{done}/{m.tasks.length} · {fmt(m.dueDate)}</span>
                    </div>
                    <ul className="mt-1.5 flex flex-col">
                      {m.tasks.map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center gap-2.5 border-b border-border-subtle py-2 last:border-b-0">
                          <span className={cn("min-w-0 flex-1 font-body text-[12.5px]", t.status === "done" ? "text-fg-subtle line-through" : "text-fg")}>{t.name}</span>
                          <span className="font-body text-[11.5px] text-fg-subtle">{name(t.ownerEmail)}</span>
                          <span className="w-[86px] text-right font-body text-[11.5px] text-fg-subtle">{fmt(t.dueDate)}</span>
                          <Pill label={TASK_STATUS[t.status].label} tone={TASK_STATUS[t.status].tone} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt className="font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className={cn("mt-0.5 font-body text-[13px]", muted ? "text-fg-subtle" : "text-fg")}>{value}</dd>
    </div>
  );
}
