"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { setContractRecordsLiveAction } from "./actions";

/** Turns the switch on or off. Two clicks, because it changes the numbers everyone sees. */
export function SwitchControl({ on, last }: { on: boolean; last: { by: string | null; at: string } | null }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null);

  function flip() {
    start(async () => {
      const res = await setContractRecordsLiveAction(!on).catch(() => ({ ok: false, error: "That didn't go through. Reload and check the state before trying again." } as const));
      setConfirming(false);
      if (!res.ok) { setMsg({ text: res.error ?? "That didn't go through.", bad: true }); return; }
      const r = res as { recomputed?: number; failed?: number };
      setMsg({ text: `Done. ${r.recomputed ?? 0} accounts updated${r.failed ? `, ${r.failed} could not be updated and keep their previous numbers until their next sync` : ""}.`, bad: !!r.failed });
      router.refresh();
    });
  }

  return (
    <section className={cn("flex flex-col gap-3 rounded-lg border px-5 py-4 shadow-sm", on ? "border-success bg-success-bg" : "border-border bg-surface")}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <div className="font-display text-sm font-bold text-fg">{on ? "Signal is reading contract records" : "Signal is reading HubSpot deals"}</div>
          <p className="font-body text-[12.5px] leading-relaxed text-fg-muted">
            {on
              ? "ARR, status and renewal date on Today, Clients and Insights come from each account's contract records. An account with no records still uses its deals."
              : "ARR, status and renewal date everywhere still come from HubSpot deals. Switching makes every account with contract records use them instead."}
            {last && <> Last changed {new Date(last.at).toISOString().slice(0, 10)}{last.by ? ` by ${last.by}` : ""}.</>}
          </p>
        </div>
        {!confirming ? (
          <button onClick={() => { setMsg(null); setConfirming(true); }} disabled={busy}
            className={cn("rounded-sm px-3.5 py-2 font-body text-[13px] font-semibold transition-colors", on ? "border border-border bg-surface text-fg hover:border-danger hover:text-danger-fg" : "bg-sirius text-white hover:bg-accent-hover")}>
            {on ? "Switch back to HubSpot deals" : "Switch Signal to contract records"}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-body text-[12.5px] font-semibold text-fg">{on ? "Everyone's numbers go back to the deal-based ones. Sure?" : "Everyone's numbers change to the ones in the “From records” columns below. Sure?"}</span>
            <button onClick={() => setConfirming(false)} disabled={busy} className="rounded-sm px-3 py-1.5 font-body text-[12.5px] font-semibold text-fg-muted hover:text-fg">Cancel</button>
            <button onClick={flip} disabled={busy} className="rounded-sm bg-sirius px-3.5 py-1.5 font-body text-[12.5px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50">
              {busy ? "Updating every account…" : on ? "Yes, switch back" : "Yes, switch"}
            </button>
          </div>
        )}
      </div>
      {msg && <p role="status" className={cn("font-body text-[12.5px] font-semibold", msg.bad ? "text-danger-fg" : "text-success-fg")}>{msg.text}</p>}
    </section>
  );
}
