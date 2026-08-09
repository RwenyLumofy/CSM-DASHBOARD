import { notFound } from "next/navigation";
import { PrototypeHybrid, StateGallery } from "../scratch-usage-v2/Prototypes";

/* Usage tab v2 — the approved hybrid: B's structure with a compact summary
   strip, A's chart height, and use-case evidence at full width. Fixture-only,
   development-only. Does not touch components/clients/UsageTab.tsx. */
export const metadata = { title: "Hybrid · Usage tab v2" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 p-5">
      <header className="max-w-[78ch]">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-sirius">Hybrid · B refined</p>
        <h1 className="mt-1 font-display text-[22px] font-semibold text-fg">Usage — Bank of Bahrain &amp; Kuwait</h1>
        <p className="mt-1.5 font-body text-[12.5px] leading-relaxed text-fg-muted">
          Full-width trust controls, compact summary strip, two-column analysis row with the chart at 168px
          and at most three observations, then use-case evidence at full width, then reference behind
          disclosure. Parent states describe evidence, never outcome. Fixture data.
        </p>
      </header>
      <PrototypeHybrid />
      <section>
        <h2 className="mb-2 font-display text-[15px] font-semibold text-fg">Component state gallery</h2>
        <StateGallery />
      </section>
    </div>
  );
}
