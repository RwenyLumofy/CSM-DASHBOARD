import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ClientProfileTabs } from "@/components/clients/ClientProfileTabs";
import { ClientHeaderCard } from "@/components/clients/ClientHeaderCard";
import { ChurnReasonBanner } from "@/components/clients/ChurnReasonBanner";
import { CsPulsePanel } from "@/components/clients/CsPulsePanel";
import { AccountTasks } from "@/components/clients/AccountTasks";
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
  getChurnTaxonomy,
} from "@/lib/data";
import { getCsPulseDimensions, getCsPulseTiers } from "@/lib/health/data";
import { normalizePulse } from "@/lib/health/pulse";
import { getCurrentUserRole, isSuperAdmin, isAdminOrSuper, canEditClient, getCurrentUserEmail } from "@/lib/auth";
import { permissionRole, editsAllClients } from "@/lib/roles";
import { getProjectBoard, getProjectConfig, listProjectTemplates } from "@/lib/projects/data";
import { getNotesForClient } from "@/lib/notes/data";
import { hasDatabase, integrations } from "@/lib/config";
import { applyDealOverrides, computeRenewal, dealOverridesMap, DEAL_DATES_KEY, type DealDatesMap } from "@/lib/deal-overrides";
import { computeProfileCompleteness } from "@/lib/profile-completeness";
import { computeOnboardingPeriod } from "@/lib/metrics/onboarding";
import { getSupabaseProjectUrl } from "@/lib/integrations/supabase-storage";
import { getClientHealthConfig } from "@/lib/metrics/health-config-store";
import { TAXONOMY_KEY, normalizeOverlay, resolveTaxonomy, resolveGroups } from "@/lib/use-case-overlay";
import { IMPLEMENTATION_KEY, normalizeImplementations } from "@/lib/use-case-implementation";

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

  // Resolved server-side; the stakeholder mutations enforce it again, so this
  // only decides what the Stakeholders tab renders.
  const mayEditClient = await canEditClient(client);

  // Account tasks are today_tasks scoped to this account, any focus area —
  // same rows the Today board reads, so one set of data, two views.
  const viewerEmail = await getCurrentUserEmail();
  const accountTasks = await (async () => {
    if (!hasDatabase() || !viewerEmail) return [];
    try {
      const { getTodayTasksVisibleDb } = await import("@/lib/repo/drizzle");
      const rows = await getTodayTasksVisibleDb(viewerEmail, [id]);
      return rows
        .filter((t) => t.accountId === id)
        .map((t) => ({
          id: t.id, title: t.title, category: t.category, dueDate: t.dueDate ?? null,
          notes: t.notes ?? null, status: t.status, ownerEmail: t.ownerEmail ?? null,
          priority: t.priority ?? null,
        }));
    } catch {
      // A task read failing must not blank the whole profile.
      return [];
    }
  })();

  // Best-effort: a failed read degrades to an empty database rather than
  // blanking the whole profile — the Use Case Portfolio card just shows
  // nothing to pick from.
  const readUseCaseTaxonomy = async () => {
    if (!hasDatabase()) return normalizeOverlay({});
    try {
      const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
      return normalizeOverlay(await getWorkspaceConfigFromDb(TAXONOMY_KEY));
    } catch {
      return normalizeOverlay({});
    }
  };

  const [notes, attachments, deals, contacts, emails, meetings, propertyDefs, csmMembers, implMembers, roleLabels, superAdmin, clientActions, healthConfig, role, projects, projectConfig, projectTemplates, churnTaxonomy, canManageChurn, pulseDimensions, pulseTiers, useCaseTaxonomy] =
    await Promise.all([
      getNotesForClient(id),
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
      getCurrentUserRole(),
      getProjectBoard(id),
      getProjectConfig(),
      listProjectTemplates(),
      getChurnTaxonomy(),
      isAdminOrSuper(),
      getCsPulseDimensions(),
      getCsPulseTiers(),
      readUseCaseTaxonomy(),
    ]);
  const useCaseImplementations = normalizeImplementations(
    (client.properties as Record<string, unknown> | undefined)?.[IMPLEMENTATION_KEY],
  );
  const ownerOptions = (ms: typeof csmMembers) => ms.map((m) => ({ email: m.email, name: m.name ?? m.email, role: m.role }));
  /* Assignable people. DEDUPED BY EMAIL: the CSM and implementation directories
     overlap (plenty of people are in both), and feeding the raw concatenation
     into a <select> rendered two <option>s with the same key per person. */
  const assignableTeam = [...new Map(
    [...csmMembers, ...implMembers].map((m) => [m.email, { email: m.email, name: m.name }]),
  ).values()];
  // Project owner/implementer/task-owner pickers use the same team directories.
  const projectMembers = (ms: typeof csmMembers) => ms.map((m) => ({ email: m.email, name: m.name ?? m.email }));

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
  // Onboarding period (averaged across the account's deals) as a header badge —
  // computed live from the deals + milestone dates the page already has. The
  // badge is a live-state chip, so it's shown ONLY while the account is still
  // onboarding; once it's active/renewal/churned the chip disappears (the
  // health score still keeps scoring onboarding — that's a separate surface).
  const onboarding = computeOnboardingPeriod(effectiveTrackedDeals, dealDates);
  const onboardingLabel =
    client.status === "onboarding" && onboarding.days != null ? `${onboarding.days}d` : null;
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
        onboardingLabel={onboardingLabel}
      />

      {/* ── Account actions — one row of triggers, each opening a sidebar.
             Health and tasks were both full-width cards here; they are the two
             things a CSM dips into rather than reads continuously, so they
             collapse to buttons and give the vertical space back to the tab
             content. ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {client.status !== "onboarding" && (
          <CsPulsePanel
            clientId={client.id}
            // THE health score, the same object the header ring renders.
            health={client.health ?? null}
            pulse={normalizePulse(props.cs_pulse)}
            dimensions={pulseDimensions}
            tiers={pulseTiers}
            canEdit={permissionRole(role) !== "guest"}
          />
        )}
        <AccountTasks
          clientId={client.id}
          clientName={client.name}
          initial={accountTasks}
          canEdit={mayEditClient}
          today={new Date().toISOString().slice(0, 10)}
          teamEmails={assignableTeam}
          // The same predicate createTaskAction enforces, so the picker is
          // shown exactly when the server would accept the assignment.
          canAssignOthers={editsAllClients(role)}
        />
      </div>

      {/* ── Churn reason — classify why a churned account left ────────── */}
      {client.status === "churned" && (
        <ChurnReasonBanner
          clientId={client.id}
          taxonomy={churnTaxonomy}
          currentReasonIds={
            Array.isArray(props.churn_reasons)
              ? (props.churn_reasons as unknown[]).filter((x): x is string => typeof x === "string")
              : typeof props.churn_reason === "string" ? [props.churn_reason] : [] // legacy single value
          }
          canEdit={canManageChurn}
        />
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <ClientProfileTabs
        client={client}
        deals={deals}
        emails={emails}
        meetings={meetings}
        contacts={contacts}
        attachments={attachments}
        notes={notes}
        propertyDefs={propertyDefs}
        supabaseUrl={supabaseUrl}
        clientActions={clientActions}
        healthConfig={healthConfig}
        projects={projects}
        projectConfig={projectConfig}
        projectTemplates={projectTemplates.map((t) => ({ id: t.id, name: t.name }))}
        canEditClient={mayEditClient}
        teamEmails={assignableTeam}
        today={new Date().toISOString().slice(0, 10)}
        projectCsms={projectMembers(csmMembers)}
        projectImplementers={projectMembers(implMembers)}
        projectCanManage={role !== null}
        projectDbEnabled={hasDatabase()}
        liveUseCaseEntries={resolveTaxonomy(useCaseTaxonomy)}
        allUseCaseEntries={resolveTaxonomy(useCaseTaxonomy, true)}
        useCaseGroups={resolveGroups(useCaseTaxonomy)}
        useCaseImplementations={useCaseImplementations}
      />
    </div>
  );
}


