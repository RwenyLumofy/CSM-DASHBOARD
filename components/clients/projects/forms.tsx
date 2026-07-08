"use client";

/* Create/edit modals for projects, milestones and tasks. Each form is pure: it
   collects values and calls onSubmit(values), which returns { ok, error? }. The
   parent (ProjectsTab / ProjectDrawer) owns the server-action wiring + refresh,
   so all authorization stays in one place. */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { defaultProjectStatusId, defaultTaskStatusId } from "@/lib/projects/config";
import type { MilestoneInput, Project, ProjectInput, Task, TaskInput } from "@/lib/projects/types";
import { DateInput, Field, Modal, Select, TextArea, TextInput, dateInputValue, type ProjectsContext } from "./shared";

type SubmitResult = { ok: boolean; error?: string };

function toOptions(list: { id: string; label: string }[]) {
  return list.map((o) => ({ value: o.id, label: o.label }));
}

/* ------------------------------------------------------------- project form */

export function ProjectFormModal({
  ctx,
  mode,
  initial,
  templates,
  onClose,
  onSubmit,
}: {
  ctx: ProjectsContext;
  mode: "create" | "edit";
  initial?: Project | null;
  templates?: { id: string; name: string }[];
  onClose: () => void;
  onSubmit: (values: ProjectInput, templateId: string | null) => Promise<SubmitResult>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState(initial?.type ?? "");
  const [status, setStatus] = useState(initial?.status ?? defaultProjectStatusId(ctx.config));
  const [startDate, setStartDate] = useState(dateInputValue(initial?.startDate));
  const [deliveryDate, setDeliveryDate] = useState(dateInputValue(initial?.deliveryDate));
  const [ownerEmail, setOwnerEmail] = useState(initial?.ownerEmail ?? "");
  const [implementerEmail, setImplementerEmail] = useState(initial?.implementerEmail ?? "");
  const [contactId, setContactId] = useState(initial?.contactId ?? "");
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError("A project name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onSubmit(
        {
          name: name.trim(),
          description: description.trim() || null,
          type: type || null,
          status,
          startDate: startDate || null,
          deliveryDate: deliveryDate || null,
          ownerEmail: ownerEmail || null,
          implementerEmail: implementerEmail || null,
          contactId: contactId || null,
        },
        mode === "create" ? (templateId || null) : null,
      );
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={mode === "create" ? "New project" : "Edit project"}
      onClose={() => !busy && onClose()}
      wide
      footer={
        <>
          <button onClick={() => !busy && onClose()} disabled={busy} className="rounded-lg border border-border px-3.5 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">
            Cancel
          </button>
          <Button size="sm" onClick={save} disabled={!name.trim() || busy}>
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {mode === "create" ? "Create project" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Project name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="e.g. Onboarding — Acme Corp" autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={type} onChange={setType} disabled={busy} placeholder="— None —" options={toOptions(ctx.config.projectTypes)} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={setStatus} disabled={busy} options={toOptions(ctx.config.projectStatuses)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <DateInput value={startDate} onChange={setStartDate} disabled={busy} />
          </Field>
          <Field label="Delivery date">
            <DateInput value={deliveryDate} onChange={setDeliveryDate} disabled={busy} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner (CSM)">
            <Select value={ownerEmail} onChange={setOwnerEmail} disabled={busy} placeholder="— Unassigned —" options={ctx.csms.map((m) => ({ value: m.email, label: m.name }))} />
          </Field>
          <Field label="Implementer">
            <Select value={implementerEmail} onChange={setImplementerEmail} disabled={busy} placeholder="— Unassigned —" options={ctx.implementers.map((m) => ({ value: m.email, label: m.name }))} />
          </Field>
        </div>

        <Field label="Client contact">
          <Select value={contactId} onChange={setContactId} disabled={busy} placeholder="— None —" options={ctx.contacts.map((c) => ({ value: c.id, label: c.name }))} />
        </Field>

        {mode === "create" && templates && templates.length > 0 && (
          <Field label="Start from a template" hint="Pre-fills milestones & tasks. Dates are computed from the start date above.">
            <Select value={templateId} onChange={setTemplateId} disabled={busy} placeholder="— Blank project —" options={templates.map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
        )}

        <Field label="Description">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} placeholder="Goals, scope, notes…" />
        </Field>

        {error && <p className="font-body text-[12px] text-[#B23A57]">{error}</p>}
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------- milestone form */

export function MilestoneFormModal({
  initial,
  onClose,
  onSubmit,
}: {
  initial?: { name: string; description: string | null; dueDate: string | null } | null;
  onClose: () => void;
  onSubmit: (values: MilestoneInput) => Promise<SubmitResult>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [dueDate, setDueDate] = useState(dateInputValue(initial?.dueDate));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError("A milestone name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onSubmit({ name: name.trim(), description: description.trim() || null, dueDate: dueDate || null });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={initial ? "Edit milestone" : "New milestone"}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <button onClick={() => !busy && onClose()} disabled={busy} className="rounded-lg border border-border px-3.5 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">
            Cancel
          </button>
          <Button size="sm" onClick={save} disabled={!name.trim() || busy}>
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {initial ? "Save" : "Add milestone"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Milestone name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="e.g. Kick-off" autoFocus />
        </Field>
        <Field label="Due date">
          <DateInput value={dueDate} onChange={setDueDate} disabled={busy} />
        </Field>
        <Field label="Description">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} placeholder="Optional" />
        </Field>
        {error && <p className="font-body text-[12px] text-[#B23A57]">{error}</p>}
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------- task form */

export function TaskFormModal({
  ctx,
  initial,
  milestones,
  defaultMilestoneId,
  defaultStatusId,
  onClose,
  onSubmit,
}: {
  ctx: ProjectsContext;
  initial?: Task | null;
  milestones: { id: string; name: string }[];
  defaultMilestoneId: string;
  /** Pre-select a status (e.g. the kanban column an "Add task" was clicked from). Ignored when editing. */
  defaultStatusId?: string;
  onClose: () => void;
  onSubmit: (values: TaskInput & { milestoneId: string }) => Promise<SubmitResult>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState(initial?.type ?? "");
  const [status, setStatus] = useState(initial?.status ?? defaultStatusId ?? defaultTaskStatusId(ctx.config));
  const [milestoneId, setMilestoneId] = useState(initial?.milestoneId ?? defaultMilestoneId);
  const [startDate, setStartDate] = useState(dateInputValue(initial?.startDate));
  const [deliveryDate, setDeliveryDate] = useState(dateInputValue(initial?.deliveryDate));
  const [ownerEmail, setOwnerEmail] = useState(initial?.ownerEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError("A task name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        type: type || null,
        status,
        startDate: startDate || null,
        deliveryDate: deliveryDate || null,
        ownerEmail: ownerEmail || null,
        milestoneId,
      });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={initial ? "Edit task" : "New task"}
      onClose={() => !busy && onClose()}
      wide
      footer={
        <>
          <button onClick={() => !busy && onClose()} disabled={busy} className="rounded-lg border border-border px-3.5 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">
            Cancel
          </button>
          <Button size="sm" onClick={save} disabled={!name.trim() || busy}>
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {initial ? "Save" : "Add task"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Task name">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={busy} placeholder="e.g. Configure SSO" autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Milestone">
            <Select value={milestoneId} onChange={setMilestoneId} disabled={busy} options={milestones.map((m) => ({ value: m.id, label: m.name }))} />
          </Field>
          <Field label="Owner">
            <Select value={ownerEmail} onChange={setOwnerEmail} disabled={busy} placeholder="— Unassigned —" options={ctx.members.map((m) => ({ value: m.email, label: m.name }))} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={type} onChange={setType} disabled={busy} placeholder="— None —" options={toOptions(ctx.config.taskTypes)} />
          </Field>
          <Field label="Status">
            <Select value={status} onChange={setStatus} disabled={busy} options={toOptions(ctx.config.taskStatuses)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date">
            <DateInput value={startDate} onChange={setStartDate} disabled={busy} />
          </Field>
          <Field label="Delivery date">
            <DateInput value={deliveryDate} onChange={setDeliveryDate} disabled={busy} />
          </Field>
        </div>

        <Field label="Description">
          <TextArea value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} placeholder="Optional" />
        </Field>

        {error && <p className="font-body text-[12px] text-[#B23A57]">{error}</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------- simple name/description */

/** Minimal single-field prompt (used by Save-as-template). */
export function NamePromptModal({
  title,
  label,
  submitLabel,
  withDescription = false,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  submitLabel: string;
  withDescription?: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string | null) => Promise<SubmitResult>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!name.trim()) {
      setError(`${label} is required.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await onSubmit(name.trim(), description.trim() || null);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <button onClick={() => !busy && onClose()} disabled={busy} className="rounded-lg border border-border px-3.5 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">
            Cancel
          </button>
          <Button size="sm" onClick={save} disabled={!name.trim() || busy}>
            {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={label}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} disabled={busy} autoFocus />
        </Field>
        {withDescription && (
          <Field label="Description">
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} placeholder="Optional" />
          </Field>
        )}
        {error && <p className="font-body text-[12px] text-[#B23A57]">{error}</p>}
      </div>
    </Modal>
  );
}
