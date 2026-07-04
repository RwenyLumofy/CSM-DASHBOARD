"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ChevronDown, ChevronUp, Lock, Eye, EyeOff, Save, RotateCcw } from "lucide-react";
import type { PropertyDefinition } from "@/lib/types";
import { cn } from "@/lib/cn";

const GROUP_LABELS: Record<string, string> = {
  client:     "Client",
  contract:   "Contract",
  product:    "Product",
  engagement: "Engagement",
  dates:      "Dates",
  general:    "General",
};

const TYPE_LABELS: Record<string, string> = {
  text:          "Text",
  number:        "Number",
  currency:      "Currency ($)",
  date:          "Date",
  single_select: "Single-select",
  multi_select:  "Multi-select",
};

const SELECT_TYPES = new Set(["single_select", "multi_select"]);

interface Props {
  initialDefs: PropertyDefinition[];
  isSuperAdmin: boolean;
}

export function PropertiesManager({ initialDefs, isSuperAdmin }: Props) {
  const router = useRouter();
  const [defs, setDefs] = useState<PropertyDefinition[]>(initialDefs);
  // drafts: per-property staged edits, keyed by property key
  const [drafts, setDrafts] = useState<Record<string, PropertyDefinition>>({});
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [newOptionInputs, setNewOptionInputs] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // New property form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newProp, setNewProp] = useState({ key: "", label: "", type: "text", group: "general" });
  const [creatingProp, setCreatingProp] = useState(false);

  const grouped = Object.entries(GROUP_LABELS).map(([group, label]) => ({
    group,
    label,
    defs: defs.filter((d) => d.group === group).sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((g) => g.defs.length > 0 || g.group === "general");

  // --- draft helpers ---

  function getDraft(key: string): PropertyDefinition {
    return drafts[key] ?? defs.find((d) => d.key === key)!;
  }

  function hasDraftChanges(key: string): boolean {
    const draft = drafts[key];
    if (!draft) return false;
    const saved = defs.find((d) => d.key === key);
    if (!saved) return false;
    return (
      draft.label !== saved.label ||
      JSON.stringify(draft.options) !== JSON.stringify(saved.options) ||
      JSON.stringify(draft.hiddenOptions ?? []) !== JSON.stringify(saved.hiddenOptions ?? [])
    );
  }

  function initDraft(key: string) {
    const def = defs.find((d) => d.key === key);
    if (!def) return;
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...def, options: [...def.options], hiddenOptions: [...(def.hiddenOptions ?? [])] },
    }));
  }

  function discardDraft(key: string) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function updateDraft(key: string, patch: Partial<PropertyDefinition>) {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...getDraft(key), ...patch },
    }));
  }

  // --- draft mutations ---

  function addOptionToDraft(propKey: string) {
    const raw = (newOptionInputs[propKey] ?? "").trim();
    if (!raw) return;
    const draft = getDraft(propKey);
    if (draft.options.includes(raw)) { setError(`"${raw}" already exists`); return; }
    setError(null);
    updateDraft(propKey, { options: [...draft.options, raw] });
    setNewOptionInputs((prev) => ({ ...prev, [propKey]: "" }));
  }

  function removeOptionFromDraft(propKey: string, opt: string) {
    const draft = getDraft(propKey);
    updateDraft(propKey, {
      options: draft.options.filter((o) => o !== opt),
      hiddenOptions: (draft.hiddenOptions ?? []).filter((o) => o !== opt),
    });
  }

  function toggleHideInDraft(propKey: string, opt: string) {
    const draft = getDraft(propKey);
    const hidden = draft.hiddenOptions ?? [];
    const isHidden = hidden.includes(opt);
    updateDraft(propKey, {
      hiddenOptions: isHidden ? hidden.filter((o) => o !== opt) : [...hidden, opt],
    });
  }

  // --- save / discard ---

  async function saveDraft(propKey: string) {
    const draft = drafts[propKey];
    const saved = defs.find((d) => d.key === propKey);
    if (!draft || !saved) return;

    setSavingKey(propKey);
    setError(null);

    try {
      const body: Record<string, unknown> = { key: propKey };
      if (draft.label !== saved.label) body.label = draft.label;
      if (JSON.stringify(draft.options) !== JSON.stringify(saved.options)) body.options = draft.options;
      if (JSON.stringify(draft.hiddenOptions ?? []) !== JSON.stringify(saved.hiddenOptions ?? []))
        body.hiddenOptions = draft.hiddenOptions ?? [];

      const res = await fetch("/api/admin/properties", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) { setError("Failed to save changes"); return; }

      setDefs((prev) => prev.map((d) => (d.key === propKey ? { ...draft } : d)));
      discardDraft(propKey);
      router.refresh();
    } catch {
      setError("Failed to save changes");
    } finally {
      setSavingKey(null);
    }
  }

  // --- create new property ---

  async function createProperty() {
    const key = newProp.key.trim().toLowerCase().replace(/\s+/g, "_");
    const label = newProp.label.trim();
    if (!key || !label) { setError("Key and label are required"); return; }
    if (defs.find((d) => d.key === key)) { setError(`Property key "${key}" already exists`); return; }

    setError(null);
    setCreatingProp(true);
    try {
      const res = await fetch("/api/admin/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, label, type: newProp.type, group: newProp.group }),
      });
      if (!res.ok) { setError("Failed to create property"); return; }
      const created: PropertyDefinition = {
        key, label,
        type: newProp.type as PropertyDefinition["type"],
        group: newProp.group as PropertyDefinition["group"],
        options: [],
        hiddenOptions: [],
        sortOrder: 999,
        isSystem: false,
        isReadOnly: false,
      };
      setDefs((prev) => [...prev, created]);
      setNewProp({ key: "", label: "", type: "text", group: "general" });
      setShowNewForm(false);
      setExpandedKey(key);
      initDraft(key);
    } finally {
      setCreatingProp(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 opacity-60 hover:opacity-100"><X size={13} className="inline" /></button>
        </div>
      )}

      {grouped.map(({ group, label, defs: groupDefs }) => (
        groupDefs.length === 0 ? null : (
          <section key={group}>
            <h3 className="mb-2 px-1 font-display text-xs font-semibold uppercase tracking-wider text-fg-muted">
              {label}
            </h3>
            <div className="overflow-hidden rounded-xl border border-border">
              {groupDefs.map((def) => {
                const isExpanded = expandedKey === def.key;
                const hasOptions = SELECT_TYPES.has(def.type);
                const canEdit = isSuperAdmin;
                const draft = getDraft(def.key);
                const isDirty = hasDraftChanges(def.key);
                const isSaving = savingKey === def.key;

                return (
                  <div
                    key={def.key}
                    className={cn(
                      "border-b border-border last:border-b-0",
                      isExpanded && "bg-bg-muted/40",
                    )}
                  >
                    {/* Row header */}
                    <button
                      type="button"
                      onClick={() => {
                        if (isExpanded) {
                          setExpandedKey(null);
                        } else {
                          initDraft(def.key);
                          setExpandedKey(def.key);
                        }
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-muted/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-body text-sm font-medium text-fg">{def.label}</span>
                          {def.isSystem ? (
                            <span className="flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5 font-body text-[11px] font-medium text-fg-muted">
                              {!canEdit && <Lock size={10} />} Default
                            </span>
                          ) : (
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 font-body text-[11px] font-medium text-sirius">
                              Custom
                            </span>
                          )}
                          {isDirty && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 font-body text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                              Unsaved
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-fg-muted">
                          {TYPE_LABELS[def.type] ?? def.type} · <span className="opacity-60">{def.key}</span>
                        </div>
                      </div>
                      {hasOptions && (
                        <span className="shrink-0 font-body text-xs text-fg-muted">
                          {def.options.length} option{def.options.length !== 1 ? "s" : ""}
                          {(def.hiddenOptions ?? []).length > 0 && (
                            <span className="ml-1 text-fg-muted/60">· {def.hiddenOptions.length} hidden</span>
                          )}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronUp size={15} className="shrink-0 text-fg-muted" />
                      ) : (
                        <ChevronDown size={15} className="shrink-0 text-fg-muted" />
                      )}
                    </button>

                    {/* Expanded panel — all edits go to draft */}
                    {isExpanded && (
                      <div className="border-t border-border px-4 pb-4 pt-3">

                        {/* Display label */}
                        <div className="mb-4">
                          <label className="mb-1 block font-body text-xs font-medium text-fg-muted">
                            Display label
                          </label>
                          {!canEdit ? (
                            <div className="flex max-w-xs items-center gap-1.5 rounded-lg border border-border bg-bg-muted/50 px-3 py-2 font-body text-sm text-fg-muted">
                              <Lock size={12} /> {def.label}
                            </div>
                          ) : (
                            <input
                              className="w-full max-w-xs rounded-lg border border-border bg-bg px-3 py-2 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
                              value={draft.label}
                              onChange={(e) => updateDraft(def.key, { label: e.target.value })}
                            />
                          )}
                        </div>

                        {/* Options for select types */}
                        {hasOptions && (
                          <div>
                            <div className="mb-2 flex items-baseline gap-2">
                              <span className="font-body text-xs font-medium text-fg-muted">Options</span>
                              <span className="font-body text-[11px] text-fg-muted/70">
                                · <Eye size={10} className="inline" /> hide/show in dropdowns &nbsp;·&nbsp; <X size={10} className="inline" /> delete permanently
                              </span>
                            </div>
                            <div className="mb-3 overflow-hidden rounded-lg border border-border">
                              {draft.options.length === 0 && (
                                <div className="px-3 py-2 font-body text-xs italic text-fg-muted">No options yet</div>
                              )}
                              {draft.options.map((opt, i) => {
                                const isHidden = (draft.hiddenOptions ?? []).includes(opt);
                                return (
                                  <div
                                    key={opt}
                                    className={cn(
                                      "flex items-center gap-2 px-3 py-2 font-body text-xs",
                                      i < draft.options.length - 1 && "border-b border-border",
                                      isHidden ? "bg-bg-muted" : "bg-bg",
                                    )}
                                  >
                                    {canEdit && (
                                      <button
                                        type="button"
                                        title={isHidden ? "Show in dropdown" : "Hide from dropdown"}
                                        onClick={() => toggleHideInDraft(def.key, opt)}
                                        className={cn(
                                          "shrink-0 transition-colors",
                                          isHidden ? "text-fg-muted hover:text-sirius" : "text-fg hover:text-fg-muted",
                                        )}
                                      >
                                        {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                                      </button>
                                    )}
                                    <span className={cn("flex-1 font-medium", isHidden ? "text-fg-muted" : "text-fg")}>
                                      {opt}
                                    </span>
                                    {isHidden && (
                                      <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                                        hidden
                                      </span>
                                    )}
                                    {canEdit && (
                                      <button
                                        type="button"
                                        title="Remove permanently"
                                        onClick={() => removeOptionFromDraft(def.key, opt)}
                                        className="shrink-0 text-fg-muted transition-colors hover:text-red-500"
                                      >
                                        <X size={11} />
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {canEdit && (
                              <div className="flex items-center gap-2">
                                <input
                                  className="w-48 rounded-lg border border-border bg-bg px-3 py-1.5 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
                                  placeholder="Add option…"
                                  value={newOptionInputs[def.key] ?? ""}
                                  onChange={(e) =>
                                    setNewOptionInputs((prev) => ({ ...prev, [def.key]: e.target.value }))
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.preventDefault(); addOptionToDraft(def.key); }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => addOptionToDraft(def.key)}
                                  disabled={!(newOptionInputs[def.key] ?? "").trim()}
                                  className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 font-body text-xs font-medium text-fg transition-colors hover:bg-bg-muted disabled:opacity-40"
                                >
                                  <Plus size={13} /> Add
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Save / Discard — only shown for super-admins with pending changes */}
                        {canEdit && (
                          <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
                            <button
                              type="button"
                              onClick={() => saveDraft(def.key)}
                              disabled={!isDirty || isSaving}
                              className="flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-2 font-body text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                            >
                              <Save size={14} />
                              {isSaving ? "Saving…" : "Save changes"}
                            </button>
                            <button
                              type="button"
                              onClick={() => { discardDraft(def.key); initDraft(def.key); }}
                              disabled={!isDirty || isSaving}
                              className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 font-body text-sm font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
                            >
                              <RotateCcw size={13} />
                              Discard
                            </button>
                            {isDirty && (
                              <span className="ml-auto font-body text-xs text-amber-600 dark:text-amber-400">
                                Unsaved changes
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )
      ))}

      {/* Add custom property */}
      {!isSuperAdmin ? null : showNewForm ? (
        <div className="rounded-xl border border-border bg-bg p-5">
          <h3 className="mb-4 font-display text-sm font-semibold text-fg">New property</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block font-body text-xs font-medium text-fg-muted">Label</label>
              <input
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
                placeholder="e.g. Contract owner"
                value={newProp.label}
                onChange={(e) => setNewProp((p) => ({ ...p, label: e.target.value, key: e.target.value.toLowerCase().replace(/\s+/g, "_") }))}
              />
            </div>
            <div>
              <label className="mb-1 block font-body text-xs font-medium text-fg-muted">Key (auto)</label>
              <input
                className="w-full rounded-lg border border-border bg-bg-muted px-3 py-2 font-mono text-sm text-fg-muted outline-none"
                value={newProp.key}
                readOnly
              />
            </div>
            <div>
              <label className="mb-1 block font-body text-xs font-medium text-fg-muted">Type</label>
              <select
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
                value={newProp.type}
                onChange={(e) => setNewProp((p) => ({ ...p, type: e.target.value }))}
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-body text-xs font-medium text-fg-muted">Group</label>
              <select
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-body text-sm text-fg outline-none ring-sirius focus:ring-2"
                value={newProp.group}
                onChange={(e) => setNewProp((p) => ({ ...p, group: e.target.value }))}
              >
                {Object.entries(GROUP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={createProperty}
              disabled={creatingProp || !newProp.label.trim()}
              className="rounded-lg bg-sirius px-4 py-2 font-body text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            >
              {creatingProp ? "Creating…" : "Create property"}
            </button>
            <button
              type="button"
              onClick={() => { setShowNewForm(false); setError(null); }}
              className="rounded-lg border border-border px-4 py-2 font-body text-sm font-medium text-fg-muted transition-colors hover:text-fg"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 self-start rounded-lg border border-dashed border-border px-4 py-2.5 font-body text-sm font-medium text-fg-muted transition-colors hover:border-sirius hover:text-sirius"
        >
          <Plus size={15} />
          Add custom property
        </button>
      )}
    </div>
  );
}
