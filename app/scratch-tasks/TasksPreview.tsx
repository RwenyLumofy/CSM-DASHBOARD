"use client";

/* Dev preview. See page.tsx for why this exists and why it is tracked. */

import { useState } from "react";
import { Check, MessageSquare, CheckCheck, Inbox } from "lucide-react";
import { cn } from "@/lib/cn";
import { TaskUpdates } from "@/components/clients/TaskUpdates";
import { TYPE_META } from "@/components/layout/NotificationsBell";
import { notificationHref } from "@/lib/notifications/link";

const PEOPLE = [
  { email: "aelsagher@lumofy.com", name: "Ahmed Elsagher" },
  { email: "qalshakhoori@lumofy.com", name: "Qasim Alshakhoori" },
  { email: "zainab@lumofy.com", name: "Zainab Hussain" },
  { email: "maryam@lumofy.com", name: "Maryam Al Bastaki" },
];

const t = (minsAgo: number) => new Date(Date.now() - minsAgo * 60_000).toISOString();

const THREAD = [
  {
    id: "u1", authorEmail: "aelsagher@lumofy.com", authorName: "Ahmed Elsagher",
    body: "Deck is drafted through the adoption section. The usage numbers for Q3 look off — they're double-counting the pilot workspace.",
    createdAt: t(260), editedAt: null, deleted: false, mine: false,
  },
  {
    id: "u2", authorEmail: "zainab@lumofy.com", authorName: "Zainab Hussain",
    body: "@[qalshakhoori@lumofy.com] can you confirm before Thursday? If the pilot is excluded we're still ahead of target, just by less.",
    createdAt: t(95), editedAt: null, deleted: false, mine: false,
  },
  {
    id: "u3", authorEmail: "qalshakhoori@lumofy.com", authorName: "Qasim Alshakhoori",
    body: "Confirmed — pilot excluded. Corrected figures are in the shared sheet. @[aelsagher@lumofy.com] the adoption slide needs the new number.",
    createdAt: t(12), editedAt: null, deleted: false, mine: false,
  },
];

const NOTIFICATIONS = [
  { id: "n1", type: "task_mentioned", title: "zainab@lumofy.com mentioned you", body: "Prepare the QBR deck — can you confirm before Thursday?", clientId: "4020204985", entityType: "task", entityId: "tdt-1", readAt: null, createdAt: t(95) },
  { id: "n2", type: "task_update", title: "ahmed@lumofy.com commented on your task", body: "Prepare the QBR deck — Deck is drafted through the adoption section.", clientId: "4020204985", entityType: "task", entityId: "tdt-1", readAt: null, createdAt: t(260) },
  { id: "n3", type: "task_assigned", title: "You were given a task", body: "Chase the signed order form", clientId: null, entityType: "task", entityId: "tdt-9", readAt: null, createdAt: t(400) },
  { id: "n4", type: "client_assigned", title: "Bank of Bahrain & Kuwait assigned to you", body: null, clientId: "4020204985", entityType: null, entityId: null, readAt: t(600), createdAt: t(1500) },
  { id: "n5", type: "assignment_needs_admin", title: "Two candidates, no clear owner", body: "Gulf Air — tie between two CSMs", clientId: "acc_gulfair", entityType: null, entityId: null, readAt: t(600), createdAt: t(2900) },
  { id: "n6", type: "profile_incomplete_yellow", title: "Account profile incomplete", body: "Arla Foods — renewal date, executive sponsor", clientId: "acc_arla", entityType: null, entityId: null, readAt: t(600), createdAt: t(4300) },
];

const ago = (iso: string) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

function Panel({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-[17px] font-semibold text-fg">{title}</h2>
        <p className="mt-0.5 max-w-2xl font-body text-[12.5px] leading-relaxed text-fg-muted">{note}</p>
      </div>
      {children}
    </section>
  );
}

