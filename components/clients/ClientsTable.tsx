"use client";

import { useCallback, useMemo, useState, memo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, AlertTriangle, ChevronRight, Loader2, Plus, X } from "lucide-react";
import type { Client, PropertyDefinition } from "@/lib/types";
import { STATUS_OVERRIDE_KEY } from "@/lib/status";
import { HealthPill } from "@/components/ui/HealthPill";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { formatCurrency, formatDate } from "@/lib/format";
import { currentQuarter, periodBounds } from "@/lib/metrics/arr";
import { AddClientDialog } from "@/components/clients/AddClientDialog";
import { ImportDialog } from "@/components/clients/ImportDialog";

type SortKey = "name" | "arr" | "health" | "renewal";
type SortDir = "asc" | "desc";
type Csm = { id: string; name: string };
/** "all" is a view filter (no filtering); the other four match
 *  Client["status"] (AccountStatus) exactly. */
type StatusFilter = "onboarding" | "active" | "renewal" | "churned" | "all";
type RenewalFilter = "all" | "overdue" | "this_quarter" | "next_quarter" | "next_30" | "next_90" | "custom";

function addDaysIso(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "YYYY-Qn" -> the following quarter, rolling the year over past Q4. */
function nextQuarterOf(q: string): string {
  const m = q.match(/^(\d{4})-Q([1-4])$/)!;
  let year = Number(m[1]);
  let qn = Number(m[2]) + 1;
  if (qn > 4) { qn = 1; year += 1; }
  return `${year}-Q${qn}`;
}

/** Half-open [start, end) date range for a renewal filter, or null for "all"
 *  (no filtering). periodBounds()/currentQuarter() are the same quarter-math
 *  already used by the ARR/retention reports, so "this/next quarter" here
 *  matches what those reports mean by a quarter exactly. */
function renewalBounds(filter: RenewalFilter, customStart: string, customEnd: string): { start: string; end: string } | null {
  const today = new Date().toISOString().slice(0, 10);
  switch (filter) {
    case "all": return null;
    case "overdue": return { start: "0000-01-01", end: today };
    case "this_quarter": return periodBounds(currentQuarter());
    case "next_quarter": return periodBounds(nextQuarterOf(currentQuarter()));
    case "next_30": return { start: today, end: addDaysIso(today, 30) };
    case "next_90": return { start: today, end: addDaysIso(today, 90) };
    case "custom":
      if (!customStart && !customEnd) return null;
      // end is exclusive elsewhere in this function, so bump the picked end
      // date by a day to make it inclusive the way a person reading a date
      // range picker would expect ("through June 30" includes June 30).
      return { start: customStart || "0000-01-01", end: customEnd ? addDaysIso(customEnd, 1) : "9999-12-31" };
  }
}

function daysToRenewal(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

/** Run `fn` over `items` with at most `limit` in flight — same pattern used
 *  server-side in lib/repo/drizzle.ts. A bulk edit over most/all of a large
 *  list otherwise fires one PATCH per client all at once; against the small
 *  (6-connection) production DB pool that starves the very next read (the
 *  router.refresh() this function triggers) into a withDbTimeout timeout,
 *  which briefly renders the whole clients list empty. */
async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}

function channelOf(c: Client): string | null {
  const v = c.properties?.referral_source;
  return typeof v === "string" && v.trim() ? v : null;
}

/** The "Tier" account property (client.properties.tier) — an unrelated,
 *  same-named concept to Client["health"]["tier"] (healthy/watch/at_risk,
 *  filtered separately below as the "Health" dropdown). */
function accountTierOf(c: Client): string | null {
  const v = c.properties?.tier;
  return typeof v === "string" && v.trim() ? v : null;
}

/** Fields available for bulk edit. kind drives the PATCH payload shape. */
type BulkField =
  | { key: string; label: string; kind: "csm" }
  | { key: string; label: string; kind: "impl" }
  | { key: string; label: string; kind: "core"; coreKey: string; text?: boolean; staticOptions?: { value: string; label: string }[] }
  | { key: string; label: string; kind: "prop"; propKey: string };

const BULK_FIELDS: BulkField[] = [
  { key: "csm", label: "CSM", kind: "csm" },
  { key: "impl", label: "Implementation", kind: "impl" },
  // Onboarding/Active/Renewal are auto-derived from deal activity (lib/status.ts)
  // and can't be bulk-set — Churn is the only manual lever, same as the profile page.
  { key: "status", label: "Status", kind: "core", coreKey: "status", staticOptions: [
    { value: "churned", label: "Churn" },
  ] },
  { key: "tier", label: "Tier", kind: "prop", propKey: "tier" },
  { key: "referral_source", label: "Acquisition Channel", kind: "prop", propKey: "referral_source" },
  { key: "country", label: "Country", kind: "core", coreKey: "country", text: true },
];

export function ClientsTable({
  clients,
  csms,
  impls,
  propertyDefs,
  initialQuery = "",
  showActions = false,
  canAssignOwners = false,
  completenessByClient = {},
}: {
  clients: Client[];
  csms: Csm[];
  impls: Csm[];
  propertyDefs: PropertyDefinition[];
  initialQuery?: string;
  showActions?: boolean;
  /** Super-admin: may reassign the CSM inline / in bulk. Others see read-only. */
  canAssignOwners?: boolean;
  /** Profile-completeness severity per client id, keyed for the incomplete-profile badge. */
  completenessByClient?: Record<string, { severity: "red" | "yellow" | "none"; missingRed: { key: string; label: string }[]; missingYellow: { key: string; label: string }[] }>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [tier, setTier] = useState("all");
  // Profile-completeness filter — matches ProfileCompleteness["severity"]
  // directly ("none" = Complete, "yellow" = Partial complete, "red" = Incomplete),
  // same values already driving RowCompletenessBadge below.
  const [completenessFilter, setCompletenessFilter] = useState<"all" | "none" | "yellow" | "red">("all");
  const [csm, setCsm] = useState("all");
  // Defaults to "all" — no pre-filtering; the four real lifecycle stages
  // (onboarding, active, renewal, churned) are each individually selectable.
  const [status, setStatus] = useState<StatusFilter>("all");
  const [renewal, setRenewal] = useState<RenewalFilter>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [channel, setChannel] = useState("all");
  const [country, setCountry] = useState("all");
  const [accountTier, setAccountTier] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("arr");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [bulkField, setBulkField] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  const channels = useMemo(() => [...new Set(clients.map(channelOf).filter(Boolean) as string[])].sort(), [clients]);
  const countries = useMemo(() => [...new Set(clients.map((c) => c.country).filter(Boolean) as string[])].sort(), [clients]);
  const accountTiers = useMemo(() => [...new Set(clients.map(accountTierOf).filter(Boolean) as string[])].sort(), [clients]);
  // Health tiers are admin-defined (Settings → Workflows → Client health), so
  // the filter options come from whatever tier names are actually present,
  // ordered high→low by the top score seen in each.
  const healthTiers = useMemo(() => {
    const top = new Map<string, number>();
    for (const c of clients) {
      const name = c.health.tier;
      if (!name || name === "—") continue;
      top.set(name, Math.max(top.get(name) ?? 0, c.health.score));
    }
    return [...top.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [clients]);
  const propOptions = (key: string) => propertyDefs.find((d) => d.key === key)?.options ?? [];

  // Recomputed only when the filter/custom dates actually change, not on
  // every render/keystroke elsewhere in the table.
  const renewalRange = useMemo(() => renewalBounds(renewal, customStart, customEnd), [renewal, customStart, customEnd]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = clients.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (renewalRange) {
        if (!c.renewalDate) return false;
        const d = c.renewalDate.slice(0, 10);
        if (d < renewalRange.start || d >= renewalRange.end) return false;
      }
      if (tier !== "all" && c.health.tier !== tier) return false;
      if (completenessFilter !== "all" && (completenessByClient[c.id]?.severity ?? "none") !== completenessFilter) return false;
      if (csm !== "all" && c.csm?.id !== csm) return false;
      if (channel !== "all" && channelOf(c) !== channel) return false;
      if (country !== "all" && c.country !== country) return false;
      if (accountTier !== "all" && accountTierOf(c) !== accountTier) return false;
      if (q) {
        const hay = `${c.name} ${c.domain ?? ""} ${c.country ?? ""} ${c.csm?.name ?? ""} ${c.implementationOwner?.name ?? ""} ${c.industry ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "arr": cmp = a.arr - b.arr; break;
        case "health": cmp = a.health.score - b.health.score; break;
        case "renewal": {
          const av = a.renewalDate ? new Date(a.renewalDate).getTime() : Number.POSITIVE_INFINITY;
          const bv = b.renewalDate ? new Date(b.renewalDate).getTime() : Number.POSITIVE_INFINITY;
          cmp = av - bv; break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [clients, query, tier, completenessFilter, completenessByClient, csm, status, renewalRange, channel, country, accountTier, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "name" ? "asc" : "desc"); }
  }

  const isFiltered = filtered.length !== clients.length;
  // Same raw sum-across-clients convention as buildPortfolioSummary (lib/metrics/portfolio.ts) —
  // no currency conversion exists anywhere in the app, so mixed-currency portfolios just add face
  // values under one label. Unlike that summary, this intentionally does NOT exclude churned
  // clients: it must track the client count above exactly under every filter, or picking
  // "Churned" in the status filter would show N clients next to a mismatched/zero ARR.
  const arrCurrency = clients[0]?.currency ?? "USD";
  const totalArr = useMemo(() => filtered.reduce((sum, c) => sum + c.arr, 0), [filtered]);
  const totalArrAll = useMemo(() => clients.reduce((sum, c) => sum + c.arr, 0), [clients]);
  const allSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filtered.forEach((c) => next.delete(c.id));
      else filtered.forEach((c) => next.add(c.id));
      return next;
    });
  }
  // useCallback with stable deps so these can be passed directly to the
  // memoized ClientRow below without a per-row wrapper closure recreated on
  // every render — a new closure per row would defeat the memoization.
  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  async function patchClient(id: string, body: unknown) {
    await fetch(`/api/clients/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  const setRowCsm = useCallback(async (id: string, csmId: string) => {
    setSavingRow(`${id}:csm`);
    try {
      await patchClient(id, { csmId: csmId || null });
      router.refresh();
    } finally {
      setSavingRow(null);
    }
  }, [router]);

  const setRowImpl = useCallback(async (id: string, ownerEmail: string) => {
    setSavingRow(`${id}:impl`);
    try {
      await patchClient(id, { implementationOwnerEmail: ownerEmail || null });
      router.refresh();
    } finally {
      setSavingRow(null);
    }
  }, [router]);

  const currentBulk = BULK_FIELDS.find((f) => f.key === bulkField) ?? null;

  async function applyBulk() {
    if (!currentBulk) return;
    setBulkSaving(true);
    let body: unknown;
    if (currentBulk.kind === "csm") body = { csmId: bulkValue || null };
    else if (currentBulk.kind === "impl") body = { implementationOwnerEmail: bulkValue || null };
    // Status is a special case: it's auto-computed, so "Churn" is applied as
    // the manual override property (recomputeClient re-derives it otherwise),
    // never as a direct core-field write — see lib/status.ts.
    else if (currentBulk.kind === "core" && currentBulk.coreKey === "status") {
      body = { properties: { [STATUS_OVERRIDE_KEY]: bulkValue || null } };
    }
    else if (currentBulk.kind === "core") body = { fields: { [currentBulk.coreKey]: bulkValue || null } };
    else body = { properties: { [currentBulk.propKey]: bulkValue || null } };
    try {
      await mapLimit([...selected], 5, (id) => patchClient(id, body));
      router.refresh();
      setSelected(new Set());
      setBulkField("");
      setBulkValue("");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      {/* Toolbar */}
      {showActions && (
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5" title={isFiltered ? `${filtered.length} of ${clients.length} clients match the current filters` : undefined}>
              <span className="font-display text-lg font-bold leading-none tabular text-fg">{filtered.length}</span>
              <span className="font-body text-[13px] text-fg-muted">
                {isFiltered ? `of ${clients.length} clients` : filtered.length === 1 ? "client" : "clients"}
              </span>
            </div>
            <div className="flex items-center gap-1.5" title={isFiltered ? `${formatCurrency(totalArr, arrCurrency, { compact: true })} of ${formatCurrency(totalArrAll, arrCurrency, { compact: true })} ARR match the current filters` : undefined}>
              <span className="font-display text-lg font-bold leading-none tabular text-fg">{formatCurrency(totalArr, arrCurrency, { compact: true })}</span>
              <span className="font-body text-[13px] text-fg-muted">
                {isFiltered ? `of ${formatCurrency(totalArrAll, arrCurrency, { compact: true })} ARR` : "ARR"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ImportDialog />
            <AddClientDialog />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, domain, country, CSM…"
          className="min-w-[200px] flex-1 rounded-[10px] border border-border bg-bg px-3.5 py-2 font-body text-[13px] text-fg outline-none transition-colors placeholder:text-fg-subtle focus:border-sirius-200 focus:ring-2 focus:ring-sirius/10"
        />
        <FilterSelect value={tier} onChange={setTier} label="Health">
          <option value="all">All health</option>
          {healthTiers.map((t) => <option key={t} value={t}>{t}</option>)}
        </FilterSelect>
        <FilterSelect value={completenessFilter} onChange={(v) => setCompletenessFilter(v as "all" | "none" | "yellow" | "red")} label="Profile completeness">
          <option value="all">All profiles</option>
          <option value="none">Complete</option>
          <option value="yellow">Partial complete</option>
          <option value="red">Incomplete</option>
        </FilterSelect>
        <FilterSelect value={csm} onChange={setCsm} label="CSM">
          <option value="all">All CSMs</option>
          {csms.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </FilterSelect>
        <FilterSelect value={channel} onChange={setChannel} label="Acquisition channel">
          <option value="all">All channels</option>
          {channels.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
        </FilterSelect>
        <FilterSelect value={country} onChange={setCountry} label="Country">
          <option value="all">All countries</option>
          {countries.map((co) => <option key={co} value={co}>{co}</option>)}
        </FilterSelect>
        <FilterSelect value={accountTier} onChange={setAccountTier} label="Tier">
          <option value="all">All tiers</option>
          {accountTiers.map((t) => <option key={t} value={t}>{t}</option>)}
        </FilterSelect>
        <FilterSelect value={status} onChange={(v) => setStatus(v as StatusFilter)} label="Status">
          <option value="all">All statuses</option>
          <option value="onboarding">Onboarding</option>
          <option value="active">Active</option>
          <option value="renewal">Renewal</option>
          <option value="churned">Churned</option>
        </FilterSelect>
        <FilterSelect value={renewal} onChange={(v) => setRenewal(v as RenewalFilter)} label="Renewal">
          <option value="all">Any renewal date</option>
          <option value="overdue">Overdue</option>
          <option value="this_quarter">This quarter</option>
          <option value="next_quarter">Next quarter</option>
          <option value="next_30">Next 30 days</option>
          <option value="next_90">Next 90 days</option>
          <option value="custom">Custom range…</option>
        </FilterSelect>
        {renewal === "custom" && (
          <span className="flex items-center gap-1.5">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              aria-label="Renewal from"
              className="rounded-md border border-border bg-surface px-2.5 py-2 font-body text-[13px] text-fg-muted outline-none transition-colors focus:border-sirius-200"
            />
            <span className="caption">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              aria-label="Renewal to"
              className="rounded-md border border-border bg-surface px-2.5 py-2 font-body text-[13px] text-fg-muted outline-none transition-colors focus:border-sirius-200"
            />
          </span>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft/50 px-5 py-3">
          <span className="font-body text-[13px] font-semibold text-sirius">{selected.size} selected</span>
          <span className="caption">Set</span>
          <FilterSelect value={bulkField} onChange={(v) => { setBulkField(v); setBulkValue(""); }} label="Field">
            <option value="">field…</option>
            {BULK_FIELDS.filter((f) => (f.kind !== "csm" && f.kind !== "impl") || canAssignOwners).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </FilterSelect>
          {currentBulk && <span className="caption">to</span>}
          {currentBulk && <BulkValueControl field={currentBulk} csms={csms} impls={impls} options={currentBulk.kind === "prop" ? propOptions(currentBulk.propKey) : undefined} value={bulkValue} onChange={setBulkValue} />}
          <button
            onClick={applyBulk}
            disabled={!currentBulk || bulkValue === "" || bulkSaving}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-sirius px-3.5 py-2 font-body text-[13px] font-semibold text-white transition-colors hover:bg-cosmos disabled:opacity-50"
          >
            {bulkSaving && <Loader2 size={14} className="animate-spin" />} Apply
          </button>
          <button onClick={() => setSelected(new Set())} className="inline-flex items-center gap-1 rounded-md px-2 py-2 font-body text-[13px] text-fg-muted hover:text-fg">
            <X size={14} /> Clear
          </button>
        </div>
      )}

      {/* Table */}
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border bg-bg-subtle">
            <th className="w-10 px-5 py-3">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" className="size-4 cursor-pointer accent-sirius" />
            </th>
            <Th onClick={() => toggleSort("name")} active={sortKey === "name"} dir={sortDir}>Client</Th>
            <Th>CSM</Th>
            <Th onClick={() => toggleSort("arr")} active={sortKey === "arr"} dir={sortDir} align="right">ARR</Th>
            <Th onClick={() => toggleSort("renewal")} active={sortKey === "renewal"} dir={sortDir}>Renewal</Th>
            <Th onClick={() => toggleSort("health")} active={sortKey === "health"} dir={sortDir}>Health</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <ClientRow
              key={c.id}
              client={c}
              csms={csms}
              impls={impls}
              isSelected={selected.has(c.id)}
              onToggle={toggleRow}
              canAssignOwners={canAssignOwners}
              savingCsm={savingRow === `${c.id}:csm`}
              savingImpl={savingRow === `${c.id}:impl`}
              onSetCsm={setRowCsm}
              onSetImpl={setRowImpl}
              completeness={completenessByClient[c.id]}
            />
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-16 text-center">
                {clients.length === 0 ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg-muted"><Plus size={20} className="text-fg-subtle" /></div>
                    <div>
                      <p className="font-body text-sm font-semibold text-fg">No clients yet</p>
                      <p className="caption mt-0.5">New logos sync automatically from HubSpot, or add them manually.</p>
                    </div>
                  </div>
                ) : (
                  <p className="font-body text-sm text-fg-muted">No clients match these filters.</p>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * One client row. Memoized so typing in the search box (which re-renders
 * ClientsTable via local `query` state, not a server refresh) doesn't
 * re-render every row's owner dropdowns/badges — only rows whose own props
 * actually changed. Selection/saving state is passed down as plain booleans
 * (not the shared `selected` Set/`savingRow` string) specifically so a row's
 * memo comparison isn't invalidated by an unrelated row's selection toggling.
 */
const ClientRow = memo(function ClientRow({
  client: c,
  csms,
  impls,
  isSelected,
  onToggle,
  canAssignOwners,
  savingCsm,
  savingImpl,
  onSetCsm,
  onSetImpl,
  completeness,
}: {
  client: Client;
  csms: Csm[];
  impls: Csm[];
  isSelected: boolean;
  onToggle: (id: string) => void;
  canAssignOwners: boolean;
  savingCsm: boolean;
  savingImpl: boolean;
  onSetCsm: (id: string, csmId: string) => void;
  onSetImpl: (id: string, email: string) => void;
  completeness?: { severity: "red" | "yellow" | "none"; missingRed: { key: string; label: string }[]; missingYellow: { key: string; label: string }[] };
}) {
  const dtr = daysToRenewal(c.renewalDate);
  const renewalSoon = dtr != null && dtr >= 0 && dtr <= 90;
  const renewalOverdue = dtr != null && dtr < 0 && c.status !== "churned";
  // A controlled <select> whose value matches no <option> renders as
  // "Unassigned". So always include the currently-assigned owner as an
  // option (even if they've left the team or the options list is empty) —
  // otherwise an assigned client falsely shows as Unassigned.
  const rowCsms =
    c.csm && !csms.some((m) => m.id === c.csm!.id)
      ? [{ id: c.csm.id, name: c.csm.name }, ...csms]
      : csms;
  const rowImpls =
    c.implementationOwner && !impls.some((m) => m.id === c.implementationOwner!.id)
      ? [{ id: c.implementationOwner.id, name: c.implementationOwner.name }, ...impls]
      : impls;
  return (
    <tr className={cn("group border-b border-border-subtle transition-colors last:border-0", isSelected ? "bg-accent-soft/40" : "hover:bg-accent-soft/60", c.status === "churned" && "opacity-60")}>
      <Td>
        <input type="checkbox" checked={isSelected} onChange={() => onToggle(c.id)} aria-label={`Select ${c.name}`} className="size-4 cursor-pointer accent-sirius" />
      </Td>
      <Td>
        <span className="inline-flex items-center gap-1.5">
          <Link href={`/clients/${c.id}`} className="font-body text-sm font-semibold text-fg group-hover:text-sirius">{c.name}</Link>
          <RowCompletenessBadge completeness={completeness} />
        </span>
      </Td>
      <Td>
        {canAssignOwners ? (
          <span className="flex items-center gap-1.5">
            <select
              value={c.csm?.id ?? ""}
              disabled={savingCsm}
              onChange={(e) => onSetCsm(c.id, e.target.value)}
              className="max-w-[150px] truncate rounded-md border border-transparent bg-transparent py-1 pl-1.5 pr-5 font-body text-[13px] text-fg-muted outline-none transition-colors hover:border-border hover:bg-bg focus:border-sirius-200"
            >
              <option value="">Unassigned</option>
              {rowCsms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {savingCsm && <Loader2 size={12} className="animate-spin text-fg-subtle" />}
          </span>
        ) : (
          <span className="font-body text-[13px] text-fg-muted">{c.csm?.name ?? "Unassigned"}</span>
        )}
      </Td>
      <Td align="right">
        <span className="tabular font-body text-sm font-semibold text-fg">{formatCurrency(c.arr, c.currency, { compact: true })}</span>
      </Td>
      <Td>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("tabular font-body text-[13px]", renewalSoon ? "font-semibold text-[#8A6A0A]" : "text-fg-muted")}>{formatDate(c.renewalDate)}</span>
          {renewalOverdue && <Badge tone="nova">Overdue renewal</Badge>}
        </span>
      </Td>
      <Td>{c.status === "churned" ? <Badge tone="neutral">Churned</Badge> : <HealthPill health={c.health} compact />}</Td>
      <Td align="right">
        <Link href={`/clients/${c.id}`} className="grid size-7 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-bg-muted hover:text-sirius">
          <ChevronRight size={16} />
        </Link>
      </Td>
    </tr>
  );
});

function BulkValueControl({
  field,
  csms,
  impls,
  options,
  value,
  onChange,
}: {
  field: BulkField;
  csms: Csm[];
  impls: Csm[];
  options?: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const cls = "rounded-md border border-border bg-surface px-3 py-2 font-body text-[13px] text-fg outline-none focus:border-sirius-200";
  if (field.kind === "csm") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">Unassigned</option>
        {csms.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    );
  }
  if (field.kind === "impl") {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
        <option value="">Unassigned</option>
        {impls.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    );
  }
  if (field.kind === "core" && field.text) {
    return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="value…" className={cls} />;
  }
  const opts = field.kind === "core" ? field.staticOptions ?? [] : (options ?? []).map((o) => ({ value: o, label: o }));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cls}>
      <option value="">value…</option>
      {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/** Small profile-completeness triangle next to a client's name in the list —
 *  same red = loud / yellow = quiet convention as the profile header badge.
 *  Complete profiles (or no data) render nothing. */
function RowCompletenessBadge({ completeness }: { completeness?: { severity: "red" | "yellow" | "none"; missingRed: { key: string; label: string }[]; missingYellow: { key: string; label: string }[] } }) {
  if (!completeness || completeness.severity === "none") return null;
  if (completeness.severity === "red") {
    return (
      <span
        title={`Missing required info: ${completeness.missingRed.map((f) => f.label).join(", ")}`}
        className="inline-flex size-5 shrink-0 animate-pulse items-center justify-center rounded-full border-2 border-[#B91414] bg-[#E31B1B] text-white"
      >
        <AlertTriangle size={11} strokeWidth={2.75} />
      </span>
    );
  }
  return (
    <span title={`Nice to have: ${completeness.missingYellow.map((f) => f.label).join(", ")}`} className="inline-flex shrink-0 text-[#C99A14]">
      <AlertTriangle size={14} strokeWidth={2} />
    </span>
  );
}

function Th({ children, onClick, active, dir, align = "left" }: { children?: React.ReactNode; onClick?: () => void; active?: boolean; dir?: SortDir; align?: "left" | "right" }) {
  return (
    <th
      className={cn("select-none px-5 py-3 font-body text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted", align === "right" && "text-right", onClick && "cursor-pointer hover:text-fg")}
      onClick={onClick}
    >
      <span className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
        {children}
        {active && (dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  );
}

function Td({ children, align = "left" }: { children?: React.ReactNode; align?: "left" | "right" }) {
  return <td className={cn("px-5 py-3 align-middle", align === "right" && "text-right")}>{children}</td>;
}

function FilterSelect({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-surface px-3 py-2.5 font-body text-[13px] font-medium text-fg-muted outline-none transition-colors hover:text-fg focus:border-sirius-200"
    >
      {children}
    </select>
  );
}
