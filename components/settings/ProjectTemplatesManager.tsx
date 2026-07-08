"use client";

/* Shared project-template library (Settings → Projects). Any CSM/super-admin
   can create a template; a template's creator or a super-admin can edit/delete
   it. A template is a reusable milestone/task blueprint with day-offsets that
   become real dates when applied to a project's start date. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileStack, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { ProjectConfig } from "@/lib/projects/config";
import type { ProjectTemplate, ProjectTemplateStructure, TemplateMilestone } from "@/lib/projects/types";
import { Field, Modal, Select, TextArea, TextInput } from "@/components/clients/projects/shared";
import { createTemplateAction, deleteTemplateAction, updateTemplateAction } from "@/app/(app)/settings/project-config-actions";

export function ProjectTemplatesManager({
  initialTemplates,
  config,
  currentUserEmail,
  isSuperAdmin,
}: {
  initialTemplates: ProjectTemplate[];
  config: ProjectConfig;
  currentUserEmail: string | null;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ProjectTemplate | "new" | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canManage = (t: ProjectTemplate) =>
    isSuperAdmin || (!!currentUserEmail && !!t.createdByEmail && t.createdByEmail.toLowerCase() === currentUserEmail.toLowerCase());

  async function remove(t: ProjectTemplate) {
    if (!confirm(`Delete template "${t.name}"? Projects already created from it are unaffected.`)) return;
    setDeletingId(t.id);
    try {
      const res = await deleteTemplateAction(t.id);
      if (!res.ok) {
        alert(res.error ?? "Failed to delete the template.");
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <Button size="sm" variant="secondary" iconLeft={Plus} onClick={() => setEditing("new")}>
          New template
        </Button>
      </div>

      {initialTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <FileStack size={20} className="mb-2 text-fg-subtle" />
          <p className="font-body text-[13px] font-semibold text-fg">No templates yet</p>
          <p className="mt-1 max-w-sm font-body text-[12px] text-fg-muted">Create a reusable structure of milestones and tasks — e.g. a standard onboarding — that any CSM can apply to a new project.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full border-collapse font-body">
            <thead>
              <tr className="border-b border-border bg-bg-muted/60">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Template</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Structure</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Created by</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {initialTemplates.map((t) => {
                const taskCount = t.structure.milestones.reduce((n, m) => n + (m.tasks?.length ?? 0), 0);
                return (
                  <tr key={t.id} className="hover:bg-bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-body text-[13px] font-semibold text-fg">{t.name}</span>
                        {t.type && <Badge tone="neutral">{t.type}</Badge>}
                      </div>
                      {t.description && <div className="mt-0.5 max-w-md truncate font-body text-[12px] text-fg-muted">{t.description}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-body text-[12.5px] text-fg-muted">
                      {t.structure.milestones.length} milestone{t.structure.milestones.length === 1 ? "" : "s"} · {taskCount} task{taskCount === 1 ? "" : "s"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-body text-[12.5px] text-fg-muted">{t.createdByName ?? t.createdByEmail ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {canManage(t) ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setEditing(t)} title="Edit" className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-fg"><Pencil size={14} /></button>
                          <button onClick={() => remove(t)} disabled={deletingId === t.id} title="Delete" className="rounded p-1 text-fg-subtle hover:bg-bg-muted hover:text-[#B23A57] disabled:opacity-50">
                            {deletingId === t.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        </div>
                      ) : (
                        <span className="font-body text-[11px] text-fg-subtle">View only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <TemplateEditorModal
          config={config}
          template={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------- editor modal */

function emptyStructure(): ProjectTemplateStructure {
  return { milestones: [{ name: "Milestone 1", dueOffsetDays: null, tasks: [] }] };
}

