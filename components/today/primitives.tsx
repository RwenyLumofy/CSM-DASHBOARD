/* =========================================================================
   Today page — shared presentational primitives. No hooks, so usable from both
   server and client trees. Uses Signal's semantic status tokens (soft *-bg /
   *-fg) for restrained status colour — never bright backgrounds.
   ========================================================================= */

import type { ReactNode } from "react";
import { AlertTriangle, Loader2, Inbox, WifiOff, Lock, Clock, ShieldAlert, RefreshCw } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Confidence, DataFreshness, OperationalState, SectionStatus } from "@/lib/today/types";
import { OPERATIONAL_STATE, CONFIDENCE } from "@/lib/today/format";
import { freshnessLabel } from "@/lib/today/repo";

export type StatusTone = "danger" | "warning" | "info" | "success" | "eclipse" | "neutral";

const TONE_CLS: Record<StatusTone, string> = {
  danger: "bg-danger-bg text-danger-fg",
  warning: "bg-warning-bg text-warning-fg",
  info: "bg-info-bg text-info-fg",
  success: "bg-success-bg text-success-fg",
  eclipse: "bg-eclipse-bg text-eclipse-fg",
  neutral: "bg-bg-muted text-fg-muted",
};

const DOT_CLS: Record<StatusTone, string> = {
  danger: "bg-danger", warning: "bg-warning", info: "bg-info", success: "bg-success", eclipse: "bg-eclipse", neutral: "bg-fg-subtle",
};

export function StatusPill({ tone, dot = false, children, className }: { tone: StatusTone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 font-body text-[11.5px] font-semibold", TONE_CLS[tone], className)}>
      {dot && <span className={cn("size-1.5 rounded-full", DOT_CLS[tone])} aria-hidden />}
      {children}
    </span>
  );
}

export function OperationalStateBadge({ state }: { state: OperationalState }) {
  const { label, tone } = OPERATIONAL_STATE[state];
  return <StatusPill tone={tone} dot>{label}</StatusPill>;
}

export function ConfidenceIndicator({ confidence, showLabel = true }: { confidence: Confidence; showLabel?: boolean }) {
  const { label, dots } = CONFIDENCE[confidence];
  const tone: StatusTone = confidence === "high" ? "success" : confidence === "medium" ? "info" : confidence === "low" ? "warning" : "neutral";
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("h-2.5 w-1 rounded-sm", i < dots ? DOT_CLS[tone] : "bg-border-strong")} />
        ))}
      </span>
      {showLabel && <span className="font-body text-[11.5px] text-fg-muted">{confidence === "unknown" ? "Unknown" : `${confidence[0].toUpperCase()}${confidence.slice(1)}`}</span>}
    </span>
  );
}

export function EvidenceFreshness({ freshness }: { freshness: DataFreshness }) {
  const tone: StatusTone = freshness.level === "fresh" ? "success" : freshness.level === "recent" ? "neutral" : freshness.level === "aging" ? "warning" : freshness.level === "stale" ? "danger" : "danger";
  const Icon = freshness.level === "missing" ? WifiOff : Clock;
  return (
    <span className="inline-flex items-center gap-1.5 font-body text-[11.5px] text-fg-subtle" title={freshnessLabel(freshness)}>
      <Icon size={12} className={cn(tone === "danger" && "text-danger", tone === "warning" && "text-warning")} />
      <span className="truncate">{freshnessLabel(freshness)}</span>
    </span>
  );
}

/* ------------------------------------------------------------- section shell */

export function Section({ title, supporting, action, children, className }: {
  title: string; supporting?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <section className={cn("flex flex-col", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-semibold text-fg">{title}</h2>
          {supporting && <p className="mt-0.5 font-body text-[12.5px] text-fg-muted">{supporting}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------ reliability states */

/**
 * Every major section renders through this so loading / empty / partial /
 * stale / error / permission-denied are visually distinct and never silently
 * shown as zero. `status: "ok"` renders children.
 */
export function SectionState({ status, empty, onRetry, children }: {
  status: SectionStatus;
  empty?: { title: string; body?: string; action?: ReactNode };
  onRetry?: () => void;
  children: ReactNode;
}) {
  if (status === "ok" || status === "partial") return <>{children}</>;

  const shell = (icon: ReactNode, title: string, body: string, action?: ReactNode) => (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-6 py-10 text-center">
      <div className="grid size-9 place-items-center rounded-full bg-bg-muted text-fg-subtle">{icon}</div>
      <p className="font-body text-[13px] font-semibold text-fg">{title}</p>
      <p className="max-w-xs font-body text-[12px] text-fg-muted">{body}</p>
      {action}
    </div>
  );

  switch (status) {
    case "loading":
      return (
        <div className="flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg border border-border-subtle bg-bg-muted/50" />)}
        </div>
      );
    case "empty":
      return shell(<Inbox size={17} />, empty?.title ?? "Nothing here", empty?.body ?? "No items to show.", empty?.action);
    case "stale":
      return shell(<Clock size={17} className="text-warning" />, "Data may be out of date", "This section hasn't refreshed recently. Figures shown are the last known values.",
        onRetry && <button onClick={onRetry} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-[12px] font-semibold text-fg-muted hover:text-fg"><RefreshCw size={13} /> Refresh</button>);
    case "error":
      return shell(<AlertTriangle size={17} className="text-danger" />, "Couldn't load this section", "Something went wrong fetching the data.",
        onRetry && <button onClick={onRetry} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-body text-[12px] font-semibold text-fg-muted hover:text-fg"><RefreshCw size={13} /> Retry</button>);
    case "denied":
      return shell(<Lock size={17} />, "You don't have access", "Ask an administrator if you need visibility into this data.", undefined);
    default:
      return null;
  }
}

export { AlertTriangle, ShieldAlert, Loader2 };
