"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ExternalLink, UserCog, Wrench, Loader2, Sparkles, Hand, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { HealthPill } from "@/components/ui/HealthPill";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";
import type { AssignmentSource, Csm, HealthScore } from "@/lib/types";
import { setCsmOwnerAction, setImplementationOwnerAction } from "@/app/(app)/clients/[id]/owner-actions";
import { formatCurrency, formatDate } from "@/lib/format";

export interface OwnerOption {
  email: string;
  name: string;
  role: string;
}

function SourceBadge({ source }: { source?: AssignmentSource | null }) {
  if (!source) return null;
  const auto = source === "auto";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wide",
        auto ? "bg-accent-soft text-sirius" : "bg-bg-muted text-fg-muted",
      )}
    >
      {auto ? <Sparkles size={9} /> : <Hand size={9} />}
      {auto ? "Auto" : "Manual"}
    </span>
  );
}

/** Profile-completeness badge. Red is deliberately loud — a bright, saturated,
 *  slightly-clashing warning color instead of the app's muted palette — so an
 *  incomplete must-have profile can't blend in and get ignored. Yellow is a
 *  quiet nudge; a fully complete profile renders nothing at all. */
function CompletenessBadge({ severity, missingRed, missingYellow }: { severity: "red" | "yellow" | "none"; missingRed: string[]; missingYellow: string[] }) {
  if (severity === "none") return null;
  if (severity === "red") {
    return (
      <span
        title={`Missing required info: ${missingRed.join(", ")}`}
        className="inline-flex animate-pulse items-center gap-1.5 rounded-full border-2 border-[#B91414] bg-[#E31B1B] px-2.5 py-1 font-body text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[0_0_0_3px_rgba(227,27,27,0.28)]"
      >
        <AlertTriangle size={13} strokeWidth={2.5} />
        Incomplete profile
      </span>
    );
  }
  return (
    <span
      title={`Nice to have: ${missingYellow.join(", ")}`}
      className="inline-flex items-center gap-1.5 rounded-full bg-[#FBF6E0] px-2.5 py-1 font-body text-[11px] font-semibold text-[#8A6A0A]"
    >
      <AlertTriangle size={12} strokeWidth={2} />
      Missing some info
    </span>
  );
}

