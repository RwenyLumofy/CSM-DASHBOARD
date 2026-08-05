"use client";

/* =========================================================================
   How the score works — one disclosure at the top of Health signals.

   Collapsed by default and deliberately so. A CSM opening a profile wants
   THIS account's verdict; the rules behind it are a question they ask once,
   or when they disagree with a number. Occupying the top of the page with a
   permanent wall of methodology pushes the actual answer below the fold.

   Every figure here comes from the assembled model the account was scored
   with — nothing is typed into this file. Retune a weight in Settings and
   this changes with it. See lib/health/describe-model.ts for why that matters.

   The prose explains WHY each stage exists, not just what it does. "CS Pulse
   ≥ 75" is already on screen; what a CSM needs is why a number alone was not
   trusted to decide, and that reasoning is stable even as the numbers move.
   ========================================================================= */

import { useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ModelSummary } from "@/lib/health/describe-model";

const pct = (w: number) => `${Math.round(w * 100)}%`;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-px grid size-[19px] shrink-0 place-items-center rounded-full bg-bg-muted font-body text-[11px] font-bold text-fg-muted">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-body text-[12.5px] font-semibold text-fg">{title}</p>
        <div className="mt-1.5 flex flex-col gap-2">{children}</div>
      </div>
    </div>
  );
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="max-w-[68ch] font-body text-[12.5px] leading-relaxed text-fg-muted">{children}</p>
);

const B = ({ children }: { children: React.ReactNode }) => (
  <strong className="font-semibold text-fg">{children}</strong>
);

export function HealthModelExplainer({ model }: { model: ModelSummary }) {
  const [open, setOpen] = useState(false);
  const required = model.components.filter((c) => c.mandatory);

  return (
    <div className="rounded-xl border border-border-subtle bg-bg-muted/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-left transition-colors hover:bg-bg-muted"
      >
        <Info size={13} className="shrink-0 text-fg-subtle" aria-hidden />
        <span className="font-body text-[12.5px] font-semibold text-fg">How this score is calculated</span>
        <ChevronRight size={13} className={cn("ml-auto shrink-0 text-fg-subtle transition-transform", open && "rotate-90")} aria-hidden />
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border-subtle px-3.5 py-4">
          <P>
            The score answers one question &mdash; how is this account actually doing &mdash; and it is
            built in four stages. Understanding the last two matters most, because they are where an
            account&rsquo;s number and the way we treat it can legitimately part company.
          </P>

          <Step n={1} title="Separate readings, combined by weight">
            <P>
              Each of these is scored 0&ndash;100 on its own evidence, then blended in these proportions.
              None of them can carry the score alone.
            </P>
            <ul className="flex flex-col gap-1">
              {model.components.map((c) => (
                <li key={c.id} className="flex items-baseline gap-2 font-body text-[12.5px]">
                  <span className="tabular w-9 shrink-0 font-semibold text-fg">{pct(c.weight)}</span>
                  <span className="text-fg-muted">{c.name}</span>
                  {c.mandatory && (
                    <span className="rounded bg-[#B23A57]/10 px-1.5 py-0.5 font-body text-[9.5px] font-bold uppercase tracking-[0.05em] text-[#B23A57]">
                      Required
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {required.length > 0 && (
              <P>
                <B>Required</B> is a statement about evidence, not performance. With no reading at all for{" "}
                {required.length === 1 ? "it" : "either of them"}, the account is left unassessed rather than
                given a low score &mdash; there is nothing to judge, and a number invented in that gap would
                be worse than an honest blank.
              </P>
            )}
            <P>
              Anywhere else, a missing reading is set aside and the remaining weights re-share to cover it.
              A signal we simply do not have is never quietly counted as a zero. If less than {pct(model.minCoverage)}{" "}
              of the weight has data behind it, the account is not scored at all.
            </P>
          </Step>

          <Step n={2} title="The number lands in a band">
            <div className="flex flex-wrap gap-1.5">
              {model.bands.map((b) => (
                <span key={b.name} className="rounded-pill bg-surface px-2.5 py-1 font-body text-[11.5px] text-fg-muted ring-1 ring-inset ring-border-subtle">
                  <B>{b.name}</B> <span className="tabular">{b.min}&ndash;{b.max}</span>
                </span>
              ))}
            </div>
            <P>
              This much is arithmetic. Nothing about the account&rsquo;s circumstances has been weighed yet
              &mdash; only its readings.
            </P>
          </Step>

          <Step n={3} title="Then the checks the number can&rsquo;t see">
            <P>
              A band is earned by arithmetic; being shown as <B>{model.bands[0]?.name ?? "Healthy"}</B> has to
              be earned twice. An account can be well adopted, actively used, scoring in the eighties, and
              still resting entirely on one relationship that could end it. A weighted average cannot feel
              that. So each check below has to hold before the top band is granted &mdash; and failing even
              one caps the account at the status beside it, however high it scored.
            </P>
            <ul className="flex flex-col gap-1">
              {model.gates.map((g) => (
                <li key={g.name} className="flex items-baseline gap-2 font-body text-[12.5px] text-fg-muted">
                  <span className="text-fg-subtle" aria-hidden>&middot;</span>
                  <span>{g.name}</span>
                  <span className="ml-auto shrink-0 font-body text-[11px] text-fg-subtle">else {g.capTo}</span>
                </li>
              ))}
            </ul>
            <P>
              Thin evidence caps it too: below {pct(model.coverageCap.threshold)} coverage the status cannot
              exceed {model.coverageCap.capTo}. A confident grade drawn from very little is more dangerous
              than an uncertain one, because it reads as a reason not to call.
            </P>
          </Step>

          <Step n={4} title="And the facts that settle it outright">
            <P>
              Some things are not an input to a judgement &mdash; they are the judgement. Where one of these
              is true, the score stops being the deciding voice and the account moves to the status shown,
              whatever the rest of the picture says.
            </P>
            <div className="flex flex-col gap-2">
              {model.escalations.map((e) => (
                <div key={e.status}>
                  <p className="font-body text-[11.5px] font-semibold text-fg">{e.status}</p>
                  <p className="font-body text-[12px] leading-relaxed text-fg-muted">{e.triggers.join(", ")}</p>
                </div>
              ))}
            </div>
          </Step>

          <div className="rounded-lg bg-surface px-3.5 py-3 ring-1 ring-inset ring-border-subtle">
            <P>
              <B>None of this rewrites the score.</B> A failed check moves the status and leaves the number
              exactly where it was, which is why an account can read 73 and still sit on Watch. Both are
              true, and they answer different questions: the score is how the account is doing; the status
              is how we have decided to treat it until something changes.
            </P>
          </div>

          <p className="font-body text-[11px] leading-relaxed text-fg-subtle">
            Every weight, band and check above is configured in Settings &rarr; Client health. This panel
            reads that same configuration, so it always describes the rules this account was actually
            scored under &mdash; not a description of them written down once.
          </p>
        </div>
      )}
    </div>
  );
}
