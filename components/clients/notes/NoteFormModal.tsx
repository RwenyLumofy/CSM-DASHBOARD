"use client";

/* Writing a note.

   Type is chosen FIRST because it decides what else is asked: only a meeting
   is offered a synced client_meetings row to link; a call or a message has a
   date but nothing to link; a plain note has no event, so it is not asked
   when it happened.

   `occurred_at` is the change that matters most here. A note used to be filed
   on the day it was typed, and authors worked around that by writing the date
   into the sentence — 14 of the 66 notes in production open with one. The
   date field is what those were asking for, and unlike the meeting link it
   serves a phone call or a WhatsApp message too.

   The task half is optional and uses the provenance seam four other surfaces
   already use ("Add as task" on signals and commitments): today_tasks gains a
   row with source_type='note'. The focus area is PICKED, never inferred —
   nothing in a note's prose reliably says whether it is a risk or an
   expansion signal, and a wrong default files work in a box nobody watches. */

import { useMemo, useRef, useState } from "react";
import { Loader2, Lock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { Deal, Meeting } from "@/lib/types";
import type { Note, NoteType } from "@/lib/notes/types";
import {
  createNoteAction, updateNoteAction, type MentionablePerson,
} from "@/app/(app)/clients/[id]/note-actions";
import { createTaskAction } from "@/app/(app)/today/task-actions";
import { DEFAULT_CATEGORIES } from "@/lib/today/format";
import { NOTE_TYPE_META, noteMeta } from "./noteMeta";
import { MentionPicker } from "./MentionPicker";
import { RichTextEditor } from "./RichTextEditor";

/** The same six the account Tasks sidebar offers: "Reminder" plus the five
 *  Today focus areas (components/clients/AccountTasks.tsx). */
const TASK_CATEGORIES = [
  { id: "reminder", label: "Reminder" },
  ...DEFAULT_CATEGORIES.map((c) => ({ id: c.id, label: c.label })),
];

const SELECT_CLS =
  "rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none ring-sirius focus:ring-2";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function NoteFormModal({
  clientId, deals, meetings, people, initial, onClose, onSaved,
}: {
  clientId: string;
  deals: Deal[];
  meetings: Meeting[];
  people: MentionablePerson[];
  initial: Note | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<NoteType>(initial?.type ?? "meeting");
  const [body, setBody] = useState(initial?.body ?? "");
  const [dealId, setDealId] = useState(initial?.dealId ?? "");
  const [meetingId, setMeetingId] = useState(initial?.meetingId ?? "");
  const [occurred, setOccurred] = useState(
    initial?.occurredAt ? initial.occurredAt.slice(0, 10) : todayISO(),
  );
  const [taskTitle, setTaskTitle] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Mention state. The editor shows "@Sakina Asghar" because the raw email is
     unreadable while typing; `picked` converts back to the stored token. */
  const [query, setQuery] = useState<string | null>(null);
  const picked = useRef<Map<string, string>>(new Map());
  const insertRef = useRef<((text: string) => void) | null>(null);

  const meta = noteMeta(type);
  const isEmpty = body.replace(/<[^>]*>/g, "").trim().length === 0;
  // A meeting is only offerable if the account has any that were synced.
  const linkable = meta.linkable && meetings.length > 0;

  const meetingOptions = useMemo(
    () => [...meetings].sort((a, b) => (b.startTime ?? "").localeCompare(a.startTime ?? "")).slice(0, 40),
    [meetings],
  );

  /** Longest names first, so "@Ahmed Samara" isn't half-consumed by "@Ahmed". */
  function toTokens(html: string): string {
    let out = html;
    for (const [name, email] of [...picked.current].sort((a, b) => b[0].length - a[0].length)) {
      out = out.split(`@${name}`).join(`@[${email}]`);
    }
    return out;
  }

  function pickMention(p: MentionablePerson) {
    picked.current.set(p.name, p.email);
    insertRef.current?.(p.name);
    setQuery(null);
  }

  async function save() {
    if (isEmpty) { setError("The note can't be empty."); return; }
    if (taskTitle.trim() && !category) { setError("Choose a focus area for the task."); return; }
    setBusy(true);
    setError(null);
    try {
      const values = {
        body: toTokens(body),
        dealId: dealId || null,
        type,
        // A plain note records no event, so it carries no date of its own.
        occurredAt: meta.event && !meetingId ? new Date(occurred).toISOString() : null,
        meetingId: linkable && meetingId ? meetingId : null,
      };

      const res = initial
        ? await updateNoteAction(clientId, initial.id, values)
        : await createNoteAction(clientId, values);
      if (!res.ok) { setError(res.error ?? "Something went wrong."); return; }

      /* The task is a SEPARATE action and deliberately non-fatal: the note is
         already saved, so a task failure must report itself rather than read
         as a failed save and tempt the author into writing it twice. */
      const created = initial ? null : (res as Awaited<ReturnType<typeof createNoteAction>>).note;
      const noteId = initial?.id ?? created?.id;
      if (taskTitle.trim() && category) {
        const t = await createTaskAction({
          category,
          title: taskTitle.trim(),
          accountId: clientId,
          sourceType: noteId ? "note" : null,
          sourceId: noteId ?? null,
        });
        if (!t.ok) {
          setError(`Note saved, but the task wasn't created: ${t.error ?? "unknown error"}`);
          return;
        }
      }
      onSaved();
    } catch (e) {
      // Belt-and-suspenders: a thrown (not returned) error from a server
      // action should still surface rather than leave the button re-enabled
      // with nothing saved and no explanation.
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function close() { if (!busy) onClose(); }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-[15px] font-semibold text-fg">{initial ? "Edit note" : "New note"}</h2>
          <button onClick={close} aria-label="Close" className="rounded-md p-1 text-fg-muted hover:bg-bg-muted hover:text-fg">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          <div>
            <span className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">How did it happen?</span>
            <div className="flex flex-wrap gap-1.5">
              {NOTE_TYPE_META.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setType(m.id); if (!m.linkable) setMeetingId(""); }}
                    aria-pressed={type === m.id}
                    disabled={busy}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-body text-[12px] font-semibold transition-colors disabled:opacity-50",
                      type === m.id
                        ? "border-sirius bg-accent-soft text-info-fg"
                        : "border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg",
                    )}
                  >
                    <Icon size={12} aria-hidden /> {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">
              {type === "note" ? "Note" : "What was agreed or raised"}
            </label>
            <RichTextEditor
              value={body}
              onChange={setBody}
              onMentionQuery={setQuery}
              registerInsert={(fn) => { insertRef.current = fn; }}
              disabled={busy}
              autoFocus
              placeholder="What was agreed, what was raised, what the team should know…"
            />
            <MentionPicker query={query} people={people} onPick={pickMention} />
            <p className="m-0 mt-1.5 flex items-center gap-1.5 font-body text-[11.5px] text-fg-subtle">
              <Lock size={11} className="shrink-0" aria-hidden />
              Type @ to mention someone. Mentions don&rsquo;t grant access.
            </p>
          </div>

          {linkable && (
            <div>
              <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">
                Which meeting <span className="font-normal text-fg-subtle">— optional</span>
              </label>
              <select value={meetingId} onChange={(e) => setMeetingId(e.target.value)} disabled={busy} className={`${SELECT_CLS} w-full`}>
                <option value="">Not one of these</option>
                {meetingOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {(m.title ?? "Untitled meeting")}{m.startTime ? ` — ${formatDate(m.startTime)}` : ""}
                  </option>
                ))}
              </select>
              <p className="m-0 mt-1.5 font-body text-[11.5px] text-fg-subtle">
                Signal already has these from HubSpot. Linking one dates the note to the day it happened.
              </p>
            </div>
          )}

          {meta.event && !meetingId && (
            <div>
              <label htmlFor="note-when" className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">
                When did it happen?
              </label>
              <input
                id="note-when" type="date" value={occurred} max={todayISO()}
                onChange={(e) => setOccurred(e.target.value)} disabled={busy}
                className={SELECT_CLS}
              />
              <p className="m-0 mt-1.5 font-body text-[11.5px] text-fg-subtle">
                So it files on the day of the {meta.label.toLowerCase()}, not the day you wrote it up.
              </p>
            </div>
          )}

          {deals.length > 0 && (
            <div>
              <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">
                Related deal <span className="font-normal text-fg-subtle">— optional</span>
              </label>
              <select value={dealId} onChange={(e) => setDealId(e.target.value)} disabled={busy} className={`${SELECT_CLS} w-full`}>
                <option value="">No deal</option>
                {deals.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.id}</option>)}
              </select>
            </div>
          )}

          {!initial && (
            <div className="border-t border-border-subtle pt-4">
              <label htmlFor="note-task" className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">
                Create a task from this note <span className="font-normal text-fg-subtle">— optional</span>
              </label>
              <input
                id="note-task" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} disabled={busy}
                placeholder="e.g. Send the competency framework draft"
                className={`${SELECT_CLS} w-full`}
              />
              {taskTitle.trim() && (
                <>
                  <span className="mb-2 mt-3 block font-body text-[12px] font-semibold text-fg-muted">Focus area</span>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {TASK_CATEGORIES.map((c) => (
                      <button
                        key={c.id} type="button" onClick={() => setCategory(c.id)}
                        aria-pressed={category === c.id} disabled={busy}
                        className={cn(
                          "rounded-lg border px-2.5 py-2 text-left font-body text-[12px] font-semibold transition-colors disabled:opacity-50",
                          category === c.id
                            ? "border-sirius bg-accent-soft text-info-fg"
                            : "border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg",
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <p className="m-0 mt-2 font-body text-[11.5px] text-fg-subtle">
                    Nothing preselected — a note&rsquo;s words don&rsquo;t say which box its work belongs in.
                  </p>
                </>
              )}
            </div>
          )}

          {error && <p role="alert" className="font-body text-[12px] text-danger-fg">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button onClick={close} disabled={busy}
            className="rounded-lg border border-border px-3.5 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">
            Cancel
          </button>
          <Button size="sm" onClick={() => void save()} disabled={busy || isEmpty} iconLeft={busy ? undefined : Plus}>
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {initial ? "Save changes" : taskTitle.trim() ? "Save note + task" : "Add note"}
          </Button>
        </div>
      </div>
    </div>
  );
}
