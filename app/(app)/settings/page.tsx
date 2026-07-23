import Link from "next/link";
import { FolderKanban, Plug, Settings2, TrendingDown, Users, Workflow as WorkflowIcon, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PropertiesManager } from "@/components/settings/PropertiesManager";
import { SyncManager } from "@/components/settings/SyncManager";
import { MembersArea } from "@/components/settings/MembersArea";
import { WorkflowManager } from "@/components/settings/WorkflowManager";
import { StakeholderTypesManager } from "@/components/settings/StakeholderTypesManager";
import { AttachmentCategoriesManager } from "@/components/settings/AttachmentCategoriesManager";
import { ProjectOptionsManager } from "@/components/settings/ProjectOptionsManager";
import { ProjectTemplatesManager } from "@/components/settings/ProjectTemplatesManager";
import { ChurnTaxonomyManager } from "@/components/settings/ChurnTaxonomyManager";
import { getAppUsers, getChurnTaxonomy, getClients, getOwnedAccountCounts, getPropertyDefinitions, getRoleLabels } from "@/lib/data";
import { getProjectConfig, listProjectTemplates } from "@/lib/projects/data";
import { getCurrentUserEmail, isAdminOrSuper, isSuperAdmin } from "@/lib/auth";
import { hasDatabase, integrations } from "@/lib/config";
import { withDbTimeout } from "@/lib/db/client";
import { permissionRole } from "@/lib/roles";
import { cn } from "@/lib/cn";
import type { LumofyStaffMember } from "@/components/settings/LumofyStaffManager";
import type { Member } from "@/components/settings/MembersManager";

export const metadata = { title: "Settings · Lumofy Signals" };
export const dynamic = "force-dynamic";
// Saving the Client Health formula (workflow-actions.saveClientHealthConfigAction)
// runs a full recomputeAllClientHealth() sweep — 74 clients, each with a usage
// read. Server actions are dispatched to their host route, so this ceiling
// applies to that save. Matches the client-health cron's maxDuration.
export const maxDuration = 300;

/* =========================================================================
   Settings, grouped by concern — one job per tab.

   Was a single "Workspace" tab holding seven unrelated sections (people, data
   fields, vocabularies, and a HubSpot sync) in one long scroll, so finding a
   setting meant hunting. Now:

     Members       — who's in and what they can do (users, roles, Lumofy team)
     Properties    — the data model (client fields, vocabularies)
     Projects      — project options and templates
     Automations   — routing + client-health scoring (was "Workflows")
     Integrations  — HubSpot data sync

   Visibility is unchanged: non-admins see only Properties (read-only) and
   Projects; Members, Automations and the config sections stay super-admin.
   Each tab is an async component, so only the active tab's data is fetched.
   ========================================================================= */

type TabKey = "members" | "properties" | "projects" | "automations" | "churn" | "integrations";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  // canManage = admin OR super-admin (workspace management). superAdmin alone
  // gates the crown (integration secrets / full re-sync).
  const [superAdmin, canManage, currentUserEmail, roleLabels] = await Promise.all([
    isSuperAdmin(),
    isAdminOrSuper(),
    getCurrentUserEmail(),
    getRoleLabels(),
  ]);

  const tabs: [TabKey, string, LucideIcon][] = [
    ...(canManage ? ([["members", "Members", Users]] as [TabKey, string, LucideIcon][]) : []),
    ["properties", "Properties", Settings2],
    ["projects", "Projects", FolderKanban],
    ...(canManage ? ([["automations", "Automations", WorkflowIcon]] as [TabKey, string, LucideIcon][]) : []),
    ...(canManage ? ([["churn", "Churn taxonomy", TrendingDown]] as [TabKey, string, LucideIcon][]) : []),
    ["integrations", "Integrations", Plug],
  ];

  const allowed = new Set(tabs.map(([k]) => k));
  const activeTab: TabKey = tab && allowed.has(tab as TabKey) ? (tab as TabKey) : tabs[0][0];

  return (
    <div className="flex flex-col gap-6 p-8">
      <PageHeader title="Settings" description="Manage members, properties, projects, automations, and integrations." />

      <div className="flex gap-1 border-b border-border">
        {tabs.map(([key, label, Icon]) => (
          <Link
            key={key}
            href={`/settings?tab=${key}`}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 font-body text-[13.5px] font-semibold transition-colors",
              activeTab === key ? "border-sirius text-sirius" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            <Icon size={15} /> {label}
          </Link>
        ))}
      </div>

      {activeTab === "members" && canManage ? (
        <MembersTab currentUserEmail={currentUserEmail} roleLabels={roleLabels} />
      ) : activeTab === "projects" ? (
        <ProjectsTab superAdmin={canManage} currentUserEmail={currentUserEmail} />
      ) : activeTab === "automations" && canManage ? (
        <AutomationsTab roleLabels={roleLabels} />
      ) : activeTab === "churn" && canManage ? (
        <ChurnTaxonomyTab />
      ) : activeTab === "integrations" ? (
        <IntegrationsTab superAdmin={superAdmin} />
      ) : (
        <PropertiesTab superAdmin={canManage} />
      )}
    </div>
  );
}

