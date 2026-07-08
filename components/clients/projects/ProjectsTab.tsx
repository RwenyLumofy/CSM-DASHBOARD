"use client";

/* Project Management tab.

   List = a clean full-width TABLE (name · status · owner · delivery) — no more
   cramped horizontal project board. Opening a project swaps in a FULL-WIDTH
   focus view (ProjectView) with the task kanban given real room. All mutations
   are applied optimistically to local state for instant, animated feedback
   (this is also what fixes drag-drop: the card moves the moment you drop,
   independent of server latency), then reconciled with the server. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { Contact } from "@/lib/types";
import { defaultProjectStatusId, defaultTaskStatusId, type ProjectConfig } from "@/lib/projects/config";
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
  OwnerAvatar,
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
  const [newOpen, setNewOpen] = useState(false);
  const [lastMovedTaskId, setLastMovedTaskId] = useState<string | null>(null);
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync from the server after any refresh() (stable keys mean unchanged rows
  // don't remount, so only genuinely new/changed rows re-animate).
  useEffect(() => setProjects(props.initialProjects), [props.initialProjects]);

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

  /* ---- persistence (skipped in demo/no-DB so the module still works locally) ---- */
  async function run(action: () => Promise<Result>): Promise<Result> {
    if (!dbEnabled) return { ok: true };
    const res = await action();
    if (res && !res.ok) show(res.error ?? "Something went wrong.");
    router.refresh();
    return res ?? { ok: true };
  }

  function flashLanded(taskId: string) {
    setLastMovedTaskId(taskId);
    if (landTimer.current) clearTimeout(landTimer.current);
    landTimer.current = setTimeout(() => setLastMovedTaskId(null), 640);
  }

  function updateProjectById(projectId: string, patch: Partial<ProjectInput> & { status?: string }): Promise<Result> {
    patchProject(projectId, (p) => ({ ...p, ...patch }));
    return run(() => updateProjectAction(clientId, projectId, patch));
  }

  const api: ProjectApi = {
    lastMovedTaskId,
    moveTask: (task, toStatus) => {
      patchTaskInPlace(task.projectId, task.id, (t) => ({ ...t, status: toStatus }));
      flashLanded(task.id);
      void run(() => updateTaskAction(clientId, task.id, { status: toStatus }));
    },
    toggleTask: (task) => {
      const doneId = config.taskStatuses.find((s) => s.terminal === "done")?.id;
      if (!doneId) return;
      const next = task.status === doneId ? defaultTaskStatusId(config) : doneId;
      patchTaskInPlace(task.projectId, task.id, (t) => ({ ...t, status: next }));
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
      const task: Task = {
        id: `tmp-${rand()}`, projectId, milestoneId, clientId, name: input.name, description: input.description ?? null,
        type: input.type ?? null, status, startDate: input.startDate ?? null, deliveryDate: input.deliveryDate ?? null,
        ownerEmail: input.ownerEmail ?? null, sortOrder: 1e6, completedAt: null, createdAt: nowIso(), updatedAt: nowIso(),
      };
      patchProject(projectId, (p) => ({ ...p, milestones: p.milestones.map((m) => (m.id === milestoneId ? { ...m, tasks: [...m.tasks, task] } : m)) }));
      return run(() => addTaskAction(clientId, projectId, milestoneId, input));
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
      const milestone: MilestoneWithTasks = { id: `tmp-${rand()}`, projectId, clientId, name: input.name, description: input.description ?? null, dueDate: input.dueDate ?? null, sortOrder: 1e6, createdAt: nowIso(), tasks: [] };
      patchProject(projectId, (p) => ({ ...p, milestones: [...p.milestones, milestone] }));
      return run(() => addMilestoneAction(clientId, projectId, input as MilestoneInput));
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

        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            body="Track onboarding, implementations, expansions and more — organised as milestones and tasks. Start blank or from a shared template."
            action={canManage ? <Button size="sm" iconLeft={Plus} onClick={() => setNewOpen(true)}>New project</Button> : undefined}
          />
        ) : (
          <ProjectTable ctx={ctx} projects={projects} onOpen={setSelectedId} onStatus={(id, s) => void updateProjectById(id, { status: s })} />
        )}
      </div>

      {selected && <ProjectView ctx={ctx} project={selected} api={api} onClose={() => setSelectedId(null)} />}

      {newOpen && (
        <ProjectFormModal
          ctx={ctx}
          mode="create"
          templates={templates}
          onClose={() => setNewOpen(false)}
          onSubmit={(values, templateId) => createProject(values, templateId)}
        />
      )}

      {toast}
    </>
  );
}

/* ------------------------------------------------------------------- table */

function ProjectTable({
  ctx,
  projects,
  onOpen,
  onStatus,
}: {
  ctx: ProjectsContext;
  projects: ProjectDetail[];
  onOpen: (id: string) => void;
  onStatus: (id: string, status: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <table className="w-full border-collapse font-body">
        <thead>
          <tr className="border-b border-border bg-bg-muted/60">
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Project</th>
            <th className="w-[160px] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Status</th>
            <th className="w-[200px] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Owner</th>
            <th className="w-[150px] px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Delivery</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {projects.map((p) => {
            const progress = projectProgress(p, ctx.config);
            const complete = progress.total > 0 && progress.done === progress.total;
            const owner = memberName(ctx.csms, p.ownerEmail);
            const overdue = isOverdue(p.deliveryDate) && !complete;
            return (
              <tr key={p.id} onClick={() => onOpen(p.id)} className="pm-in group cursor-pointer transition-colors hover:bg-bg-muted/40">
                {/* Project name + subtle progress */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {p.type && <span className="hidden sm:inline"><OptionDot ctx={ctx} typeId={p.type} /></span>}
                    <span className="font-body text-[13.5px] font-semibold text-fg transition-colors group-hover:text-sirius">{p.name}</span>
                  </div>
                  {progress.total > 0 && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1 w-28 overflow-hidden rounded-full bg-bg-muted">
                        <div className={cn("h-full rounded-full transition-all duration-500", complete ? "bg-[#2DB47A]" : "bg-sirius")} style={{ width: `${progress.pct}%` }} />
                      </div>
                      <span className="tabular-nums font-body text-[10.5px] font-semibold text-fg-subtle">{progress.done}/{progress.total}</span>
                    </div>
                  )}
                </td>
                {/* Status (inline change) */}
                <td className="px-4 py-3">
                  <StatusSelect options={ctx.config.projectStatuses} value={p.status} onChange={(s) => onStatus(p.id, s)} disabled={!ctx.canManage} />
                </td>
                {/* Owner */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <OwnerAvatar name={owner} size={22} title="CSM" />
                    <span className="truncate font-body text-[13px] text-fg-muted">{owner ?? "Unassigned"}</span>
                  </div>
                </td>
                {/* Delivery */}
                <td className="px-4 py-3">
                  <span className={cn("whitespace-nowrap font-body text-[13px]", overdue ? "font-semibold text-[#B23A57]" : "text-fg-muted")}>{formatDate(p.deliveryDate)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
