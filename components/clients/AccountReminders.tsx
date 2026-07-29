"use client";

/* Account reminders.

   Backed by today_tasks, NOT a new table. That is the whole design decision:
   today_tasks already carries account_id, due_date, owner_email, priority and
   notes, and — more importantly — it is what the Today board reads. A reminder
   stored anywhere else would only exist on a page the CSM visits when they
   already remembered. Setting one here puts it in front of them on the morning
   it matters.

   Reminders are tasks in the "reminder" focus area. They therefore appear on
   Today alongside everything else, can be completed from either surface, and
   inherit assignment and permission behaviour already built and tested.

   Overdue is stated in words as well as colour, and sorted first, because the
   entire value of a reminder is knowing which one you have already missed. */

import { useMemo, useState } from "react";
import { Bell, Loader2, Plus, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { createTaskAction, toggleTaskAction } from "@/app/(app)/today/task-actions";

export const REMINDER_CATEGORY = "reminder";

export interface AccountReminder {
  id: string;
  title: string;
  dueDate: string | null;
  notes: string | null;
  status: string;
  ownerEmail: string | null;
}

const inputCls =
  "w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius";

/** Whole-day difference, computed from date strings only — a reminder due
 *  "today" must not flip to overdue because of the viewer's clock time. */
function daysUntil(due: string | null, today: string): number | null {
  if (!due) return null;
  const a = Date.parse(`${due.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

function dueLabel(due: string | null, today: string): { text: string; tone: "overdue" | "today" | "soon" | "later" | "none" } {
  const d = daysUntil(due, today);
  if (d == null) return { text: "No date", tone: "none" };
  if (d < 0) return { text: `Overdue by ${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"}`, tone: "overdue" };
  if (d === 0) return { text: "Due today", tone: "today" };
  if (d === 1) return { text: "Due tomorrow", tone: "soon" };
  if (d <= 7) return { text: `Due in ${d} days`, tone: "soon" };
  return { text: new Date(`${due!.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short" }), tone: "later" };
}

const TONE: Record<string, string> = {
  overdue: "text-[#B23A57] font-semibold",
  today: "text-[#8A6D12] font-semibold",
  soon: "text-fg-muted",
  later: "text-fg-subtle",
  none: "text-fg-subtle",
};

export function AccountReminders({ clientId, clientName, initial, canEdit, today }: {
  clientId: string;
  clientName: string;
  initial: AccountReminder[];
  canEdit: boolean;
  today: string;
}) {
  const [items, setItems] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", dueDate: "", notes: "" });
  const [done, setDone] = useState<Record<string, boolean>>({});

  const open = useMemo(() => {
    const rank = { overdue: 0, today: 1, soon: 2, later: 3, none: 4 } as const;
    return items
      .filter((r) => r.status !== "done" && !done[r.id])
      // Missed first — the only ordering that makes a reminder list useful.
      .sort((a, b) => rank[dueLabel(a.dueDate, today).tone] - rank[dueLabel(b.dueDate, today).tone]);
  }, [items, done, today]);

  async function add() {
    const title = form.title.trim();
    if (!title) { setError("What should you be reminded about?"); return; }
    setBusy(true); setError(null);
    const r = await createTaskAction({
      category: REMINDER_CATEGORY,
      title,
      accountId: clientId,
      dueDate: form.dueDate || null,
      notes: form.notes.trim() || null,
    });
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't save the reminder."); return; }
    if (r.task) {
      setItems((prev) => [...prev, {
        id: r.task!.id, title: r.task!.title, dueDate: r.task!.dueDate ?? null,
        notes: r.task!.notes ?? null, status: "open", ownerEmail: r.task!.ownerEmail ?? null,
      }]);
    }
    setForm({ title: "", dueDate: "", notes: "" });
    setAdding(false);
  }

  async function complete(id: string) {
    setDone((d) => ({ ...d, [id]: true })); // optimistic
    const r = await toggleTaskAction(id, "done");
    if (!r.ok) { setDone((d) => ({ ...d, [id]: false })); setError(r.error ?? "Couldn't complete."); }
  }

  return (
    <section className="rounded-xl border border-border p-4" aria-labelledby="rem-h">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="rem-h" className="flex items-center gap-1.5 font-body text-[13.5px] font-semibold text-fg">
            <Bell size={14} className="text-fg-subtle" aria-hidden /> Reminders
          </h3>
          <p className="mt-0.5 font-body text-[11.5px] text-fg-muted">
            Account-specific nudges. These also appear on your Today board, so you don&rsquo;t have to open this page to be reminded.
          </p>
        </div>
        {canEdit && !adding && (
          <button onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
            <Plus size={12} /> Add reminder
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border p-3">
          <label className="flex flex-col gap-1">
            <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Remind me to</span>
            <input autoFocus className={inputCls} value={form.title} placeholder={`e.g. Prepare the QBR deck for ${clientName}`}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">When</span>
              <input type="date" className={inputCls} value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Notes (optional)</span>
              <input className={inputCls} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
          </div>
          {error && <p role="alert" className="font-body text-[11.5px] text-[#B23A57]">{error}</p>}
          <div className="flex items-center gap-2">
            <button onClick={add} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12.5px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Add reminder
            </button>
            <button onClick={() => { setAdding(false); setError(null); }} aria-label="Cancel"
              className="rounded-lg border border-border p-1.5 text-fg-muted hover:text-fg"><X size={13} /></button>
          </div>
        </div>
      )}

      {open.length === 0 && !adding ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-4 text-center font-body text-[12.5px] text-fg-muted">
          No reminders on this account.
          {canEdit && " Set one for a renewal conversation, a QBR, or an executive follow-up."}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1">
          {open.map((r) => {
            const d = dueLabel(r.dueDate, today);
            return (
              <li key={r.id} className="flex items-start gap-2 rounded-lg border border-border-subtle px-3 py-2">
                {canEdit && (
                  <button onClick={() => complete(r.id)} aria-label={`Mark "${r.title}" done`}
                    className="mt-0.5 grid size-4 shrink-0 place-items-center rounded border border-border text-transparent transition-colors hover:border-sirius hover:text-sirius">
                    <Check size={10} strokeWidth={3} />
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="font-body text-[12.5px] text-fg">{r.title}</p>
                  {r.notes && <p dir="auto" className="mt-0.5 font-body text-[11.5px] text-fg-subtle">{r.notes}</p>}
                </div>
                {/* Text, not just colour — WCAG 1.4.1. */}
                <span className={cn("shrink-0 font-body text-[11.5px]", TONE[d.tone])}>{d.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
