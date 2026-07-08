"use client";

/* Project Management tab.

   List = a clean full-width TABLE (name · status · owner · delivery) with row
   selection + bulk actions and inline status/owner editing (via portal menus
   that can't be clipped). Opening a project shows it in a LIGHTBOX (ProjectView).

   All mutations are optimistic against local `projects` state for instant,
   animated feedback, then reconciled with the server. A pending-mutation guard
   stops an in-flight refresh from reverting a concurrent optimistic update, and
   optimistic temp ids are swapped for real ids as soon as the server responds. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, FolderKanban, Minus, Plus, Settings2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { Contact } from "@/lib/types";
import { defaultProjectStatusId, defaultTaskStatusId, isProjectComplete, type ProjectConfig } from "@/lib/projects/config";
import type { MilestoneInput, MilestoneWithTasks, ProjectDetail, ProjectInput, Task, TaskInput } from "@/lib/projects/types";
import {
  addMilestoneAction,
  addTaskAction,
  createProjectAction,
  deleteMilestoneAction,
  deleteProjectAction,
  deleteTaskAction,
  saveProjectAsTemplateAction,
  updateMilestoneAction,
  updateProjectAction,
  updateTaskAction,
} from "@/app/(app)/clients/[id]/project-actions";
import { ProjectView, type ProjectApi, type Result } from "./ProjectView";
import { ProjectFormModal } from "./forms";
import {
  EmptyState,
  MenuItem,
  OwnerSelect,
  PopMenu,
  StatusSelect,
  formatDate,
  isOverdue,
  memberName,
  projectProgress,
  useToast,
  type Member,
  type ProjectsContext,
} from "./shared";

interface Props {
  clientId: string;
  initialProjects: ProjectDetail[];
  config: ProjectConfig;
  templates: { id: string; name: string }[];
  contacts: Contact[];
  csms: Member[];
  implementers: Member[];
  canManage: boolean;
  dbEnabled: boolean;
}

const rand = () => Math.random().toString(36).slice(2, 10);
const nowIso = () => new Date().toISOString();

export function ProjectsTab(props: Props) {
  const { clientId, config, templates, contacts, csms, implementers, canManage, dbEnabled } = props;
  const router = useRouter();
  const { show, node: toast } = useToast();
  const [projects, setProjects] = useState<ProjectDetail[]>(props.initialProjects);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [lastMovedTaskId, setLastMovedTaskId] = useState<string | null>(null);
  const [justCompletedTaskId, setJustCompletedTaskId] = useState<string | null>(null);
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(0);

  // Re-sync from the server after refresh() — but NOT while a mutation is still
  // in flight, so a fast second edit's optimistic state isn't clobbered.
  useEffect(() => {
    if (pending.current === 0) setProjects(props.initialProjects);
  }, [props.initialProjects]);

  const ctx: ProjectsContext = useMemo(() => {
    const members: Member[] = [];
    const seen = new Set<string>();
    for (const m of [...csms, ...implementers]) {
      const key = m.email.toLowerCase();
      if (!seen.has(key)) { seen.add(key); members.push(m); }
    }
    return {
      clientId,
      config,
      contacts: contacts.map((c) => ({ id: c.id, name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unknown" })),
      csms,
      implementers,
      members,
      canManage,
    };
  }, [clientId, config, contacts, csms, implementers, canManage]);

  const selected = projects.find((p) => p.id === selectedId) ?? null;
  const checkedList = projects.filter((p) => checked.has(p.id));

  /* ---- local (optimistic) mutators ---- */
  function patchProject(id: string, fn: (p: ProjectDetail) => ProjectDetail) {
    setProjects((prev) => prev.map((p) => (p.id === id ? fn(p) : p)));
  }
  function patchTaskInPlace(projectId: string, taskId: string, fn: (t: Task) => Task) {
    patchProject(projectId, (p) => ({ ...p, milestones: p.milestones.map((m) => ({ ...m, tasks: m.tasks.map((t) => (t.id === taskId ? fn(t) : t)) })) }));
  }
  function moveTaskToMilestone(projectId: string, taskId: string, toMilestoneId: string) {
    patchProject(projectId, (p) => {
      let moved: Task | null = null;
      const stripped = p.milestones.map((m) => ({ ...m, tasks: m.tasks.filter((t) => (t.id === taskId ? ((moved = { ...t, milestoneId: toMilestoneId }), false) : true)) }));
      if (!moved) return p;
      return { ...p, milestones: stripped.map((m) => (m.id === toMilestoneId ? { ...m, tasks: [...m.tasks, moved!] } : m)) };
    });
  }
  function swapMilestoneId(projectId: string, tmp: string, real: string) {
    patchProject(projectId, (p) => ({ ...p, milestones: p.milestones.map((m) => (m.id === tmp ? { ...m, id: real, tasks: m.tasks.map((t) => ({ ...t, milestoneId: real })) } : m)) }));
  }
  function swapTaskId(projectId: string, tmp: string, real: string) {
    patchProject(projectId, (p) => ({ ...p, milestones: p.milestones.map((m) => ({ ...m, tasks: m.tasks.map((t) => (t.id === tmp ? { ...t, id: real } : t)) })) }));
  }

  /* ---- persistence (skipped in demo/no-DB so the module still works locally) ---- */
  async function run(action: () => Promise<Result>): Promise<Result> {
    if (!dbEnabled) return { ok: true };
    pending.current += 1;
    try {
      const res = await action();
      if (res && !res.ok) show(res.error ?? "Something went wrong.");
      return res ?? { ok: true };
    } finally {
      pending.current -= 1;
      router.refresh();
    }
  }
  async function persistAdd<T extends Result>(action: () => Promise<T>, onOk: (res: T) => void): Promise<Result> {
    if (!dbEnabled) return { ok: true };
    pending.current += 1;
    try {
      const res = await action();
      if (!res.ok) show(res.error ?? "Something went wrong."); else onOk(res);
      return res;
    } finally {
      pending.current -= 1;
      router.refresh();
    }
  }
  async function persistMany(actions: (() => Promise<Result>)[]) {
    if (!dbEnabled || actions.length === 0) return;
    pending.current += 1;
    try {
      const results = await Promise.all(actions.map((a) => a()));
      const failed = results.filter((r) => r && !r.ok).length;
      if (failed) show(`${failed} update${failed === 1 ? "" : "s"} failed.`);
    } finally {
      pending.current -= 1;
      router.refresh();
    }
  }

  function flashLanded(taskId: string) {
    setLastMovedTaskId(taskId);
    if (landTimer.current) clearTimeout(landTimer.current);
    landTimer.current = setTimeout(() => setLastMovedTaskId(null), 640);
  }
  function flashCompleted(taskId: string) {
    setJustCompletedTaskId(taskId);
    if (completeTimer.current) clearTimeout(completeTimer.current);
    completeTimer.current = setTimeout(() => setJustCompletedTaskId(null), 950);
  }

  function updateProjectById(projectId: string, patch: Partial<ProjectInput> & { status?: string }): Promise<Result> {
    patchProject(projectId, (p) => ({ ...p, ...patch }));
    return run(() => updateProjectAction(clientId, projectId, patch));
  }

  const api: ProjectApi = {
    lastMovedTaskId,
    justCompletedTaskId,
    moveTask: (task, toStatus) => {
      const doneId = config.taskStatuses.find((s) => s.terminal === "done")?.id;
      patchTaskInPlace(task.projectId, task.id, (t) => ({ ...t, status: toStatus }));
      if (doneId && toStatus === doneId && task.status !== doneId) flashCompleted(task.id);
      else flashLanded(task.id);
      void run(() => updateTaskAction(clientId, task.id, { status: toStatus }));
    },
    toggleTask: (task) => {
      const doneId = config.taskStatuses.find((s) => s.terminal === "done")?.id;
      if (!doneId) return;
      const becomingDone = task.status !== doneId;
      const next = becomingDone ? doneId : defaultTaskStatusId(config);
      patchTaskInPlace(task.projectId, task.id, (t) => ({ ...t, status: next }));
      if (becomingDone) flashCompleted(task.id);
      void run(() => updateTaskAction(clientId, task.id, { status: next }));
    },
    deleteTask: (task) => {
      patchProject(task.projectId, (p) => ({ ...p, milestones: p.milestones.map((m) => ({ ...m, tasks: m.tasks.filter((t) => t.id !== task.id) })) }));
      void run(() => deleteTaskAction(clientId, task.id));
    },
    deleteMilestone: (m) => {
      patchProject(m.projectId, (p) => ({ ...p, milestones: p.milestones.filter((x) => x.id !== m.id) }));
      void run(() => deleteMilestoneAction(clientId, m.id));
    },
    deleteProject: () => {
      const id = selectedId;
      if (!id) return;
      setSelectedId(null);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      void run(() => deleteProjectAction(clientId, id));
    },
    addTask: async (milestoneId, input) => {
      const projectId = selectedId;
      if (!projectId) return { ok: false, error: "No project open." };
      const status = input.status && config.taskStatuses.some((s) => s.id === input.status) ? input.status : defaultTaskStatusId(config);
      const tempId = `tmp-${rand()}`;
      const task: Task = {
        id: tempId, projectId, milestoneId, clientId, name: input.name, description: input.description ?? null,
        type: input.type ?? null, status, startDate: input.startDate ?? null, deliveryDate: input.deliveryDate ?? null,
        ownerEmail: input.ownerEmail ?? null, sortOrder: 1e6, completedAt: null, createdAt: nowIso(), updatedAt: nowIso(),
      };
      patchProject(projectId, (p) => ({ ...p, milestones: p.milestones.map((m) => (m.id === milestoneId ? { ...m, tasks: [...m.tasks, task] } : m)) }));
      return persistAdd(() => addTaskAction(clientId, projectId, milestoneId, input), (res) => { if (res.taskId) swapTaskId(projectId, tempId, res.taskId); });
    },
    editTask: async (task, patch) => {
      const { milestoneId, ...rest } = patch;
      patchTaskInPlace(task.projectId, task.id, (t) => ({ ...t, ...rest, milestoneId }));
      if (milestoneId !== task.milestoneId) moveTaskToMilestone(task.projectId, task.id, milestoneId);
      return run(() => updateTaskAction(clientId, task.id, { ...rest, milestoneId }));
    },
    addMilestone: async (input) => {
      const projectId = selectedId;
      if (!projectId) return { ok: false, error: "No project open." };
      const tempId = `tmp-${rand()}`;
      const milestone: MilestoneWithTasks = { id: tempId, projectId, clientId, name: input.name, description: input.description ?? null, dueDate: input.dueDate ?? null, sortOrder: 1e6, createdAt: nowIso(), tasks: [] };
      patchProject(projectId, (p) => ({ ...p, milestones: [...p.milestones, milestone] }));
      return persistAdd(() => addMilestoneAction(clientId, projectId, input as MilestoneInput), (res) => { if (res.milestoneId) swapMilestoneId(projectId, tempId, res.milestoneId); });
    },
    editMilestone: async (id, patch) => {
      const projectId = selectedId;
      if (!projectId) return { ok: false, error: "No project open." };
      patchProject(projectId, (p) => ({ ...p, milestones: p.milestones.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
      return run(() => updateMilestoneAction(clientId, id, patch));
    },
    updateProject: (patch) => (selectedId ? updateProjectById(selectedId, patch) : Promise.resolve({ ok: false })),
    saveAsTemplate: async (name, description) => (selectedId ? run(() => saveProjectAsTemplateAction(clientId, selectedId, { name, description })) : { ok: false }),
  };

  async function createProject(input: ProjectInput, templateId: string | null): Promise<Result> {
    const status = input.status && config.projectStatuses.some((s) => s.id === input.status) ? input.status : defaultProjectStatusId(config);
    if (dbEnabled) {
      const res = await createProjectAction(clientId, input, templateId);
      if (!res.ok) { show(res.error ?? "Couldn't create the project."); return res; }
      router.refresh();
      if (res.projectId) setSelectedId(res.projectId);
      return res;
    }
    const id = `tmp-${rand()}`;
    const proj: ProjectDetail = {
      id, clientId, name: input.name, description: input.description ?? null, type: input.type ?? null, status,
      startDate: input.startDate ?? null, deliveryDate: input.deliveryDate ?? null, ownerEmail: input.ownerEmail ?? null,
      implementerEmail: input.implementerEmail ?? null, contactId: input.contactId ?? null, sortOrder: 0,
      createdByEmail: null, createdAt: nowIso(), updatedAt: nowIso(), completedAt: null, milestones: [],
    };
    setProjects((prev) => [proj, ...prev]);
    setSelectedId(id);
    return { ok: true };
  }

  /* ---- selection + bulk ---- */
  function toggle(id: string) {
    setChecked((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setChecked((prev) => (prev.size >= projects.length ? new Set() : new Set(projects.map((p) => p.id))));
  }
  function clearSelection() { setChecked(new Set()); }

  function bulkStatus(status: string) {
    const ids = checkedList.map((p) => p.id);
    setProjects((prev) => prev.map((p) => (checked.has(p.id) ? { ...p, status } : p)));
    void persistMany(ids.map((id) => () => updateProjectAction(clientId, id, { status })));
  }
  function bulkOwner(email: string | null) {
    const ids = checkedList.map((p) => p.id);
    setProjects((prev) => prev.map((p) => (checked.has(p.id) ? { ...p, ownerEmail: email } : p)));
    void persistMany(ids.map((id) => () => updateProjectAction(clientId, id, { ownerEmail: email })));
  }
  function bulkDelete() {
    const ids = checkedList.map((p) => p.id);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} project${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    setProjects((prev) => prev.filter((p) => !checked.has(p.id)));
    clearSelection();
    void persistMany(ids.map((id) => () => deleteProjectAction(clientId, id)));
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-[15px] font-semibold text-fg">Projects</h2>
            <span className="tabular-nums rounded-full bg-bg-muted px-2 py-0.5 font-body text-[11px] font-semibold text-fg-muted">{projects.length}</span>
            {!dbEnabled && <span className="rounded-full bg-[#FBF6E0] px-2 py-0.5 font-body text-[11px] font-semibold text-[#8A6A0A]">Demo — changes aren&rsquo;t saved</span>}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/settings?tab=projects" className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-body text-[12px] font-medium text-fg-muted transition-colors hover:text-fg sm:inline-flex" title="Manage statuses, types & templates">
              <Settings2 size={13} /> Configure
            </Link>
            {canManage && <Button size="sm" iconLeft={Plus} onClick={() => setNewOpen(true)}>New project</Button>}
          </div>
        </div>

        {/* Bulk action bar */}
        {canManage && checkedList.length > 0 && (
          <div className="pm-in flex flex-wrap items-center gap-2 rounded-xl border border-sirius-200 bg-accent-soft px-3 py-2">
            <span className="font-body text-[12.5px] font-semibold text-sirius">{checkedList.length} selected</span>
            <span className="mx-1 h-4 w-px bg-sirius-200" />
            <PopMenu trigger={() => <span className="inline-flex items-center gap-1 rounded-lg border border-sirius-200 bg-bg px-2.5 py-1 font-body text-[12px] font-semibold text-fg transition-colors hover:border-sirius">Set status</span>}>
              {(close) => config.projectStatuses.map((s) => <MenuItem key={s.id} onClick={() => { bulkStatus(s.id); close(); }}><Badge tone={s.color} dot>{s.label}</Badge></MenuItem>)}
            </PopMenu>
            <PopMenu trigger={() => <span className="inline-flex items-center gap-1 rounded-lg border border-sirius-200 bg-bg px-2.5 py-1 font-body text-[12px] font-semibold text-fg transition-colors hover:border-sirius">Assign owner</span>}>
              {(close) => (
                <>
                  <MenuItem onClick={() => { bulkOwner(null); close(); }}><span className="text-fg-muted">Unassigned</span></MenuItem>
                  {ctx.csms.map((m) => <MenuItem key={m.email} onClick={() => { bulkOwner(m.email); close(); }}>{m.name}</MenuItem>)}
                </>
              )}
            </PopMenu>
            <button onClick={bulkDelete} className="inline-flex items-center gap-1.5 rounded-lg border border-sirius-200 bg-bg px-2.5 py-1 font-body text-[12px] font-semibold text-[#B23A57] transition-colors hover:border-[#B23A57]">
              <Trash2 size={12} /> Delete
            </button>
            <button onClick={clearSelection} className="ml-auto inline-flex items-center gap-1 font-body text-[12px] font-medium text-fg-muted transition-colors hover:text-fg">
              <X size={13} /> Clear
            </button>
          </div>
        )}

        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            body="Track onboarding, implementations, expansions and more — organised as milestones and tasks. Start blank or from a shared template."
            action={canManage ? <Button size="sm" iconLeft={Plus} onClick={() => setNewOpen(true)}>New project</Button> : undefined}
          />
        ) : (
          <ProjectTable
            ctx={ctx}
            projects={projects}
            checked={checked}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onOpen={setSelectedId}
            onStatus={(id, s) => void updateProjectById(id, { status: s })}
            onOwner={(id, e) => void updateProjectById(id, { ownerEmail: e })}
          />
        )}
      </div>

      {selected && <ProjectView ctx={ctx} project={selected} api={api} onClose={() => setSelectedId(null)} />}

      {newOpen && (
        <ProjectFormModal ctx={ctx} mode="create" templates={templates} onClose={() => setNewOpen(false)} onSubmit={(values, templateId) => createProject(values, templateId)} />
      )}

      {toast}
    </>
  );
}

/* ------------------------------------------------------------------- table */

function TriCheck({ state, onClick, label }: { state: "on" | "off" | "some"; onClick: () => void; label: string }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-md border transition-all duration-150",
        state === "off" ? "border-border-strong hover:border-sirius" : "border-sirius bg-sirius text-white",
      )}
    >
      {state === "on" && <Check size={12} strokeWidth={3} />}
      {state === "some" && <Minus size={12} strokeWidth={3} />}
    </button>
  );
}

