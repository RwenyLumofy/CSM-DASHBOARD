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

   Because there is no Save button, a failed write has nothing to fall back
   on: the chip is rolled out again, and the reason is shown under the box.
   A viewer who cannot edit the account gets a read-only list rather than
   inputs that would 403 on the first keystroke.
   ========================================================================= */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";

/** How long the "saved" tick lingers after a successful write. */
const SAVED_TICK_MS = 1600;

export function ToolChipInput({
  label,
  value,
  suggestions,
  placeholder,
  canEdit,
  onCommit,
}: {
  label: string;
  /** Already normalized by the caller (see normalizeTools). */
  value: string[];
  /** Offered as you type. Not a closed list — free text is always accepted. */
  suggestions: string[];
  placeholder: string;
  /** Server-resolved write gate. False renders the list, not an editor. */
  canEdit: boolean;
  /** Persists the new list. Resolves null on success, or the reason to show
   *  the user — the chip is rolled back either way. */
  onCommit: (next: string[]) => Promise<string | null>;
}) {
  const [tools, setTools] = useState<string[]>(value);
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  /* Which suggestion is lit up. Set by arrowing AND by hovering, because both
     should look the same to the eye. */
  const [highlight, setHighlight] = useState<number | null>(null);
  /* ...but only ARROWING arms Enter. A hover is where the mouse happens to be
     resting, not a choice: with the pointer left over the list, typing your own
     tool and pressing Enter used to file whatever sat under the cursor. Enter
     falls back to the raw text unless you actually picked something, so
     "Workday Extra" adds that — not the "Workday" the list is offering. */
  const [pickedByKey, setPickedByKey] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => { setHighlight(null); setPickedByKey(false); }, [draft]);

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
    setError(null);
    const failure = await onCommit(next);
    if (failure) {
      // Roll the chip back — it isn't stored — and say why, or the list just
      // flickers and the CSM believes a stack they never recorded.
      setTools(previous);
      setStatus("idle");
      setError(failure);
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
    const picked = pickedByKey && highlight != null ? matches[highlight] : null;

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
      setPickedByKey(true);
      setHighlight((h) => (h == null || !pickedByKey ? 0 : Math.min(h + 1, matches.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      if (matches.length === 0) return;
      e.preventDefault();
      // Arrowing back off the top returns to what you typed.
      setHighlight((h) => (h == null || h === 0 ? null : h - 1));
      setPickedByKey((k) => (highlight === 0 ? false : k));
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
          {canEdit && status === "saving" && <Loader2 size={12} className="animate-spin text-fg-subtle" />}
          {canEdit && status === "saved" && <Check size={12} className="text-sirius" />}
        </span>
      </div>

      {!canEdit ? (
        tools.length === 0 ? (
          <span className="font-body text-[13px] text-fg-subtle">—</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {tools.map((t) => (
              <span
                key={t}
                className="inline-flex max-w-full items-center rounded-pill bg-bg-muted px-2 py-0.5 font-body text-[12.5px] font-semibold text-fg-muted"
              >
                <span className="truncate">{t}</span>
              </span>
            ))}
          </div>
        )
      ) : (
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
            {/* The list is a typing aid, not the menu of what may be recorded.
                Said once, at the top, so an in-house tool with no entry here
                doesn't read as unsupported. */}
            <div className="border-b border-border-subtle px-3 pb-1.5 pt-1 font-body text-[11px] text-fg-subtle">
              Suggestions — or type any tool and press Enter
            </div>
            {matches.map((s, i) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={i === highlight}
                onMouseEnter={() => setHighlight(i)} /* lights it up; does not arm Enter */
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
            {draft.trim() && !pickedByKey && !matches.some((m) => m.toLowerCase() === draft.trim().toLowerCase()) && (
              <div className="mt-1 border-t border-border-subtle px-3 pb-0.5 pt-1.5 font-body text-[11px] text-fg-subtle">
                Press Enter to add &ldquo;{draft.trim()}&rdquo;
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {error && (
        <span className="flex items-start gap-1.5 font-body text-[12px] text-danger-fg">
          <AlertCircle size={12} className="mt-[2px] shrink-0" />
          <span>{error}</span>
        </span>
      )}
    </div>
  );
}
