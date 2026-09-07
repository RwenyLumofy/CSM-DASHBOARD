"use client";

/* =========================================================================
   Data sync controls (Settings).

   • Sync now — incremental: pulls only deals modified in HubSpot since the last
     checkpoint and refreshes engagement. Never touches CSM field overrides
     (they live in client.properties jsonb), so manual edits are safe.

   • Full re-sync (super-admin only) — a "factory reset": clears the per-deal
     field overrides (__deal_overrides) so HubSpot's current values show through,
     rewinds the checkpoint, and re-pulls every Closed Won deal. Milestone dates
     and account-brief edits are preserved. Guarded by an explicit confirm that
     reads the live consequence first: two of the cleared fields (amount,
     contract start date) are inputs to ARR and the renewal date, so this moves
     reported numbers, not just labels. The dialog says so in figures.

   Both run via server actions (settings/actions.ts) — auth-gated server-side, so
   the destructive path is never reachable from the open /api/sync endpoint.
   ========================================================================= */

import { useState, useEffect } from "react";
import { RefreshCw, RotateCcw, AlertTriangle, Loader2, Check, X } from "lucide-react";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { syncNowAction, fullResyncAction, previewFullResyncAction, type SyncActionResult, type ResetPreview } from "@/app/(app)/settings/actions";

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
  // Read on open, never hardcoded — a number written into the copy would be
  // wrong the first time anyone edited a deal.
  const [preview, setPreview] = useState<ResetPreview | null>(null);

  /* "Last synced 4 minutes ago" is a function of the CURRENT TIME, so the
     server renders it against the request clock and the browser recomputes it
     against the hydration clock — the two disagree the moment a minute
     boundary falls between them, which is a genuine hydration mismatch, not a
     cosmetic one. Same reasoning (and same fix) as the mount gate in
     components/notifications/NotificationsCentre.tsx.

     Formatting in UTC on both passes would silence React and keep the SSR
     pass, but "ago" has no timezone to pin — the disagreement is about WHEN
     each pass ran, not where. Deferring one frame is the only honest fix. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!confirmFull) { setPreview(null); return; }
    let live = true;
    previewFullResyncAction().then((p) => { if (live) setPreview(p); });
    return () => { live = false; };
  }, [confirmFull]);

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
                    <span className="font-semibold text-fg">
                      {!mounted ? "\u2026" : lastSyncedAt ? relativeTime(lastSyncedAt) : "never"}
                    </span>.
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

                {/* The commercial half, which the copy above never mentioned:
                    `amount` and `contractStartDate` overrides are applied by
                    recomputeClient BEFORE it derives ARR and the renewal date,
                    so clearing them restates reported numbers. Read live. */}
                {preview === null ? (
                  <p className="caption mt-3 flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Checking what this would change…
                  </p>
                ) : !preview.ok ? (
                  <p className="mt-3 font-body text-[12.5px] text-[#B23A57]">
                    Couldn&apos;t check what this would change: {preview.error}
                  </p>
                ) : preview.clients === 0 ? (
                  <p className="caption mt-3 leading-relaxed">
                    No account currently has per-deal overrides, so nothing would be cleared.
                  </p>
                ) : (
                  <div className="mt-3 rounded-[10px] border border-[#B23A57]/25 bg-[#B23A57]/8 px-3 py-2.5">
                    <p className="font-body text-[12.5px] font-semibold leading-relaxed text-[#B23A57]">
                      This also changes reported numbers.
                    </p>
                    <ul className="mt-1.5 flex flex-col gap-1">
                      {preview.accountsWithArrChange! > 0 && (
                        <li className="font-body text-[12.5px] leading-relaxed text-fg-muted">
                          ARR moves on <span className="tabular font-semibold text-fg">{preview.accountsWithArrChange}</span>{" "}
                          account{preview.accountsWithArrChange === 1 ? "" : "s"} — portfolio total by{" "}
                          <span className="tabular font-semibold text-fg">
                            {preview.arrDelta! > 0 ? "+" : ""}
                            {preview.arrDelta!.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>.
                        </li>
                      )}
                      {preview.contractStartOverrides! > 0 && (
                        <li className="font-body text-[12.5px] leading-relaxed text-fg-muted">
                          Renewal dates change on{" "}
                          <span className="tabular font-semibold text-fg">{preview.contractStartOverrides}</span> deal
                          {preview.contractStartOverrides === 1 ? "" : "s"}.
                        </li>
                      )}
                      <li className="font-body text-[12.5px] leading-relaxed text-fg-muted">
                        <span className="tabular font-semibold text-fg">{preview.fields}</span> field correction
                        {preview.fields === 1 ? "" : "s"} across{" "}
                        <span className="tabular font-semibold text-fg">{preview.clients}</span> account
                        {preview.clients === 1 ? "" : "s"} are removed.
                      </li>
                    </ul>
                  </div>
                )}

                <p className="mt-3 font-body text-[12.5px] font-semibold text-[#B23A57]">This cannot be undone.</p>
                {preview?.ok && preview.clients! > 0 && (
                  <p className="caption mt-1 leading-relaxed">
                    A copy of all {preview.fields} cleared values is saved first, so they can be restored by hand.
                  </p>
                )}
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
