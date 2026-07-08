"use client";

/* Project Management tab — a kanban board of PROJECT cards grouped by status
   columns (drag a card to change status), a "New project" entry (blank or from
   a shared template), and a slide-over drawer for the milestones/tasks of the
   project you open. Benchmarked on Vitally / Planhat success-plan boards. */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderKanban, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import type { Contact } from "@/lib/types";
import type { ProjectConfig } from "@/lib/projects/config";
import type { ProjectDetail, ProjectTemplate } from "@/lib/projects/types";
import { createProjectAction, updateProjectAction } from "@/app/(app)/clients/[id]/project-actions";
import { ProjectDrawer } from "./ProjectDrawer";
import { ProjectFormModal } from "./forms";
import {
  EmptyState,
  OptionPill,
  OwnerAvatar,
  formatDate,
  isOverdue,
  memberName,
  projectProgress,
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

export function ProjectsTab(props: Props) {
  const { clientId, config, templates, contacts, csms, implementers, canManage, dbEnabled } = props;
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectDetail[]>(props.initialProjects);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [, startTransition] = useTransition();

  // Re-sync from the server after any router.refresh() (mutations re-render the
  // page and hand down fresh initialProjects).
  useEffect(() => setProjects(props.initialProjects), [props.initialProjects]);

  const ctx: ProjectsContext = useMemo(() => {
    const members: Member[] = [];
    const seen = new Set<string>();
    for (const m of [...csms, ...implementers]) {
      const key = m.email.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        members.push(m);
      }
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

  function refresh() {
    startTransition(() => router.refresh());
  }

  // Optimistic status change on drag; the server action + refresh reconcile.
  async function moveProject(projectId: string, status: string) {
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status } : p)));
    const res = await updateProjectAction(clientId, projectId, { status });
    if (!res.ok) {
      alert(res.error ?? "Couldn't move the project.");
    }
    refresh();
  }

  if (!dbEnabled) {
    return (
      <EmptyState
        icon={FolderKanban}
        title="Projects need the database"
        body="The project tracker stores its data in Postgres. It's disabled in this preview/sample environment, but works on the deployed app."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[15px] font-semibold text-fg">Projects</h2>
          <span className="tabular-nums rounded-full bg-bg-muted px-2 py-0.5 font-body text-[11px] font-semibold text-fg-muted">{projects.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/settings?tab=projects" className="hidden items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-body text-[12px] font-medium text-fg-muted hover:text-fg sm:inline-flex" title="Manage statuses, types & templates">
            <Settings2 size={13} /> Configure
          </Link>
          {canManage && (
            <Button size="sm" iconLeft={Plus} onClick={() => setNewOpen(true)}>
              New project
            </Button>
          )}
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
        <div className="flex gap-3 overflow-x-auto pb-2">
          {config.projectStatuses.map((status) => {
            const inColumn = projects.filter((p) => p.status === status.id);
            return (
              <ProjectColumn
                key={status.id}
                label={status.label}
                color={status.color}
                count={inColumn.length}
                canManage={canManage}
                onDropProject={(projectId) => moveProject(projectId, status.id)}
              >
                {inColumn.map((p) => (
                  <ProjectCard key={p.id} ctx={ctx} project={p} onOpen={() => setSelectedId(p.id)} />
                ))}
              </ProjectColumn>
            );
          })}
          {(() => {
            // Projects whose status id was renamed/removed from the config would
            // otherwise match no column and silently vanish — collect them into a
            // read-only "Uncategorized" column so they stay visible and can be
            // dragged back onto a valid status.
            const known = new Set(config.projectStatuses.map((s) => s.id));
            const orphans = projects.filter((p) => !known.has(p.status));
            if (orphans.length === 0) return null;
            return (
              <ProjectColumn label="Uncategorized" color="neutral" count={orphans.length} canManage={canManage}>
                {orphans.map((p) => (
                  <ProjectCard key={p.id} ctx={ctx} project={p} onOpen={() => setSelectedId(p.id)} />
                ))}
              </ProjectColumn>
            );
          })()}
        </div>
      )}

      {selected && <ProjectDrawer ctx={ctx} project={selected} onClose={() => setSelectedId(null)} />}

      {newOpen && (
        <ProjectFormModal
          ctx={ctx}
          mode="create"
          templates={templates}
          onClose={() => setNewOpen(false)}
          onSubmit={async (values, templateId) => {
            const res = await createProjectAction(clientId, values, templateId);
            if (res.ok) {
              refresh();
              if (res.projectId) setSelectedId(res.projectId);
            }
            return res;
          }}
        />
      )}
    </div>
  );
}

