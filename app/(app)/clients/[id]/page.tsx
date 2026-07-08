import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ClientProfileTabs } from "@/components/clients/ClientProfileTabs";
import { ClientHeaderCard } from "@/components/clients/ClientHeaderCard";
import {
  getAttachmentsForClient,
  getClientForProfile,
  getContactsForClient,
  getDealsForClient,
  getEmailsForClient,
  getMeetingsForClient,
  getClientActionsFor,
  getPropertyDefinitions,
  getRoleLabels,
  getTeamMembers,
  getTimelineForClient,
} from "@/lib/data";
import { isSuperAdmin } from "@/lib/auth";
import { integrations } from "@/lib/config";
import { applyDealOverrides, computeRenewal, dealOverridesMap, DEAL_DATES_KEY, type DealDatesMap } from "@/lib/deal-overrides";
import { computeProfileCompleteness } from "@/lib/profile-completeness";
import { getSupabaseProjectUrl } from "@/lib/integrations/supabase-storage";
import { getClientHealthConfig } from "@/lib/assignment/config";

// Per-request data + auth-gated — never static-generate this route.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClientForProfile(id);
  return { title: client ? `${client.name} · Lumofy Signals` : "Client · Lumofy Signals" };
}

export default async function ClientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await getClientForProfile(id);
  if (!client) notFound();

  const [timeline, attachments, deals, contacts, emails, meetings, propertyDefs, csmMembers, implMembers, roleLabels, superAdmin, clientActions, healthConfig] =
    await Promise.all([
      getTimelineForClient(id),
      getAttachmentsForClient(id),
      getDealsForClient(id),
      getContactsForClient(id),
      getEmailsForClient(id),
      getMeetingsForClient(id),
      getPropertyDefinitions(),
      getTeamMembers("csm"),
      getTeamMembers("implementation"),
      getRoleLabels(),
      isSuperAdmin(),
      getClientActionsFor(id),
      getClientHealthConfig(),
    ]);
  const ownerOptions = (ms: typeof csmMembers) => ms.map((m) => ({ email: m.email, name: m.name ?? m.email, role: m.role }));

  const props = client.properties ?? {};
  const industry = client.industry;
  const tier = typeof props.tier === "string" && props.tier.trim() ? props.tier : null;
  const useCases = Array.isArray(props.use_cases_rollup) ? (props.use_cases_rollup as string[]) : [];
  const trackedDeals = deals.filter((d) => d.tracked !== false);
  // Effective deals = synced values with any CSM inline override applied (the
  // same merge the deal card itself displays) — the header must agree with
  // what the CSM sees/sets on the deal card, not the raw HubSpot-synced value.
  const overridesByDeal = dealOverridesMap(props);
  const effectiveTrackedDeals = trackedDeals.map((d) => applyDealOverrides(d, overridesByDeal[d.id]));
  // Upcoming renewal = nearest (effective contract start + 1yr) across all tracked
  // deals that is still in the future — uses CSM overrides where set, so the header
  // nudges the CSM toward the soonest renewal to plan for.
  const upcomingRenewal = (() => {
    const now = Date.now();
    const dates = effectiveTrackedDeals
      .map((d) => computeRenewal(d.contractStartDate))
      .filter((iso): iso is string => !!iso && new Date(iso).getTime() > now)
      .sort();
    return dates[0] ?? null;
  })();
  // Combined lifecycle status (merged Status + Phase).
  const STATUS_LABELS: Record<string, string> = { onboarding: "Onboarding", active: "Active", renewal: "Renewal", churned: "Churn" };
  const statusLabel = STATUS_LABELS[client.status] ?? "Active";
  const statusTone: "sirius" | "neutral" = client.status === "churned" ? "neutral" : "sirius";
  const dealDates = (props[DEAL_DATES_KEY] as DealDatesMap | undefined) ?? {};
  const completeness = computeProfileCompleteness(client, effectiveTrackedDeals, dealDates);
  // Attachment uploads go straight from the browser to Supabase Storage — the
  // project URL is safe to hand down (it's not a secret), but only once the
  // two Supabase keys are actually configured.
  const supabaseUrl = integrations.supabaseStorage() ? getSupabaseProjectUrl() : null;

  return (
    <div className="flex flex-col gap-6 p-8">
      <Link href="/clients" className="inline-flex w-fit items-center gap-1.5 font-body text-[13px] font-semibold text-fg-muted hover:text-sirius">
        <ArrowLeft size={15} /> All clients
      </Link>

      {/* ── Unified header — identity + metrics + owners ──────────── */}
      <ClientHeaderCard
        clientId={client.id}
        name={client.name}
        industry={industry ?? null}
        country={client.country ?? null}
        tier={tier}
        statusLabel={statusLabel}
        statusTone={statusTone}
        health={client.health}
        hubspotUrl={client.hubspotUrl}
        arr={client.arr}
        currency={client.currency}
        activeDealsCount={trackedDeals.length}
        upcomingRenewal={upcomingRenewal ?? null}
        csm={client.csm}
        csmSource={client.csmSource}
        implementationOwner={client.implementationOwner}
        implementationOwnerSource={client.implementationOwnerSource}
        csmOptions={ownerOptions(csmMembers)}
        implementationOptions={ownerOptions(implMembers)}
        canEdit={superAdmin}
        roleLabels={roleLabels}
        profileSeverity={completeness.severity}
        missingRed={completeness.missingRed.map((f) => f.label)}
        missingYellow={completeness.missingYellow.map((f) => f.label)}
        useCases={useCases}
      />

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <ClientProfileTabs
        client={client}
        deals={deals}
        emails={emails}
        meetings={meetings}
        contacts={contacts}
        attachments={attachments}
        timeline={timeline}
        propertyDefs={propertyDefs}
        supabaseUrl={supabaseUrl}
        clientActions={clientActions}
        healthConfig={healthConfig}
      />
    </div>
  );
}


