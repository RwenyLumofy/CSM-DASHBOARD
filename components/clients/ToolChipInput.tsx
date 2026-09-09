"use client";

/* =========================================================================
   Tool entry box — type a name, it becomes a chip.

   Used by the client profile's Tech stack section. Deliberately always-live
   rather than the click-to-edit treatment the rest of the profile's fields
   use: recording a stack is a list-building job, not a single-value
   correction, and a CSM on a call needs to dump four tool names without
   opening and closing an editor four times.

   Matching known tools surface as you type, but the box never refuses free
   text — an in-house portal is exactly the thing worth writing down.
   ========================================================================= */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";

/** How long the "saved" tick lingers after a successful write. */
const SAVED_TICK_MS = 1600;

export function ToolChipInput({
  label,
  value,
  suggestions,
  placeholder,
  onCommit,
}: {
  label: string;
  /** Already normalized by the caller (see normalizeTools). */
  value: string[];
  /** Offered as you type. Not a closed list — free text is always accepted. */
  suggestions: string[];
  placeholder: string;
  /** Persists the new list. Resolves false to roll the chip back. */
  onCommit: (next: string[]) => Promise<boolean>;
}) {
  const [tools, setTools] = useState<string[]>(value);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  /* null until the user actually arrows/hovers into the list. Enter falls back
     to the raw text while it's null, so typing "Workday Extra" adds that —
     not the "Workday" that happens to sit at the top of the matches. */
  const [highlight, setHighlight] = useState<number | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  /* Leaving the box commits whatever is half-typed, so a name isn't lost to a
     stray click — but that commit has to lose to a suggestion click. Blur beats
     click, and committing immediately re-renders the row out from under the
     mouse, so "gree" + a click on "Greenhouse" filed a chip called "gree" and
     then swallowed the click. Deferring the commit and letting the suggestion
     cancel it makes the outcome independent of which event lands first. */
  const blurCommit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelBlurCommit = () => {
    if (blurCommit.current) clearTimeout(blurCommit.current);
    blurCommit.current = null;
  };
  useEffect(() => cancelBlurCommit, []);
  const listId = useId();

  /* A tool the account already has is not a useful suggestion, and matching is
     case-insensitive so "workday" doesn't re-offer "Workday". */
  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase();
    const taken = new Set(tools.map((t) => t.toLowerCase()));
    return suggestions
      .filter((s) => !taken.has(s.toLowerCase()))
      .filter((s) => (q ? s.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [draft, suggestions, tools]);

  useEffect(() => setHighlight(null), [draft]);

  // Close the suggestion list on an outside click, not on blur — blur fires
  // before the click lands on a suggestion and would eat the selection.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (status !== "saved") return;
    const t = setTimeout(() => setStatus("idle"), SAVED_TICK_MS);
    return () => clearTimeout(t);
  }, [status]);

  async function persist(next: string[], previous: string[]) {
    setStatus("saving");
    const ok = await onCommit(next);
    if (!ok) {
      setTools(previous); // The write failed — don't leave a chip that isn't stored.
      setStatus("idle");
      return;
    }
    setStatus("saved");
  }

  /**
   * Files one or more chips. Splits on commas so pasting "Workday, BambooHR,
   * Personio" out of a discovery-call note lands as three chips instead of one
   * long one, and so a stray trailing comma doesn't end up inside a tool name.
   */
  function add(raw: string) {
    setDraft("");
    const seen = new Set(tools.map((t) => t.toLowerCase()));
    const additions: string[] = [];
    for (const part of raw.split(",")) {
      const clean = part.trim();
      if (!clean || seen.has(clean.toLowerCase())) continue;
      seen.add(clean.toLowerCase());
      additions.push(clean);
    }
    if (additions.length === 0) return;
    const previous = tools;
    const next = [...tools, ...additions];
    setTools(next);
    void persist(next, previous);
  }

  function remove(name: string) {
    const previous = tools;
    const next = tools.filter((t) => t !== name);
    setTools(next);
    void persist(next, previous);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const picked = highlight != null ? matches[highlight] : null;

    if (e.key === "Enter" || e.key === ",") {
      const typed = draft.trim();
      if (!picked && !typed) return;
      e.preventDefault();
      add(picked ?? typed);
      return;
    }
    if (e.key === "ArrowDown") {
      if (matches.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (h == null ? 0 : Math.min(h + 1, matches.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      if (matches.length === 0) return;
      e.preventDefault();
      setHighlight((h) => (h == null || h === 0 ? null : h - 1));
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    // Backspace on an empty box pulls the last chip back for editing rather
    // than silently deleting it — a mis-typed name is fixable in place.
    if (e.key === "Backspace" && !draft && tools.length > 0) {
      e.preventDefault();
      const last = tools[tools.length - 1];
      remove(last);
      setDraft(last);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
        {tools.length > 0 && (
          <span className="tabular font-body text-[11px] font-semibold text-fg-subtle">{tools.length}</span>
        )}
        <span className="ml-auto flex h-3.5 items-center">
          {status === "saving" && <Loader2 size={12} className="animate-spin text-fg-subtle" />}
          {status === "saved" && <Check size={12} className="text-sirius" />}
        </span>
      </div>

      <div
        ref={boxRef}
        onClick={() => inputRef.current?.focus()}
        className="relative flex cursor-text flex-wrap items-center gap-1.5 rounded-[10px] border border-border bg-bg px-2 py-1.5 transition-colors focus-within:border-sirius focus-within:ring-2 focus-within:ring-sirius/15 hover:border-sirius-200"
      >
        {tools.map((t) => (
          <span
            key={t}
            className="inline-flex max-w-full items-center gap-1 rounded-pill bg-accent-soft py-0.5 pl-2 pr-1 font-body text-[12.5px] font-semibold text-sirius"
          >
            <span className="truncate">{t}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); cancelBlurCommit(); remove(t); }}
              title={`Remove ${t}`}
              aria-label={`Remove ${t}`}
              className="grid size-4 shrink-0 place-items-center rounded-full text-sirius/60 transition-colors hover:bg-sirius hover:text-white"
            >
              <X size={10} strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setOpen(true); }}
          onFocus={() => { cancelBlurCommit(); setOpen(true); }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            const typed = draft;
            cancelBlurCommit();
            blurCommit.current = setTimeout(() => { blurCommit.current = null; add(typed); }, 150);
          }}
          placeholder={tools.length === 0 ? placeholder : "Add another…"}
          role="combobox"
          aria-expanded={open && matches.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          className="min-w-[7rem] flex-1 bg-transparent py-0.5 font-body text-[13px] text-fg outline-none placeholder:text-fg-subtle"
        />

        {open && matches.length > 0 && (
          <div
            id={listId}
            role="listbox"
            className="absolute left-0 top-full z-30 mt-1.5 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-xl"
          >
            {matches.map((s, i) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={(e) => { cancelBlurCommit(); e.preventDefault(); }}
                onClick={() => { cancelBlurCommit(); add(s); inputRef.current?.focus(); }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left font-body text-[13px] transition-colors",
                  i === highlight ? "bg-accent-soft text-sirius" : "text-fg hover:bg-bg-muted",
                )}
              >
                <Plus size={11} className="shrink-0 opacity-60" />
                <span className="truncate">{s}</span>
              </button>
            ))}
            {draft.trim() && highlight == null && !matches.some((m) => m.toLowerCase() === draft.trim().toLowerCase()) && (
              <div className="mt-1 border-t border-border-subtle px-3 pb-0.5 pt-1.5 font-body text-[11px] text-fg-subtle">
                Press Enter to add &ldquo;{draft.trim()}&rdquo;
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
