"use client";

/* Notes tab — HubSpot-style rich-text notes on a client, optionally tagged to
   one of the account's deals for filtering. Any user who can view the client
   profile can add/edit/delete a note (guard() in note-actions.ts scopes that
   at the server boundary); this tab has no separate canManage gate, matching
   the Attachments/Contacts tabs it's modeled after. Notes come straight from
   the server-fetched `notes` prop; mutations call the server action then
   router.refresh() to reconcile — no local optimistic cloning, since a
   modal-driven CRUD flow doesn't need Projects' drag-and-drop-grade
   instantaneity. */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, StickyNote, Trash2, X } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { relativeTime } from "@/lib/format";
import type { Deal } from "@/lib/types";
import type { Note, NoteInput } from "@/lib/notes/types";
import { createNoteAction, deleteNoteAction, updateNoteAction } from "@/app/(app)/clients/[id]/note-actions";
import { EmptyState } from "@/components/clients/projects/shared";
import { RichTextEditor } from "./RichTextEditor";

const SELECT_CLS =
  "rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none ring-sirius focus:ring-2";

export function NotesTab({ clientId, deals, notes }: { clientId: string; deals: Deal[]; notes: Note[] }) {
  const router = useRouter();
  const [dealFilter, setDealFilter] = useState("");
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; note: Note } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const dealName = (dealId: string | null) => (dealId ? deals.find((d) => d.id === dealId)?.name ?? "Untitled deal" : null);
  const filtered = dealFilter ? notes.filter((n) => n.dealId === dealFilter) : notes;
  const dealsWithNotes = useMemo(() => {
    const ids = new Set(notes.map((n) => n.dealId).filter((id): id is string => !!id));
    return deals.filter((d) => ids.has(d.id));
  }, [deals, notes]);

  async function submit(values: NoteInput, editing: Note | null): Promise<{ ok: boolean; error?: string }> {
    const res = editing ? await updateNoteAction(clientId, editing.id, values) : await createNoteAction(clientId, values);
    if (res.ok) router.refresh();
    return res;
  }

  async function remove(note: Note) {
    if (!confirm("Delete this note? This can't be undone.")) return;
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
        <div className="flex items-center gap-2">
          {dealsWithNotes.length > 0 && (
            <select value={dealFilter} onChange={(e) => setDealFilter(e.target.value)} className={SELECT_CLS}>
              <option value="">All deals</option>
              {dealsWithNotes.map((d) => (
                <option key={d.id} value={d.id}>{d.name ?? d.id}</option>
              ))}
            </select>
          )}
          <Button size="sm" iconLeft={Plus} onClick={() => setModal({ mode: "create" })}>
            Add note
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title={dealFilter ? "No notes for this deal" : "No notes yet"}
          body="Capture call summaries, account updates, and pinned context here — a running notes feed authored by the CS team, formatted with rich text."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((n) => {
            const deal = dealName(n.dealId);
            return (
              <li key={n.id} className="rounded-xl border border-border-subtle p-4">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2 font-body text-[12px] text-fg-subtle">
                    <span className="font-semibold text-fg-muted">{n.createdByName ?? n.createdByEmail ?? "Unknown"}</span>
                    <span>·</span>
                    <span title={n.updatedAt}>{relativeTime(n.updatedAt)}{n.updatedAt !== n.createdAt ? " (edited)" : ""}</span>
                    {deal && <Badge tone="neutral">{deal}</Badge>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => setModal({ mode: "edit", note: n })} title="Edit note" className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => remove(n)} disabled={deletingId === n.id} title="Delete note" className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted hover:text-[#B23A57] disabled:opacity-50">
                      {deletingId === n.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
                {/* Sanitized server-side (lib/notes/sanitize.ts) before ever reaching the DB. */}
                <div className="note-body font-body text-[13px] text-fg" dangerouslySetInnerHTML={{ __html: n.body }} />
              </li>
            );
          })}
        </ul>
      )}

      {modal && (
        <NoteFormModal
          deals={deals}
          initial={modal.mode === "edit" ? modal.note : null}
          onClose={() => setModal(null)}
          onSubmit={(values) => submit(values, modal.mode === "edit" ? modal.note : null)}
        />
      )}
    </Card>
  );
}

function NoteFormModal({
  deals,
  initial,
  onClose,
  onSubmit,
}: {
  deals: Deal[];
  initial: Note | null;
  onClose: () => void;
  onSubmit: (values: NoteInput) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [body, setBody] = useState(initial?.body ?? "");
  const [dealId, setDealId] = useState(initial?.dealId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmpty = body.replace(/<[^>]*>/g, "").trim().length === 0;

  async function save() {
    if (isEmpty) {
      setError("The note can't be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onSubmit({ body, dealId: dealId || null });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (!busy) onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-[15px] font-semibold text-fg">{initial ? "Edit note" : "New note"}</h2>
          <button onClick={close} className="rounded-md p-1 text-fg-muted hover:bg-bg-muted hover:text-fg">
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {deals.length > 0 && (
            <div>
              <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">Related deal (optional)</label>
              <select value={dealId} onChange={(e) => setDealId(e.target.value)} disabled={busy} className={`${SELECT_CLS} w-full`}>
                <option value="">No deal</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>{d.name ?? d.id}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">Note</label>
            <RichTextEditor value={body} onChange={setBody} disabled={busy} autoFocus />
          </div>
          {error && <p className="font-body text-[12px] text-[#B23A57]">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
          <button onClick={close} disabled={busy} className="rounded-lg border border-border px-3.5 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">
            Cancel
          </button>
          <Button size="sm" onClick={save} disabled={busy || isEmpty}>
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {initial ? "Save changes" : "Add note"}
          </Button>
        </div>
      </div>
    </div>
  );
}
