"use client";

/* Dev preview — the shared task detail, in both the contexts it ships into.
   Renders the SHIPPING component (components/tasks/TaskDetail) against sample
   data. The only difference between the two panels is the `account` prop. */

import { useState } from "react";
import { X } from "lucide-react";
import { TaskDetail, type TaskDetailTask } from "@/components/tasks/TaskDetail";
import { DEFAULT_CATEGORIES, DEFAULT_CATEGORY_IDS } from "@/lib/today/format";
import type { User } from "@/lib/today/types";

const PEOPLE: User[] = [
  { id: "ali@lumofy.com", name: "Ali Abbas", role: "Customer Success Manager", email: "ali@lumofy.com", route: "#", accountIds: [] },
  { id: "qasim@lumofy.com", name: "Qasim Alshakhoori", role: "Implementation", email: "qasim@lumofy.com", route: "#", accountIds: [] },
  { id: "sara@lumofy.com", name: "Sara Nasser", role: "CS Team Lead", email: "sara@lumofy.com", route: "#", accountIds: [] },
];

const TODAY = "2026-08-02";

const TASK: TaskDetailTask = {
  id: "preview-task-1",
  title: "Reply to Gathern's email regarding not renewing with us, and share a counter offer",
  notes: "",
  dueDate: "2026-08-02",
  priority: "urgent",
  category: "derisking",
  ownerEmail: "ali@lumofy.com",
  status: "open",
};

const CATEGORIES = [...DEFAULT_CATEGORY_IDS];
const catLabel = (id: string) => DEFAULT_CATEGORIES.find((c) => c.id === id)?.label ?? id;

export function TaskDetailPreview() {
  const [showAccount, setShowAccount] = useState(true);

  return (
    <div className="min-h-screen bg-bg p-6 md:p-10">
      <div className="mx-auto max-w-[1240px]">
        <h1 className="font-display text-[22px] font-bold text-fg">Task detail — one component, two contexts</h1>
        <p className="mt-1 max-w-[720px] font-body text-[13.5px] leading-relaxed text-fg-muted">
          Both panels render <code className="rounded bg-bg-muted px-1 py-0.5 text-[12.5px]">components/tasks/TaskDetail</code>.
          The only prop that differs is <code className="rounded bg-bg-muted px-1 py-0.5 text-[12.5px]">account</code> — supplied
          on the left, <code className="rounded bg-bg-muted px-1 py-0.5 text-[12.5px]">null</code> on the right, because the
          client profile already shows the account. Edits are live but in-memory: nothing is written.
        </p>

        <label className="mt-4 inline-flex items-center gap-2 font-body text-[13px] text-fg-muted">
          <input type="checkbox" checked={showAccount} onChange={(e) => setShowAccount(e.target.checked)}
            className="size-[15px] accent-[#3355C6]" />
          Show commercial context on the account block
        </label>

        <div className="mt-6 flex flex-wrap items-start gap-6">
          <Panel
            label="Opened from Today"
            hint="You cannot see the account — so the task carries it."
            eyebrow="Task"
          >
            <TaskDetail
              preview
              task={TASK}
              people={PEOPLE}
              viewerId="ali@lumofy.com"
              today={TODAY}
              categories={CATEGORIES}
              categoryLabel={catLabel}
              account={{
                id: "gathern",
                name: "Gathern",
                arr: showAccount ? 142000 : null,
                renewalDate: showAccount ? "14 Sep" : null,
                healthLabel: showAccount ? "Health 38 · At risk" : null,
              }}
              canEdit
              canPost
              onOpenAccount={() => {}}
            />
          </Panel>

          <Panel
            label="Opened from the client profile"
            hint="Gathern is already on screen — the block is dropped."
            eyebrow="Task · Gathern"
          >
            <TaskDetail
              preview
              task={{ ...TASK, id: "preview-task-2" }}
              people={PEOPLE}
              viewerId="ali@lumofy.com"
              today={TODAY}
              categories={CATEGORIES}
              categoryLabel={catLabel}
              account={null}
              canEdit
              canPost
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ label, hint, eyebrow, children }: {
  label: string; hint: string; eyebrow: string; children: React.ReactNode;
}) {
  return (
    <div className="w-full max-w-[560px] flex-1">
      <p className="font-body text-[13px] font-semibold text-fg">{label}</p>
      <p className="mb-2 font-body text-[12.5px] text-fg-subtle">{hint}</p>
      {/* Mirrors the real shells: 560px, the drawer's own padding. */}
      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="font-body text-[11px] font-semibold uppercase tracking-[0.05em] text-fg-subtle">{eyebrow}</div>
          <X size={18} className="text-fg-muted" aria-hidden />
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
