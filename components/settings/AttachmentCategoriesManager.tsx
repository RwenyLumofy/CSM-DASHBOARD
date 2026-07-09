"use client";

import { useState } from "react";
import { Plus, GripVertical, Pencil, Trash2, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";

const DEFAULT_CATEGORIES = [
  "Contract",
  "Proposal",
  "Invoice",
  "Deck / Presentation",
  "Statement of Work",
  "Other",
];

interface Props {
  initialCategories: string[];
}

export function AttachmentCategoriesManager({ initialCategories }: Props) {
  const [categories, setCategories] = useState<string[]>(initialCategories.length > 0 ? initialCategories : DEFAULT_CATEGORIES);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [newVal, setNewVal] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function persist(next: string[]) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stakeholder-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "attachment_categories", value: next }),
      });
      if (!res.ok) { setError("Save failed"); return false; }
      setCategories(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch { setError("Save failed"); return false; }
    finally { setSaving(false); }
  }

  async function saveEdit() {
    const trimmed = editVal.trim();
    if (!trimmed) { setError("Category name required"); return; }
    if (categories.some((t, i) => t === trimmed && i !== editIdx)) { setError("Already exists"); return; }
    const next = categories.map((t, i) => (i === editIdx ? trimmed : t));
    if (await persist(next)) setEditIdx(null);
  }

  async function addType() {
    const trimmed = newVal.trim();
    if (!trimmed) return;
    if (categories.includes(trimmed)) { setError("Already exists"); return; }
    if (await persist([...categories, trimmed])) { setNewVal(""); setAddingNew(false); }
  }

  async function remove(idx: number) {
    if (!confirm(`Remove "${categories[idx]}"? Existing files already tagged with it will keep showing this label; it just won't be offered for new files.`)) return;
    const ok = await persist(categories.filter((_, i) => i !== idx));
    if (ok) {
      setEditIdx((prev) => {
        if (prev === null) return prev;
        if (prev === idx) return null;
        if (prev > idx) return prev - 1;
        return prev;
      });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error} <button type="button" onClick={() => setError(null)} className="ml-2 opacity-60 hover:opacity-100"><X size={12} className="inline" /></button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        {categories.map((t, i) => (
          <div key={i} className={cn("flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0", editIdx === i ? "bg-bg-muted/40" : "")}>
            <GripVertical size={14} className="shrink-0 text-fg-muted/40 cursor-grab" />
            {editIdx === i ? (
              <>
                <input
                  autoFocus
                  className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
                  value={editVal}
                  onChange={(e) => setEditVal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditIdx(null); }}
                />
                <div className="flex shrink-0 gap-1">
                  <button type="button" disabled={saving} onClick={saveEdit} className="grid size-7 place-items-center rounded-md bg-sirius text-white disabled:opacity-50"><Check size={13} /></button>
                  <button type="button" onClick={() => setEditIdx(null)} className="grid size-7 place-items-center rounded-md border border-border text-fg-muted hover:text-fg"><X size={12} /></button>
                </div>
              </>
            ) : (
              <>
                <span className="flex-1 font-body text-sm font-medium text-fg">{t}</span>
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => { setEditIdx(i); setEditVal(t); }} className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg">
                    <Pencil size={13} />
                  </button>
                  <button type="button" onClick={() => remove(i)} className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40">
                    <Trash2 size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {addingNew && (
          <div className="flex items-center gap-3 border-t border-border bg-bg-muted/30 px-4 py-3">
            <GripVertical size={14} className="shrink-0 text-fg-muted/20" />
            <input
              autoFocus
              className="flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
              placeholder="e.g. Renewal Docs"
              value={newVal}
              onChange={(e) => setNewVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addType(); if (e.key === "Escape") { setAddingNew(false); setNewVal(""); } }}
            />
            <div className="flex shrink-0 gap-1">
              <button type="button" disabled={saving || !newVal.trim()} onClick={addType} className="grid size-7 place-items-center rounded-md bg-sirius text-white disabled:opacity-40"><Check size={13} /></button>
              <button type="button" onClick={() => { setAddingNew(false); setNewVal(""); }} className="grid size-7 place-items-center rounded-md border border-border text-fg-muted hover:text-fg"><X size={12} /></button>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {!addingNew && (
          <button type="button" onClick={() => setAddingNew(true)}
            className="flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 font-body text-sm font-medium text-fg-muted transition-colors hover:border-sirius hover:text-sirius">
            <Plus size={14} /> Add category
          </button>
        )}
        {saved && <span className="font-body text-xs text-green-600 dark:text-green-400">Saved</span>}
      </div>
    </div>
  );
}
