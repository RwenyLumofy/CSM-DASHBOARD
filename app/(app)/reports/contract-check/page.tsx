import Link from "next/link";
import { notFound } from "next/navigation";
import { isSuperAdmin } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { hasDatabase } from "@/lib/config";
import { formatCurrency } from "@/lib/format";
import { contractRecordsLive, getClientsFromDb, getWorkspaceConfigFromDb } from "@/lib/repo/drizzle";
import { compareAccount, sortForReview, summarize } from "@/lib/contracts/compare";
import { contractTablesExist, getAllContractRecordsDb } from "@/lib/contracts/repo";
import { STATUS_LABEL, type ContractStatus } from "@/lib/contracts/status";
import { toView, type ContractView } from "@/lib/contracts/view";
import { SwitchControl } from "./SwitchControl";

/* Contract check — every account's ARR and status today (from HubSpot deals)
   beside what its contract records give. Phase 5 of the contract rework
   (docs/specs/revenue/contract-records-specification.md): the two run side by
   side until the differences are understood, then the app switches over.

   Super admins only: a 404 for everyone else. The table is read-only; a
   difference is fixed on the account's contract tab. The one thing here that
   changes numbers is the switch at the top (./actions.ts), which makes Signal
   read contract records instead of deals, and can be flipped back. */

export const metadata = { title: "Contract check · Lumofy Signals" };
export const dynamic = "force-dynamic";
// Flipping the switch re-materializes every account from this route.
export const maxDuration = 300;

