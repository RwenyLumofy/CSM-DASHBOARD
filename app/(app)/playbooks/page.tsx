import Link from "next/link";
import { ListChecks, Zap } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { getClients, getOpenTasks, getPlaybooks } from "@/lib/data";
import { formatDate } from "@/lib/format";
import type { PlaybookTrigger } from "@/lib/types";

export const metadata = { title: "Playbooks · Lumofy CS" };

const TRIGGER_LABEL: Record<PlaybookTrigger, string> = {
  health_below: "Health below",
  renewal_within: "Renewal within",
  csat_below: "CSAT below",
  open_tickets_above: "Open tickets above",
  adoption_below: "Adoption below",
  manual: "Manual",
};

function triggerText(trigger: PlaybookTrigger, value?: number): string {
  switch (trigger) {
    case "health_below":
      return `Auto-starts when health drops below ${value}`;
    case "renewal_within":
      return `Auto-starts ${value} days before renewal`;
    case "csat_below":
      return `Auto-starts when CSAT drops below ${value}%`;
    case "open_tickets_above":
      return `Auto-starts when open tickets exceed ${value}`;
    case "adoption_below":
      return `Auto-starts when seat adoption drops below ${value}%`;
    case "manual":
      return "Started manually by the CSM";
  }
}

export default async function PlaybooksPage() {
  const [playbooks, openTasks, clients] = await Promise.all([getPlaybooks(), getOpenTasks(), getClients()]);
  const clientName = (id: string) => clients.find((c) => c.id === id)?.name ?? id;

  return (
    <div className="flex flex-col gap-7 p-8">
      <PageHeader
        eyebrow="Process"
        title="Playbooks"
        description="Repeatable plays that fire automatically on health, renewal, and adoption signals — so no account slips."
      />

      {/* Open tasks across the portfolio */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <CardEyebrow>Across the portfolio</CardEyebrow>
          <Badge tone="sirius">{openTasks.length} open tasks</Badge>
        </div>
        {openTasks.length === 0 ? (
          <p className="caption">No open playbook tasks.</p>
        ) : (
          <ul className="flex flex-col">
            {openTasks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 border-b border-border-subtle py-2.5 last:border-0">
                <div className="flex items-center gap-3">
                  <span className={`size-2 rounded-pill ${t.status === "in_progress" ? "bg-sirius" : "bg-border-strong"}`} />
                  <span className="font-body text-[13px] text-fg">{t.title}</span>
                  <Link href={`/clients/${t.clientId}`} className="caption hover:text-sirius">
                    {clientName(t.clientId)}
                  </Link>
                </div>
                <div className="flex items-center gap-3">
                  {t.status === "in_progress" && <Badge tone="sirius">In progress</Badge>}
                  {t.dueDate && <span className="caption tabular">{formatDate(t.dueDate)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Playbook definitions */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {playbooks.map((pb) => (
          <Card key={pb.id} className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <span className="grid size-9 place-items-center rounded-md bg-accent-soft text-sirius">
                {pb.trigger === "manual" ? <ListChecks size={18} strokeWidth={1.75} /> : <Zap size={18} strokeWidth={1.75} />}
              </span>
              {pb.active && <Badge tone="aurora" dot>Active</Badge>}
            </div>
            <div>
              <h3 className="h6">{pb.name}</h3>
              <p className="caption mt-1 leading-relaxed">{pb.description}</p>
            </div>
            <div className="rounded-md bg-bg-muted px-3 py-2">
              <span className="caption">{triggerText(pb.trigger, pb.triggerValue)}</span>
            </div>
            <ol className="flex flex-col gap-2">
              {pb.steps.map((s, i) => (
                <li key={s.id} className="flex items-start gap-2.5">
                  <span className="tabular mt-0.5 grid size-5 shrink-0 place-items-center rounded-pill bg-bg-muted font-body text-[11px] font-semibold text-fg-muted">
                    {i + 1}
                  </span>
                  <div className="flex flex-1 items-center justify-between gap-2">
                    <span className="font-body text-[13px] text-fg">{s.title}</span>
                    {s.dueOffsetDays != null && <span className="caption tabular shrink-0">D+{s.dueOffsetDays}</span>}
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-auto caption">{TRIGGER_LABEL[pb.trigger]} trigger · {pb.steps.length} steps</div>
          </Card>
        ))}
      </div>
    </div>
  );
}
