import { notFound } from "next/navigation";
import { PrototypeHybrid } from "../scratch-usage-v2/Prototypes";

/* The hybrid at the CONTENT widths Signal actually gives a client tab, rather
   than at raw viewport widths. Signal's left nav is ~248px and the page padding
   ~40px, so a 1280 viewport yields ~992 of content and 1440 yields ~1152. The
   third frame is the narrow case the analysis row has to survive. */
const FRAMES = [
  { w: 1152, label: "1440px viewport · ~1152px content", note: "nav 248 + padding 40" },
  { w: 992, label: "1280px viewport · ~992px content", note: "nav 248 + padding 40" },
  { w: 900, label: "~900px content", note: "narrow — the analysis row should stack" },
];

export const metadata = { title: "Widths · Usage tab v2 hybrid" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-7 p-5">
      <header className="max-w-[74ch]">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-sirius">Container widths</p>
        <h1 className="mt-1 font-display text-[21px] font-semibold text-fg">The hybrid at Signal&rsquo;s real content widths</h1>
        <p className="mt-1.5 font-body text-[12.5px] leading-relaxed text-fg-muted">
          The tab does not get the viewport &mdash; it gets what is left after the nav and page padding.
          The analysis row uses a <span className="font-mono text-[11.5px]">@container</span> query, so it
          stacks on the width it actually has rather than on the browser&rsquo;s.
        </p>
      </header>
      {FRAMES.map((f) => (
        <section key={f.w}>
          <p className="mb-2 font-body text-[11px] font-bold uppercase tracking-[0.06em] text-fg-subtle">
            {f.label} <span className="font-normal normal-case tracking-normal text-fg-subtle">· {f.note}</span>
          </p>
          <div className="overflow-x-auto rounded-xl bg-bg-muted/40 p-4">
            <div style={{ width: f.w }} className="max-w-full"><PrototypeHybrid /></div>
          </div>
        </section>
      ))}
    </div>
  );
}