function ProjectColumn({
  label,
  color,
  count,
  canManage,
  onDropProject,
  children,
}: {
  label: string;
  color: string;
  count: number;
  canManage: boolean;
  /** Omitted for the read-only "Uncategorized" column (can't drop onto it). */
  onDropProject?: (projectId: string) => void;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  const droppable = canManage && !!onDropProject;
  return (
    <div
      onDragOver={(e) => {
        if (!droppable) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (!droppable) return;
        const id = e.dataTransfer.getData("text/project");
        if (id) onDropProject!(id);
      }}
      className={cn(
        "flex w-[280px] shrink-0 flex-col rounded-xl border bg-bg-muted/30 transition-colors",
        over ? "border-sirius bg-accent-soft/40" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={cn("size-2 rounded-full", DOT[color] ?? "bg-neutral-400")} />
        <span className="font-body text-[12.5px] font-semibold text-fg">{label}</span>
        <span className="tabular-nums ml-auto font-body text-[11px] font-semibold text-fg-subtle">{count}</span>
      </div>
      <div className="flex min-h-[60px] flex-col gap-2 px-2 pb-2">{children}</div>
    </div>
  );
}

// Column header dot colours keyed to the config option colour token.
const DOT: Record<string, string> = {
  sirius: "bg-sirius",
  aurora: "bg-[#2DB47A]",
  stellar: "bg-[#C99A14]",
  nova: "bg-[#D14B6B]",
  eclipse: "bg-eclipse",
  cosmos: "bg-cosmos",
  halo: "bg-neutral-500",
  neutral: "bg-neutral-400",
};

function ProjectCard({ ctx, project, onOpen }: { ctx: ProjectsContext; project: ProjectDetail; onOpen: () => void }) {
  const progress = projectProgress(project, ctx.config);
  const owner = memberName(ctx.csms, project.ownerEmail);
  const implementer = memberName(ctx.implementers, project.implementerEmail);
  const contact = ctx.contacts.find((c) => c.id === project.contactId)?.name ?? null;
  const complete = progress.total > 0 && progress.done === progress.total;
  const overdue = isOverdue(project.deliveryDate) && !complete;
  const milestoneCount = project.milestones.length;

  return (
    <div
      draggable={ctx.canManage}
      onDragStart={(e) => e.dataTransfer.setData("text/project", project.id)}
      onClick={onOpen}
      className={cn(
        "cursor-pointer rounded-lg border border-border bg-bg p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-sirius-200 hover:shadow-md",
        ctx.canManage && "active:cursor-grabbing",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-body text-[13px] font-semibold leading-snug text-fg">{project.name}</span>
        {project.type && <OptionPill options={ctx.config.projectTypes} id={project.type} />}
      </div>

      {/* Progress */}
      <div className="mt-2.5 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-muted">
          <div className={cn("h-full rounded-full", complete ? "bg-[#2DB47A]" : "bg-sirius")} style={{ width: `${progress.pct}%` }} />
        </div>
        <span className="tabular-nums font-body text-[11px] font-semibold text-fg-muted">{progress.done}/{progress.total}</span>
      </div>

      {/* Meta */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center -space-x-1.5">
          {owner && <OwnerAvatar name={owner} size={20} title="CSM" />}
          {implementer && <OwnerAvatar name={implementer} size={20} title="Implementer" />}
        </div>
        <div className="flex items-center gap-2 font-body text-[11px] text-fg-muted">
          {milestoneCount > 0 && <span>{milestoneCount} milestone{milestoneCount === 1 ? "" : "s"}</span>}
          {project.deliveryDate && (
            <span className={cn("whitespace-nowrap", overdue ? "font-semibold text-[#B23A57]" : "")}>{formatDate(project.deliveryDate)}</span>
          )}
        </div>
      </div>

      {contact && <div className="mt-1.5 truncate font-body text-[11px] text-fg-subtle">Contact: {contact}</div>}
    </div>
  );
}
