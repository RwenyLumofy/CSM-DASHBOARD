"use client";

/* =========================================================================
   Vitally-style 360° client profile — vertical side-tab navigation with a
   panel per section. The server page fetches everything and passes it in;
   this component owns tab + pagination state only.

   Tabs:
     General information · Communication · Attachments · Usage · Support ·
     Satisfaction indicator · Project Management · Notes · Action list

   Usage + Satisfaction are placeholders pending the Metabase / Intercom
   integrations. Project Management, Notes, and Action list are designed
   empty states until their data models land.
   ========================================================================= */

import { useState, useRef, useEffect, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  ExternalLink,
  FileText,
  FolderKanban,
  Gauge,
  Inbox,
  LifeBuoy,
  ListChecks,
  Loader2,
  Mail,
  MessagesSquare,
  Package,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  MapPin,
  StickyNote,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Minus,
  Smile,
  ThumbsUp,
  UploadCloud,
  UserPlus,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { Sparkline } from "@/components/ui/Sparkline";
import { LineChart } from "@/components/ui/charts";
import { HEALTH_METRIC_LABELS, type ClientHealthConfig } from "@/lib/metrics/health-config";
import { recalculateClientHealthAction } from "@/app/(app)/clients/[id]/health-actions";
import { formatCurrency, formatDate, formatNumber, relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ATTACHMENTS_BUCKET, ALLOWED_ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_BYTES, extensionOf, isAllowedAttachmentExtension } from "@/lib/attachments";
import { createAttachmentUploadUrlAction, recordAttachmentAction, deleteAttachmentAction, updateAttachmentCategoryAction } from "@/app/(app)/clients/[id]/attachment-actions";
import { addContactAction, deleteContactAction } from "@/app/(app)/clients/[id]/contact-actions";
import { UsageTab } from "@/components/clients/UsageTab";
import { ProjectsTab } from "@/components/clients/projects/ProjectsTab";
import { PopMenu, MenuItem, type Member } from "@/components/clients/projects/shared";
import type { ProjectConfig } from "@/lib/projects/config";
import type { ProjectDetail } from "@/lib/projects/types";
import { STATUS_OVERRIDE_KEY } from "@/lib/status";
import { computeOnboardingPeriod } from "@/lib/metrics/onboarding";
import { FIELD_SEVERITY } from "@/lib/profile-completeness";
import {
  DEAL_OVERRIDES_KEY,
  DEAL_DATES_KEY,
  DEAL_BRIEFS_KEY,
  DEAL_FIELD_OPTION_KEYS,
  DEAL_FIELD_FALLBACK_OPTIONS,
  applyDealOverrides,
  computeRenewal,
  hasGlobalLibrary,
  type DealOverridesMap,
  type DealDatesMap,
  type DealBriefsMap,
  type OverrideFieldType,
} from "@/lib/deal-overrides";
import type {
  Attachment,
  Client,
  ClientAction,
  Contact,
  Deal,
  Email,
  Meeting,
  PropertyDefinition,
  SupportTicket,
} from "@/lib/types";
import { normalizeStakeholderMappings, type StakeholderMapping } from "@/lib/stakeholders";
import { ActionFeed } from "@/components/actions/ActionFeed";
import { NotesTab } from "@/components/clients/notes/NotesTab";
import type { Note } from "@/lib/notes/types";

type TabKey =
  | "general"
  | "usage"
  | "communication"
  | "attachments"
  | "support"
  | "satisfaction"
  | "projects"
  | "notes"
  | "actions";

interface Props {
  client: Client;
  deals: Deal[];
  emails: Email[];
  meetings: Meeting[];
  contacts: Contact[];
  attachments: Attachment[];
  notes: Note[];
  propertyDefs: PropertyDefinition[];
  /** Supabase project URL for direct-to-storage attachment uploads, or null
   *  when SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY aren't set. */
  supabaseUrl: string | null;
  /** Open AI actions for this client (the "Action list" tab). */
  clientActions: ClientAction[];
  /** The formula that produced client.health — shown (read-only) on the
   *  Action list tab's Health signals card. Edited in Settings → Workflows. */
  healthConfig: ClientHealthConfig;
  /** Project Management tab data (see lib/projects/*). */
  projects: ProjectDetail[];
  projectConfig: ProjectConfig;
  projectTemplates: { id: string; name: string }[];
  projectCsms: Member[];
  projectImplementers: Member[];
  projectCanManage: boolean;
  projectDbEnabled: boolean;
}

export function ClientProfileTabs(props: Props) {
  const { client, deals, emails, meetings, contacts, attachments, notes, propertyDefs, supabaseUrl, clientActions, healthConfig } = props;
  const [active, setActive] = useState<TabKey>("general");

  const commCount = contacts.length + emails.length + meetings.length;

  const TABS: { key: TabKey; label: string; icon: typeof Building2; count?: number }[] = [
    { key: "general", label: "General information", icon: Building2 },
    { key: "communication", label: "Communication", icon: MessagesSquare, count: commCount || undefined },
    { key: "attachments", label: "Attachments", icon: Paperclip, count: attachments.length || undefined },
    { key: "usage", label: "Usage", icon: BarChart3 },
    { key: "support", label: "Support", icon: LifeBuoy, count: client.support.openTickets || undefined },
    { key: "satisfaction", label: "Satisfaction indicator", icon: Gauge },
    { key: "projects", label: "Project Management", icon: FolderKanban },
    { key: "notes", label: "Notes", icon: StickyNote, count: notes.length || undefined },
    { key: "actions", label: "Action list", icon: ListChecks, count: clientActions.length || undefined },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[236px_1fr]">
      {/* ── Vertical tab nav ─────────────────────────────────────────── */}
      <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-6 lg:h-fit lg:flex-col lg:overflow-visible lg:pb-0">
        {TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={cn(
                "group flex shrink-0 items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left font-body text-[13px] font-medium transition-colors lg:w-full",
                isActive ? "bg-accent-soft text-sirius" : "text-fg-muted hover:bg-bg-muted hover:text-fg",
              )}
            >
              <t.icon size={16} strokeWidth={1.9} className="shrink-0" />
              <span className={cn("flex-1 whitespace-nowrap", isActive && "font-semibold")}>{t.label}</span>
              {t.count != null && (
                <span
                  className={cn(
                    "tabular inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                    isActive ? "bg-sirius/15 text-sirius" : "bg-bg-muted text-fg-muted",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── Active panel ─────────────────────────────────────────────── */}
      <div className="min-w-0 flex flex-col gap-5">
        {active === "general" && <GeneralTab client={client} deals={deals} propertyDefs={propertyDefs} />}
        {active === "usage" && <UsageTab clientId={client.id} />}
        {active === "communication" && <CommunicationTab clientId={client.id} contacts={contacts} emails={emails} meetings={meetings} stakeholderMappings={normalizeStakeholderMappings(client.properties?.stakeholder_mappings)} />}
        {active === "attachments" && <AttachmentsTab clientId={client.id} attachments={attachments} deals={deals} supabaseUrl={supabaseUrl} />}
        {active === "support" && <SupportTab client={client} />}
        {active === "satisfaction" && <SatisfactionTab client={client} />}
        {active === "projects" && (
          <ProjectsTab
            clientId={client.id}
            initialProjects={props.projects}
            config={props.projectConfig}
            templates={props.projectTemplates}
            contacts={contacts}
            csms={props.projectCsms}
            implementers={props.projectImplementers}
            canManage={props.projectCanManage}
            dbEnabled={props.projectDbEnabled}
          />
        )}
        {active === "notes" && <NotesTab clientId={client.id} deals={deals} notes={notes} />}
        {active === "actions" && <ActionsTab client={client} actions={clientActions} healthConfig={healthConfig} />}
      </div>
    </div>
  );
}

/* ===================================================================== */
/* General information                                                    */
/* ===================================================================== */

const GROUP_META: { key: PropertyDefinition["group"]; label: string; icon: typeof Building2; subtitle: string }[] = [
  { key: "contract", label: "Contract", icon: Receipt, subtitle: "Revenue, licensing & support level" },
  { key: "product", label: "Package & product", icon: Package, subtitle: "Modules & content library" },
];

/* Per-deal milestone dates — CSM-only (no HubSpot source), stored under
   client.properties.__deal_dates keyed by deal id. Preserved by Full re-sync. */
const DEAL_DATE_FIELDS: { key: string; label: string }[] = [
  { key: "invoice_sent_date", label: "Invoice sent" },
  { key: "kickoff_meeting_date", label: "Kick-off meeting" },
  { key: "launch_date", label: "Launch" },
  { key: "platform_start_date", label: "Platform start" },
  { key: "platform_end_date", label: "Platform end" },
  { key: "global_library_start_date", label: "Global library start" },
  { key: "global_library_expiry_date", label: "Global library expiry" },
];

/* HubSpot-synced deal fields that the CSM may override per deal (display =
   override ?? synced value). Stored under client.properties.__deal_overrides and
   cleared by the Settings "Full re-sync". Computed fields (Total licenses,
   Renewal) are NOT here — they derive from the effective values. The Deal field
   name doubles as the override key. */
const DEAL_FIELDS: { key: keyof Deal; label: string; type: OverrideFieldType }[] = [
  // Overview
  { key: "name", label: "Deal name", type: "text" },
  { key: "amount", label: "Amount", type: "currency" },
  { key: "referralSource", label: "Acquisition Channel", type: "single_select" },
  { key: "ownerName", label: "Account Executive", type: "single_select" },
  // Commercials
  { key: "numberOfUsers", label: "Licenses", type: "number" },
  { key: "complementaryLicenses", label: "Complementary", type: "number" },
  { key: "pricePerUser", label: "User price", type: "currency" },
  { key: "contractDuration", label: "Contract length (Years)", type: "number" },
  // Product & content
  { key: "products", label: "Module", type: "multi_select" },
  { key: "useCases", label: "Use case", type: "multi_select" },
  { key: "globalLibraryPackage", label: "Global library", type: "multi_select" },
  { key: "globalLibraryLicenses", label: "Global library licenses", type: "number" },
  { key: "aiCourseCredits", label: "AI course credits", type: "number" },
  // Service levels
  { key: "supportLevel", label: "Support level", type: "single_select" },
  { key: "implementationLevel", label: "Implementation level", type: "single_select" },
  // Contract dates
  { key: "closeDate", label: "Closed won", type: "date" },
  { key: "contractStartDate", label: "Contract start", type: "date" },
];
const DEAL_FIELD = (k: keyof Deal) => DEAL_FIELDS.find((f) => f.key === k)!;

const INDUSTRY_OPTIONS = [
  "Agriculture", "Automotive", "Banking & Finance", "Biotechnology",
  "Construction & Real Estate", "Consulting & Professional Services",
  "Defense & Security", "E-commerce & Retail", "Education & E-Learning",
  "Energy & Utilities", "Food & Beverage", "Government & Public Sector",
  "Healthcare & Pharmaceuticals", "Hospitality & Tourism",
  "Information Technology", "Insurance", "Legal", "Logistics & Transportation",
  "Manufacturing", "Media & Entertainment", "Non-Profit",
  "Oil & Gas", "Telecommunications", "Other",
].map((v) => ({ value: v, label: v }));

const COUNTRY_OPTIONS = [
  "Saudi Arabia", "United Arab Emirates", "Kuwait", "Qatar", "Bahrain", "Oman",
  "Jordan", "Egypt", "Lebanon", "Iraq", "Palestine", "Yemen", "Libya", "Tunisia",
  "Algeria", "Morocco", "Turkey", "Pakistan", "India", "United Kingdom",
  "United States", "Canada", "Australia", "Germany", "France", "Other",
].map((v) => ({ value: v, label: v }));

// Lifecycle status labels/tones. Onboarding/Active/Renewal are auto-derived
// by recomputeClient() (see lib/status.ts) from deal launch + renewal dates —
// a CSM can't pick them. "Churned" is the one manual lever (StatusField
// below), stored under client.properties.__status_override so it survives
// HubSpot sync and wins over the auto-derived value.
const STATUS_LABELS: Record<string, { label: string; tone: BadgeTone }> = {
  onboarding: { label: "Onboarding", tone: "eclipse" },
  active: { label: "Active", tone: "aurora" },
  renewal: { label: "Renewal", tone: "stellar" },
  churned: { label: "Churned", tone: "neutral" },
};

function hasValue(v: unknown): boolean {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function GeneralTab({
  client,
  deals,
  propertyDefs,
}: {
  client: Client;
  deals: Deal[];
  propertyDefs: PropertyDefinition[];
}) {
  const id = client.id;
  const props = client.properties ?? {};
  // Surfaced in the summary header → excluded from the Account grid.
  const HEADER_KEYS = new Set(["tier", "use_cases_rollup"]);
  // Per-deal now — shown on each deal card, not at the account level. Includes
  // the deal-scoped picklist definitions (deal_*), which exist only to hold the
  // sync-managed option lists for the deal-card editors — never shown here.
  const PER_DEAL_KEYS = new Set([
    "referral_source",
    "licenses_purchased", "user_price", "complementary_licenses", "contract_length_years",
    "package", "use_case", "closed_won_date_prop", "contract_effective_date_prop",
    "deal_account_executive", "deal_modules", "deal_use_cases", "deal_global_libraries", "deal_support_level", "deal_implementation_level",
  ]);
  const hidden = new Set([...HEADER_KEYS, ...PER_DEAL_KEYS]);
  const groups = GROUP_META.map((g) => ({
    ...g,
    defs: propertyDefs.filter((d) => d.group === g.key && !hidden.has(d.key)).sort((a, b) => a.sortOrder - b.sortOrder),
  })).filter((g) => g.defs.length > 0);
  // The account "Tier" property (Tier 1–4) — surfaced as a badge in the header
  // for a quick glance, and editable here in the Account section (same dual
  // treatment as Status). Rendered explicitly rather than via a group, since
  // its "client" group isn't one of the rendered property groups above.
  const tierDef = propertyDefs.find((d) => d.key === "tier");

  // Per-deal CSM data lives here (keyed by deal id) — never shown as raw "Other" props.
  const dealOverrides = (props[DEAL_OVERRIDES_KEY] as DealOverridesMap | undefined) ?? {};
  const dealDates = (props[DEAL_DATES_KEY] as DealDatesMap | undefined) ?? {};
  const dealBriefs = (props[DEAL_BRIEFS_KEY] as DealBriefsMap | undefined) ?? {};
  const optsFor = (key: string) => selectOpts(propertyDefs.find((d) => d.key === key)?.options);

  return (
    <Panel>
      {/* Account overview — identity & status (deal economics live on the cards below).
          Owners (CSM + Implementation) are managed in the Owners card above the tabs. */}
      <Section icon={Building2} title="Account" subtitle="Identity & status">
        <FieldGrid>
          <EditableField clientId={id} label="Domain" value={client.domain} type="text" target={{ core: "domain" }} />
          <EditableField clientId={id} label="Industry" value={client.industry} type="single_select" options={INDUSTRY_OPTIONS} target={{ core: "industry" }} alertSeverity={FIELD_SEVERITY.industry} />
          <EditableField clientId={id} label="Country" value={client.country} type="single_select" options={COUNTRY_OPTIONS} target={{ core: "country" }} alertSeverity={FIELD_SEVERITY.country} />
          <EditableField clientId={id} label="Employees" value={client.employees} type="number" target={{ core: "employees" }} alertSeverity={FIELD_SEVERITY.employees} />
          {tierDef && (
            <EditableField clientId={id} label={tierDef.label} value={props[tierDef.key]} type={tierDef.type} options={selectOpts(tierDef.options)} target={{ prop: tierDef.key }} />
          )}
          <StatusField clientId={id} status={client.status} manuallyChurned={props[STATUS_OVERRIDE_KEY] === "churned"} />
          {(client.status === "churned" || client.churnedAt) && (
            <EditableField clientId={id} label="Churn date" value={client.churnedAt} type="date" target={{ core: "churnedAt" }} />
          )}
        </FieldGrid>
        {client.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border-subtle pt-4">
            {client.tags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
          </div>
        )}
      </Section>

      {/* Contracts & deals — each deal carries its economics, package, service
          levels and per-deal dates (CSM-editable milestones + synced contract dates). */}
      {deals.length > 0 && <DealsTabs deals={deals} clientId={id} dealOverrides={dealOverrides} dealDates={dealDates} dealBriefs={dealBriefs} propertyDefs={propertyDefs} />}

      {groups.map((g) => (
        <Section key={g.key} icon={g.icon} title={g.label} subtitle={g.subtitle} defaultOpen={false}>
          <FieldGrid>
            {g.defs.map((d) => (
              <EditableField
                key={d.key}
                clientId={id}
                label={d.label}
                value={props[d.key]}
                type={d.type}
                options={d.type === "single_select" || d.type === "multi_select" ? selectOpts(d.options) : undefined}
                currency={client.currency}
                target={{ prop: d.key }}
              />
            ))}
          </FieldGrid>
        </Section>
      ))}
    </Panel>
  );
}

/** One handover narrative. Clamps long text with a fade + Show more / less. */
function BriefBlock({ name, text }: { name: string | null; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 480;
  return (
    <div>
      {name && (
        <div className="mb-2 flex items-center gap-2">
          <Tag size={12} className="shrink-0 text-sirius" />
          <span className="font-body text-[12.5px] font-semibold text-fg">{name}</span>
        </div>
      )}
      <div
        className={cn(
          "relative whitespace-pre-wrap break-words font-body text-[13.5px] leading-relaxed text-fg-muted",
          !open && long && "max-h-48 overflow-hidden",
        )}
      >
        {text}
        {!open && long && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-surface to-transparent" />
        )}
      </div>
      {long && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-2 inline-flex items-center gap-1 font-body text-[12.5px] font-semibold text-sirius transition-colors hover:text-cosmos"
        >
          {open ? <>Show less <ChevronUp size={13} /></> : <>Show more <ChevronDown size={13} /></>}
        </button>
      )}
    </div>
  );
}

/* ===================================================================== */
/* Attachments (own tab)                                                  */
/* ===================================================================== */

// Mirrors AttachmentCategoriesManager's own DEFAULT_CATEGORIES — shown until a
// super-admin actually saves a list in Settings (workspace_config has no row
// for "attachment_categories" until then, so the fetch below would otherwise
// come back empty and the picker would offer nothing but "Uncategorized").
// Same fallback-to-defaults pattern DEFAULT_STAKEHOLDER_TYPES already uses.
const DEFAULT_ATTACHMENT_CATEGORIES = ["Contract", "Proposal", "Invoice", "Deck / Presentation", "Statement of Work", "Other"];

function AttachmentsTab({
  clientId,
  attachments,
  deals,
  supabaseUrl,
}: {
  clientId: string;
  attachments: Attachment[];
  deals: Deal[];
  supabaseUrl: string | null;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dealFilter, setDealFilter] = useState("all");
  const dealName = (dealId: string | null) => (dealId ? deals.find((d) => d.id === dealId)?.name ?? "—" : "—");

  useEffect(() => {
    fetch("/api/admin/stakeholder-config?key=attachment_categories")
      .then((r) => r.json())
      .then((data) => setCategories(Array.isArray(data.value) && data.value.length ? data.value : DEFAULT_ATTACHMENT_CATEGORIES))
      .catch(() => setCategories(DEFAULT_ATTACHMENT_CATEGORIES));
  }, []);

  // Union of the admin-configured list with any value already present on this
  // client's own attachments -- a category value set before this feature
  // existed, or later removed from Settings, still shows correctly and stays
  // filterable/selectable instead of silently disappearing (category is a
  // free-text column, not a foreign key into the admin list).
  const categoryOptions = useMemo(() => {
    const used = attachments.map((a) => a.category).filter((c): c is string => !!c);
    return [...new Set([...categories, ...used])].sort((a, b) => a.localeCompare(b));
  }, [categories, attachments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attachments
      .filter((a) => !q || a.name.toLowerCase().includes(q))
      .filter((a) => categoryFilter === "all" || a.category === categoryFilter)
      .filter((a) => dealFilter === "all" || a.dealId === dealFilter);
  }, [attachments, search, categoryFilter, dealFilter]);

  async function remove(a: Attachment) {
    if (!confirm(`Delete "${a.name}"? This can't be undone.`)) return;
    setDeletingId(a.id);
    try {
      const res = await deleteAttachmentAction(clientId, a.id);
      if (!res.ok) {
        alert(res.error ?? "Failed to delete the attachment.");
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardEyebrow>Attachments</CardEyebrow>
          <Badge tone="neutral">{filtered.length}{filtered.length !== attachments.length ? " of " + attachments.length : ""}</Badge>
        </div>
        <AttachmentUploadButton clientId={clientId} deals={deals} supabaseUrl={supabaseUrl} categories={categories} />
      </div>
      {attachments.length === 0 ? (
        <EmptyHint icon={Paperclip} title="No files yet" body="Upload contracts, decks, or other files to keep them with this account." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex min-w-[180px] flex-1 items-center gap-1.5 rounded-lg border border-border bg-bg px-2.5 py-1.5">
              <Search size={13} className="shrink-0 text-fg-subtle" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by file name…"
                className="w-full bg-transparent font-body text-[12.5px] text-fg outline-none placeholder:text-fg-subtle"
              />
            </div>
            <TicketFilterSelect value={categoryFilter} onChange={setCategoryFilter} label="Category">
              <option value="all">All categories</option>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </TicketFilterSelect>
            <TicketFilterSelect value={dealFilter} onChange={setDealFilter} label="Deal">
              <option value="all">All deals</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.name ?? d.id}</option>)}
            </TicketFilterSelect>
          </div>
          {filtered.length === 0 ? (
            <EmptyHint icon={Paperclip} title="No attachments match these filters" body="Try clearing a filter or the search box to see more files." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  <col className="w-[36%]" />
                  <col className="w-[150px]" />
                  <col className="w-[110px]" />
                  <col />
                  <col className="w-10" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="pb-2 pr-4 text-left font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Name</th>
                    <th className="pb-2 pr-4 text-left font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Category</th>
                    <th className="pb-2 pr-4 text-left font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Uploaded</th>
                    <th className="pb-2 pr-4 text-left font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Deal</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => (
                    <tr key={a.id} className="border-b border-border-subtle last:border-0">
                      <td className="max-w-0 py-2.5 pr-4">
                        {a.url ? (
                          <a href={a.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-2 font-body text-[13px] font-medium text-fg hover:text-sirius">
                            <FileText size={15} className="shrink-0 text-fg-subtle" />
                            <span className="truncate">{a.name}</span>
                            {a.extension && <Badge tone="neutral">{a.extension.toUpperCase()}</Badge>}
                          </a>
                        ) : (
                          <span className="flex min-w-0 items-center gap-2 font-body text-[13px] font-medium text-fg" title="File stored in HubSpot">
                            <Paperclip size={14} className="shrink-0 text-fg-subtle" />
                            <span className="truncate">{a.name}</span>
                            {a.extension && <Badge tone="neutral">{a.extension.toUpperCase()}</Badge>}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4">
                        <AttachmentCategoryPicker
                          clientId={clientId}
                          attachmentId={a.id}
                          value={a.category}
                          options={categoryOptions}
                          onChanged={() => router.refresh()}
                        />
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4 font-body text-[13px] text-fg-muted">{formatDate(a.createdAt)}</td>
                      <td className="truncate py-2.5 pr-4 font-body text-[13px] text-fg-muted">{dealName(a.dealId)}</td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => remove(a)}
                          disabled={deletingId === a.id}
                          title="Delete attachment"
                          className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted hover:text-[#B23A57] disabled:opacity-50"
                        >
                          {deletingId === a.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** Inline category picker for one attachment row -- a neutral Badge pill when
 *  set, or a dashed "+ Category" placeholder when uncategorized, opening a
 *  PopMenu (Uncategorized + every known category) on click. Selecting a row
 *  persists immediately via updateAttachmentCategoryAction and refreshes. */
function AttachmentCategoryPicker({
  clientId, attachmentId, value, options, onChanged,
}: {
  clientId: string;
  attachmentId: string;
  value: string | null;
  options: string[];
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function set(next: string | null) {
    setSaving(true);
    try {
      const res = await updateAttachmentCategoryAction(clientId, attachmentId, next);
      if (!res.ok) {
        alert(res.error ?? "Failed to update the category.");
        return;
      }
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <PopMenu
      trigger={() => (
        <span className="inline-flex items-center gap-1.5">
          {value ? (
            <Badge tone="neutral">{value}</Badge>
          ) : (
            <span className="rounded-lg border border-dashed border-border px-2 py-1 font-body text-[11.5px] font-medium text-fg-subtle transition-colors hover:border-sirius-200 hover:text-fg-muted">
              + Category
            </span>
          )}
          {saving && <Loader2 size={11} className="animate-spin text-fg-subtle" />}
        </span>
      )}
    >
      {(close) => (
        <>
          <MenuItem selected={!value} onClick={() => { set(null); close(); }}>
            <span className="text-fg-muted">Uncategorized</span>
          </MenuItem>
          {options.map((o) => (
            <MenuItem key={o} selected={value === o} onClick={() => { set(o); close(); }}>
              {o}
            </MenuItem>
          ))}
        </>
      )}
    </PopMenu>
  );
}

/** Upload button + dialog — files go straight from the browser to Supabase
 *  Storage via a signed upload URL (never through our server), then a server
 *  action records the resulting metadata (name/deal/date) against the client. */
function AttachmentUploadButton({ clientId, deals, supabaseUrl, categories }: { clientId: string; deals: Deal[]; supabaseUrl: string | null; categories: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dealId, setDealId] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabledReason = !supabaseUrl ? "File storage isn't configured yet (SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY)." : undefined;

  function openDialog() {
    setFile(null);
    setDealId("");
    setCategory("");
    setError(null);
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
  }

  function pickFile(f: File | undefined) {
    if (!f) return;
    const ext = extensionOf(f.name);
    if (!isAllowedAttachmentExtension(ext)) {
      setError(`.${ext || "?"} files aren't supported. Allowed: ${ALLOWED_ATTACHMENT_EXTENSIONS.join(", ")}.`);
      return;
    }
    if (f.size > MAX_ATTACHMENT_BYTES) {
      setError(`File is larger than ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB.`);
      return;
    }
    setError(null);
    setFile(f);
  }

  async function upload() {
    if (!file || !supabaseUrl) return;
    setBusy(true);
    setError(null);
    try {
      const target = await createAttachmentUploadUrlAction(clientId, file.name, file.size);
      if (!target.ok || !target.path || !target.token) {
        setError(target.error ?? "Failed to start the upload.");
        return;
      }
      const supabase = createSupabaseClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "");
      const { error: uploadError } = await supabase.storage.from(ATTACHMENTS_BUCKET).uploadToSignedUrl(target.path, target.token, file);
      if (uploadError) {
        setError(uploadError.message);
        return;
      }
      const recorded = await recordAttachmentAction(clientId, { path: target.path, name: file.name, size: file.size, dealId: dealId || null, category: category || null });
      if (!recorded.ok) {
        setError(recorded.error ?? "Uploaded, but failed to save the attachment record.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="secondary" iconLeft={UploadCloud} onClick={openDialog} disabled={!supabaseUrl} title={disabledReason}>
        Upload
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-bg shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="font-display text-[15px] font-semibold text-fg">Upload attachment</h2>
              <button onClick={close} className="rounded-md p-1 text-fg-muted hover:bg-bg-muted hover:text-fg">
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5">
              <div>
                <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">File</label>
                <input
                  type="file"
                  accept={ALLOWED_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(",")}
                  onChange={(e) => pickFile(e.target.files?.[0])}
                  disabled={busy}
                  className="block w-full font-body text-[13px] text-fg-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:font-body file:text-[12.5px] file:font-semibold file:text-fg hover:file:border-sirius-200"
                />
                <p className="mt-1.5 font-body text-[11px] text-fg-subtle">
                  PDF, PNG, JPG, PPT, Word, Excel, or CSV — up to {Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">Associate with deal (optional)</label>
                <select
                  value={dealId}
                  onChange={(e) => setDealId(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none ring-sirius focus:ring-2"
                >
                  <option value="">No deal</option>
                  {deals.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name ?? d.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">Category (optional)</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none ring-sirius focus:ring-2"
                >
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              {error && <p className="font-body text-[12px] text-[#B23A57]">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <button onClick={close} disabled={busy} className="rounded-lg border border-border px-3.5 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">
                Cancel
              </button>
              <Button size="sm" onClick={upload} disabled={!file || busy}>
                {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                Upload
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ===================================================================== */
/* Usage (Metabase — pending)                                             */
/* ===================================================================== */

/* ===================================================================== */
/* Communication (HubSpot)                                                */
/* ===================================================================== */

type CommView = "emails" | "meetings" | "contacts" | "stakeholders";

function CommunicationTab({ clientId, contacts, emails, meetings, stakeholderMappings }: { clientId: string; contacts: Contact[]; emails: Email[]; meetings: Meeting[]; stakeholderMappings: StakeholderMapping[] }) {
  const [view, setView] = useState<CommView>("emails");
  // Only actually needed for the "emails"/"meetings" sub-view, but was
  // re-sorting on every render (including tab switches away from this
  // panel and unrelated parent re-renders) regardless of which sub-view was
  // active.
  const sortedEmails = useMemo(
    () => [...emails].sort((a, b) => (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt)),
    [emails],
  );
  const sortedMeetings = useMemo(
    () => [...meetings].sort((a, b) => (b.startTime ?? b.createdAt).localeCompare(a.startTime ?? a.createdAt)),
    [meetings],
  );

  const TABS: { key: CommView; label: string; icon: LucideIcon; count?: number }[] = [
    { key: "emails", label: "Emails", icon: Mail, count: emails.length },
    { key: "meetings", label: "Meetings", icon: Calendar, count: meetings.length },
    { key: "contacts", label: "Contacts", icon: Phone, count: contacts.length },
    { key: "stakeholders", label: "Stakeholder Mapping", icon: Users },
  ];

  return (
    <Card>
      {/* Sub-tab navigation */}
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-border pb-0">
        <div className="flex items-center gap-0.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = view === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setView(t.key)}
                className={cn(
                  "-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 px-3.5 py-2.5 font-body text-[13px] font-semibold transition-colors duration-150",
                  active
                    ? "border-sirius text-sirius"
                    : "border-transparent text-fg-muted hover:border-border hover:text-fg",
                )}
              >
                <Icon size={14} className="shrink-0" />
                {t.label}
                {t.count != null && (
                  <span className={cn(
                    "ml-0.5 min-w-[18px] rounded-full px-1.5 py-0.5 text-center font-body text-[10px] font-bold tabular-nums",
                    active ? "bg-sirius/15 text-sirius" : "bg-bg-muted text-fg-subtle",
                  )}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {view === "contacts" && <AddContactButton clientId={clientId} />}
      </div>

      <div className="pt-1">
        {view === "emails" &&
          (sortedEmails.length === 0 ? (
            <EmptyHint icon={Mail} title="No emails" body="Emails sync from this account across all deals and contacts in HubSpot." />
          ) : (
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
              {sortedEmails.map((e) => <EmailCard key={e.id} email={e} />)}
            </div>
          ))}

        {view === "meetings" &&
          (sortedMeetings.length === 0 ? (
            <EmptyHint icon={Calendar} title="No meetings" body="Meetings sync from this account across all deals and contacts in HubSpot." />
          ) : (
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border">
              {sortedMeetings.map((m) => <MeetingCard key={m.id} meeting={m} />)}
            </div>
          ))}

        {view === "contacts" &&
          (contacts.length === 0 ? (
            <EmptyHint icon={Phone} title="No contacts yet" body="Contacts sync from HubSpot automatically, or add one by hand above." />
          ) : (
            <ContactsTable contacts={contacts} clientId={clientId} />
          ))}

        {view === "stakeholders" && (
          <StakeholderMatrix clientId={clientId} contacts={contacts} initialMappings={stakeholderMappings} />
        )}
      </div>
    </Card>
  );
}

/* ---- Email body parser --------------------------------------------------- */

const SIG_MARKERS = /^(regards|best|thanks|sincerely|kind regards|warm regards|best wishes|yours|cheers|br,|thank you|with regards|cordially|appreciate|yours truly)/i;

function parseEmailBody(raw: string): { paragraphs: string[]; signature: string[] } {
  // HubSpot strips HTML: what were <br>/<p> become runs of 2+ spaces.
  // Split on 2+ consecutive spaces to restore paragraph structure.
  const parts = raw.split(/  +/).map((s) => s.trim()).filter(Boolean);

  const sigIdx = parts.findIndex((p, i) => i > 0 && SIG_MARKERS.test(p));
  if (sigIdx === -1) return { paragraphs: parts, signature: [] };
  return { paragraphs: parts.slice(0, sigIdx), signature: parts.slice(sigIdx) };
}

/* ---- Email card ---------------------------------------------------------- */

function EmailCard({ email }: { email: Email }) {
  const [expanded, setExpanded] = useState(false);

  const isInbound = email.direction === "INBOUND";
  const isOutbound = email.direction === "OUTBOUND";

  const accentBar = isInbound
    ? "bg-emerald-500"
    : isOutbound
      ? "bg-blue-500"
      : "bg-border";

  const dirBadge = isInbound
    ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50"
    : isOutbound
      ? "text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/50"
      : "text-fg-muted bg-bg-muted";

  const { paragraphs, signature } = email.bodySnippet
    ? parseEmailBody(email.bodySnippet)
    : { paragraphs: [], signature: [] };

  return (
    <div className="group relative">
      {/* Direction accent bar */}
      <div className={cn("absolute inset-y-0 left-0 w-[3px]", accentBar)} />

      {/* Header row — click to expand */}
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full cursor-pointer items-start gap-4 px-5 py-4 pl-6 text-left transition-colors duration-150 hover:bg-bg-muted/50"
      >
        {/* Icon */}
        <div className={cn(
          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
          isInbound ? "bg-emerald-50 dark:bg-emerald-950/40" : isOutbound ? "bg-blue-50 dark:bg-blue-950/40" : "bg-bg-muted",
        )}>
          <Mail size={14} className={isInbound ? "text-emerald-600 dark:text-emerald-400" : isOutbound ? "text-blue-600 dark:text-blue-400" : "text-fg-muted"} />
        </div>

        <div className="min-w-0 flex-1">
          {/* Subject */}
          <div className="flex flex-wrap items-center gap-2 leading-snug">
            <span className="font-body text-[13.5px] font-semibold text-fg">
              {email.subject ?? "(no subject)"}
            </span>
            {email.direction && (
              <span className={cn("rounded-md px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wider", dirBadge)}>
                {email.direction}
              </span>
            )}
          </div>

          {/* From / To */}
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
            <span className="font-body text-[12px] text-fg-muted">
              <span className="font-medium">From:</span>{" "}
              <span className="text-fg/80">{email.fromEmail ?? "—"}</span>
            </span>
            <span className="font-body text-[12px] text-fg-muted">
              <span className="font-medium">To:</span>{" "}
              <span className="text-fg/80">
                {(email.toEmail ?? "—").split(";").map((addr, i) => (
                  <span key={i}>{i > 0 && <span className="text-fg-muted">, </span>}{addr.trim()}</span>
                ))}
              </span>
            </span>
          </div>
        </div>

        {/* Date + chevron */}
        <div className="ml-2 flex shrink-0 flex-col items-end gap-1.5">
          {email.sentAt && (
            <span className="whitespace-nowrap font-body text-[11.5px] text-fg-muted">
              {formatDate(email.sentAt)}
            </span>
          )}
          <ChevronDown
            size={13}
            className={cn("text-fg-muted/60 transition-transform duration-200", expanded && "rotate-180")}
          />
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border/60 bg-bg-muted/20 pl-6">
          {paragraphs.length > 0 ? (
            <div className="px-5 py-4">
              <div className="flex flex-col gap-2.5">
                {paragraphs.map((p, i) => (
                  <p key={i} className="font-body text-[13px] leading-relaxed text-fg">{p}</p>
                ))}
              </div>
              {signature.length > 0 && (
                <>
                  <div className="my-4 border-t border-border/50" />
                  <div className="flex flex-col gap-0.5">
                    {signature.map((line, i) => (
                      <p key={i} className="font-body text-[12px] leading-relaxed text-fg-muted">{line}</p>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="px-5 py-4">
              <p className="font-body text-[13px] italic text-fg-muted">No body content available.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Meeting card -------------------------------------------------------- */

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const [expanded, setExpanded] = useState(false);

  const isCompleted = meeting.outcome === "COMPLETED";
  const isNoShow = meeting.outcome === "NO_SHOW";
  const isCanceled = meeting.outcome === "CANCELED";

  const accentBar = isCompleted
    ? "bg-emerald-500"
    : isNoShow
      ? "bg-red-500"
      : isCanceled
        ? "bg-fg-muted/30"
        : "bg-purple-500";

  const outcomeBadge = isCompleted
    ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/50"
    : isNoShow
      ? "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-950/50"
      : isCanceled
        ? "text-fg-muted bg-bg-muted"
        : "text-purple-700 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/50";

  function formatTimeRange() {
    if (!meeting.startTime) return "—";
    const start = new Date(meeting.startTime);
    const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" };
    const startStr = start.toLocaleDateString("en-GB", opts);
    if (!meeting.endTime) return startStr;
    const end = new Date(meeting.endTime);
    const endTime = end.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${startStr} – ${endTime}`;
  }

  return (
    <div className="group relative">
      {/* Outcome accent bar */}
      <div className={cn("absolute inset-y-0 left-0 w-[3px]", accentBar)} />

      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full cursor-pointer items-start gap-4 pl-6 pr-5 py-4 text-left transition-colors duration-150 hover:bg-bg-muted/50"
      >
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-purple-50 dark:bg-purple-950/40">
          <Calendar size={14} className="text-purple-600 dark:text-purple-400" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-body text-[13.5px] font-semibold text-fg">{meeting.title ?? "Meeting"}</span>
            {meeting.outcome && (
              <span className={cn("rounded-md px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wider", outcomeBadge)}>
                {meeting.outcome.replace("_", " ")}
              </span>
            )}
          </div>
          <div className="mt-1 font-body text-[12px] text-fg-muted">{formatTimeRange()}</div>
          {meeting.location && (
            <div className="mt-0.5 flex items-center gap-1 font-body text-[12px] text-fg-muted">
              <MapPin size={11} className="shrink-0" /> {meeting.location}
            </div>
          )}
        </div>

        <ChevronDown
          size={13}
          className={cn("mt-1 shrink-0 text-fg-muted/60 transition-transform duration-200", expanded && "rotate-180")}
        />
      </button>

      {expanded && meeting.notes && (
        <div className="border-t border-border/60 bg-bg-muted/20 pl-6 px-5 py-4">
          <p className="whitespace-pre-wrap font-body text-[13px] leading-relaxed text-fg">{meeting.notes}</p>
        </div>
      )}
      {expanded && !meeting.notes && (
        <div className="border-t border-border/60 bg-bg-muted/20 pl-6 px-5 py-4">
          <p className="font-body text-[13px] italic text-fg-muted">No meeting notes available.</p>
        </div>
      )}
    </div>
  );
}

/* ---- Contacts table ------------------------------------------------------- */

function ContactsTable({ contacts, clientId }: { contacts: Contact[]; clientId: string }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(c: Contact, name: string) {
    if (!confirm(`Remove "${name}" from this account's contacts?`)) return;
    setDeletingId(c.id);
    try {
      const res = await deleteContactAction(clientId, c.id);
      if (!res.ok) {
        alert(res.error ?? "Failed to remove the contact.");
        return;
      }
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="overflow-x-auto overflow-hidden rounded-xl border border-border">
      <table className="w-full min-w-[560px] border-collapse font-body">
        <thead>
          <tr className="border-b border-border bg-bg-muted/60">
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Name</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Job Title</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Email</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Phone</th>
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Send Email</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {contacts.map((c) => {
            const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "Unknown";
            const initials = [c.firstName?.[0], c.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
            const isManual = !c.hubspotContactId;
            return (
              <tr key={c.id} className="group transition-colors duration-100 hover:bg-bg-muted/40">
                {/* Name + avatar */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-body text-[11px] font-bold text-sirius">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-body text-[13px] font-semibold text-fg">{name}</span>
                        {c.isPrimary && (
                          <span className="shrink-0 rounded-full bg-sirius/10 px-1.5 py-px font-body text-[10px] font-semibold text-sirius">Primary</span>
                        )}
                        {isManual && (
                          <span className="shrink-0 rounded-full bg-bg-muted px-1.5 py-px font-body text-[10px] font-semibold text-fg-subtle" title="Added manually — not synced from HubSpot">
                            Manual
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </td>
                {/* Job title */}
                <td className="px-4 py-3 font-body text-[13px] text-fg-muted">
                  {c.jobTitle || <span className="text-fg-muted/30">—</span>}
                </td>
                {/* Email — clickable mailto */}
                <td className="px-4 py-3 font-body text-[13px]">
                  {c.email ? (
                    <a
                      href={`mailto:${c.email}`}
                      className="cursor-pointer text-fg-muted transition-colors duration-150 hover:text-sirius hover:underline"
                    >
                      {c.email}
                    </a>
                  ) : (
                    <span className="text-fg-muted/30">—</span>
                  )}
                </td>
                {/* Phone */}
                <td className="px-4 py-3 font-body text-[13px] text-fg-muted">
                  {c.phone || <span className="text-fg-muted/30">—</span>}
                </td>
                {/* Send email button */}
                <td className="px-4 py-3">
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      title={`Send email to ${name}`}
                      aria-label={`Send email to ${name}`}
                      className="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 py-1 font-body text-[11.5px] font-medium text-fg-muted transition-colors duration-150 hover:border-sirius hover:text-sirius"
                    >
                      <Mail size={12} /> Send email
                    </a>
                  )}
                </td>
                {/* Remove — manually-added contacts only */}
                <td className="px-4 py-3 text-right">
                  {isManual && (
                    <button
                      onClick={() => remove(c, name)}
                      disabled={deletingId === c.id}
                      title="Remove contact"
                      className="rounded-md p-1 text-fg-subtle hover:bg-bg-muted hover:text-[#B23A57] disabled:opacity-50"
                    >
                      {deletingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Add-a-contact-by-hand dialog — for stakeholders HubSpot doesn't have yet.
 *  Mirrors AttachmentUploadButton's dialog pattern. */
function AddContactButton({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setJobTitle("");
    setError(null);
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await addContactAction(clientId, { firstName, lastName, email, phone, jobTitle });
      if (!res.ok) {
        setError(res.error ?? "Failed to add the contact.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const canSave = firstName.trim() || lastName.trim() || email.trim();

  return (
    <>
      <Button size="sm" variant="secondary" iconLeft={UserPlus} onClick={openDialog}>
        Add contact
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-bg shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="font-display text-[15px] font-semibold text-fg">Add contact</h2>
              <button onClick={close} className="rounded-md p-1 text-fg-muted hover:bg-bg-muted hover:text-fg">
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">First name</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none ring-sirius focus:ring-2"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">Last name</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none ring-sirius focus:ring-2"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none ring-sirius focus:ring-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">Phone</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none ring-sirius focus:ring-2"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block font-body text-[12px] font-semibold text-fg-muted">Job title</label>
                  <input
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    disabled={busy}
                    className="w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] text-fg outline-none ring-sirius focus:ring-2"
                  />
                </div>
              </div>
              {error && <p className="font-body text-[12px] text-[#B23A57]">{error}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
              <button onClick={close} disabled={busy} className="rounded-lg border border-border px-3.5 py-2 font-body text-[13px] font-medium text-fg-muted hover:text-fg">
                Cancel
              </button>
              <Button size="sm" onClick={save} disabled={!canSave || busy}>
                {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                Add contact
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---- Stakeholder mapping matrix ------------------------------------------ */

interface LumofyStaffEntry {
  id: string;
  name: string;
  email: string;
  phone: string;
  jobTitle: string;
}

const DEFAULT_STAKEHOLDER_TYPES = ["Executive Sponsor", "Champion", "Decision Maker", "Power User", "Gatekeeper"];

interface PersonOption {
  id: string;
  name: string;
  sublabel: string | null;
  initials: string;
  detail: string | null;
}

function contactToOption(c: Contact): PersonOption {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || c.id;
  const initials = ([c.firstName?.[0], c.lastName?.[0]].filter(Boolean).join("").toUpperCase()) || "?";
  const detailParts = [c.jobTitle, c.email, c.phone].filter(Boolean) as string[];
  return { id: c.id, name, sublabel: c.jobTitle || c.email || null, initials, detail: detailParts.length ? detailParts.join(" · ") : null };
}

function staffToOption(s: LumofyStaffEntry): PersonOption {
  const initials = s.name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const detailParts = [s.jobTitle, s.email, s.phone].filter(Boolean) as string[];
  return { id: s.id, name: s.name, sublabel: s.jobTitle || s.email || null, initials, detail: detailParts.length ? detailParts.join(" · ") : null };
}

const PEOPLE_THEME = {
  sirius: {
    chip: "border-sirius/30 bg-accent-soft text-sirius",
    avatar: "bg-accent-soft text-sirius",
    add: "border-sirius/30 text-sirius hover:bg-sirius/5",
  },
  purple: {
    chip: "border-purple-200/60 bg-purple-50/60 text-fg dark:border-purple-800/40 dark:bg-purple-950/20",
    avatar: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
    add: "border-purple-300/60 text-purple-700 hover:bg-purple-50/60 dark:border-purple-800/40 dark:text-purple-400 dark:hover:bg-purple-950/20",
  },
} as const;

function PersonChip({ option, theme, onRemove }: { option: PersonOption; theme: keyof typeof PEOPLE_THEME; onRemove: () => void }) {
  const t = PEOPLE_THEME[theme];
  return (
    <span title={option.detail ?? option.name} className={cn("flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-1.5", t.chip)}>
      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full font-body text-[10px] font-bold", t.avatar)}>
        {option.initials}
      </span>
      <span className="max-w-[120px] truncate font-body text-[12px] font-semibold">{option.name}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="flex size-4 shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-bg-muted hover:text-fg"
        aria-label={"Remove " + option.name}
      >
        <X size={11} />
      </button>
    </span>
  );
}

function PeopleMultiSelect({
  options, selectedIds, onChange, theme, addLabel, emptyOptionsHint,
}: {
  options: PersonOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  theme: keyof typeof PEOPLE_THEME;
  addLabel: string;
  emptyOptionsHint: string;
}) {
  const t = PEOPLE_THEME[theme];
  const selected = selectedIds.map((id) => options.find((o) => o.id === id)).filter((o): o is PersonOption => !!o);
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-bg p-1.5">
      {selected.map((o) => (
        <PersonChip key={o.id} option={o} theme={theme} onRemove={() => toggle(o.id)} />
      ))}
      <PopMenu
        menuWidth={260}
        trigger={() => (
          <span className={cn("flex items-center gap-1 rounded-lg border border-dashed px-2 py-1 font-body text-[11.5px] font-semibold transition-colors", t.add)}>
            <Plus size={12} /> {selected.length === 0 ? addLabel : "Add"}
          </span>
        )}
      >
        {() => <PeoplePickerList options={options} selectedIds={selectedIds} onToggle={toggle} emptyOptionsHint={emptyOptionsHint} />}
      </PopMenu>
    </div>
  );
}

function PeoplePickerList({
  options, selectedIds, onToggle, emptyOptionsHint,
}: {
  options: PersonOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  emptyOptionsHint: string;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.name.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q))
    : options;

  return (
    <div className="flex w-60 flex-col gap-1">
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5">
        <Search size={13} className="shrink-0 text-fg-subtle" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="w-full bg-transparent font-body text-[13px] text-fg outline-none placeholder:text-fg-subtle"
        />
      </div>
      <div className="flex max-h-[240px] flex-col gap-0.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-2.5 py-3 text-center font-body text-[12px] text-fg-subtle">
            {options.length === 0 ? emptyOptionsHint : "No matches"}
          </div>
        ) : (
          filtered.map((o) => {
            const on = selectedIds.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => onToggle(o.id)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-bg-muted"
              >
                <span className={cn("flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-sirius bg-sirius text-white" : "border-border")}>
                  {on && <Check size={11} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body text-[13px] text-fg">{o.name}</span>
                  {o.sublabel && <span className="block truncate font-body text-[11px] text-fg-muted">{o.sublabel}</span>}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function StakeholderMatrix({ clientId, contacts, initialMappings }: { clientId: string; contacts: Contact[]; initialMappings: StakeholderMapping[] }) {
  const [types, setTypes] = useState<string[]>([]);
  const [staff, setStaff] = useState<LumofyStaffEntry[]>([]);
  const [mappings, setMappings] = useState<StakeholderMapping[]>(initialMappings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [typesRes, staffRes] = await Promise.all([
          fetch("/api/admin/stakeholder-config?key=stakeholder_types"),
          fetch("/api/admin/stakeholder-config?key=lumofy_staff"),
        ]);
        const [typesData, staffData] = await Promise.all([typesRes.json(), staffRes.json()]);
        const loadedTypes: string[] = typesData.value?.length ? typesData.value : DEFAULT_STAKEHOLDER_TYPES;
        const loadedStaff: LumofyStaffEntry[] = staffData.value ?? [];
        setTypes(loadedTypes);
        setStaff(loadedStaff);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function getMapping(type: string): StakeholderMapping {
    return mappings.find((m) => m.type === type) ?? { type, contactIds: [], staffIds: [] };
  }

  function updateMapping(type: string, patch: Partial<Omit<StakeholderMapping, "type">>) {
    setMappings((prev) => {
      const existing = prev.find((m) => m.type === type);
      if (existing) return prev.map((m) => m.type === type ? { ...m, ...patch } : m);
      return [...prev, { type, contactIds: [], staffIds: [], ...patch }];
    });
  }

  async function saveMappings() {
    setSaving(true);
    try {
      await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties: { stakeholder_mappings: mappings } }),
      });
    } finally { setSaving(false); }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-fg-muted font-body text-sm">Loading stakeholder map…</div>;
  }

  const contactOptions = contacts.map(contactToOption);
  const staffOptions = staff.map(staffToOption);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[180px_1fr_1fr] gap-3">
        <div className="font-body text-[11px] font-semibold uppercase tracking-wider text-fg-muted px-1">Stakeholder Type</div>
        <div className="font-body text-[11px] font-semibold uppercase tracking-wider text-fg-muted px-1">Client Stakeholder</div>
        <div className="font-body text-[11px] font-semibold uppercase tracking-wider text-fg-muted px-1">Lumofy Owner</div>
      </div>

      <div className="flex flex-col gap-2">
        {types.map((type) => {
          const mapping = getMapping(type);
          return (
            <div key={type} className="grid grid-cols-[180px_1fr_1fr] gap-3 rounded-xl border border-border bg-bg p-3 transition-shadow hover:shadow-sm">
              <div className="flex items-center">
                <span className="rounded-lg bg-accent-soft px-3 py-1.5 font-body text-xs font-semibold text-sirius">{type}</span>
              </div>
              <PeopleMultiSelect
                options={contactOptions}
                selectedIds={mapping.contactIds}
                onChange={(ids) => updateMapping(type, { contactIds: ids })}
                theme="sirius"
                addLabel="Select contacts"
                emptyOptionsHint="No contacts yet"
              />
              <PeopleMultiSelect
                options={staffOptions}
                selectedIds={mapping.staffIds}
                onChange={(ids) => updateMapping(type, { staffIds: ids })}
                theme="purple"
                addLabel="Select team members"
                emptyOptionsHint="No team members yet"
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={saveMappings}
          className="flex items-center gap-1.5 rounded-lg bg-sirius px-4 py-2 font-body text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        >
          <Check size={14} /> {saving ? "Saving…" : "Save mapping"}
        </button>
        {types.length === 0 && (
          <p className="font-body text-xs text-fg-muted">
            Configure stakeholder types in <a href="/settings" className="text-sirius hover:underline">Settings → Stakeholder types</a>.
          </p>
        )}
        {staff.length === 0 && (
          <p className="font-body text-xs text-fg-muted">
            Add Lumofy team members in <a href="/settings" className="text-sirius hover:underline">Settings → Lumofy team</a>.
          </p>
        )}
      </div>
    </div>
  );
}

/* ===================================================================== */
/* Support (Intercom)                                                     */
/* ===================================================================== */

const TICKET_STATE_TONE: Record<SupportTicket["state"], BadgeTone> = {
  open: "nova",
  snoozed: "stellar",
  closed: "neutral",
};

const TICKET_PRIORITY_TONE: Record<SupportTicket["priority"], BadgeTone> = {
  P1: "nova",
  P2: "stellar",
  P3: "neutral",
};

// Open+breaching first (most urgent), then open on-track, then snoozed, then
// closed (most recent first) — matches how a CSM would want to scan this.
function ticketSortKey(t: SupportTicket): number {
  if (t.state === "open") return t.slaBreaches.length > 0 ? 0 : 1;
  if (t.state === "snoozed") return t.slaBreaches.length > 0 ? 2 : 3;
  return t.slaBreaches.length > 0 ? 4 : 5;
}

function TicketSlaCell({ ticket }: { ticket: SupportTicket }) {
  if (ticket.slaBreaches.length === 0) {
    return <Badge tone="aurora">On track</Badge>;
  }
  const worst = ticket.slaBreaches.reduce((a, b) => (b.elapsedBusinessHours > a.elapsedBusinessHours ? b : a), ticket.slaBreaches[0]!);
  const overdueHours = Math.max(0, Math.round(worst.elapsedBusinessHours - worst.targetHours));
  const kinds = ticket.slaBreaches.map((b) => b.kind).join(" + ");
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone="nova">Breached ({kinds})</Badge>
      <span className="caption">{overdueHours}h over</span>
    </span>
  );
}

function TicketFilterSelect({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border bg-bg px-2.5 py-1.5 font-body text-[12.5px] font-medium text-fg-muted outline-none transition-colors hover:text-fg focus:border-sirius-200"
    >
      {children}
    </select>
  );
}

function SupportTab({ client }: { client: Client }) {
  const s = client.support;
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [slaFilter, setSlaFilter] = useState<string>("all");

  const sorted = useMemo(() => [...s.tickets].sort((a, b) => ticketSortKey(a) - ticketSortKey(b) || b.createdAt.localeCompare(a.createdAt)), [s.tickets]);
  const tickets = useMemo(
    () =>
      sorted
        .filter((t) => stateFilter === "all" || t.state === stateFilter)
        .filter((t) => priorityFilter === "all" || t.priority === priorityFilter)
        .filter((t) => slaFilter === "all" || (slaFilter === "breached" ? t.slaBreaches.length > 0 : t.slaBreaches.length === 0)),
    [sorted, stateFilter, priorityFilter, slaFilter],
  );

  return (
    <>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <CardEyebrow>Support · Intercom</CardEyebrow>
          {s.lastConversationAt && <span className="caption">Last conversation {relativeTime(s.lastConversationAt)}</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Open tickets" value={String(s.openTickets)} tone={s.openTickets > 3 ? "down" : undefined} icon={LifeBuoy} />
          <Metric label="Snoozed" value={String(s.snoozedTickets)} />
          <Metric label="Closed (30d)" value={String(s.closedLast30d)} />
          <Metric label="Oldest open" value={s.oldestOpenDays != null ? `${s.oldestOpenDays}d` : "—"} tone={(s.oldestOpenDays ?? 0) > 14 ? "down" : undefined} />
          <Metric label="Median first response" value={s.medianFirstResponseHours != null ? `${s.medianFirstResponseHours}h` : "—"} />
          <Metric
            label="Breached SLA"
            value={String(s.tickets.filter((t) => t.state === "open" && t.slaBreaches.length > 0).length)}
            tone={s.tickets.some((t) => t.state === "open" && t.slaBreaches.length > 0) ? "down" : undefined}
          />
        </div>
      </Card>
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardEyebrow>Tickets ({tickets.length}{tickets.length !== sorted.length ? ` of ${sorted.length}` : ""})</CardEyebrow>
          {!s.supportLevelUsed && (
            <span className="caption">No support level set — SLA not evaluated</span>
          )}
        </div>
        {sorted.length > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <TicketFilterSelect value={stateFilter} onChange={setStateFilter} label="State">
              <option value="all">All states</option>
              <option value="open">Open</option>
              <option value="snoozed">Snoozed</option>
              <option value="closed">Closed</option>
            </TicketFilterSelect>
            <TicketFilterSelect value={priorityFilter} onChange={setPriorityFilter} label="Priority">
              <option value="all">All priorities</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
              <option value="P3">P3</option>
            </TicketFilterSelect>
            <TicketFilterSelect value={slaFilter} onChange={setSlaFilter} label="SLA">
              <option value="all">All SLA</option>
              <option value="breached">Breached</option>
              <option value="on_track">On track</option>
            </TicketFilterSelect>
          </div>
        )}
        {sorted.length === 0 ? (
          <EmptyHint
            icon={Inbox}
            title="No tickets yet"
            body="Individual tickets will appear here once this account has Intercom conversations."
          />
        ) : tickets.length === 0 ? (
          <EmptyHint icon={Inbox} title="No tickets match these filters" body="Try clearing a filter to see more tickets." />
        ) : (
          <div className="max-h-[520px] overflow-y-auto rounded-lg border border-border">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Priority</th>
                  <th className="px-3 py-2 text-left font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">State</th>
                  <th className="px-3 py-2 text-left font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">Created</th>
                  <th className="px-3 py-2 text-left font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">SLA</th>
                  <th className="px-3 py-2 text-left font-body text-[11px] font-semibold uppercase tracking-wide text-fg-subtle"></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2.5"><Badge tone={TICKET_PRIORITY_TONE[t.priority]}>{t.priority}</Badge></td>
                    <td className="px-3 py-2.5"><Badge tone={TICKET_STATE_TONE[t.state]}>{t.state}</Badge></td>
                    <td className="px-3 py-2.5 font-body text-[12.5px] text-fg-muted">{formatDate(t.createdAt)}</td>
                    <td className="px-3 py-2.5"><TicketSlaCell ticket={t} /></td>
                    <td className="px-3 py-2.5 text-right">
                      {t.url && (
                        <a href={t.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-body text-[12px] font-semibold text-sirius hover:underline">
                          Open <ExternalLink size={12} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/* ===================================================================== */
/* Satisfaction indicator (NPS / CSAT — pending Intercom)                 */
/* ===================================================================== */

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m)] ?? m} ${y}`;
}

/** One satisfaction KPI tile: a colored accent bar, the big value, its response
 *  count, and a vs-previous-month delta pulled from the metric's own trend. */
function SatisfactionKpi({
  label, hint, value, unit, responses, color, icon: Icon, trend,
}: {
  label: string;
  hint: string;
  value: number | null;
  unit: "%" | "";
  responses: number;
  color: string;
  icon: LucideIcon;
  trend: { period: string; value: number }[];
}) {
  const delta = trend.length >= 2 ? trend[trend.length - 1]!.value - trend[trend.length - 2]!.value : null;
  const DeltaIcon = delta == null || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaColor = delta == null || delta === 0 ? "text-fg-subtle" : delta > 0 ? "text-success" : "text-danger";
  return (
    <div className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface p-4">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <span className="caption flex items-center gap-1.5">
          <Icon className="size-3.5" style={{ color }} strokeWidth={2} />
          {label}
        </span>
        {delta != null && (
          <span className={cn("flex items-center gap-0.5 font-body text-[11px] font-semibold tabular", deltaColor)} title="vs. previous month">
            <DeltaIcon className="size-3" />
            {delta > 0 ? "+" : ""}{delta}{unit}
          </span>
        )}
      </div>
      <div className="tabular mt-2 font-display text-[2rem] font-bold leading-none text-fg">
        {value != null ? `${value}${unit}` : "—"}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="caption">{responses} response{responses === 1 ? "" : "s"}</span>
        <span className="caption text-fg-subtle">{hint}</span>
      </div>
    </div>
  );
}

function SatisfactionTrendCard({
  title, current, unit, trend, color, emptyBody,
}: {
  title: string;
  current: number | null;
  unit: "%" | "";
  trend: { period: string; value: number; responses: number }[];
  color: string;
  emptyBody: string;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <CardEyebrow>{title}</CardEyebrow>
        {current != null && (
          <span className="tabular font-display text-sm font-bold" style={{ color }}>{current}{unit}</span>
        )}
      </div>
      {trend.length === 0 ? (
        <EmptyHint icon={Gauge} title={`No ${title} data yet`} body={emptyBody} />
      ) : (
        <div className="mt-2">
          <LineChart
            series={[{ label: title, color, points: trend.map((t) => ({ month: t.period, value: t.value })) }]}
            months={trend.map((t) => t.period)}
            formatShort={monthLabel}
            formatLong={monthLabel}
          />
        </div>
      )}
    </Card>
  );
}

/**
 * Satisfaction indicator — three independent signals, each its own KPI tile and
 * trend line:
 *   NPS           — outbound survey Q1 (recommend, 0–10)  → −100..100
 *   Platform CSAT — outbound survey Q2 (happy, 1–5)       → % satisfied
 *   Tickets CSAT  — Intercom conversation ratings         → % satisfied
 * The two survey metrics come from lib/support/survey-sync.ts; Tickets CSAT is
 * the pre-existing post-conversation rating. All three live on client.support.
 */
function SatisfactionTab({ client }: { client: Client }) {
  const s = client.support;
  const emptyNps = 'NPS from the Intercom outbound survey ("How likely are you to recommend us…", 0–10). A monthly line appears here once this account has survey responses.';
  const emptyPlatform = 'Platform CSAT from the survey’s second question ("How happy are you with the experience…", 1–5). Appears once this account responds to the survey.';
  const emptyTickets = "Post-conversation ticket CSAT from Intercom conversation ratings. A monthly line appears once this account’s conversations get a customer rating.";
  return (
    <>
      <Card>
        <CardEyebrow>Satisfaction indicator</CardEyebrow>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SatisfactionKpi label="NPS" hint="survey · −100 to 100" value={s.nps} unit="" responses={s.npsResponses} color="var(--color-eclipse)" icon={ThumbsUp} trend={s.npsTrend} />
          <SatisfactionKpi label="Platform CSAT" hint="survey · % satisfied" value={s.platformCsat} unit="%" responses={s.platformCsatResponses} color="var(--color-sirius)" icon={Smile} trend={s.platformCsatTrend} />
          <SatisfactionKpi label="Tickets CSAT" hint="support · % satisfied" value={s.csat} unit="%" responses={s.csatResponses} color="var(--color-aurora)" icon={LifeBuoy} trend={s.csatTrend} />
        </div>
      </Card>
      <SatisfactionTrendCard title="NPS trend" current={s.nps} unit="" trend={s.npsTrend} color="var(--color-eclipse)" emptyBody={emptyNps} />
      <SatisfactionTrendCard title="Platform CSAT trend" current={s.platformCsat} unit="%" trend={s.platformCsatTrend} color="var(--color-sirius)" emptyBody={emptyPlatform} />
      <SatisfactionTrendCard title="Tickets CSAT trend" current={s.csat} unit="%" trend={s.csatTrend} color="var(--color-aurora)" emptyBody={emptyTickets} />
    </>
  );
}

/* ===================================================================== */
/* Action list — health breakdown + auto-calc placeholder                 */
/* ===================================================================== */

function ActionsTab({ client, actions, healthConfig }: { client: Client; actions: ClientAction[]; healthConfig: ClientHealthConfig }) {
  const router = useRouter();
  const [recalculating, setRecalculating] = useState(false);

  async function recalculate() {
    setRecalculating(true);
    try {
      await recalculateClientHealthAction(client.id);
      router.refresh();
    } finally {
      setRecalculating(false);
    }
  }

  const enabledMetrics = healthConfig.metrics.filter((m) => m.enabled);

  return (
    <>
      <Card>
        <CardEyebrow>Action list</CardEyebrow>
        <p className="mb-4 mt-0.5 font-body text-[12px] leading-relaxed text-fg-subtle">
          AI-guided next steps for {client.name}, from this account&rsquo;s live readings — missing data, quiet usage, health
          dips, stakeholder gaps. These are guidance, not tasks: dismiss one to hide it, or it clears itself once the
          underlying situation resolves. Regenerate to refresh.
        </p>
        <ActionFeed
          mode="client"
          clientId={client.id}
          items={actions.map((a) => ({
            id: a.id,
            clientId: a.clientId,
            category: a.category,
            signalKey: a.signalKey,
            priority: a.priority,
            title: a.title,
            insight: a.insight,
            source: a.source,
            clientName: client.name,
          }))}
        />
      </Card>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <CardEyebrow>Health signals</CardEyebrow>
          <button
            onClick={recalculate}
            disabled={recalculating}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius hover:text-sirius disabled:opacity-50"
          >
            {recalculating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Recalculate
          </button>
        </div>
        <p className="mb-1 mt-0.5 font-body text-[12px] leading-relaxed text-fg-subtle">
          Weighted per the formula set in Settings → Workflows → Client health. A signal with no data for this account
          shows as &ldquo;No data&rdquo; rather than a guessed value.
        </p>
        <div className="mt-2 flex flex-col gap-3.5">
          {enabledMetrics.length === 0 ? (
            <p className="font-body text-[12.5px] text-fg-subtle">No signals are enabled in the health formula.</p>
          ) : (
            enabledMetrics.map((m) => (
              <ComponentBar key={m.key} label={HEALTH_METRIC_LABELS[m.key]} value={client.health.components[m.key] ?? null} weight={m.weight} />
            ))
          )}
        </div>
      </Card>
    </>
  );
}

/* ===================================================================== */
/* Shared pieces                                                          */
/* ===================================================================== */

function PagedList<T>({
  items,
  pageSize,
  render,
  container = "divide",
}: {
  items: T[];
  pageSize: number;
  render: (item: T) => React.ReactNode;
  container?: "divide" | "gap";
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(page, pageCount - 1);
  const start = safe * pageSize;
  const slice = items.slice(start, start + pageSize);
  return (
    <div>
      <ul className={container === "divide" ? "flex flex-col divide-y divide-border-subtle" : "flex flex-col gap-3.5"}>
        {slice.map(render)}
      </ul>
      {items.length > pageSize && (
        <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3">
          <span className="caption tabular">
            {start + 1}–{Math.min(start + pageSize, items.length)} of {items.length}
          </span>
          <div className="flex items-center gap-1">
            <PagerBtn disabled={safe === 0} onClick={() => setPage(safe - 1)}>
              <ChevronLeft size={15} />
            </PagerBtn>
            <span className="caption tabular px-1.5">{safe + 1}/{pageCount}</span>
            <PagerBtn disabled={safe >= pageCount - 1} onClick={() => setPage(safe + 1)}>
              <ChevronRight size={15} />
            </PagerBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function PagerBtn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function EmptyHint({ icon: Icon, title, body }: { icon: typeof Building2; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full bg-bg-muted text-fg-subtle">
        <Icon size={20} strokeWidth={1.75} />
      </span>
      <p className="font-body text-sm font-semibold text-fg">{title}</p>
      <p className="caption max-w-md leading-relaxed">{body}</p>
    </div>
  );
}

/** Accordion stack — each section is its own rounded card. */
function Panel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>;
}

function Section({
  icon: Icon,
  title,
  subtitle,
  right,
  defaultOpen = true,
  children,
}: {
  icon: typeof Building2;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-bg-subtle"
      >
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg transition-colors", open ? "bg-sirius text-white" : "bg-accent-soft text-sirius")}>
          <Icon size={17} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-bold text-fg">{title}</span>
          {subtitle && <span className="caption mt-0.5 block">{subtitle}</span>}
        </span>
        {right}
        <ChevronDown size={18} className={cn("shrink-0 text-fg-subtle transition-transform duration-200", !open && "-rotate-90")} />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="border-t border-border-subtle px-5 py-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">{children}</dl>;
}

function Field({ label, children, muted }: { label: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</dt>
      <dd className={cn("font-body text-[13px] leading-snug", muted ? "text-fg-subtle" : "font-semibold text-fg")}>{children}</dd>
    </div>
  );
}

/* ----------------------------------------------------------- inline edit */

type FieldType = "text" | "number" | "currency" | "date" | "single_select" | "multi_select";
type Opt = { value: string; label: string };
type EditTarget = { core: string } | { prop: string } | { csm: true };

function selectOpts(options?: string[] | string): Opt[] {
  // Be resilient if options ever arrive as a JSON string (double-encoded jsonb).
  let arr: string[] = [];
  if (Array.isArray(options)) arr = options;
  else if (typeof options === "string") {
    try { const p = JSON.parse(options); if (Array.isArray(p)) arr = p; } catch { /* ignore */ }
  }
  return arr.map((o) => ({ value: String(o), label: String(o) }));
}

/** Small triangle next to a field's label when that field is on the
 *  profile-completeness list AND currently empty — red = must-fill, yellow =
 *  nice-to-have (see lib/profile-completeness.ts). Filled-in fields show
 *  nothing, so the icon only ever draws the eye to what's actually missing. */
function FieldAlert({ severity }: { severity?: "red" | "yellow" }) {
  if (!severity) return null;
  return (
    <AlertTriangle
      size={11}
      strokeWidth={2.5}
      className={severity === "red" ? "shrink-0 text-[#E31B1B]" : "shrink-0 text-[#C99A14]"}
      aria-label={severity === "red" ? "Required — missing" : "Nice to have — missing"}
    />
  );
}

/** A label/value cell that turns into the right input when clicked. */
function EditableField({
  clientId,
  label,
  value,
  type,
  options,
  target,
  currency,
  readOnly,
  alertSeverity,
}: {
  clientId: string;
  label: string;
  value: unknown;
  type: FieldType;
  options?: Opt[];
  target?: EditTarget;
  currency?: string;
  readOnly?: boolean;
  alertSeverity?: "red" | "yellow";
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localValue, setLocalValue] = useState<unknown>(value);
  const empty = !hasValue(localValue);
  const labelFor = (v: string) => options?.find((o) => o.value === v)?.label ?? v;

  let display: React.ReactNode = "—";
  if (!empty) {
    if (type === "multi_select" && Array.isArray(localValue)) {
      const items = localValue as string[];
      const MAX = 3;
      const shown = items.slice(0, MAX);
      const extra = items.length - MAX;
      display = (
        <span className="flex flex-wrap gap-1">
          {shown.map((v, i) => <Badge key={i} tone="neutral">{labelFor(v)}</Badge>)}
          {extra > 0 && <Badge tone="neutral">+{extra} more</Badge>}
        </span>
      );
    } else if (type === "single_select") display = labelFor(String(localValue));
    else if (type === "currency") { const n = Number(localValue); display = Number.isFinite(n) ? formatCurrency(n, currency ?? "USD") : String(localValue); }
    else if (type === "number") { const n = Number(localValue); display = Number.isFinite(n) ? formatNumber(n) : String(localValue); }
    else if (type === "date") display = formatDate(String(localValue));
    else display = String(localValue);
  }
  const valueCls = cn("font-body text-[13px] leading-snug", empty ? "text-fg-subtle" : "font-semibold text-fg");

  async function commit(raw: unknown) {
    if (!target) return;
    let out: unknown;
    if (type === "multi_select") out = Array.isArray(raw) ? raw : [];
    else if (raw === "" || raw == null) out = null;
    else if (type === "number" || type === "currency") { const n = Number(raw); out = Number.isFinite(n) ? n : raw; }
    else out = raw;

    // Optimistic: show new value immediately, close editor.
    const prev = localValue;
    setLocalValue(out);
    setEditing(false);
    setSaving(true);

    const payload =
      "core" in target ? { fields: { [target.core]: out } }
      : "prop" in target ? { properties: { [target.prop]: out } }
      : { csmId: (out as string) || null };
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      // Rollback on failure so the user knows the save didn't take.
      setLocalValue(prev);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
        {label}
        {empty && <FieldAlert severity={alertSeverity} />}
      </dt>
      <dd>
        {readOnly || !target ? (
          <span className={valueCls}>{display}</span>
        ) : editing ? (
          <EditInput type={type} options={options} value={localValue} saving={saving} onCommit={commit} onCancel={() => setEditing(false)} />
        ) : (
          <button onClick={() => setEditing(true)} className="group -ml-1 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-bg-muted">
            <span className={valueCls}>{display}</span>
            <Pencil size={11} className="ml-auto shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
      </dd>
    </div>
  );
}

/**
 * Lifecycle status — auto-computed (Onboarding/Active/Renewal), so it renders
 * as a read-only badge. "Churned" is the one manual lever: a CSM can mark or
 * unmark it here; every other state is derived from deal activity.
 */
function StatusField({ clientId, status, manuallyChurned }: { clientId: string; status: string; manuallyChurned: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [localStatus, setLocalStatus] = useState(status);
  const [localChurned, setLocalChurned] = useState(manuallyChurned);
  const meta = STATUS_LABELS[localStatus] ?? { label: localStatus, tone: "neutral" as BadgeTone };

  async function toggleChurn(next: boolean) {
    const prevStatus = localStatus;
    const prevChurned = localChurned;
    // Churning is unambiguous (always "churned"); un-churning re-derives from
    // deal activity server-side, so refresh to pick up the real result.
    setLocalChurned(next);
    if (next) setLocalStatus("churned");
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties: { [STATUS_OVERRIDE_KEY]: next ? "churned" : null } }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!next) router.refresh();
    } catch {
      setLocalChurned(prevChurned);
      setLocalStatus(prevStatus);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <dt className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">Status</dt>
      <dd className="flex items-center gap-2">
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <button
          type="button"
          disabled={saving}
          onClick={() => toggleChurn(!localChurned)}
          className="font-body text-[11px] font-medium text-fg-subtle underline decoration-dotted underline-offset-2 hover:text-fg disabled:opacity-50"
        >
          {localChurned ? "Reactivate" : "Mark as churned"}
        </button>
      </dd>
    </div>
  );
}

const editCls = "w-full rounded-md border border-sirius-200 bg-surface px-2 py-1 font-body text-[13px] text-fg outline-none focus:ring-2 focus:ring-sirius/10";

/** Searchable dropdown multi-select picker used inside deal-card / property cells. */
function MultiSelectDropdown({
  opts,
  arr,
  setArr,
  saving,
  onSave,
  onCancel,
}: {
  opts: Opt[];
  arr: string[];
  setArr: React.Dispatch<React.SetStateAction<string[]>>;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const labelFor = (v: string) => opts.find((o) => o.value === v)?.label ?? v;
  const filtered = search
    ? opts.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : opts;
  const toggle = (v: string) =>
    setArr((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]));

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const triggerLabel =
    arr.length === 0 ? "Select options…"
    : arr.length <= 2 ? arr.map(labelFor).join(", ")
    : `${arr.length} selected`;

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[200px] items-center gap-2 rounded-lg border border-border bg-bg px-3 py-1.5 font-body text-sm transition-colors hover:border-sirius focus:outline-none focus:ring-2 focus:ring-sirius"
      >
        <span className={cn("flex-1 truncate text-left font-body text-sm", arr.length === 0 ? "text-fg-muted" : "font-medium text-fg")}>
          {triggerLabel}
        </span>
        <ChevronDown size={13} className={cn("shrink-0 text-fg-muted transition-transform duration-150", open && "rotate-180")} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-border bg-bg shadow-xl"
        >
          {/* Search input */}
          <div className="border-b border-border p-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-muted px-2.5 py-1.5">
              <Search size={13} className="shrink-0 text-fg-muted" />
              <input
                autoFocus
                className="flex-1 bg-transparent font-body text-sm text-fg placeholder:text-fg-muted focus:outline-none"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className="shrink-0 text-fg-muted hover:text-fg">
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Options list */}
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-center font-body text-sm italic text-fg-muted">No matches</div>
            ) : (
              filtered.map((o) => {
                const checked = arr.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-bg-muted",
                      checked && "bg-accent-soft/40",
                    )}
                  >
                    <span className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border-[1.5px] transition-colors",
                      checked ? "border-sirius bg-sirius text-white" : "border-border bg-bg",
                    )}>
                      {checked && <Check size={10} />}
                    </span>
                    <span className={cn("flex-1 font-body text-sm leading-snug", checked ? "font-semibold text-fg" : "text-fg")}>
                      {o.label}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-3 py-2">
            <span className="font-body text-xs text-fg-muted">
              {arr.length > 0 ? `${arr.length} selected` : "None selected"}
            </span>
            {arr.length > 0 && (
              <button type="button" onClick={() => setArr([])} className="font-body text-xs text-fg-muted underline hover:text-fg">
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Selected chips preview (when dropdown closed) */}
      {!open && arr.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {arr.slice(0, 4).map((v) => (
            <span key={v} className="flex items-center gap-1 rounded-full border border-sirius/30 bg-accent-soft px-2 py-0.5 font-body text-[11px] font-medium text-sirius">
              {labelFor(v)}
              <button type="button" onClick={() => toggle(v)} className="ml-0.5 opacity-60 hover:opacity-100"><X size={9} /></button>
            </span>
          ))}
          {arr.length > 4 && (
            <span className="flex items-center rounded-full border border-border bg-bg-muted px-2 py-0.5 font-body text-[11px] text-fg-muted">
              +{arr.length - 4} more
            </span>
          )}
        </div>
      )}

      {/* Save / Cancel */}
      <div className="mt-2 flex items-center gap-1.5">
        <button type="button" disabled={saving} onClick={onSave}
          className="flex items-center gap-1 rounded-md bg-sirius px-3 py-1.5 font-body text-xs font-semibold text-white transition-opacity disabled:opacity-50">
          <Check size={12} /> Save
        </button>
        <button type="button" disabled={saving} onClick={onCancel}
          className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 font-body text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50">
          <X size={11} /> Cancel
        </button>
      </div>
    </div>
  );
}

/** Edit mode for a field: holds a local draft and only persists on Save. */
function EditInput({
  type,
  options,
  value,
  saving,
  onCommit,
  onCancel,
}: {
  type: FieldType;
  options?: Opt[];
  value: unknown;
  saving: boolean;
  onCommit: (out: unknown) => void;
  onCancel: () => void;
}) {
  const initText = type === "date" && value ? String(value).slice(0, 10) : value != null && !Array.isArray(value) ? String(value) : "";
  const [text, setText] = useState(initText);
  const [arr, setArr] = useState<string[]>(Array.isArray(value) ? (value as string[]) : []);

  const save = () => onCommit(type === "multi_select" ? arr : text);
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); };

  const buttons = (
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" disabled={saving} onClick={save} title="Save" className="grid size-6 place-items-center rounded-md bg-sirius text-white transition-colors hover:bg-cosmos disabled:opacity-50">
        <Check size={13} />
      </button>
      <button type="button" disabled={saving} onClick={onCancel} title="Cancel" className="grid size-6 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-bg-muted disabled:opacity-50">
        <X size={13} />
      </button>
    </span>
  );

  if (type === "single_select") {
    const opts = options ?? [];
    const all = text && !opts.some((o) => o.value === text) ? [...opts, { value: text, label: text }] : opts;
    return (
      <div className="flex items-center gap-1.5">
        <select autoFocus disabled={saving} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} className={editCls}>
          <option value="">—</option>
          {all.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {buttons}
      </div>
    );
  }

  if (type === "multi_select") {
    const opts = [...(options ?? [])];
    for (const v of arr) if (!opts.some((o) => o.value === v)) opts.push({ value: v, label: v });
    return (
      <MultiSelectDropdown
        opts={opts}
        arr={arr}
        setArr={setArr}
        saving={saving}
        onSave={save}
        onCancel={onCancel}
      />
    );
  }

  // text / number / date — free text (numbers parsed on save by commit()).
  const inputType = type === "date" ? "date" : "text";
  return (
    <div className="flex items-center gap-1.5">
      <input autoFocus disabled={saving} type={inputType} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} className={editCls} />
      {buttons}
    </div>
  );
}

function ComponentBar({ label, value, weight }: { label: string; value: number | null; weight: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 font-body text-[13px] text-fg-muted">{label}</span>
      {value == null ? (
        <>
          <div className="h-1.5 flex-1 rounded-pill bg-bg-muted" />
          <span className="w-16 shrink-0 text-right font-body text-[12px] italic text-fg-subtle">No data</span>
        </>
      ) : (
        <>
          <Progress value={value} tone={value >= 75 ? "aurora" : value >= 55 ? "stellar" : "nova"} />
          <span className="tabular w-8 shrink-0 text-right font-body text-[13px] font-semibold text-fg">{value}</span>
        </>
      )}
      <span className="caption tabular w-10 shrink-0 text-right">{Math.round(weight * 10) / 10}%</span>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down";
  icon?: typeof LifeBuoy;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="caption flex items-center gap-1.5">
        {Icon && <Icon size={13} strokeWidth={1.75} />}
        {label}
      </span>
      <span className={`tabular font-display text-xl font-bold ${tone === "up" ? "text-[#1E8F61]" : tone === "down" ? "text-[#B23A57]" : "text-fg"}`}>
        {value}
      </span>
      {sub && <span className="caption">{sub}</span>}
    </div>
  );
}


/* ----------------------------------------------------------------- deals */

const PIPELINE_LABEL = (p: Deal["pipeline"]) =>
  p === "direct" ? "Direct Sales" : p === "indirect" ? "Indirect Sales" : p === "cs" ? "CS Pipeline" : "—";

/** Deals grouped into Renewals (sales won + CS renewed) and Expansion (CS
 *  expanded). Each deal is its own card; tracking toggles are held as a local
 *  draft spanning both tabs and only persist (recomputing ARR) on Save. The
 *  whole section collapses. Per-deal milestone dates are CSM-editable and persist
 *  under client.properties.__deal_dates; synced contract dates stay read-only. */
function DealsTabs({ deals, clientId, dealOverrides, dealDates, dealBriefs, propertyDefs }: { deals: Deal[]; clientId: string; dealOverrides: DealOverridesMap; dealDates: DealDatesMap; dealBriefs: DealBriefsMap; propertyDefs: PropertyDefinition[] }) {
  const router = useRouter();
  // router.refresh() is fire-and-forget — it resolves the *scheduling* of a
  // background re-render, not the refreshed (server-confirmed) props actually
  // landing. Without useTransition, a save's own "saving" flag cleared as soon
  // as the fetch settled, while the still-stale `deals` prop kept the "N
  // unsaved changes" banner and Save button visible — reading as "the save
  // didn't work," prompting a second (or third) click. isPending stays true
  // until the refreshed props have actually committed.
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(true);
  const sales = deals.filter((d) => d.pipeline !== "cs");
  const expansions = deals.filter((d) => d.pipeline === "cs" && d.category === "expansion");
  const confirmedChurns = deals.filter((d) => d.pipeline === "cs" && d.category === "confirmed_churn");
  const downgrades = deals.filter((d) => d.pipeline === "cs" && d.category === "downgraded");
  // Catch-all: any CS deal not in one of the three explicit buckets above
  // (i.e. category === "renewal", or an as-yet-unclassified CS stage).
  const renewals = deals.filter(
    (d) => d.pipeline === "cs" && d.category !== "expansion" && d.category !== "confirmed_churn" && d.category !== "downgraded",
  );
  type DealTab = "sales" | "renewals" | "expansion" | "confirmed_churn" | "downgrade";
  const TAB_ORDER: { key: DealTab; n: number }[] = [
    { key: "sales", n: sales.length },
    { key: "renewals", n: renewals.length },
    { key: "expansion", n: expansions.length },
    { key: "confirmed_churn", n: confirmedChurns.length },
    { key: "downgrade", n: downgrades.length },
  ];
  const [tab, setTab] = useState<DealTab>(TAB_ORDER.find((t) => t.n > 0)?.key ?? "renewals");

  // Optimistic local copies — updated immediately on save so the UI reflects
  // changes without waiting for the server round-trip from router.refresh().
  const [localOverrides, setLocalOverrides] = useState<DealOverridesMap>(dealOverrides);
  const [localDates, setLocalDates] = useState<DealDatesMap>(dealDates);
  const [localBriefs, setLocalBriefs] = useState<DealBriefsMap>(dealBriefs);

  const baseline = () => Object.fromEntries(deals.map((d) => [d.id, d.tracked ?? true]));
  const [draft, setDraft] = useState<Record<string, boolean>>(baseline);
  const [saving, setSaving] = useState(false);
  const changed = deals.filter((d) => (draft[d.id] ?? true) !== (d.tracked ?? true));

  async function save() {
    setSaving(true);
    try {
      await Promise.all(
        changed.map((d) =>
          fetch(`/api/deals/${encodeURIComponent(d.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tracked: draft[d.id] }),
          }),
        ),
      );
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  async function saveDealBrief(dealId: string, value: string | null) {
    const prev = localBriefs;
    const next: DealBriefsMap = { ...localBriefs };
    if (value?.trim()) next[dealId] = value.trim();
    else delete next[dealId];
    setLocalBriefs(next);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ properties: { [DEAL_BRIEFS_KEY]: next } }) });
      if (!res.ok) throw new Error();
    } catch { setLocalBriefs(prev); }
  }

  async function saveDealField(dealId: string, key: string, value: unknown) {
    const isEmpty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
    const forDeal: Record<string, unknown> = { ...(localOverrides[dealId] ?? {}) };
    if (isEmpty) delete forDeal[key];
    else forDeal[key] = value;
    const next: DealOverridesMap = { ...localOverrides };
    if (Object.keys(forDeal).length === 0) delete next[dealId];
    else next[dealId] = forDeal;
    const prev = localOverrides;
    setLocalOverrides(next);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ properties: { [DEAL_OVERRIDES_KEY]: next } }) });
      if (!res.ok) throw new Error();
      // The deal card itself updates instantly from localOverrides above, but
      // an amount/date override also changes the header's ARR/renewal/status
      // and the profile-completeness badge (all server-computed) — refresh so
      // those don't sit stale until a manual reload.
      startTransition(() => router.refresh());
    } catch { setLocalOverrides(prev); }
  }

  async function saveDealFields(dealId: string, fields: Record<string, unknown>) {
    const isEmpty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
    const forDeal: Record<string, unknown> = { ...(localOverrides[dealId] ?? {}) };
    for (const [key, value] of Object.entries(fields)) {
      if (isEmpty(value)) delete forDeal[key];
      else forDeal[key] = value;
    }
    const next: DealOverridesMap = { ...localOverrides };
    if (Object.keys(forDeal).length === 0) delete next[dealId];
    else next[dealId] = forDeal;
    const prev = localOverrides;
    setLocalOverrides(next);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ properties: { [DEAL_OVERRIDES_KEY]: next } }) });
      if (!res.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch { setLocalOverrides(prev); }
  }

  async function saveDealDate(dealId: string, key: string, value: string | null) {
    const forDeal: Record<string, string | null> = { ...(localDates[dealId] ?? {}) };
    if (value) forDeal[key] = value;
    else delete forDeal[key];
    const next: DealDatesMap = { ...localDates, [dealId]: forDeal };
    const prev = localDates;
    setLocalDates(next);
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ properties: { [DEAL_DATES_KEY]: next } }) });
      if (!res.ok) throw new Error();
      // Milestone dates feed the profile-completeness badge (header + list) —
      // refresh so filling one in clears the alert immediately, not after reload.
      startTransition(() => router.refresh());
    } catch { setLocalDates(prev); }
  }

  const shown =
    tab === "sales" ? sales
    : tab === "renewals" ? renewals
    : tab === "expansion" ? expansions
    : tab === "confirmed_churn" ? confirmedChurns
    : downgrades;
  const TOGGLE: { key: DealTab; label: string; n: number }[] = [
    { key: "sales", label: "Sales", n: sales.length },
    { key: "renewals", label: "Renewal", n: renewals.length },
    { key: "expansion", label: "Expansion", n: expansions.length },
    { key: "confirmed_churn", label: "Confirmed Churn", n: confirmedChurns.length },
    { key: "downgrade", label: "Downgrade", n: downgrades.length },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* Header — click to collapse / expand the whole section. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-bg-subtle"
      >
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg transition-colors", open ? "bg-sirius text-white" : "bg-accent-soft text-sirius")}>
          <Tag size={17} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-bold text-fg">Contracts &amp; deals</span>
          <span className="caption mt-0.5 block">Tracked deals count toward ARR</span>
        </span>
        <span className="tabular inline-flex h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-bg-muted px-1.5 text-[11px] font-semibold text-fg-muted">
          {deals.length}
        </span>
        <ChevronDown size={18} className={cn("shrink-0 text-fg-subtle transition-transform duration-200", !open && "-rotate-90")} />
      </button>

      {/* Collapsible body */}
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="border-t border-border-subtle px-5 py-5">
            {/* Renewals / Expansion sub-tabs */}
            <div className="mb-4 flex justify-end">
              <div className="inline-flex shrink-0 rounded-pill bg-bg-muted p-0.5">
                {TOGGLE.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-body text-[12.5px] font-semibold transition-colors",
                      tab === t.key ? "bg-surface text-sirius shadow-sm" : "text-fg-muted hover:text-fg",
                    )}
                  >
                    {t.label}
                    <span className={cn("tabular text-[11px]", tab === t.key ? "text-sirius/70" : "text-fg-subtle")}>{t.n}</span>
                  </button>
                ))}
              </div>
            </div>

            {shown.length === 0 ? (
              <EmptyHint
                icon={Tag}
                title={
                  tab === "sales" ? "No sales deals"
                  : tab === "renewals" ? "No renewal deals"
                  : tab === "expansion" ? "No expansion deals"
                  : tab === "confirmed_churn" ? "No confirmed churn deals"
                  : "No downgrade deals"
                }
                body={
                  tab === "sales" ? "Closed-won deals from Direct Sales or Indirect Sales pipelines appear here."
                  : tab === "renewals" ? "CS pipeline deals in the Renewed stage appear here."
                  : tab === "expansion" ? "Deals in the CS pipeline's Expansion stage appear here."
                  : tab === "confirmed_churn" ? "Deals in the CS pipeline's Confirmed Churned stage appear here."
                  : "Deals in the CS pipeline's Downgraded stage appear here."
                }
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {shown.map((d) => (
                  <DealCard
                    key={d.id}
                    deal={d}
                    checked={draft[d.id] ?? true}
                    onToggle={() => setDraft((s) => ({ ...s, [d.id]: !(s[d.id] ?? true) }))}
                    dealOverride={localOverrides[d.id] ?? {}}
                    onSaveField={(key, value) => saveDealField(d.id, key, value)}
                    onSaveFields={(fields) => saveDealFields(d.id, fields)}
                    dealDates={localDates[d.id] ?? {}}
                    onSaveDate={(key, value) => saveDealDate(d.id, key, value)}
                    dealBrief={localBriefs[d.id] ?? null}
                    onSaveBrief={(value) => saveDealBrief(d.id, value)}
                    propertyDefs={propertyDefs}
                    refreshPending={isPending}
                  />
                ))}
              </ul>
            )}

            {changed.length > 0 && (
              <div className="mt-3 flex items-center justify-end gap-2 border-t border-border-subtle pt-3">
                <span className="caption mr-auto">{changed.length} unsaved change{changed.length > 1 ? "s" : ""} — ARR updates on save</span>
                <button type="button" onClick={() => setDraft(baseline())} disabled={saving || isPending}
                  className="rounded-[10px] px-3 py-1.5 font-body text-[13px] font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-50">
                  Reset
                </button>
                <button type="button" onClick={save} disabled={saving || isPending}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-sirius px-4 py-1.5 font-body text-[13px] font-semibold text-white transition-colors hover:bg-cosmos disabled:opacity-60">
                  {(saving || isPending) ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A single deal — economics, product, service levels and dates, grouped for
 *  scannability. Synced contract dates are read-only; milestone dates are
 *  CSM-editable per deal; renewal is auto-calculated (contract start + 1yr). */
function DealCard({
  deal,
  checked,
  onToggle,
  dealOverride,
  onSaveField,
  onSaveFields,
  dealDates,
  onSaveDate,
  dealBrief,
  onSaveBrief,
  propertyDefs,
  refreshPending,
}: {
  deal: Deal;
  checked: boolean;
  onToggle: () => void;
  dealOverride: Record<string, unknown>;
  onSaveField: (key: string, value: unknown) => void | Promise<void>;
  onSaveFields: (fields: Record<string, unknown>) => void | Promise<void>;
  dealDates: Record<string, string | null>;
  onSaveDate: (key: string, value: string | null) => void | Promise<void>;
  dealBrief: string | null;
  onSaveBrief: (value: string | null) => void | Promise<void>;
  propertyDefs: PropertyDefinition[];
  /** True while a prior save's router.refresh() is still landing — keeps
   *  fields showing "saving" instead of re-enabling and inviting a second,
   *  overlapping edit before the server-confirmed data has actually arrived. */
  refreshPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editingBrief, setEditingBrief] = useState(false);
  const [savingBrief, setSavingBrief] = useState(false);
  const [briefDraft, setBriefDraft] = useState("");
  // CSM override takes priority; fall back to HubSpot-synced value.
  const displayBrief = dealBrief ?? deal.accountBrief ?? null;

  async function commitBrief() {
    setSavingBrief(true);
    try { await onSaveBrief(briefDraft.trim() || null); }
    finally { setSavingBrief(false); setEditingBrief(false); }
  }
  function startEditBrief(e: React.MouseEvent) {
    e.stopPropagation();
    setBriefDraft(displayBrief ?? "");
    setEditingBrief(true);
  }

  // Effective deal = synced values with CSM overrides layered on top. Display and
  // computed fields read from `eff`; an editable cell shows an "edited" tag when
  // that field carries an override (key present in dealOverride).
  const eff = applyDealOverrides(deal, dealOverride);
  const isEdited = (k: keyof Deal) => Object.prototype.hasOwnProperty.call(dealOverride, k as string);
  // Global library is "None" (or unset) on this deal -> its start/expiry
  // dates aren't needed. Reacts instantly to editing the Global library
  // field above: `eff` is recomputed from `dealOverride` on every render, and
  // saveDealField updates dealOverride optimistically before the server
  // round-trip even lands.
  const needsGlobalLibraryDates = hasGlobalLibrary(eff);
  const renewal = computeRenewal(eff.contractStartDate);
  // Onboarding period for THIS deal — days from its Kick-off meeting to its
  // Launch (or to today if not launched yet). Same pure calc used for the
  // account-level rollup (lib/metrics/onboarding.ts), fed just this deal.
  const onboarding = computeOnboardingPeriod([{ id: deal.id }], { [deal.id]: dealDates });
  const onboardingLabel =
    onboarding.days == null ? "—" : onboarding.ongoing ? `${onboarding.days}d (ongoing)` : `${onboarding.days}d`;
  // Total Licenses = Licenses Purchased + Complementary Licenses (computed).
  const totalLicenses =
    eff.numberOfUsers != null || eff.complementaryLicenses != null
      ? (eff.numberOfUsers ?? 0) + (eff.complementaryLicenses ?? 0)
      : null;
  // Render one editable, override-aware cell for a HubSpot-synced deal field.
  const optionsForDealField = (key: keyof Deal): Opt[] | undefined => {
    const optionKey = DEAL_FIELD_OPTION_KEYS[key as string];
    if (!optionKey) return undefined;
    const def = propertyDefs.find((d) => d.key === optionKey);
    const fromDef = selectOpts(def?.options);
    // Fallback only when no options are seeded yet (pre-sync). Once the def has
    // any options, trust it exclusively — merging the fallback would resurrect
    // names the admin intentionally removed.
    const base = fromDef.length > 0
      ? fromDef
      : selectOpts(DEAL_FIELD_FALLBACK_OPTIONS[key as string] ?? []);
    const hidden = new Set(def?.hiddenOptions ?? []);
    const visible = hidden.size > 0 ? base.filter((o) => !hidden.has(o.value)) : base;
    return visible.length > 0 ? visible : undefined;
  };
  const cell = (key: keyof Deal) => {
    const spec = DEAL_FIELD(key);
    return (
      <OverrideField
        label={spec.label}
        type={spec.type}
        value={(eff as unknown as Record<string, unknown>)[key as string]}
        currency="USD"
        overridden={isEdited(key)}
        options={optionsForDealField(key)}
        onCommit={(v) => onSaveField(key as string, v)}
        alertSeverity={FIELD_SEVERITY[key as string]}
        pending={refreshPending}
      />
    );
  };

  return (
    <li className={cn("rounded-xl border border-border-subtle transition-opacity", !checked && "opacity-60")}>
      {/* Always-visible header — click anywhere (except the checkbox) to expand / collapse */}
      <div
        className="flex cursor-pointer items-start gap-3 rounded-xl p-4 transition-colors hover:bg-bg-subtle"
        onClick={() => setOpen((o) => !o)}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          title={checked ? "Tracked — counts toward ARR once you Save. Uncheck to mark it dead." : "Not tracked — excluded from ARR once you Save."}
          className="mt-1 size-4 shrink-0 cursor-pointer accent-sirius"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="block truncate font-body text-sm font-semibold text-fg">{eff.name ?? `Deal ${deal.hubspotDealId}`}</span>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone="halo">{PIPELINE_LABEL(deal.pipeline)}</Badge>
                {eff.referralSource && <Badge tone="neutral">{eff.referralSource}</Badge>}
                {!checked && <Badge tone="nova">Not tracked</Badge>}
              </div>
            </div>
            <span className={cn("tabular shrink-0 text-right font-display text-base font-bold", checked ? "text-[#1E8F61]" : "text-fg-subtle line-through")}>
              {formatCurrency(eff.amount, "USD")}
            </span>
          </div>
        </div>
        <ChevronDown size={16} className={cn("mt-0.5 shrink-0 text-fg-subtle transition-transform duration-200", open && "rotate-180")} />
      </div>

      {/* Collapsible body — Commercials, Product & content, Service levels, Dates */}
      <div className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="border-t border-border-subtle px-4 pb-4 pt-3">
            {/* Account brief — always shown; CSM-editable; HubSpot value is the fallback */}
            <div className="mb-3 rounded-lg border border-sirius-200/60 bg-accent-soft px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClipboardList size={12} className="shrink-0 text-sirius" />
                  <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-sirius">Account brief</span>
                  {!dealBrief && deal.accountBrief && (
                    <span className="font-body text-[10px] uppercase tracking-[0.05em] text-fg-subtle">HubSpot</span>
                  )}
                </div>
                {!editingBrief && (
                  <button
                    onClick={startEditBrief}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-body text-[11px] font-semibold text-fg-subtle transition-colors hover:bg-sirius/10 hover:text-sirius"
                  >
                    <Pencil size={10} /> Edit
                  </button>
                )}
              </div>
              {editingBrief ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    autoFocus
                    disabled={savingBrief}
                    rows={4}
                    value={briefDraft}
                    onChange={(e) => setBriefDraft(e.target.value)}
                    placeholder="Write the account brief here…"
                    className="w-full resize-y rounded-md border border-sirius-200 bg-surface px-2.5 py-1.5 font-body text-[13px] text-fg outline-none focus:ring-2 focus:ring-sirius/10 disabled:opacity-50"
                  />
                  <div className="flex justify-end gap-1.5">
                    <button disabled={savingBrief} onClick={() => setEditingBrief(false)}
                      className="rounded-[8px] px-3 py-1 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-50">
                      Cancel
                    </button>
                    <button disabled={savingBrief} onClick={commitBrief}
                      className="inline-flex items-center gap-1.5 rounded-[8px] bg-sirius px-3 py-1 font-body text-[12px] font-semibold text-white transition-colors hover:bg-cosmos disabled:opacity-60">
                      {savingBrief ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                    </button>
                  </div>
                </div>
              ) : displayBrief ? (
                <BriefBlock name={null} text={displayBrief} />
              ) : (
                <button onClick={startEditBrief} className="caption text-left text-fg-subtle hover:text-fg">
                  No brief yet — click to add one.
                </button>
              )}
            </div>
            {/* Overview — name, amount, referral, Account Executive (all CSM-editable). */}
            <DealGroup label="Overview">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {cell("name")}
                {cell("amount")}
                {cell("referralSource")}
                {/* Account Executive = the deal's HubSpot `account_executive`
                    property (owner picklist). Editable single-select; overrides
                    persist like every other deal field. */}
                {cell("ownerName")}
              </dl>
            </DealGroup>

            {/* Commercials */}
            <DealGroup label="Commercials">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {cell("numberOfUsers")}
                {cell("complementaryLicenses")}
                <Field label="Total licenses" muted={totalLicenses == null}>
                  {totalLicenses != null ? (
                    <span className="flex items-baseline gap-1.5">
                      {formatNumber(totalLicenses)}
                      <span className="font-body text-[10px] uppercase tracking-[0.05em] text-fg-subtle">auto</span>
                    </span>
                  ) : "—"}
                </Field>
                {cell("pricePerUser")}
                {cell("contractDuration")}
              </dl>
            </DealGroup>

            {/* Product & content */}
            <DealGroup label="Product & content">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {cell("products")}
                {cell("useCases")}
                {cell("globalLibraryPackage")}
                {cell("globalLibraryLicenses")}
                {cell("aiCourseCredits")}
              </dl>
            </DealGroup>

            {/* Service levels — CSM-editable; override HubSpot */}
            <DealGroup label="Service levels">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {cell("supportLevel")}
                {cell("implementationLevel")}
              </dl>
            </DealGroup>

            {/* Dates — contract dates (editable, override HubSpot) + auto renewal, then CSM milestones */}
            <DealGroup label="Dates">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                {cell("closeDate")}
                {cell("contractStartDate")}
                <SyncedDate label="Renewal" value={renewal} hint="Auto · +1yr" />
                <SyncedValue label="Onboarding period" value={onboardingLabel} hint="Auto · kickoff→launch" />
              </dl>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border-subtle pt-3 sm:grid-cols-3">
                {DEAL_DATE_FIELDS.map((f) => {
                  // These two only apply when this deal actually has a global
                  // library — see needsGlobalLibraryDates above. Dimmed + no
                  // alert icon while it doesn't; both flip back immediately if
                  // the Global library field above is edited, since eff (and
                  // this) recompute on every render.
                  const isGlobalLibraryDate = f.key === "global_library_start_date" || f.key === "global_library_expiry_date";
                  const dimmed = isGlobalLibraryDate && !needsGlobalLibraryDates;
                  return (
                    <DealDateField
                      key={f.key}
                      label={f.label}
                      value={dealDates[f.key] ?? null}
                      onCommit={(v) => onSaveDate(f.key, v)}
                      alertSeverity={dimmed ? undefined : FIELD_SEVERITY[f.key]}
                      pending={refreshPending}
                      dimmed={dimmed}
                    />
                  );
                })}
              </dl>
              {deal.hubspotUrl && (
                <div className="mt-3 flex justify-end">
                  <a
                    href={deal.hubspotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 font-body text-[12px] font-semibold text-fg-muted transition-colors hover:border-sirius-200 hover:text-sirius"
                  >
                    <ExternalLink size={12} /> View in HubSpot
                  </a>
                </div>
              )}
            </DealGroup>
          </div>
        </div>
      </div>
    </li>
  );
}

/** Section divider inside a deal card — a small uppercase label over its content. */
function DealGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 border-t border-border-subtle pt-3">
      <div className="eyebrow mb-2">{label}</div>
      {children}
    </div>
  );
}

/** Read-only date cell — the value comes from the HubSpot sync or is auto-derived. */
function SyncedDate({ label, value, hint }: { label: string; value: string | null; hint: string }) {
  const empty = !value;
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className={cn("font-body text-[13px] leading-snug", empty ? "text-fg-subtle" : "font-semibold text-fg")}>{formatDate(value)}</span>
        <span className="font-body text-[10px] uppercase tracking-[0.05em] text-fg-subtle">{hint}</span>
      </dd>
    </div>
  );
}

/** Read-only computed value (non-date) cell — same look as SyncedDate. */
function SyncedValue({ label, value, hint }: { label: string; value: string; hint: string }) {
  const empty = value === "—";
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className={cn("font-body text-[13px] leading-snug", empty ? "text-fg-subtle" : "font-semibold text-fg")}>{value}</span>
        <span className="font-body text-[10px] uppercase tracking-[0.05em] text-fg-subtle">{hint}</span>
      </dd>
    </div>
  );
}

/** CSM-editable milestone date cell — persists into client.properties.__deal_dates. */
function DealDateField({ label, value, onCommit, alertSeverity, pending, dimmed }: { label: string; value: string | null; onCommit: (v: string | null) => void | Promise<void>; alertSeverity?: "red" | "yellow"; pending?: boolean; dimmed?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const empty = !value;
  const valueCls = cn("font-body text-[13px] leading-snug", empty ? "text-fg-subtle" : "font-semibold text-fg");

  async function commit(raw: unknown) {
    const out = raw === "" || raw == null ? null : String(raw);
    setSaving(true);
    try {
      await onCommit(out);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  return (
    <div className={cn("flex flex-col gap-1 transition-opacity", dimmed && "opacity-50")}>
      <dt className="flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
        {label}
        {empty && <FieldAlert severity={alertSeverity} />}
      </dt>
      <dd>
        {editing ? (
          <EditInput type="date" value={value} saving={saving || !!pending} onCommit={commit} onCancel={() => setEditing(false)} />
        ) : (
          <button onClick={() => setEditing(true)} className="group -ml-1 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-bg-muted">
            <span className={valueCls}>{formatDate(value)}</span>
            <Pencil size={11} className="ml-auto shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
      </dd>
    </div>
  );
}

/** CSM-editable, override-aware deal field cell. Display = effective value
 *  (override ?? HubSpot). Editing persists to client.properties.__deal_overrides;
 *  clearing the value removes the override (the field reverts to its HubSpot value). */
function OverrideField({
  label,
  type,
  value,
  currency,
  overridden,
  options,
  onCommit,
  alertSeverity,
  pending,
}: {
  label: string;
  type: OverrideFieldType;
  value: unknown;
  currency?: string;
  overridden: boolean;
  options?: Opt[];
  onCommit: (v: unknown) => void | Promise<void>;
  alertSeverity?: "red" | "yellow";
  /** True while a prior save's router.refresh() is still landing. */
  pending?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const empty = !hasValue(value);
  const isArrayType = type === "tags" || type === "multi_select";
  const labelFor = (v: string) => options?.find((o) => o.value === v)?.label ?? v;

  let display: React.ReactNode = "—";
  if (!empty) {
    if (isArrayType && Array.isArray(value)) {
      const items = value as string[];
      const MAX = 3;
      const shown = items.slice(0, MAX);
      const extra = items.length - MAX;
      display = (
        <span className="flex flex-wrap gap-1">
          {shown.map((v, i) => <Badge key={i} tone="neutral">{labelFor(v)}</Badge>)}
          {extra > 0 && <Badge tone="neutral">+{extra} more</Badge>}
        </span>
      );
    }
    else if (type === "single_select") display = labelFor(String(value));
    else if (type === "currency") { const n = Number(value); display = Number.isFinite(n) ? formatCurrency(n, currency ?? "USD") : String(value); }
    else if (type === "number") { const n = Number(value); display = Number.isFinite(n) ? formatNumber(n) : String(value); }
    else if (type === "date") display = formatDate(String(value));
    else display = String(value);
  }
  const valueCls = cn("font-body text-[13px] leading-snug", empty ? "text-fg-subtle" : "font-semibold text-fg");

  async function commit(raw: unknown) {
    let out: unknown;
    if (isArrayType) out = Array.isArray(raw) ? raw : [];
    else if (raw === "" || raw == null) out = null;
    else if (type === "number" || type === "currency") { const n = Number(raw); out = Number.isFinite(n) ? n : null; }
    else out = raw;
    setSaving(true);
    try { await onCommit(out); }
    finally { setSaving(false); setEditing(false); }
  }

  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">
        {label}
        {empty && <FieldAlert severity={alertSeverity} />}
        {overridden && <span className="rounded bg-accent-soft px-1 text-[9px] font-semibold normal-case tracking-normal text-sirius">edited</span>}
      </dt>
      <dd>
        {editing ? (
          type === "tags" ? (
            <TagsInput value={Array.isArray(value) ? (value as string[]) : []} saving={saving || !!pending} onCommit={commit} onCancel={() => setEditing(false)} />
          ) : (
            <EditInput type={type as FieldType} options={options} value={value} saving={saving || !!pending} onCommit={commit} onCancel={() => setEditing(false)} />
          )
        ) : (
          <button onClick={() => setEditing(true)} className="group -ml-1 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-bg-muted">
            <span className={valueCls}>{display}</span>
            <Pencil size={11} className="ml-auto shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}
      </dd>
    </div>
  );
}

/** Comma-separated tags editor for array deal fields (Package / Use case / …). */
function TagsInput({ value, saving, onCommit, onCancel }: { value: string[]; saving: boolean; onCommit: (v: string[]) => void; onCancel: () => void }) {
  const [text, setText] = useState(value.join(", "));
  const save = () => onCommit(text.split(",").map((s) => s.trim()).filter(Boolean));
  const onKey = (e: React.KeyboardEvent) => { if (e.key === "Enter") save(); if (e.key === "Escape") onCancel(); };
  return (
    <div className="flex items-center gap-1.5">
      <input autoFocus disabled={saving} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} placeholder="comma, separated" className={editCls} />
      <span className="flex shrink-0 items-center gap-1">
        <button type="button" disabled={saving} onClick={save} title="Save" className="grid size-6 place-items-center rounded-md bg-sirius text-white transition-colors hover:bg-cosmos disabled:opacity-50">
          <Check size={13} />
        </button>
        <button type="button" disabled={saving} onClick={onCancel} title="Cancel" className="grid size-6 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-bg-muted disabled:opacity-50">
          <X size={13} />
        </button>
      </span>
    </div>
  );
}
