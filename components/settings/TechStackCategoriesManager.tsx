"use client";

/* =========================================================================
   Settings → Tech stack categories.

   Defines the boxes every account's Client Profile → General information →
   Tech stack section offers. Follows AttachmentCategoriesManager: each change
   PUTs the whole list to workspace_config, and an empty list reads back as the
   shipped defaults rather than a blank section.

   The one thing this must never do is change a category's `key` — that key is
   the clients.properties key holding every account's recorded tools, so a
   rename edits the label only. Removing a category likewise leaves the data
   in place; it just stops being offered, which is what the confirm says.
   ========================================================================= */

import { useState } from "react";
import { Check, ChevronDown, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  DEFAULT_TECH_STACK_CATEGORIES,
  TECH_STACK_CONFIG_KEY,
  placeholderFor,
  techStackKeyFor,
  normalizeTools,
  type TechStackField,
} from "@/lib/tech-stack";

/** What we send to workspace_config — placeholder is derived on read, not stored. */
type StoredCategory = { key: string; label: string; suggestions: string[] };

const toStored = (c: TechStackField): StoredCategory => ({ key: c.key, label: c.label, suggestions: c.suggestions });

export function TechStackCategoriesManager({ initialCategories }: { initialCategories: TechStackField[] }) {
  const [categories, setCategories] = useState<TechStackField[]>(
    initialCategories.length > 0 ? initialCategories : DEFAULT_TECH_STACK_CATEGORIES,
  );
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(next: TechStackField[]): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stakeholder-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: TECH_STACK_CONFIG_KEY, value: next.map(toStored) }),
      });
      if (!res.ok) {
        setError(res.status === 403 ? "Only an admin can change these." : `Save failed (HTTP ${res.status}).`);
        return false;
      }
      setCategories(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch {
      setError("Couldn't reach the server — nothing was saved.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveLabel() {
    const label = editLabel.trim();
    if (!label) { setError("A category needs a name."); return; }
    if (categories.some((c) => c.key !== editKey && c.label.toLowerCase() === label.toLowerCase())) {
      setError("Another category already has that name."); return;
    }
    // Key deliberately untouched — the recorded tools live under it.
    const next = categories.map((c) =>
      c.key === editKey ? { ...c, label, placeholder: placeholderFor(label, c.suggestions) } : c,
    );
    if (await persist(next)) setEditKey(null);
  }

  async function addCategory() {
    const label = newLabel.trim();
    if (!label) return;
    if (categories.some((c) => c.label.toLowerCase() === label.toLowerCase())) {
      setError("A category with that name already exists."); return;
    }
    const key = techStackKeyFor(label, categories.map((c) => c.key));
    const next = [...categories, { key, label, suggestions: [], placeholder: placeholderFor(label, []) }];
    if (await persist(next)) { setNewLabel(""); setAdding(false); setExpanded(key); }
  }

  async function remove(cat: TechStackField) {
    if (!confirm(
      `Remove "${cat.label}"?\n\nTools already recorded under it on any account are kept in the database, ` +
      `but the box stops appearing on every client profile — so nobody can see or edit them until the ` +
      `category is added back.`,
    )) return;
    await persist(categories.filter((c) => c.key !== cat.key));
  }

  async function saveSuggestions(cat: TechStackField, raw: string) {
    const suggestions = normalizeTools(raw.split("\n").join(","));
    const next = categories.map((c) =>
      c.key === cat.key ? { ...c, suggestions, placeholder: placeholderFor(c.label, suggestions) } : c,
    );
    await persist(next);
  }

  async function move(idx: number, delta: number) {
    const target = idx + delta;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[idx], next[target]] = [next[target], next[idx]];
    await persist(next);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border">
        {categories.map((cat, idx) => (
          <div key={cat.key} className="flex flex-col">
            <div className="flex items-center gap-2 px-3 py-2.5">
              {editKey === cat.key ? (
                <>
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void saveLabel(); if (e.key === "Escape") setEditKey(null); }}
                    className="flex-1 rounded-md border border-sirius bg-bg px-2 py-1 font-body text-[13px] text-fg outline-none"
                  />
                  <button onClick={saveLabel} disabled={saving} title="Save" className="grid size-6 place-items-center rounded-md bg-sirius text-white disabled:opacity-50">
                    <Check size={13} />
                  </button>
                  <button onClick={() => setEditKey(null)} title="Cancel" className="grid size-6 place-items-center rounded-md text-fg-subtle hover:bg-bg-muted">
                    <X size={13} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-body text-[13px] font-semibold text-fg">{cat.label}</span>
                  <span className="font-body text-[11px] text-fg-subtle">
                    {cat.suggestions.length === 0 ? "no suggestions" : `${cat.suggestions.length} suggestions`}
                  </span>
                  <button
                    onClick={() => setExpanded((k) => (k === cat.key ? null : cat.key))}
                    title="Edit suggestions"
                    className="grid size-6 place-items-center rounded-md text-fg-subtle hover:bg-bg-muted"
                  >
                    <ChevronDown size={14} className={cn("transition-transform", expanded === cat.key && "rotate-180")} />
                  </button>
                  <button onClick={() => move(idx, -1)} disabled={idx === 0 || saving} title="Move up" className="rounded-md px-1 font-body text-[13px] text-fg-subtle hover:bg-bg-muted disabled:opacity-30">↑</button>
                  <button onClick={() => move(idx, 1)} disabled={idx === categories.length - 1 || saving} title="Move down" className="rounded-md px-1 font-body text-[13px] text-fg-subtle hover:bg-bg-muted disabled:opacity-30">↓</button>
                  <button onClick={() => { setEditKey(cat.key); setEditLabel(cat.label); }} title="Rename" className="grid size-6 place-items-center rounded-md text-fg-subtle hover:bg-bg-muted">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => remove(cat)} title="Remove" className="grid size-6 place-items-center rounded-md text-fg-subtle hover:bg-bg-muted hover:text-danger-fg">
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
            {expanded === cat.key && (
              <SuggestionEditor cat={cat} saving={saving} onSave={(raw) => saveSuggestions(cat, raw)} />
            )}
          </div>
        ))}
      </div>

      {adding ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addCategory(); if (e.key === "Escape") { setAdding(false); setNewLabel(""); } }}
            placeholder="e.g. Payroll, Ticketing, Data warehouse"
            className="flex-1 rounded-md border border-sirius bg-bg px-2.5 py-1.5 font-body text-[13px] text-fg outline-none placeholder:text-fg-subtle"
          />
          <button onClick={addCategory} disabled={saving} className="grid size-7 place-items-center rounded-md bg-sirius text-white disabled:opacity-50">
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </button>
          <button onClick={() => { setAdding(false); setNewLabel(""); }} className="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-bg-muted">
            <X size={13} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 font-body text-[12.5px] font-semibold text-sirius transition-colors hover:bg-accent-soft"
        >
          <Plus size={13} /> Add a category
        </button>
      )}

      <div className="flex h-4 items-center gap-2">
        {saving && <span className="font-body text-[12px] text-fg-subtle">Saving…</span>}
        {saved && !saving && <span className="font-body text-[12px] text-sirius">Saved</span>}
        {error && <span className="font-body text-[12px] text-danger-fg">{error}</span>}
      </div>

      <p className="caption">
        Categories appear in this order on every client profile. Renaming one keeps the tools already
        recorded under it; removing one hides them without deleting them. Suggestions only speed up
        typing — a CSM can always record a tool that isn&rsquo;t listed.
      </p>
    </div>
  );
}

/** One category's suggestion list, edited as plain lines. A textarea beats a
 *  chip editor here: an admin pasting a vendor list wants to paste it. */
function SuggestionEditor({
  cat,
  saving,
  onSave,
}: {
  cat: TechStackField;
  saving: boolean;
  onSave: (raw: string) => void;
}) {
  const [draft, setDraft] = useState(cat.suggestions.join("\n"));
  const dirty = draft !== cat.suggestions.join("\n");
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle bg-bg-subtle px-3 py-3">
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
        Suggested tools — one per line
      </span>
      <textarea
        rows={6}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={"Workday\nBambooHR\nPersonio"}
        className="w-full resize-y rounded-md border border-border bg-bg px-2.5 py-2 font-body text-[12.5px] text-fg outline-none focus:border-sirius placeholder:text-fg-subtle"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => onSave(draft)}
          disabled={saving || !dirty}
          className="rounded-md bg-sirius px-3 py-1 font-body text-[12.5px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          Save suggestions
        </button>
        {dirty && <span className="font-body text-[12px] text-fg-subtle">Unsaved</span>}
      </div>
    </div>
  );
}