export function TasksPreview() {
  const [openThread, setOpenThread] = useState(true);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 p-6 sm:p-10">
      <header>
        <p className="font-body text-[11px] font-semibold uppercase tracking-wide text-sirius">Dev preview</p>
        <h1 className="mt-1 font-display text-[26px] font-semibold text-fg">Task updates &amp; notifications</h1>
        <p className="mt-1.5 font-body text-[13px] leading-relaxed text-fg-muted">
          The shipping components against sample data — a live thread needs a signed-in
          session, which a local environment doesn&rsquo;t have. The composer works: type
          <span className="mx-1 rounded bg-bg-muted px-1.5 py-0.5 font-mono text-[11.5px]">@</span>
          to open the picker, post, and the mention renders as a chip.
        </p>
      </header>

      <Panel
        title="The thread, in the account Tasks sidebar"
        note="A task row now carries its conversation. One thread open at a time — several expanded turn a scannable list into a wall. This box is the REAL drawer width — 540px with 24px padding — so what you see here is what the sidebar gives it."
      >
        {/* Mirrors AccountTasks' drawer exactly: w-[540px] p-6. Previewing this
            in a wide card was misleading — the thread never gets that much
            room, and the row's meta is what suffers first. */}
        <div className="w-[540px] max-w-full rounded-xl border border-border bg-surface p-6">
          <div className="flex flex-col rounded-lg border border-border-subtle px-3 py-2">
            {/* Deliberately a REALISTIC title length. The short one ("Prepare
                the QBR deck") fit fine and hid the fact that the meta on the
                title's line squeezed a real title to ~180px. */}
            <div className="flex items-start gap-2">
              <button className="mt-0.5 grid size-4 shrink-0 place-items-center rounded border border-border text-transparent hover:border-sirius hover:text-sirius">
                <Check size={10} strokeWidth={3} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-1.5 font-body text-[12.5px] text-fg">
                  <span title="High priority" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#C99A14]" />
                  <span className="min-w-0">Prepare the Q3 QBR deck and circulate to the exec sponsor</span>
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded-full bg-bg-muted px-2 py-0.5 font-body text-[10.5px] font-medium text-fg-muted">Meeting</span>
                  <span className="font-body text-[11.5px] text-[#B23A57]">2 days late</span>
                  <span className="truncate font-body text-[11px] text-fg-subtle">aelsagher@lumofy.com</span>
                </div>
              </div>
              <button onClick={() => setOpenThread((o) => !o)} aria-expanded={openThread}
                className={cn("shrink-0 transition-colors", openThread ? "text-sirius" : "text-fg-subtle hover:text-sirius")}>
                <MessageSquare size={13} />
              </button>
            </div>
            {openThread && (
              <TaskUpdates taskId="preview" canPost preview={{ updates: THREAD, people: PEOPLE }} />
            )}
          </div>
        </div>
      </Panel>

      <Panel
        title="Notifications"
        note="Every type has its own mark. The task ones and the yellow profile nudge all used to fall through to the same grey dot as “system”, so being named in an update looked like housekeeping. Each row shows where it now lands."
      >
        <div className="w-full max-w-sm overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2.5">
            <span className="font-body text-[13px] font-semibold text-fg">Notifications</span>
            <span className="flex items-center gap-1 font-body text-[11.5px] font-medium text-sirius">
              <CheckCheck size={13} /> Mark all read
            </span>
          </div>
          <ul className="flex flex-col">
            {NOTIFICATIONS.map((n) => {
              const meta = TYPE_META[n.type] ?? TYPE_META.system;
              const Icon = meta.icon;
              return (
                <li key={n.id} className={cn("flex gap-2.5 border-b border-border-subtle px-3 py-2.5", !n.readAt && "bg-accent-soft/40")}>
                  <span className={cn("mt-0.5 shrink-0", meta.tone)} title={meta.label}>
                    <Icon size={14} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-body text-[12.5px] font-semibold text-fg">{n.title}</span>
                    {n.body && <span className="mt-0.5 block line-clamp-2 font-body text-[11.5px] text-fg-muted">{n.body}</span>}
                    <span className="mt-0.5 block font-body text-[10.5px] text-fg-subtle">{ago(n.createdAt)}</span>
                    <code className="mt-1 block truncate font-mono text-[10px] text-sirius">
                      {notificationHref(n) ?? "— nowhere to go, marks read in place"}
                    </code>
                  </span>
                  {!n.readAt && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sirius" />}
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-center gap-1.5 border-t border-border-subtle px-3 py-2.5 font-body text-[12px] font-semibold text-sirius">
            <Inbox size={13} /> View all in Action list
          </div>
        </div>
        <p className="max-w-2xl font-body text-[11.5px] leading-relaxed text-fg-subtle">
          The monospace line under each is the destination — not part of the real UI, shown
          here so you can see the routing. The third one is a task with no account: it used
          to be a dead click.
        </p>
      </Panel>
    </div>
  );
}