/** One titled settings section — heading, description, then its manager. */
function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="max-w-3xl">
      <div className="mb-5">
        <h2 className="font-display text-base font-semibold text-fg">{title}</h2>
        <p className="mt-1 font-body text-sm text-fg-muted">{description}</p>
      </div>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- Members */

async function MembersTab({
  currentUserEmail,
  roleLabels,
}: {
  currentUserEmail: string | null;
  roleLabels: Record<string, string>;
}) {
  const [appUsers, ownedCounts, superAdmin, clients] = await Promise.all([
    getAppUsers(),
    getOwnedAccountCounts(),
    isSuperAdmin(),
    getClients(),
  ]);

  // Per-member scope grants (resilient — empty if the grants table isn't
  // migrated yet). Keyed by lower-cased email.
  let grantsByEmail: Record<string, { scope: string | null; clientIds: string[] }> = {};
  if (hasDatabase()) {
    try {
      const { getAllUserScopesFromDb } = await import("@/lib/repo/drizzle");
      grantsByEmail = await withDbTimeout(getAllUserScopesFromDb());
    } catch { /* pre-migration → no grants */ }
  }

  const accounts = clients.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));

  let lumofyStaff: LumofyStaffMember[] = [];
  if (hasDatabase()) {
    try {
      const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
      lumofyStaff = ((await withDbTimeout(getWorkspaceConfigFromDb("lumofy_staff"))) as LumofyStaffMember[]) ?? [];
    } catch (err) {
      console.warn("[settings] lumofy_staff read failed:", err);
    }
  }

  // Map app_users → the Member shape the redesign renders. Status is structural
  // for now (no status column yet) — everyone resolves to Active.
  const members: Member[] = appUsers.map((u) => ({
    email: u.email,
    name: u.name,
    role: u.role,
    title: u.title,
    department: u.department,
    bootstrap: u.bootstrap,
    ownedAccounts: ownedCounts[u.email.toLowerCase()] ?? 0,
    scope: u.scope,
    grantedClientIds: grantsByEmail[u.email.toLowerCase()]?.clientIds ?? [],
  }));

  // Member counts per permission key (for Roles & permissions), the directory's
  // inline permission map, and the locked (permanent super-admin) set.
  const memberCounts: Record<string, number> = {};
  const directoryPermissions: Record<string, string> = {};
  const lockedEmails: string[] = [];
  for (const u of appUsers) {
    const key = permissionRole(u.role);
    memberCounts[key] = (memberCounts[key] ?? 0) + 1;
    directoryPermissions[u.email.toLowerCase()] = u.role;
    if (u.bootstrap) lockedEmails.push(u.email.toLowerCase());
  }

  return (
    <MembersArea
      members={members}
      currentUserEmail={currentUserEmail}
      roleLabels={roleLabels}
      canGrantCrown={superAdmin}
      memberCounts={memberCounts}
      accounts={accounts}
      lumofyStaff={lumofyStaff}
      directoryPermissions={directoryPermissions}
      lockedEmails={lockedEmails}
      memberEmails={appUsers.map((u) => u.email.toLowerCase())}
    />
  );
}

/* ------------------------------------------------------------- Properties */

