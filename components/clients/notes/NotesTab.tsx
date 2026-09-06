"use client";

/* Notes tab — what was agreed, raised, or is worth knowing about an account.
   A note is the substance; the channel it arrived through (meeting, call,
   message, or none) is a field on it, and the meeting it may relate to is
   optional context rather than the subject. Signal already syncs 2,000+
   meetings from HubSpot and knows they happened; what it never held is what
   was said in them.

   WRITES ARE GATED on canEditClient at the server boundary (note-actions.ts,
   denyClientWrite). This component now takes `canEdit` and hides the controls
   to match — it previously showed Add/Edit/Delete to everyone who could open
   the profile, so a read-only Guest could compose a note and receive a raw
   permission error on save.

   Mutations call the server action then router.refresh() to reconcile — no
   optimistic cloning, since a modal-driven CRUD flow doesn't need Projects'
   drag-and-drop-grade instantaneity. */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import type { Deal, Meeting } from "@/lib/types";
import { noteDate, type Note, type NoteType } from "@/lib/notes/types";
import {
  deleteNoteAction, listMentionableForClientAction, type MentionablePerson,
} from "@/app/(app)/clients/[id]/note-actions";
import { EmptyState } from "@/components/clients/projects/shared";
import { NOTE_TYPE_META, noteMeta } from "./noteMeta";
import { NoteBody } from "./NoteBody";
import { NoteFormModal } from "./NoteFormModal";

export function NotesTab({ clientId, deals, meetings = [], notes, canEdit, lockReason }: {
  clientId: string;
  deals: Deal[];
  meetings?: Meeting[];
  notes: Note[];
  canEdit: boolean;
  lockReason?: string | null;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<NoteType | "all">("all");
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; note: Note } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [people, setPeople] = useState<MentionablePerson[]>([]);

  // The mentionable list is server-built and identical for every note on the
  // account, so it is fetched once here rather than per composer.
  useEffect(() => {
    let live = true;
    void listMentionableForClientAction(clientId).then((p) => { if (live) setPeople(p); });
    return () => { live = false; };
  }, [clientId]);

  const nameByEmail = useMemo(() => new Map(people.map((p) => [p.email, p.name])), [people]);
  const dealName = (dealId: string | null) =>
    dealId ? deals.find((d) => d.id === dealId)?.name ?? null : null;
  const meetingFor = (id: string | null) => (id ? meetings.find((m) => m.id === id) ?? null : null);

  /* Filter by CHANNEL. Attachment made a useless axis: on a typical account
     every note carries the same deal, so "All" and "Deals" returned the same
     rows. A chip only appears when something is behind it. */
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: notes.length };
    for (const m of NOTE_TYPE_META) c[m.id] = notes.filter((n) => n.type === m.id).length;
    return c;
  }, [notes]);
  const present = NOTE_TYPE_META.filter((m) => counts[m.id] > 0);
  const shown = filter === "all" ? notes : notes.filter((n) => n.type === filter);

  async function remove(note: Note) {
    if (!confirm("Delete this note? It will stop appearing on the account.")) return;
    setDeletingId(note.id);
    try {
      const res = await deleteNoteAction(clientId, note.id);
      if (!res.ok) {
        alert(res.error ?? "Failed to delete the note.");
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardEyebrow>Notes</CardEyebrow>
          <Badge tone="neutral">{notes.length}</Badge>
        </div>
        {canEdit ? (
          <Button size="sm" iconLeft={Plus} onClick={() => setModal({ mode: "create" })}>
            New note
          </Button>
        ) : (
          lockReason && <span className="font-body text-[12px] text-fg-subtle">{lockReason}</span>
        )}
      </div>

      {present.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {[{ id: "all" as const, label: "All", icon: null }, ...present].map((t) => {
            const Icon = "icon" in t ? t.icon : null;
            return (
              <button
                key={t.id}
                onClick={() => setFilter(t.id as NoteType | "all")}
                aria-pressed={filter === t.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-body text-[12px] font-semibold transition-colors",
                  filter === t.id
                    ? "border-sirius bg-accent-soft text-info-fg"
                    : "border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {Icon && <Icon size={11} aria-hidden />}
                {t.label} <span className="font-normal opacity-60 tabular-nums">{counts[t.id]}</span>
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title={filter === "all" ? "Nothing recorded yet" : "Nothing of that kind yet"}
          body="What was agreed, what was raised, what the rest of the team should know — from a call, an email, a message or a meeting."
        />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {shown.map((n) => {
            const meta = noteMeta(n.type);
            const TypeIcon = meta.icon;
            const deal = dealName(n.dealId);
            const meeting = meetingFor(n.meetingId);
            const edited = n.updatedAt !== n.createdAt;
            return (
              <li key={n.id} className="flex overflow-hidden rounded-xl border border-border-subtle bg-surface">
                <span className={cn("w-[3px] shrink-0", meta.stripe)} aria-hidden />
                <div className="min-w-0 flex-1 px-4 py-3.5">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2 font-body text-[12px] text-fg-subtle">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold", meta.chip)}>
                        <TypeIcon size={10} aria-hidden /> {meta.label}
                      </span>
                      {deal && <Badge tone="neutral">{deal}</Badge>}
                      <span className="font-semibold text-fg-muted">
                        {n.createdByName ?? n.createdByEmail ?? "Unknown"}
                      </span>
                      <span aria-hidden>·</span>
                      {/* The date the thing HAPPENED, falling back to when it
                          was written — which is every note authored before
                          occurred_at existed. */}
                      <span title={n.occurredAt ? `Happened ${n.occurredAt}` : `Written ${n.createdAt}`}>
                        {formatDate(noteDate(n))}
                      </span>
                      {edited && <span>(edited)</span>}
                    </div>
                    {canEdit && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => setModal({ mode: "edit", note: n })} title="Edit note"
                          className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => void remove(n)} disabled={deletingId === n.id} title="Delete note"
                          className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted hover:text-danger-fg disabled:opacity-50">
                          {deletingId === n.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    )}
                  </div>

                  {meeting && (
                    <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-border-subtle bg-surface-sunken px-3 py-1.5 font-body text-[11.5px] text-fg-muted">
                      <span className="font-semibold text-fg">{meeting.title ?? "Meeting"}</span>
                      {meeting.startTime && (
                        <>
                          <span className="text-border-strong" aria-hidden>·</span>
                          <span>{formatDate(meeting.startTime)}</span>
                        </>
                      )}
                    </div>
                  )}

                  {/* Sanitized server-side (lib/notes/sanitize.ts) before ever
                      reaching the database. */}
                  <NoteBody html={n.body} people={nameByEmail} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {modal && (
        <NoteFormModal
          clientId={clientId}
          deals={deals}
          meetings={meetings}
          people={people}
          initial={modal.mode === "edit" ? modal.note : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); router.refresh(); }}
        />
      )}
    </Card>
  );
}
