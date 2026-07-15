"use client";

/* =========================================================================
   Data sync controls (Settings).

   • Sync now — incremental: pulls only deals modified in HubSpot since the last
     checkpoint and refreshes engagement. Never touches CSM field overrides
     (they live in client.properties jsonb), so manual edits are safe.

   • Full re-sync (super-admin only) — a "factory reset": clears the per-deal
     field overrides (__deal_overrides) so HubSpot's current values show through,
     rewinds the checkpoint, and re-pulls every Closed Won deal. Milestone dates
     and account-brief edits are preserved. Guarded by an explicit confirm.

   Both run via server actions (settings/actions.ts) — auth-gated server-side, so
   the destructive path is never reachable from the open /api/sync endpoint.
   ========================================================================= */

import { useState } from "react";
import { RefreshCw, RotateCcw, AlertTriangle, Loader2, Check, X } from "lucide-react";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { syncNowAction, fullResyncAction, type SyncActionResult } from "@/app/(app)/settings/actions";

export function SyncManager({
  isSuperAdmin,
  initialLastSyncedAt,
  hubspotConfigured,
  databaseConfigured,
}: {
  isSuperAdmin: boolean;
  initialLastSyncedAt: string | null;
  hubspotConfigured: boolean;
  databaseConfigured: boolean;
}) {
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(initialLastSyncedAt);
  const [running, setRunning] = useState<null | "incremental" | "full">(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [confirmFull, setConfirmFull] = useState(false);

  async function run(full: boolean) {
    setRunning(full ? "full" : "incremental");
    setResult(null);
    setConfirmFull(false);
    try {
      const data: SyncActionResult = full ? await fullResyncAction() : await syncNowAction();
      if (!data.ok) {
        setResult({ ok: false, msg: data.error ?? "Sync failed." });
      } else {
        const dealCount = data.dealCount ?? 0;
        const clientCount = data.clientCount ?? 0;
        const parts = [`${dealCount} deal${dealCount === 1 ? "" : "s"}`, `${clientCount} client${clientCount === 1 ? "" : "s"}`];
        if (full) parts.push(`${data.overridesCleared ?? 0} override${data.overridesCleared === 1 ? "" : "s"} cleared`);
        // dealCount/clientCount above are how many rows HubSpot returned inside
        // this run's fetch window — that includes existing clients whose deals
        // were merely touched (e.g. a renewal edited in HubSpot), not just new
        // ones. newClientCount/newDealCount are the genuinely-new counts, so a
        // "1 client" sync that's actually a renewal update reads as 0 new here
        // instead of implying a client was just added.
        const newClients = data.newClientCount ?? 0;
        const newDeals = data.newDealCount ?? 0;
        const newNote =
          newClients > 0 || newDeals > 0
            ? ` (${newClients} new client${newClients === 1 ? "" : "s"}, ${newDeals} new deal${newDeals === 1 ? "" : "s"})`
            : " (nothing new — renewals/updates only)";
        setResult({ ok: true, msg: `${full ? "Full re-sync" : "Sync"} complete — touched ${parts.join(", ")}${newNote}.` });
        if (data.lastSyncedAt) setLastSyncedAt(data.lastSyncedAt);
      }
    } catch (e) {
      setResult({ ok: false, msg: String(e) });
    } finally {
      setRunning(null);
    }
  }

  const busy = running !== null;
  const disabled = busy || !databaseConfigured || !hubspotConfigured;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-bold text-fg">HubSpot data</h3>
          <p className="caption mt-1">
            {!databaseConfigured
              ? "No database configured — sync is unavailable in sample mode."
              : !hubspotConfigured
                ? "HubSpot is not configured (set HUBSPOT_ACCESS_TOKEN)."
                : (
                  <>
                    Last synced{" "}
                    <span className="font-semibold text-fg">{lastSyncedAt ? relativeTime(lastSyncedAt) : "never"}</span>.
                  </>
                )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={disabled}
          className="inline-flex shrink-0 items-center gap-2 rounded-[10px] bg-sirius px-4 py-2 font-body text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {running === "incremental" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {running === "incremental" ? "Syncing…" : "Sync now"}
        </button>
      </div>

      {/* Result banner */}
      {result && (
        <div
          className={cn(
            "mt-4 flex items-start gap-2 rounded-lg border px-3 py-2.5 font-body text-[12.5px]",
            result.ok ? "border-[#1E8F61]/30 bg-[#1E8F61]/8 text-[#1E8F61]" : "border-[#B23A57]/30 bg-[#B23A57]/8 text-[#B23A57]",
          )}
        >
          {result.ok ? <Check size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          <span>{result.msg}</span>
        </div>
      )}

      {/* Danger zone — full re-sync (super-admin only) */}
      {isSuperAdmin && (
        <div className="mt-5 border-t border-border-subtle pt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="flex items-center gap-1.5 font-body text-[13px] font-semibold text-fg">
                <AlertTriangle size={14} className="text-[#B23A57]" /> Full re-sync
              </h4>
              <p className="caption mt-1 max-w-md leading-relaxed">
                Re-pulls every deal from HubSpot and clears the per-deal field overrides you&apos;ve edited in the app,
                reverting them to HubSpot&apos;s current values. Milestone dates and account-brief edits are kept.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmFull(true)}
              disabled={disabled}
              className="inline-flex shrink-0 items-center gap-2 rounded-[10px] border border-[#B23A57]/40 px-4 py-2 font-body text-[13px] font-semibold text-[#B23A57] transition-colors hover:bg-[#B23A57]/8 disabled:opacity-50"
            >
              {running === "full" ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
              {running === "full" ? "Resetting…" : "Full re-sync"}
            </button>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmFull && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmFull(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#B23A57]/10 text-[#B23A57]">
                <AlertTriangle size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-fg">Run a full re-sync?</h3>
                <p className="caption mt-1.5 leading-relaxed">This is like a factory reset for HubSpot data. It will:</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {[
                    "Clear every per-deal field override (amount, licenses, package, contract dates, support level…) and revert those fields to HubSpot's current values.",
                    "Re-pull all Closed Won deals — this can take a few minutes.",
                    "Keep the CSM milestone dates and account-brief edits.",
                  ].map((t, i) => (
                    <li key={i} className="flex gap-2 font-body text-[12.5px] leading-relaxed text-fg-muted">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#B23A57]" />
                      {t}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 font-body text-[12.5px] font-semibold text-[#B23A57]">This cannot be undone.</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmFull(false)}
                className="inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 font-body text-[13px] font-semibold text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
              >
                <X size={15} /> Cancel
              </button>
              <button
                type="button"
                onClick={() => run(true)}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#B23A57] px-4 py-2 font-body text-[13px] font-semibold text-white transition-colors hover:bg-[#9A2F49]"
              >
                <RotateCcw size={15} /> Yes, full re-sync
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
