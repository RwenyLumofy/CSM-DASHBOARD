import { notFound } from "next/navigation";
import { WorkflowManager } from "@/components/settings/WorkflowManager";
import { ClientHealthEditor } from "@/components/settings/ClientHealthEditor";
import { DEFAULT_CSM_CONFIG, DEFAULT_IMPL_CONFIG, DEFAULT_CAPACITY } from "@/lib/assignment/config";
import { DEFAULT_CLIENT_HEALTH_CONFIG } from "@/lib/metrics/health-config";
import { CS_PULSE_DIMENSIONS, CS_PULSE_TIERS } from "@/lib/health/pulse";

/* =========================================================================
   Dev preview — the two Settings tabs after the split.

   Settings needs a signed-in admin, so this renders both tabs' real
   components against default config. Tracked (Tailwind skips gitignored
   paths) and 404s outside development.
   ========================================================================= */

export const metadata = { title: "Preview · Settings tabs" };

function Frame({ tab, title, blurb, children }: { tab: string; title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-bg p-5">
      <p className="font-body text-[10.5px] font-semibold uppercase tracking-[0.08em] text-sirius">
        Settings ▸ {tab}
      </p>
      <h2 className="mt-1 font-display text-base font-semibold text-fg">{title}</h2>
      <p className="mb-5 mt-1 max-w-[70ch] font-body text-sm text-fg-muted">{blurb}</p>
      {children}
    </section>
  );
}

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 p-6 sm:p-8">
      <header>
        <p className="font-body text-[11px] font-semibold uppercase tracking-wide text-sirius">Dev preview</p>
        <h1 className="mt-1 font-display text-[24px] font-semibold text-fg">The two Settings tabs, after the split</h1>
        <p className="mt-1.5 font-body text-[13px] leading-relaxed text-fg-muted">
          Real components, default config. Automations is assignment routing only; everything
          that decides a health score is in Client health.
        </p>
      </header>

      <Frame
        tab="Automations"
        title="Automations"
        blurb="How new clients are routed to a CSM and an Implementation owner, and the capacity thresholds behind it. The health score is configured under Client health."
      >
        <WorkflowManager
          initialCsm={DEFAULT_CSM_CONFIG}
          initialImpl={DEFAULT_IMPL_CONFIG}
          initialCapacity={DEFAULT_CAPACITY}
          teamHealth={[]}
        />
      </Frame>

      <Frame
        tab="Client health"
        title="Client health"
        blurb="Everything that decides an account's health score: which signals count and how they are weighted, the tier cutoffs, and the CS Pulse the CSM records each month. Saving the formula re-scores every account immediately."
      >
        <ClientHealthEditor
          initialDimensions={CS_PULSE_DIMENSIONS}
          initialTiers={CS_PULSE_TIERS}
          formula={DEFAULT_CLIENT_HEALTH_CONFIG}
        />
      </Frame>
    </div>
  );
}
