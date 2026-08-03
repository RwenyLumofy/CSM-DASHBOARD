import { notFound } from "next/navigation";
import { HealthPill } from "@/components/ui/HealthPill";
import type { HealthScore } from "@/lib/types";

/* =========================================================================
   Dev preview — the "Not assessed" health state.

   Health surfaces need a signed-in session, so this renders HealthPill
   directly against the three real production shapes from 2026-08-03. Tracked
   (Tailwind skips gitignored paths) and 404s outside development.
   ========================================================================= */

export const metadata = { title: "Preview · Health evidence" };

const CASES: { label: string; note: string; health: HealthScore }[] = [
  {
    label: "Masdar Building Materials",
    note: "The false GREEN. Profile fields and the onboarding window only — no usage, survey, support or Pulse. Showed as Healthy 76, a reason not to call them.",
    health: { score: 76, tier: "Healthy", tierColor: "#1E8F61", trend: 0, updatedAt: "",
      components: { use_case_set: 100, profile_complete: 80, onboarding_period: 100, stakeholder_mapping: 60 } },
  },
  {
    label: "DHL",
    note: "The false RED. Empty record, nothing from the customer. Showed as At risk 0 — an alarm about an account we know nothing about.",
    health: { score: 0, tier: "At risk", tierColor: "#B23A57", trend: 0, updatedAt: "",
      components: { use_case_set: 0, profile_complete: 0, stakeholder_mapping: 0 } },
  },
  {
    label: "Azmeel Travel",
    note: "Correctly At risk, and must STAY that way: 20 seats sold, 0 monthly active users. Zero usage is evidence — the loudest we hold. Only an ABSENT metric is a gap.",
    health: { score: 0, tier: "At risk", tierColor: "#B23A57", trend: 0, updatedAt: "",
      components: { usage: 0, use_case_set: 0, profile_complete: 0, stakeholder_mapping: 0 } },
  },
  {
    label: "Saudi Mining Polytechnic",
    note: "Unaffected — a real score built on real signal, including a CS Pulse.",
    health: { score: 71, tier: "Healthy", tierColor: "#1E8F61", trend: 4, updatedAt: "",
      components: { usage: 62, cs_pulse: 78, profile_complete: 90, stakeholder_mapping: 70 } },
  },
];

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-8">
      <header>
        <p className="font-body text-[11px] font-semibold uppercase tracking-wide text-sirius">Dev preview</p>
        <h1 className="mt-1 font-display text-[24px] font-semibold text-fg">Health: assessed vs not</h1>
        <p className="mt-1.5 font-body text-[13px] leading-relaxed text-fg-muted">
          Real component shapes from production, 3 August 2026. The rule: a score is only
          shown when at least one metric came from the <em>customer</em> — usage, a survey,
          support, or a CS Pulse. Record-keeping alone is not evidence.
        </p>
      </header>

      {CASES.map((c) => (
        <section key={c.label} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-body text-[13.5px] font-semibold text-fg">{c.label}</span>
            <HealthPill health={c.health} />
          </div>
          <p className="font-body text-[12px] leading-relaxed text-fg-muted">{c.note}</p>
          <div className="flex flex-wrap gap-1.5 border-t border-border-subtle pt-2">
            {Object.entries(c.health.components).map(([k, v]) => (
              <span key={k} className="rounded-pill bg-bg-muted px-2 py-0.5 font-body text-[10.5px] text-fg-muted">
                {k} {Math.round(v as number)}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="font-body text-[11px] text-fg-subtle">compact (clients list):</span>
            <HealthPill health={c.health} compact />
          </div>
        </section>
      ))}
    </div>
  );
}