async function PropertiesTab({ superAdmin }: { superAdmin: boolean }) {
  const defs = await getPropertyDefinitions();
  let stakeholderTypes: string[] = [];
  let attachmentCategories: string[] = [];
  if (hasDatabase() && superAdmin) {
    try {
      const { getWorkspaceConfigFromDb } = await import("@/lib/repo/drizzle");
      [stakeholderTypes, attachmentCategories] = await withDbTimeout(
        Promise.all([
          getWorkspaceConfigFromDb("stakeholder_types").then((v) => (v as string[]) ?? []),
          getWorkspaceConfigFromDb("attachment_categories").then((v) => (v as string[]) ?? []),
        ]),
      );
    } catch (err) {
      console.warn("[settings] workspace config read failed:", err);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="Client fields"
        description={
          superAdmin
            ? "Configure the fields on client profiles — rename labels, manage option lists, and create custom properties."
            : "Property definitions are managed by your admin and are read-only for your role."
        }
      >
        <PropertiesManager initialDefs={defs} isSuperAdmin={superAdmin} />
      </SettingsSection>

      {superAdmin && (
        <>
          <SettingsSection
            title="Stakeholder types"
            description="Define the stakeholder roles used in the client stakeholder mapping matrix. These labels appear as the row headers in every client's Communication → Stakeholder Mapping view."
          >
            <StakeholderTypesManager initialTypes={stakeholderTypes} />
          </SettingsSection>

          <SettingsSection
            title="Attachment categories"
            description="Define the categories CSMs can tag files with on every account's Attachments tab (e.g. Contract, Invoice, Deck). These appear as filter and picker options there."
          >
            <AttachmentCategoriesManager initialCategories={attachmentCategories} />
          </SettingsSection>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Projects */

async function ProjectsTab({ superAdmin, currentUserEmail }: { superAdmin: boolean; currentUserEmail: string | null }) {
  const [config, templates] = await Promise.all([getProjectConfig(), listProjectTemplates()]);
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="Project options"
        description={
          superAdmin
            ? "Configure the Status and Type vocabularies used on every account's Project Management tab. Statuses double as the kanban columns."
            : "Project statuses and types are managed by your admin and are read-only for your role."
        }
      >
        <ProjectOptionsManager initialConfig={config} isSuperAdmin={superAdmin} />
      </SettingsSection>

      <SettingsSection
        title="Project templates"
        description="Reusable milestone/task blueprints any CSM can apply to a new project. Everyone sees every template; you can edit or delete the ones you created (super-admins can manage all)."
      >
        <ProjectTemplatesManager
          initialTemplates={templates}
          config={config}
          currentUserEmail={currentUserEmail}
          isSuperAdmin={superAdmin}
        />
      </SettingsSection>
    </div>
  );
}

/* ------------------------------------------------------------ Automations */

async function AutomationsTab({ roleLabels }: { roleLabels: Record<string, string> }) {
  const { getCsmAssignmentConfig, getImplementationAssignmentConfig, getCapacityConfig, getClientHealthConfig } =
    await import("@/lib/assignment/config");
  const { getTeamHealth } = await import("@/lib/assignment/health");
  const [csm, impl, capacity, teamHealth, clientHealth] = await Promise.all([
    getCsmAssignmentConfig(),
    getImplementationAssignmentConfig(),
    getCapacityConfig(),
    getTeamHealth(),
    getClientHealthConfig(),
  ]);

  return (
    <div className="max-w-3xl">
      <div className="mb-5">
        <h2 className="font-display text-base font-semibold text-fg">Automations</h2>
        <p className="mt-1 font-body text-sm text-fg-muted">
          Two automations: how new clients are routed to a CSM and an Implementation owner, and how every account&apos;s
          health score is calculated. Pick one below.
        </p>
      </div>
      <WorkflowManager
        initialCsm={csm}
        initialImpl={impl}
        initialCapacity={capacity}
        teamHealth={teamHealth}
        initialClientHealth={clientHealth}
        roleLabels={roleLabels}
      />
    </div>
  );
}

/* ----------------------------------------------------------- Integrations */

async function IntegrationsTab({ superAdmin }: { superAdmin: boolean }) {
  let lastSyncedAt: string | null = null;
  if (hasDatabase()) {
    const { getSyncCheckpoint } = await import("@/lib/repo/drizzle");
    lastSyncedAt = await withDbTimeout(getSyncCheckpoint("last_synced_at")).catch(() => null);
  }

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="HubSpot data sync"
        description="Pull the latest companies and deals from HubSpot. The daily sync runs automatically and never overwrites your in-app edits; use these controls to sync on demand."
      >
        <SyncManager
          isSuperAdmin={superAdmin}
          initialLastSyncedAt={lastSyncedAt}
          hubspotConfigured={integrations.hubspot()}
          databaseConfigured={hasDatabase()}
        />
      </SettingsSection>
    </div>
  );
}

/* --------------------------------------------------------- Churn taxonomy */

async function ChurnTaxonomyTab() {
  const taxonomy = await getChurnTaxonomy();
  return (
    <SettingsSection
      title="Churn taxonomy"
      description="Define the reason structure a churned account is classified under — categories and the reasons within them. When an account churns it's tagged with one reason here, and the Churn dashboard groups losses by this taxonomy."
    >
      <ChurnTaxonomyManager initial={taxonomy} />
    </SettingsSection>
  );
}
