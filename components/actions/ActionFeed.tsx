"use client";

/* =========================================================================
   The AI Action List surface — a prioritized feed of CSM directives, used in
   two modes:
     - "global": every visible client's actions, with a client filter + a
       global Regenerate (the /inbox "Action list" page).
     - "client": one client's actions inside its profile tab, with a
       per-client Regenerate.
   Actions are live guidance, not tasks: you Dismiss to hide one; it auto-
   resolves server-side when the underlying condition clears.
   ========================================================================= */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  AlarmClockOff,
  ClipboardList,
  ExternalLink,
  FolderKanban,
  HeartPulse,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ActionCategory, ActionPriority } from "@/lib/types";
import { cn } from "@/lib/cn";
import {
  dismissClientActionAction,
  regenerateAllClientActionsAction,
  regenerateClientActionsAction,
} from "@/app/(app)/inbox/client-actions";

export interface ActionRow {
  id: string;
  clientId: string;
  category: ActionCategory;
  signalKey: string;
  priority: ActionPriority;
  title: string;
  insight: string | null;
  source: "ai" | "template";
  clientName: string;
}

const CATEGORY_META: Record<ActionCategory, { label: string; icon: LucideIcon; tone: string }> = {
  incomplete_profile: { label: "Profile", icon: ClipboardList, tone: "border-sirius/30 bg-accent-soft text-sirius" },
  usage: { label: "Usage", icon: Activity, tone: "border-eclipse/30 bg-[#F0E6FF] text-[#6E3FCC]" },
  health: { label: "Health", icon: HeartPulse, tone: "border-[#B23A57]/30 bg-[#FBE7ED] text-[#B23A57]" },
  stakeholders: { label: "Stakeholders", icon: Users, tone: "border-[#2DB47A]/30 bg-[#E6F9EF] text-[#1E8F61]" },
  sentiment: { label: "Sentiment", icon: MessageSquare, tone: "border-[#C99A14]/30 bg-[#FBF6E0] text-[#8A6A0A]" },
  sla: { label: "SLA", icon: AlarmClockOff, tone: "border-[#E31B1B]/30 bg-[#FDE8E8] text-[#B91C1C]" },
  project: { label: "Projects", icon: FolderKanban, tone: "border-[#0E7C7C]/30 bg-[#E6F7F7] text-[#0E7C7C]" },
};

const PRIORITY_META: Record<ActionPriority, { label: string; dot: string; order: number }> = {
  high: { label: "High", dot: "bg-[#E31B1B]", order: 0 },
  medium: { label: "Medium", dot: "bg-[#C99A14]", order: 1 },
  low: { label: "Low", dot: "bg-fg-subtle", order: 2 },
};

function FilterSelect({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-surface px-3 py-2 font-body text-[13px] font-medium text-fg-muted outline-none transition-colors hover:text-fg focus:border-sirius-200"
    >
      {children}
    </select>
  );
}

function ActionCard({ a, mode, onDismiss }: { a: ActionRow; mode: "global" | "client"; onDismiss: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const cat = CATEGORY_META[a.category];
  const pri = PRIORITY_META[a.priority];
  const CatIcon = cat.icon;

  async function dismiss() {
    setBusy(true);
    try {
      await onDismiss(a.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border", cat.tone)}>
        <CatIcon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 font-body text-[11px] font-semibold text-fg-muted">
            <span className={cn("inline-block size-2 rounded-full", pri.dot)} /> {pri.label}
          </span>
          <span className="font-body text-[11px] text-fg-subtle">·</span>
          <span className="font-body text-[11px] font-medium text-fg-subtle">{cat.label}</span>
          {mode === "global" && (
            <>
              <span className="font-body text-[11px] text-fg-subtle">·</span>
              <Link href={`/clients/${a.clientId}`} className="font-body text-[11px] font-semibold text-sirius hover:underline">
                {a.clientName}
              </Link>
            </>
          )}
          {a.source === "ai" && <Sparkles size={11} className="text-sirius" aria-label="AI-written" />}
        </div>
        <p className="font-body text-[13.5px] font-semibold text-fg">{a.title}</p>
        {a.insight && <p className="mt-0.5 font-body text-[12.5px] leading-relaxed text-fg-muted">{a.insight}</p>}
        {mode === "global" && (
          <Link href={`/clients/${a.clientId}`} className="mt-1.5 inline-flex items-center gap-1 font-body text-[12px] font-semibold text-sirius hover:underline">
            Open client <ExternalLink size={12} />
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        disabled={busy}
        title="Dismiss — hides this action until the situation changes"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Dismiss
      </button>
    </li>
  );
}

export function ActionFeed({ items, mode, clientId }: { items: ActionRow[]; mode: "global" | "client"; clientId?: string }) {
  const router = useRouter();
  const [category, setCategory] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [client, setClient] = useState<string>("all");
  const [regenerating, setRegenerating] = useState(false);

  const clientNames = useMemo(
    () => [...new Set(items.map((i) => i.clientName))].sort((a, b) => a.localeCompare(b)),
    [items],
  );
  const categoriesPresent = useMemo(
    () => [...new Set(items.map((i) => i.category))],
    [items],
  );

  const filtered = useMemo(() => {
    return items
      .filter((i) => (category === "all" || i.category === category))
      .filter((i) => (priority === "all" || i.priority === priority))
      .filter((i) => (client === "all" || i.clientName === client))
      .sort((a, b) => {
        const p = PRIORITY_META[a.priority].order - PRIORITY_META[b.priority].order;
        return p !== 0 ? p : a.clientName.localeCompare(b.clientName);
      });
  }, [items, category, priority, client]);

  async function dismiss(id: string) {
    await dismissClientActionAction(id);
    router.refresh();
  }

  async function regenerate() {
    setRegenerating(true);
    try {
      if (mode === "client" && clientId) await regenerateClientActionsAction(clientId);
      else await regenerateAllClientActionsAction();
      router.refresh();
    } finally {
      setRegenerating(false);
    }
  }

  const highCount = items.filter((i) => i.priority === "high").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <span className="font-display text-lg font-bold leading-none tabular text-fg">{items.length}</span>
          <span className="font-body text-[13px] text-fg-muted">
            open action{items.length === 1 ? "" : "s"}{highCount > 0 && <> · <span className="font-semibold text-[#B23A57]">{highCount} high</span></>}
          </span>
        </div>
        <button
          onClick={regenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 font-body text-[12.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius disabled:opacity-50"
        >
          {regenerating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Regenerate
        </button>
      </div>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect value={priority} onChange={setPriority} label="Priority">
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </FilterSelect>
          <FilterSelect value={category} onChange={setCategory} label="Category">
            <option value="all">All categories</option>
            {categoriesPresent.map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
          </FilterSelect>
          {mode === "global" && (
            <FilterSelect value={client} onChange={setClient} label="Account">
              <option value="all">All accounts</option>
              {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </FilterSelect>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center">
          <Sparkles size={26} className="text-sirius" />
          <p className="font-body text-sm font-medium text-fg">
            {items.length === 0 ? "No actions right now." : "No actions match these filters."}
          </p>
          <p className="font-body text-[12.5px] text-fg-subtle">
            {items.length === 0
              ? "When an account needs attention — a missing field, a quiet week, a health dip — it'll surface here."
              : "Try clearing a filter, or Regenerate to refresh."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {filtered.map((a) => <ActionCard key={a.id} a={a} mode={mode} onDismiss={dismiss} />)}
        </ul>
      )}
    </div>
  );
}