function ProjectTable({
  ctx,
  projects,
  checked,
  onToggle,
  onToggleAll,
  onOpen,
  onStatus,
  onOwner,
}: {
  ctx: ProjectsContext;
  projects: ProjectDetail[];
  checked: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  onStatus: (id: string, status: string) => void;
  onOwner: (id: string, email: string | null) => void;
}) {
  const allState: "on" | "off" | "some" = checked.size === 0 ? "off" : checked.size >= projects.length ? "on" : "some";
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <table className="w-full border-collapse font-body">
        <thead>
          <tr className="border-b border-border bg-bg-subtle/60">
            {ctx.canManage && <th className="w-12 px-4 py-3"><TriCheck state={allState} onClick={onToggleAll} label="Select all projects" /></th>}
            <th className="px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Project</th>
            <th className="w-[168px] px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Status</th>
            <th className="w-[210px] px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Owner</th>
            <th className="w-[150px] px-4 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">Delivery</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {projects.map((p) => {
            const progress = projectProgress(p, ctx.config);
            const complete = progress.total > 0 && progress.done === progress.total;
            const done = isProjectComplete(ctx.config, p.status);
            const overdue = isOverdue(p.deliveryDate) && !complete && !done;
            const isChecked = checked.has(p.id);
            return (
              <tr key={p.id} onClick={() => onOpen(p.id)} className={cn("pm-in group cursor-pointer transition-colors", isChecked ? "bg-accent-soft/50" : done ? "bg-[#2DB47A]/[0.04] hover:bg-[#2DB47A]/[0.08]" : "hover:bg-bg-muted/40")}>
                {ctx.canManage && (
                  <td className="px-4 py-3.5"><TriCheck state={isChecked ? "on" : "off"} onClick={() => onToggle(p.id)} label={`Select ${p.name}`} /></td>
                )}
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    {done ? <CheckCircle2 size={15} className="shrink-0 text-[#2DB47A]" /> : p.type && <OptionDot ctx={ctx} typeId={p.type} />}
                    <span className={cn("font-body text-[14px] font-semibold transition-colors", done ? "text-fg-muted" : "text-fg group-hover:text-sirius")}>{p.name}</span>
                    {typeLabel(ctx, p.type) && <span className="hidden font-body text-[11.5px] text-fg-subtle sm:inline">· {typeLabel(ctx, p.type)}</span>}
                  </div>
                  {progress.total > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1 w-32 overflow-hidden rounded-full bg-bg-muted">
                        <div className={cn("h-full rounded-full transition-all duration-500", complete ? "bg-[#2DB47A]" : "bg-sirius")} style={{ width: `${progress.pct}%` }} />
                      </div>
                      <span className="tabular-nums font-body text-[10.5px] font-medium text-fg-subtle">{progress.done}/{progress.total} tasks</span>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3.5"><StatusSelect options={ctx.config.projectStatuses} value={p.status} onChange={(s) => onStatus(p.id, s)} disabled={!ctx.canManage} /></td>
                <td className="px-4 py-3.5"><OwnerSelect members={ctx.csms} value={p.ownerEmail} onChange={(e) => onOwner(p.id, e)} disabled={!ctx.canManage} /></td>
                <td className="px-4 py-3.5"><span className={cn("whitespace-nowrap font-body text-[13px]", overdue ? "font-semibold text-[#B23A57]" : "text-fg-muted")}>{formatDate(p.deliveryDate)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function typeLabel(ctx: ProjectsContext, typeId: string | null): string | null {
  if (!typeId) return null;
  return ctx.config.projectTypes.find((t) => t.id === typeId)?.label ?? null;
}

/** Tiny coloured dot for the project type, matching the type option's colour. */
function OptionDot({ ctx, typeId }: { ctx: ProjectsContext; typeId: string }) {
  const opt = ctx.config.projectTypes.find((t) => t.id === typeId);
  const color = opt?.color ?? "neutral";
  const cls: Record<string, string> = {
    sirius: "bg-sirius", aurora: "bg-[#2DB47A]", stellar: "bg-[#C99A14]", nova: "bg-[#D14B6B]",
    eclipse: "bg-eclipse", cosmos: "bg-cosmos", halo: "bg-neutral-500", neutral: "bg-neutral-400",
  };
  return <span className={cn("inline-block size-2 rounded-full", cls[color])} title={opt?.label} />;
}
