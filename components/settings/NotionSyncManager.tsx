"use client";

/* =========================================================================
   Notion export controls (Settings → Integrations).

   Shows when the weekly client export last ran and lets a super-admin run it
   on demand. The run itself is the same one the Sunday cron starts
   (lib/integrations/notion-sync.ts) via a server action, which checks
   isSuperAdmin() server-side — the disabled button here is not the gate.
   ========================================================================= */

import { useState } from "react";
import { AlertTriangle, Check, ExternalLink, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { notionSyncNowAction } from "@/app/(app)/settings/actions";
import type { NotionLastRun } from "@/lib/integrations/notion-sync";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* Pinned to UTC and built by hand so the server render and the browser
   produce the same text whatever the viewer's timezone. */
function utcStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

function summary(run: NotionLastRun): string {
  const parts = [`${run.updated} updated`, `${run.created} added`];
  if (run.failed > 0) parts.push(`${run.failed} failed`);
  if (run.remaining > 0) parts.push(`${run.remaining} not reached`);
  return `${run.clients} client${run.clients === 1 ? "" : "s"}: ${parts.join(", ")}`;
}

export function NotionSyncManager({
  isSuperAdmin,
  configured,
  databaseConfigured,
  initialLastRun,
  initialDatabaseUrl,
}: {
  isSuperAdmin: boolean;
  configured: boolean;
  databaseConfigured: boolean;
  initialLastRun: NotionLastRun | null;
  initialDatabaseUrl: string | null;
}) {
  const [lastRun, setLastRun] = useState<NotionLastRun | null>(initialLastRun);
  const [databaseUrl, setDatabaseUrl] = useState<string | null>(initialDatabaseUrl);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const data = await notionSyncNowAction();
      if (!data.ok || !data.lastRun) {
        setResult({ ok: false, msg: data.error ?? "Sync to Notion failed." });
        return;
      }
      setLastRun(data.lastRun);
      if (data.databaseUrl) setDatabaseUrl(data.databaseUrl);
      const incomplete = data.lastRun.failed > 0 || data.lastRun.remaining > 0;
      setResult({
        ok: !incomplete,
        msg: incomplete
          ? `Sync finished with problems. ${summary(data.lastRun)}.${data.error ? ` First error: ${data.error}` : ""}`
          : `Sync complete. ${summary(data.lastRun)}.`,
      });
    } catch (e) {
      setResult({ ok: false, msg: String(e) });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-sm font-bold text-fg">Notion client database</h3>
          <p className="caption mt-1">
            {!databaseConfigured ? (
              "No database configured, so the export is unavailable in sample mode."
            ) : !configured ? (
              "Notion is not configured (set NOTION_TOKEN and NOTION_PARENT_PAGE_ID)."
            ) : lastRun ? (
              <>
                Last synced <span className="font-semibold text-fg">{utcStamp(lastRun.at)}</span>. {summary(lastRun)}.
              </>
            ) : (
              "Not synced yet. The first run creates the database in Notion."
            )}
          </p>
          {databaseUrl && (
            <a
              href={databaseUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 font-body text-[12.5px] font-semibold text-accent hover:text-accent-hover"
            >
              Open in Notion <ExternalLink size={13} />
            </a>
          )}
        </div>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={run}
            disabled={running || !databaseConfigured || !configured}
            className="inline-flex shrink-0 items-center gap-2 rounded-[10px] bg-sirius px-4 py-2 font-body text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {running ? "Syncing…" : "Sync to Notion now"}
          </button>
        )}
      </div>

      {running && <p className="caption mt-3">This can take a few minutes. Keep this page open.</p>}

      {result && (
        <div
          className={cn(
            "mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5 font-body text-[12.5px]",
            result.ok ? "bg-success-bg text-success-fg" : "bg-danger-bg text-danger-fg",
          )}
        >
          {result.ok ? <Check size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          <span>{result.msg}</span>
        </div>
      )}
    </div>
  );
}
