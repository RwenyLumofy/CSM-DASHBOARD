"use client";

/* The "@" picker for the note composer.

   Mirrors the task-update picker deliberately, including its wording: the
   list is built on the SERVER from people who can already see the account
   (listMentionableForClientAction), so this component cannot widen anyone's
   access even if it tried, and the action re-checks every token on write.

   The editor shows "@Sakina Asghar" because "@sasghar@lumofy.com" is
   unreadable while typing; the parent converts the display name back to the
   stored `@[email]` token on submit. */

import { useMemo } from "react";
import type { MentionablePerson } from "@/app/(app)/clients/[id]/note-actions";

export const initials = (s: string) =>
  s.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0] ?? "").join("").toUpperCase() || "?";

export function MentionPicker({ query, people, onPick }: {
  /** The word typed after "@", or null when the caret isn't in a mention. */
  query: string | null;
  people: MentionablePerson[];
  onPick: (p: MentionablePerson) => void;
}) {
  const matches = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return people.filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.includes(q)).slice(0, 6);
  }, [query, people]);

  if (query === null || matches.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 z-40 overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
      <p className="m-0 border-b border-border-subtle px-2.5 py-1.5 font-body text-[10.5px] text-fg-subtle">
        People who can see this account
      </p>
      {matches.map((p) => (
        <button
          key={p.email}
          type="button"
          // Don't steal the caret from the editor before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(p)}
          className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-bg-muted"
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft font-body text-[9px] font-bold text-sirius">
            {initials(p.name)}
          </span>
          <span dir="auto" className="min-w-0 flex-1 truncate font-body text-[12.5px] text-fg">{p.name}</span>
          <span className="truncate font-body text-[11px] text-fg-subtle">{p.email}</span>
        </button>
      ))}
    </div>
  );
}
