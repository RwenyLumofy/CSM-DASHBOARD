import { notFound } from "next/navigation";
import { PrototypeB, StateGallery } from "../scratch-usage-v2/Prototypes";

/* Usage tab v2 — Prototype B. Fixture-only, development-only. */
export const metadata = { title: "Prototype B · Usage tab v2" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 p-5">
      <header className="max-w-[76ch]">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-sirius">Prototype B · compact operational</p>
        <h1 className="mt-1 font-display text-[22px] font-semibold text-fg">Usage — Bank of Bahrain &amp; Kuwait</h1>
        <p className="mt-1.5 font-body text-[12.5px] leading-relaxed text-fg-muted">
          Fixture data. Two columns above the fold: facts and chart left, observations and use-case
          evidence right, so an observation sits beside the evidence it came from rather than above it.
        </p>
      </header>
      <PrototypeB />
      <section>
        <h2 className="mb-2 font-display text-[15px] font-semibold text-fg">Component state gallery</h2>
        <StateGallery />
      </section>
    </div>
  );
}
