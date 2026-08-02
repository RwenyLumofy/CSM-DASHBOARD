"use client";

/* =========================================================================
   The conversation on a task — updates, and the people named in them.

   WHY THIS EXISTS. The account Tasks sidebar lists tasks across owners, so two
   people routinely see a task only one of them can act on, with no way to say
   anything about it or reach the other. That discussion happens in Slack today
   and the account record never learns from it.

   MENTIONING SOMEBODY GRANTS THEM NOTHING (team decision, 2026-08-02). The
   picker only ever offers people who can already see the account — the server
   builds that list and re-checks it on post, so this component cannot widen
   anyone's access even if it tried.

   Flat and chronological. A task thread is three messages, not thirty, so
   nesting, reactions and editing would cost more than they return.
   ========================================================================= */

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Lock, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  getTaskUpdatesAction, postTaskUpdateAction, deleteTaskUpdateAction,
  listMentionableForTaskAction,
  type TaskUpdateView, type MentionablePerson,
} from "@/app/(app)/today/task-update-actions";

const initials = (s: string) =>
  s.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0] ?? "").join("").toUpperCase() || "?";

const ago = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
};

/** Draw `@[email]` tokens as chips and leave everything else as text. The token
 *  is the stored form precisely so a rename never breaks a mention — the email
 *  is the identity, the name is display. */
function Body({ text, nameByEmail }: { text: string; nameByEmail: Map<string, string> }) {
  const parts = useMemo(() => {
    const out: { t: "text" | "mention"; v: string }[] = [];
    const re = /@\[([^\]]+)\]/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: "text", v: text.slice(last, m.index) });
      out.push({ t: "mention", v: m[1].toLowerCase() });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: "text", v: text.slice(last) });
    return out;
  }, [text]);

  return (
    <p dir="auto" className="mt-0.5 whitespace-pre-wrap font-body text-[13px] leading-relaxed text-fg">
      {parts.map((p, i) => p.t === "text" ? p.v : (
        // An unresolvable token falls back to the raw email rather than
        // vanishing — a mention that disappears rewrites what someone said.
        <span key={i} className="rounded bg-accent-soft px-1.5 py-0.5 font-medium text-sirius">
          @{nameByEmail.get(p.v) ?? p.v}
        </span>
      ))}
    </p>
  );
}