function OwnerCell({
  icon: Icon,
  label,
  owner,
  source,
  options,
  canEdit,
  roleLabels,
  onSave,
}: {
  icon: typeof UserCog;
  label: string;
  owner: Csm | null;
  source?: AssignmentSource | null;
  options: OwnerOption[];
  canEdit: boolean;
  roleLabels: Record<string, string>;
  onSave: (email: string | null) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(owner?.email ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await onSave(value || null);
      if (!r.ok) setError(r.error ?? "Failed.");
      else {
        setEditing(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-2.5 px-5 py-4">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className="shrink-0 text-fg-subtle" />
        <span className="whitespace-nowrap font-body text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
          {label}
        </span>
        {!owner && <AlertTriangle size={11} strokeWidth={2.5} className="shrink-0 text-[#E31B1B]" aria-label="Required — missing" />}
        <SourceBadge source={source} />
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            className="w-full rounded-[10px] border border-border bg-bg px-3 py-2 font-body text-[13px] text-fg outline-none transition-colors focus:border-sirius focus:ring-2 focus:ring-sirius/15"
          >
            <option value="">Unassigned</option>
            {options.map((o) => (
              <option key={o.email} value={o.email}>
                {o.name} · {roleLabels[o.role] ?? o.role}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg bg-sirius px-3 py-1.5 font-body text-[12px] font-semibold text-white disabled:opacity-50"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setValue(owner?.email ?? "");
                setError(null);
              }}
              className="rounded-lg border border-border px-3 py-1.5 font-body text-[12px] font-medium text-fg-muted hover:text-fg"
            >
              Cancel
            </button>
          </div>
          {error && <span className="font-body text-[11.5px] text-[#B23A57]">{error}</span>}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          {owner ? (
            <span className="flex min-w-0 items-center gap-2.5">
              <Avatar initials={owner.initials} size={30} />
              <span className="min-w-0">
                <span className="block truncate font-body text-[13px] font-semibold leading-tight text-fg">
                  {owner.name}
                </span>
                {owner.email && (
                  <span className="mt-0.5 block truncate font-body text-[11px] text-fg-subtle">
                    {owner.email}
                  </span>
                )}
              </span>
            </span>
          ) : (
            <span className="font-body text-[13px] text-fg-subtle">Unassigned</span>
          )}
          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="mt-0.5 shrink-0 rounded-lg border border-border px-2.5 py-1 font-body text-[11.5px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius"
            >
              {owner ? "Reassign" : "Assign"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Account-level multi-owner cell — read-only. Account Executives are derived
 *  from the client's deals (deal-level HubSpot "Account Executive" field), so
 *  there's nothing to assign here. */
export interface ClientHeaderCardProps {
  clientId: string;
  name: string;
  industry: string | null;
  country: string | null;
  tier: string | null;
  statusLabel: string;
  statusTone: "sirius" | "neutral";
  health: HealthScore;
  hubspotUrl?: string;
  arr: number;
  currency: string;
  activeDealsCount: number;
  upcomingRenewal: string | null;
  csm: Csm | null;
  csmSource?: AssignmentSource | null;
  implementationOwner: Csm | null;
  implementationOwnerSource?: AssignmentSource | null;
  csmOptions: OwnerOption[];
  implementationOptions: OwnerOption[];
  canEdit: boolean;
  roleLabels: Record<string, string>;
  profileSeverity: "red" | "yellow" | "none";
  missingRed: string[];
  missingYellow: string[];
  /** Auto-rolled-up from every tracked deal's Use Case field (read-only —
   *  see the deal card to change it). */
  useCases: string[];
  /** Onboarding period (kickoff→launch) — a short label like "18d" or
   *  "42d · ongoing", or null when no kickoff date is recorded yet. */
  onboardingLabel: string | null;
}

export function ClientHeaderCard({
  clientId,
  name,
  industry,
  country,
  tier,
  statusLabel,
  statusTone,
  health,
  hubspotUrl,
  arr,
  currency,
  activeDealsCount,
  upcomingRenewal,
  csm,
  csmSource,
  implementationOwner,
  implementationOwnerSource,
  csmOptions,
  implementationOptions,
  canEdit,
  roleLabels,
  profileSeverity,
  missingRed,
  missingYellow,
  useCases,
  onboardingLabel,
}: ClientHeaderCardProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {/* ── Identity + health ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4 px-6 pb-5 pt-6">
        <div className="flex items-start gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-cosmos text-white">
            <Building2 size={26} strokeWidth={1.5} />
          </span>
          <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Badge tone={statusTone}>{statusLabel}</Badge>
              {tier && <Badge tone="neutral">{tier}</Badge>}
              {onboardingLabel && <Badge tone="sirius" dot>Onboarding · {onboardingLabel}</Badge>}
              <CompletenessBadge severity={profileSeverity} missingRed={missingRed} missingYellow={missingYellow} />
            </div>
            <h1 className="h3">{name}</h1>
            <p className="caption mt-1">
              {industry ?? "—"} · {country ?? "—"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <HealthPill health={health} size={52} />
          {hubspotUrl && (
            <Button
              href={hubspotUrl}
              variant="secondary"
              size="sm"
              iconRight={ExternalLink}
              target="_blank"
              rel="noreferrer"
            >
              HubSpot
            </Button>
          )}
        </div>
      </div>

      {/* ── Metrics + owners strip ─────────────────────────────────── */}
      <div className="flex flex-col divide-y divide-border-subtle border-t border-border-subtle md:flex-row md:divide-x md:divide-y-0">
        {/* ARR */}
        <div className="flex flex-1 flex-col justify-center px-5 py-4">
          <div className="mb-1.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
            Annual Recurring Revenue
          </div>
          <span className="tabular font-display text-xl font-bold text-fg">
            {formatCurrency(arr, currency)}
          </span>
          <span className="mt-0.5 font-body text-[11px] text-fg-subtle">
            {activeDealsCount} active deal{activeDealsCount === 1 ? "" : "s"}
          </span>
        </div>

        {/* Renewal */}
        <div className="flex flex-1 flex-col justify-center px-5 py-4">
          <div className="mb-1.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
            Upcoming Renewal
          </div>
          <span className="font-body text-[13px] font-semibold text-fg">
            {formatDate(upcomingRenewal)}
          </span>
        </div>

        {/* Use case(s) — auto-rolled up from every tracked deal, read-only */}
        <div className="flex flex-1 flex-col justify-center px-5 py-4">
          <div className="mb-1.5 font-body text-[10.5px] font-semibold uppercase tracking-[0.07em] text-fg-subtle">
            Use Case(s)
          </div>
          {useCases.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {useCases.map((uc) => (
                <Badge key={uc} tone="neutral" className="whitespace-nowrap">{uc}</Badge>
              ))}
            </div>
          ) : (
            <span className="font-body text-[13px] text-fg-subtle">Not set</span>
          )}
        </div>

        {/* CSM */}
        <OwnerCell
          icon={UserCog}
          label="Customer Success Manager"
          owner={csm}
          source={csmSource}
          options={csmOptions}
          canEdit={canEdit}
          roleLabels={roleLabels}
          onSave={(email) => setCsmOwnerAction(clientId, email)}
        />

        {/* Implementation */}
        <OwnerCell
          icon={Wrench}
          label="Implementation Owner"
          owner={implementationOwner}
          source={implementationOwnerSource}
          options={implementationOptions}
          canEdit={canEdit}
          roleLabels={roleLabels}
          onSave={(email) => setImplementationOwnerAction(clientId, email)}
        />
      </div>
    </div>
  );
}
