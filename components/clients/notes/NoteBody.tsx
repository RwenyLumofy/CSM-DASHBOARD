"use client";

/* A note's sanitized HTML, with `@[email]` tokens drawn as chips and long
   bodies clamped behind a "View more".

   WHY BOTH IN ONE PLACE. The body is HTML (sanitized server-side in
   lib/notes/sanitize.ts) but the mention tokens are plain text inside it, so
   the chips have to be substituted into the markup rather than composed as
   React children. Doing that in one component keeps exactly one place where
   note HTML meets dangerouslySetInnerHTML.

   Notes really are long — production averages 662 characters and runs to
   3,422 — so an unclamped feed is a wall of text. Clamping without a way to
   finish reading would lose the content that is the whole point, hence the
   toggle rather than a hard truncation. */

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** Roughly four lines at the tab's body size. */
const CLAMP_PX = 88;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Swap `@[email]` for a chip. Runs over already-sanitized HTML, and every
 *  interpolated value is escaped, so this cannot reintroduce markup. */
function renderMentions(html: string, nameByEmail: Map<string, string>): string {
  return html.replace(/@\[([^\]\s]+@[^\]\s]+)\]/g, (_whole, raw: string) => {
    const email = raw.trim().toLowerCase();
    // An unresolvable token falls back to the raw email rather than vanishing:
    // a mention that disappears rewrites what somebody wrote.
    const label = escapeHtml(nameByEmail.get(email) ?? email);
    return `<span class="rounded bg-accent-soft px-1.5 py-0.5 font-medium text-sirius">@${label}</span>`;
  });
}

export function NoteBody({ html, people }: {
  html: string;
  /** email → display name, for drawing the chips. */
  people: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [clampable, setClampable] = useState(false);
  const rendered = useMemo(() => renderMentions(html, people), [html, people]);

  return (
    <div>
      <div
        ref={(el) => {
          // Measured, not guessed from character count: what overflows depends
          // on the rendered markup, not the length of the source string.
          if (el) setClampable(el.scrollHeight > CLAMP_PX + 8);
        }}
        style={open ? undefined : { maxHeight: CLAMP_PX, overflow: "hidden" }}
        className="note-body font-body text-[13px] text-fg"
        dangerouslySetInnerHTML={{ __html: rendered }}
      />
      {clampable && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-1.5 inline-flex items-center gap-1 font-body text-[11.5px] font-semibold text-sirius hover:underline"
        >
          {open ? "View less" : "View more"}
          <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      )}
    </div>
  );
}
