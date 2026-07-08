"use client";

/* Super-admin editor for the project-management option vocabularies — the
   Status/Type lists used across every account's Project tab. Non-admins see a
   read-only summary. Persists the whole ProjectConfig blob via
   saveProjectConfigAction. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  DEFAULT_PROJECT_CONFIG,
  type OptionDef,
  type ProjectColor,
  type ProjectConfig,
  type StatusOption,
} from "@/lib/projects/config";
import { saveProjectConfigAction } from "@/app/(app)/settings/project-config-actions";

const COLORS: ProjectColor[] = ["sirius", "aurora", "stellar", "nova", "eclipse", "cosmos", "halo", "neutral"];

/** A fresh id not already present in the list (ids are internal + stable once
 *  created — a rename never changes an id, so it can't strand rows in use). */
function freshId(existing: OptionDef[]): string {
  const used = new Set(existing.map((o) => o.id));
  let n = existing.length + 1;
  let id = `option_${n}`;
  while (used.has(id)) id = `option_${++n}`;
  return id;
}

export function ProjectOptionsManager({ initialConfig, isSuperAdmin }: { initialConfig: ProjectConfig; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [config, setConfig] = useState<ProjectConfig>(initialConfig);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <ReadOnlyList title="Project statuses" options={config.projectStatuses} />
        <ReadOnlyList title="Project types" options={config.projectTypes} />
        <ReadOnlyList title="Task statuses" options={config.taskStatuses} />
        <ReadOnlyList title="Task types" options={config.taskTypes} />
        <p className="font-body text-[12px] text-fg-subtle">These are managed by your admin and are read-only for your role.</p>
      </div>
    );
  }

  function update<K extends keyof ProjectConfig>(key: K, list: ProjectConfig[K]) {
    setConfig((c) => ({ ...c, [key]: list }));
    setMsg(null);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await saveProjectConfigAction(config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error ?? "Failed to save." });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <OptionListEditor title="Project statuses" hint="The kanban columns on every account's project board (in this order)." isStatus statusKind="complete" options={config.projectStatuses} onChange={(l) => update("projectStatuses", l as StatusOption[])} />
      <OptionListEditor title="Project types" options={config.projectTypes} onChange={(l) => update("projectTypes", l)} />
      <OptionListEditor title="Task statuses" hint="Task board columns. Mark one as the 'done' status — it drives progress bars." isStatus statusKind="done" options={config.taskStatuses} onChange={(l) => update("taskStatuses", l as StatusOption[])} />
      <OptionListEditor title="Task types" options={config.taskTypes} onChange={(l) => update("taskTypes", l)} />

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={busy}>
          {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
          Save options
        </Button>
        <button
          onClick={() => { setConfig(DEFAULT_PROJECT_CONFIG); setMsg(null); }}
          disabled={busy}
          className="font-body text-[12.5px] font-medium text-fg-muted hover:text-fg"
        >
          Reset to defaults
        </button>
        {msg && <span className={cn("font-body text-[12.5px]", msg.ok ? "text-[#1E8F61]" : "text-[#B23A57]")}>{msg.text}</span>}
      </div>
    </div>
  );
}

function ReadOnlyList({ title, options }: { title: string; options: OptionDef[] }) {
  return (
    <div>
      <h4 className="mb-2 font-body text-[12.5px] font-semibold text-fg">{title}</h4>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => <Badge key={o.id} tone={o.color} dot>{o.label}</Badge>)}
      </div>
    </div>
  );
}

function OptionListEditor({
  title,
  hint,
  options,
  isStatus = false,
  statusKind,
  onChange,
}: {
  title: string;
  hint?: string;
  options: OptionDef[];
  isStatus?: boolean;
  statusKind?: "complete" | "done";
  onChange: (list: OptionDef[]) => void;
}) {
  function edit(idx: number, patch: Partial<StatusOption>) {
    onChange(options.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }
  function move(idx: number, dir: -1 | 1) {
    const next = [...options];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }
  function remove(idx: number) {
    if (options.length <= 1) return;
    onChange(options.filter((_, i) => i !== idx));
  }
  function add() {
    onChange([...options, { id: freshId(options), label: "New option", color: "neutral" }]);
  }
  // Enforce a single terminal (done/complete) status per list, so the progress
  // bar (counts all done) and the drawer (uses the first done) can't disagree.
  function setTerminal(idx: number, on: boolean) {
    onChange(
      options.map((o, i) => {
        const s = o as StatusOption;
        if (i === idx) return { ...s, terminal: on ? statusKind : undefined };
        return s.terminal ? { ...s, terminal: undefined } : s;
      }),
    );
  }

  return (
    <div>
      <div className="mb-2">
        <h4 className="font-body text-[13px] font-semibold text-fg">{title}</h4>
        {hint && <p className="mt-0.5 font-body text-[11.5px] text-fg-subtle">{hint}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        {options.map((o, idx) => {
          const status = o as StatusOption;
          const isTerminal = isStatus && status.terminal === statusKind;
          return (
            <div key={idx} className="flex items-center gap-2 rounded-lg border border-border bg-bg px-2 py-1.5">
              <div className="flex flex-col">
                <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-fg-subtle hover:text-fg disabled:opacity-30"><ArrowUp size={11} /></button>
                <button onClick={() => move(idx, 1)} disabled={idx === options.length - 1} className="text-fg-subtle hover:text-fg disabled:opacity-30"><ArrowDown size={11} /></button>
              </div>
              <input
                value={o.label}
                onChange={(e) => edit(idx, { label: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1 font-body text-[12.5px] text-fg outline-none ring-sirius focus:ring-2"
              />
              <select
                value={o.color}
                onChange={(e) => edit(idx, { color: e.target.value as ProjectColor })}
                className="rounded-md border border-border bg-bg px-1.5 py-1 font-body text-[11.5px] text-fg outline-none ring-sirius focus:ring-2"
              >
                {COLORS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <Badge tone={o.color} dot>{o.label || "—"}</Badge>
              {isStatus && (
                <label className="flex items-center gap-1 whitespace-nowrap font-body text-[11px] text-fg-muted" title={statusKind === "done" ? "Counts as done for progress" : "Marks the project complete"}>
                  <input
                    type="checkbox"
                    checked={isTerminal}
                    onChange={(e) => setTerminal(idx, e.target.checked)}
                  />
                  {statusKind === "done" ? "Done" : "Complete"}
                </label>
              )}
              <button onClick={() => remove(idx)} disabled={options.length <= 1} title="Remove" className="rounded p-1 text-fg-subtle hover:text-[#B23A57] disabled:opacity-30">
                <Trash2 size={13} />
              </button>
            </div>
          );
        })}
      </div>
      <button onClick={add} className="mt-2 inline-flex items-center gap-1.5 font-body text-[12.5px] font-semibold text-sirius hover:text-cosmos">
        <Plus size={13} /> Add option
      </button>
    </div>
  );
}