export function TaskUpdates({ taskId, canPost, preview }: {
  taskId: string;
  canPost: boolean;
  /* DEV PREVIEW ONLY — app/scratch-tasks. Reading or posting a thread needs a
     Clerk session, and a local environment has none, so there is otherwise no
     way to look at this component before it is deployed. When set, it renders
     from the supplied data and keeps posts in memory. No shipping caller
     passes it; the server is untouched either way. */
  preview?: { updates: TaskUpdateView[]; people: MentionablePerson[] };
}) {
  const [updates, setUpdates] = useState<TaskUpdateView[] | null>(null);
  const [people, setPeople] = useState<MentionablePerson[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Display name → email for everyone inserted from the picker. The textarea
     shows "@Qasim" because "@qalshakhoori@lumofy.com" is unreadable while
     typing; this converts back on submit. Two people with the identical display
     name would resolve to one of them — bounded, because the server re-checks
     every token against who may be mentioned at all, so the worst case notifies
     a colleague who can already see the account. */
  const picked = useRef<Map<string, string>>(new Map());
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);

  useEffect(() => {
    if (preview) { setUpdates(preview.updates); setPeople(preview.people); return; }
    let live = true;
    void Promise.all([getTaskUpdatesAction(taskId), listMentionableForTaskAction(taskId)])
      .then(([u, p]) => { if (live) { setUpdates(u); setPeople(p); } });
    return () => { live = false; };
  }, [taskId, preview]);

  const nameByEmail = useMemo(() => new Map(people.map((p) => [p.email, p.name])), [people]);

  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.includes(q)).slice(0, 6);
  }, [people, query]);

  /** The word being typed after an "@", or null when the caret isn't in one. */
  function onType(value: string) {
    setDraft(value);
    const caret = boxRef.current?.selectionStart ?? value.length;
    const upto = value.slice(0, caret);
    const m = /@([\p{L}\p{N}._-]*)$/u.exec(upto);
    setQuery(m ? m[1] : null);
  }

  function insert(person: MentionablePerson) {
    const caret = boxRef.current?.selectionStart ?? draft.length;
    const upto = draft.slice(0, caret);
    const start = upto.lastIndexOf("@");
    if (start < 0) return;
    picked.current.set(person.name, person.email);
    const next = `${draft.slice(0, start)}@${person.name} ${draft.slice(caret)}`;
    setDraft(next);
    setQuery(null);
    queueMicrotask(() => {
      boxRef.current?.focus();
      const pos = start + person.name.length + 2;
      boxRef.current?.setSelectionRange(pos, pos);
    });
  }

  async function post() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true); setError(null);
    // Longest names first, so "@Qais Malallah" isn't half-consumed by "@Qais".
    let body = text;
    for (const [name, email] of [...picked.current].sort((a, b) => b[0].length - a[0].length)) {
      body = body.split(`@${name}`).join(`@[${email}]`);
    }

    if (preview) {
      // Same token conversion, same renderer — only the round-trip is skipped,
      // so what you see posted here is what the real one draws.
      setUpdates((prev) => [...(prev ?? []), {
        id: `preview-${(prev?.length ?? 0) + 1}`, authorEmail: "you@lumofy.com", authorName: "You",
        body, createdAt: new Date().toISOString(), editedAt: null, deleted: false, mine: true,
      }]);
      setDraft(""); picked.current.clear(); setBusy(false);
      return;
    }

    const r = await postTaskUpdateAction(taskId, body);
    setBusy(false);
    if (!r.ok) { setError(r.error ?? "Couldn't post that."); return; }
    setDraft(""); picked.current.clear();
    setUpdates(await getTaskUpdatesAction(taskId));
  }

  async function remove(id: string) {
    if (!window.confirm("Remove this update?")) return;
    setError(null);
    if (preview) { setUpdates((prev) => (prev ?? []).map((u) => u.id === id ? { ...u, deleted: true } : u)); return; }
    const r = await deleteTaskUpdateAction(id);
    if (!r.ok) { setError(r.error ?? "Couldn't remove that."); return; }
    setUpdates(await getTaskUpdatesAction(taskId));
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
      {updates === null ? (
        <p className="font-body text-[12px] text-fg-subtle">Loading updates…</p>
      ) : updates.length === 0 ? (
        <p className="font-body text-[12px] text-fg-subtle">
          No updates yet. Post one to tell whoever else is watching this account where it stands.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {updates.map((u) => (
            <li key={u.id} className="flex gap-2.5">
              <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full font-body text-[10px] font-bold",
                u.deleted ? "bg-bg-muted text-fg-subtle" : "bg-accent-soft text-sirius")}>
                {initials(u.authorName)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span dir="auto" className="font-body text-[12.5px] font-semibold text-fg">{u.authorName}</span>
                  <span className="font-body text-[11px] text-fg-subtle">{ago(u.createdAt)}</span>
                  {u.editedAt && <span className="font-body text-[11px] text-fg-subtle">edited</span>}
                  {u.mine && !u.deleted && (
                    <button onClick={() => void remove(u.id)} aria-label="Remove this update"
                      className="ml-auto text-fg-subtle hover:text-[#B23A57]"><Trash2 size={12} /></button>
                  )}
                </div>
                {u.deleted
                  ? <p className="mt-0.5 font-body text-[12.5px] italic text-fg-subtle">Update removed</p>
                  : <Body text={u.body} nameByEmail={nameByEmail} />}
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="rounded-lg border border-[#B23A57]/30 bg-[#B23A57]/5 px-2.5 py-1.5 font-body text-[11.5px] text-[#B23A57]">
          {error}
        </p>
      )}

      {canPost && (
        <div className="relative flex flex-col gap-1.5">
          <textarea
            ref={boxRef} rows={2} value={draft} disabled={busy}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query !== null) { e.stopPropagation(); setQuery(null); }
              // Enter posts; Shift+Enter is a newline. A task update is a
              // sentence, so reaching for a button every time is friction.
              if (e.key === "Enter" && !e.shiftKey && query === null) { e.preventDefault(); void post(); }
            }}
            placeholder="Add an update — type @ to mention someone"
            className="w-full rounded-lg border border-border bg-bg px-2.5 py-2 font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle focus:border-sirius"
          />

          {query !== null && matches.length > 0 && (
            <div className="absolute bottom-[52px] z-30 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
              <p className="border-b border-border-subtle px-2.5 py-1.5 font-body text-[10.5px] text-fg-subtle">
                People who can see this account
              </p>
              {matches.map((p) => (
                <button key={p.email} type="button" onClick={() => insert(p)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-bg-muted">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft font-body text-[9px] font-bold text-sirius">
                    {initials(p.name)}
                  </span>
                  <span dir="auto" className="min-w-0 flex-1 truncate font-body text-[12.5px] text-fg">{p.name}</span>
                  <span className="truncate font-body text-[11px] text-fg-subtle">{p.email}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="flex flex-1 items-center gap-1.5 font-body text-[11px] text-fg-subtle">
              <Lock size={11} aria-hidden /> Mentioning someone doesn&rsquo;t give them access
            </span>
            <button onClick={() => void post()} disabled={busy || !draft.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12px] font-semibold text-white disabled:opacity-50">
              {busy && <Loader2 size={11} className="animate-spin" />} Post update
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