function TemplateEditorModal({
  config,
  template,
  onClose,
  onSaved,
}: {
  config: ProjectConfig;
  template: ProjectTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [type, setType] = useState(template?.type ?? "");
  const [structure, setStructure] = useState<ProjectTemplateStructure>(template?.structure ?? emptyStructure());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setMilestones(milestones: TemplateMilestone[]) {
    setStructure({ milestones });
  }

  async function save() {
    if (!name.trim()) {
      setError("A template name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const clean: ProjectTemplateStructure = {
        milestones: structure.milestones
          .filter((m) => m.name.trim())
          .map((m) => ({
            name: m.name.trim(),
            dueOffsetDays: m.dueOffsetDays ?? null,
            tasks: (m.tasks ?? []).filter((t) => t.name.trim()).map((t) => ({
              name: t.name.trim(),
              type: t.type ?? null,
              startOffsetDays: t.startOffsetDays ?? null,
              deliveryOffsetDays: t.deliveryOffsetDays ?? null,
            })),
          })),
      };
      const payload = { name: name.trim(), description: description.trim() || null, type: type || null, structure: clean };
      const res = template ? await updateTemplateAction(template.id, payload) : await createTemplateAction(payload);
      if (!res.ok) {
        setError(res.error ?? "Failed to save.");
        return;
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={template ? "Edit template" : "New template"}
      onClose={() => !busy && onClose()}
      wide
      footer={
        <>
          <button onClick={() => !busy && onClose()} disabled={busy} className="rounded-lg border border-border px-3.5 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">Cancel</button>
          <Button size="sm" onClick={save} disabled={!name.trim() || busy}>
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {template ? "Save template" : "Create template"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Template name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="e.g. Standard onboarding" autoFocus />
          </Field>
          <Field label="Type">
            <Select value={type} onChange={setType} disabled={busy} placeholder="— None —" options={config.projectTypes.map((o) => ({ value: o.id, label: o.label }))} />
          </Field>
        </div>
        <Field label="Description">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} placeholder="What is this template for?" />
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="font-body text-[13px] font-semibold text-fg">Milestones & tasks</h4>
            <span className="font-body text-[11px] text-fg-subtle">Offsets = days from the project start date</span>
          </div>
          <div className="flex flex-col gap-3">
            {structure.milestones.map((m, mi) => (
              <MilestoneEditor
                key={mi}
                config={config}
                milestone={m}
                onChange={(next) => setMilestones(structure.milestones.map((x, i) => (i === mi ? next : x)))}
                onRemove={() => setMilestones(structure.milestones.filter((_, i) => i !== mi))}
              />
            ))}
          </div>
          <button
            onClick={() => setMilestones([...structure.milestones, { name: `Milestone ${structure.milestones.length + 1}`, dueOffsetDays: null, tasks: [] }])}
            className="mt-2 inline-flex items-center gap-1.5 font-body text-[12.5px] font-semibold text-sirius hover:text-cosmos"
          >
            <Plus size={13} /> Add milestone
          </button>
        </div>

        {error && <p className="font-body text-[12px] text-[#B23A57]">{error}</p>}
      </div>
    </Modal>
  );
}

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function MilestoneEditor({
  config,
  milestone,
  onChange,
  onRemove,
}: {
  config: ProjectConfig;
  milestone: TemplateMilestone;
  onChange: (m: TemplateMilestone) => void;
  onRemove: () => void;
}) {
  const tasks = milestone.tasks ?? [];
  return (
    <div className="rounded-lg border border-border bg-bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <input
          value={milestone.name}
          onChange={(e) => onChange({ ...milestone, name: e.target.value })}
          placeholder="Milestone name"
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1 font-body text-[12.5px] font-semibold text-fg outline-none ring-sirius focus:ring-2"
        />
        <label className="flex items-center gap-1 whitespace-nowrap font-body text-[11px] text-fg-muted">
          Due
          <input
            type="number"
            value={milestone.dueOffsetDays ?? ""}
            onChange={(e) => onChange({ ...milestone, dueOffsetDays: numOrNull(e.target.value) })}
            className="w-16 rounded-md border border-border bg-bg px-1.5 py-1 font-body text-[12px] text-fg outline-none ring-sirius focus:ring-2"
            placeholder="d"
          />
        </label>
        <button onClick={onRemove} title="Remove milestone" className="rounded p-1 text-fg-subtle hover:text-[#B23A57]"><Trash2 size={13} /></button>
      </div>

      <div className="mt-2 flex flex-col gap-1.5 pl-2">
        {tasks.map((t, ti) => (
          <div key={ti} className="flex items-center gap-2">
            <span className="text-fg-subtle">·</span>
            <input
              value={t.name}
              onChange={(e) => onChange({ ...milestone, tasks: tasks.map((x, i) => (i === ti ? { ...x, name: e.target.value } : x)) })}
              placeholder="Task name"
              className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1 font-body text-[12px] text-fg outline-none ring-sirius focus:ring-2"
            />
            <select
              value={t.type ?? ""}
              onChange={(e) => onChange({ ...milestone, tasks: tasks.map((x, i) => (i === ti ? { ...x, type: e.target.value || null } : x)) })}
              className="rounded-md border border-border bg-bg px-1.5 py-1 font-body text-[11.5px] text-fg outline-none ring-sirius focus:ring-2"
            >
              <option value="">Type</option>
              {config.taskTypes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <label className="flex items-center gap-1 whitespace-nowrap font-body text-[10.5px] text-fg-muted" title="Start offset (days)">
              S
              <input type="number" value={t.startOffsetDays ?? ""} onChange={(e) => onChange({ ...milestone, tasks: tasks.map((x, i) => (i === ti ? { ...x, startOffsetDays: numOrNull(e.target.value) } : x)) })} className="w-12 rounded-md border border-border bg-bg px-1 py-1 text-[11.5px] text-fg outline-none ring-sirius focus:ring-2" />
            </label>
            <label className="flex items-center gap-1 whitespace-nowrap font-body text-[10.5px] text-fg-muted" title="Delivery offset (days)">
              D
              <input type="number" value={t.deliveryOffsetDays ?? ""} onChange={(e) => onChange({ ...milestone, tasks: tasks.map((x, i) => (i === ti ? { ...x, deliveryOffsetDays: numOrNull(e.target.value) } : x)) })} className="w-12 rounded-md border border-border bg-bg px-1 py-1 text-[11.5px] text-fg outline-none ring-sirius focus:ring-2" />
            </label>
            <button onClick={() => onChange({ ...milestone, tasks: tasks.filter((_, i) => i !== ti) })} title="Remove task" className="rounded p-0.5 text-fg-subtle hover:text-[#B23A57]"><Trash2 size={12} /></button>
          </div>
        ))}
        <button
          onClick={() => onChange({ ...milestone, tasks: [...tasks, { name: "", type: null, startOffsetDays: null, deliveryOffsetDays: null }] })}
          className={cn("mt-1 inline-flex w-fit items-center gap-1 font-body text-[11.5px] font-medium text-sirius hover:text-cosmos")}
        >
          <Plus size={12} /> Add task
        </button>
      </div>
    </div>
  );
}