const LIVE_LABEL: Record<string, string> = { onboarding: "Onboarding", active: "Active", renewal: "Renewal due", churned: "Churned" };
const money = (n: number) => formatCurrency(Math.round(n));
const signedMoney = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${money(Math.abs(n))}`;

export default async function ContractCheckPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  if (!hasDatabase() || !(await isSuperAdmin())) notFound();
  const showAll = (await searchParams).show === "all";

  if (!(await contractTablesExist())) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:px-8">
        <div className="rounded-lg border border-dashed border-border bg-surface px-5 py-8 font-body text-[13px] leading-relaxed text-fg-muted">
          <b className="text-fg">The contract tables don&apos;t exist in this database yet.</b> Run <code>drizzle/contract-records.sql</code>, then the import.
        </div>
      </div>
    );
  }

  const [clients, records, live, lastRaw] = await Promise.all([
    getClientsFromDb(), getAllContractRecordsDb(), contractRecordsLive(),
    getWorkspaceConfigFromDb("contract_records_live_log").catch(() => null),
  ]);
  const last = lastRaw && typeof lastRaw === "object" && typeof (lastRaw as { at?: unknown }).at === "string"
    ? { at: (lastRaw as { at: string }).at, by: ((lastRaw as { by?: string | null }).by ?? null) }
    : null;
  const byClient = new Map<string, ContractView[]>();
  for (const r of records) {
    const list = byClient.get(r.clientId) ?? [];
    list.push(toView(r));
    byClient.set(r.clientId, list);
  }
  const today = new Date().toISOString().slice(0, 10);
  const rows = sortForReview(clients.map((c) => compareAccount({ id: c.id, name: c.name.trim(), status: c.status, arr: c.arr }, byClient.get(c.id) ?? [], today)));
  const s = summarize(rows);
  const shown = showAll ? rows : rows.filter((r) => r.arrDiffers || r.statusDiffers);

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-2">
        <div className="eyebrow">Super admins only · read-only</div>
        <h1 className="font-display text-2xl font-bold leading-tight text-fg">Contract check</h1>
        <p className="max-w-[70ch] font-body text-[13.5px] leading-relaxed text-fg-muted">
          {live
            ? "Signal is reading contract records, so an account with records shows the same on both sides. A difference here is an account with no records, or one whose numbers have not been refreshed yet."
            : "What each account shows today, from HubSpot deals, beside what its contract records give. Open an account to fix its records. When the differences are understood, switch Signal to the records below."}
        </p>
      </header>

      <SwitchControl on={live} last={last} />

      <section className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface shadow-sm md:grid-cols-4">
        <Stat label="Live accounts · ARR today" value={money(s.liveArr)} hint={`From records ${money(s.recordArrForLive)} (${signedMoney(s.recordArrForLive - s.liveArr)})`} />
        <Stat label="Churned accounts · ARR today" value={money(s.churnedLiveArr)} hint={`From records ${money(s.churnedRecordArr)}`} />
        <Stat label="ARR differs" value={String(s.arrDiffers)} hint={`of ${s.accounts} accounts`} />
        <Stat label="Status differs" value={String(s.statusDiffers)} hint={s.withoutRecords ? `${s.withoutRecords} accounts have no records` : "Every account has records"} />
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-5 py-3.5">
          <div className="min-w-0 flex-1 font-display text-sm font-bold text-fg">{showAll ? "All accounts" : "Accounts with a difference"} <span className="tabular font-body text-[12px] font-semibold text-fg-subtle">{shown.length}</span></div>
          {[{ label: "Differences", href: "/reports/contract-check", on: !showAll }, { label: "All accounts", href: "/reports/contract-check?show=all", on: showAll }].map((t) => (
            <Link key={t.label} href={t.href} className={cn("rounded-pill px-3 py-1 font-body text-[12.5px] font-semibold transition-colors", t.on ? "bg-cosmos text-white" : "bg-bg-muted text-fg-muted hover:text-fg")}>{t.label}</Link>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] font-body text-[13px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-[0.05em] text-fg-subtle">
                <th className="px-5 py-2.5 font-semibold">Account</th>
                <th className="px-3 py-2.5 text-right font-semibold">ARR today</th>
                <th className="px-3 py-2.5 text-right font-semibold">From records</th>
                <th className="px-3 py-2.5 text-right font-semibold">Difference</th>
                <th className="px-3 py-2.5 font-semibold">Status today</th>
                <th className="px-3 py-2.5 font-semibold">From records</th>
                <th className="px-5 py-2.5 text-right font-semibold">Records</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr><td colSpan={7} className="border-t border-border-subtle px-5 py-8 text-center text-fg-subtle">No differences. Every account&apos;s records give the ARR and status it shows today.</td></tr>
              )}
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-border-subtle hover:bg-bg-subtle">
                  <td className="max-w-[280px] px-5 py-2.5">
                    <Link href={`/clients/${encodeURIComponent(r.id)}/contract`} className="block truncate font-semibold text-fg hover:text-sirius" dir="auto">{r.name}</Link>
                  </td>
                  <td className="tabular px-3 py-2.5 text-right text-fg-muted">{money(r.liveArr)}</td>
                  <td className="tabular px-3 py-2.5 text-right font-semibold text-fg">{money(r.recordArr)}</td>
                  <td className={cn("tabular px-3 py-2.5 text-right font-semibold", !r.arrDiffers ? "text-fg-subtle" : r.arrDiff > 0 ? "text-success-fg" : "text-danger-fg")}>{r.arrDiffers ? signedMoney(r.arrDiff) : "—"}</td>
                  <td className="px-3 py-2.5 text-fg-muted">{LIVE_LABEL[r.liveStatus] ?? r.liveStatus}</td>
                  <td className={cn("px-3 py-2.5", r.statusDiffers ? "font-semibold text-warning-fg" : "text-fg-muted")}>{STATUS_LABEL[r.recordStatus as ContractStatus]}</td>
                  <td className="tabular px-5 py-2.5 text-right text-fg-subtle">{r.total === 0 ? "none" : r.counted === r.total ? r.total : `${r.counted} of ${r.total} counted`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1 border-t border-border-subtle px-5 py-4 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0 [&:nth-child(2)]:border-t-0">
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      <span className="tabular font-display text-lg font-bold text-fg">{value}</span>
      <span className="font-body text-[12px] text-fg-subtle">{hint}</span>
    </div>
  );
}
