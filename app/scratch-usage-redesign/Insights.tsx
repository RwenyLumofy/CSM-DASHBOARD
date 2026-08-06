"use client";

/* =========================================================================
   The three insight blocks, drawn.

   Each answers a question a CSM already has, using data Signal already holds,
   and each is deliberately a different SHAPE — a trajectory, a distribution, a
   ledger. The previous mockup made everything a bordered card of the same
   weight, which is why nothing on it looked more important than anything else.

   Real BBK readings throughout: 757 seats, 748 licences consumed, 317 monthly
   actives. Money figures carry a dagger — Signal holds ARR, but I have not
   read this account's.
   ========================================================================= */

import { ArrowRight, Info } from "lucide-react";
import { cn } from "@/lib/cn";

const Fake = () => <sup className="ml-0.5 font-body text-[9px] font-bold text-[#C2610E]" title="Invented — real ARR not read">†</sup>;

/* ============================================================ 1. CHURN SHAPE */

/* Monthly actives as a share of seats. `churned` and `renewed` are the averaged
   shapes of accounts that did each, aligned on months-before-renewal. */
const MONTHS = ["-11", "-10", "-9", "-8", "-7", "-6", "-5", "-4", "-3", "-2", "-1", "now"];
const THIS = [38, 41, 44, 46, 43, 45, 47, 44, 42, 40, 38, 37];
const CHURNED = [44, 43, 42, 40, 39, 37, 36, 34, 32, 30, 28, 26];
const RENEWED = [40, 42, 44, 46, 47, 49, 50, 52, 53, 54, 55, 56];

function ChurnShape() {
  const w = 720, h = 200, padX = 34, padY = 14;
  const min = 20, max = 60;
  const x = (i: number) => padX + (i / (MONTHS.length - 1)) * (w - padX - 12);
  const y = (v: number) => padY + (1 - (v - min) / (max - min)) * (h - padY * 2);
  const line = (a: number[]) => a.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const band = `${RENEWED.map((v, i) => `${x(i)},${y(v)}`).join(" ")} ${[...CHURNED].reverse().map((v, i) => `${x(CHURNED.length - 1 - i)},${y(v)}`).join(" ")}`;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-[46ch]">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-sirius">
            Against your own book
          </p>
          <h3 className="mt-1 font-display text-[19px] font-semibold leading-snug text-fg">
            Falling for five months, while accounts that renewed kept climbing
          </h3>
          <p className="mt-1.5 font-body text-[13px] leading-relaxed text-fg-muted">
            Built from the 79 accounts that have already churned and the ones that renewed, aligned on
            months-to-renewal. Eleven months out this account led both. It peaked at &minus;5 and has
            fallen since &mdash; the direction the churned cohort took, and the opposite of the renewed
            one. It is still 11 points above the churn line and 19 below the renewal line.
          </p>
        </div>
        <div className="rounded-xl bg-[#B23A57]/8 px-3.5 py-2.5 text-right">
          <p className="font-body text-[11px] text-fg-muted">Trajectory match</p>
          <p className="tabular font-display text-[26px] font-bold leading-tight text-[#B23A57]">0.81</p>
          <p className="font-body text-[11px] text-fg-subtle">to the churned shape</p>
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-[200px] w-full" role="img"
        aria-label="Monthly actives as a share of seats over eleven months, against the averaged churned and renewed shapes">
        {[20, 30, 40, 50, 60].map((v) => (
          <g key={v}>
            <line x1={padX} x2={w - 12} y1={y(v)} y2={y(v)} stroke="var(--color-border-subtle)" strokeWidth="1" />
            <text x={padX - 6} y={y(v) + 3} textAnchor="end" className="fill-[var(--color-fg-subtle)] font-body text-[9px]">{v}%</text>
          </g>
        ))}
        <polygon points={band} className="fill-[var(--color-fg-subtle)]" opacity="0.07" />
        <polyline points={line(RENEWED)} fill="none" stroke="#1F9D63" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />
        <polyline points={line(CHURNED)} fill="none" stroke="#B23A57" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />
        <polyline points={line(THIS)} fill="none" stroke="var(--color-sirius)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={x(11)} cy={y(37)} r="4" className="fill-[var(--color-sirius)]" />
        {MONTHS.map((m, i) => i % 2 === 0 && (
          <text key={m} x={x(i)} y={h - 1} textAnchor="middle" className="fill-[var(--color-fg-subtle)] font-body text-[9px]">{m}</text>
        ))}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1">
        {[["var(--color-sirius)", "This account", false], ["#B23A57", "Averaged churned (79)", true], ["#1F9D63", "Averaged renewed", true]].map(([c, l, dash]) => (
          <span key={l as string} className="flex items-center gap-1.5 font-body text-[11px] text-fg-muted">
            <span className={cn("h-0.5 w-5 rounded", dash && "opacity-70")}
              style={{ background: dash ? "none" : (c as string), borderTop: dash ? `2px dashed ${c}` : undefined }} aria-hidden />
            {l as string}
          </span>
        ))}
        <span className="ml-auto font-body text-[11px] text-fg-subtle">Months to renewal</span>
      </div>
    </section>
  );
}

/* ========================================================= 2. COHORT */

const PEERS = [22, 27, 31, 34, 36, 38, 39, 41.9, 44, 47, 49, 52, 55, 58, 61, 66, 71, 78];

function Cohort() {
  const min = 18, max = 82;
  const pos = (v: number) => ((v - min) / (max - min)) * 100;
  const median = 45.5;
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <p className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-sirius">Against comparable accounts</p>
      <h3 className="mt-1 font-display text-[19px] font-semibold leading-snug text-fg">
        41.9% activation is 11th of 18 &mdash; below the median for accounts this size and age
      </h3>
      <p className="mt-1.5 max-w-[64ch] font-body text-[13px] leading-relaxed text-fg-muted">
        Cohort is accounts of 400&ndash;1,200 seats, 6&ndash;12 months since go-live. Not the whole
        portfolio &mdash; a 40-seat account that launched last week is not a fair comparison and would
        flatter this one.
      </p>

      <div className="mt-6 mb-2">
        <div className="relative h-14">
          <div className="absolute inset-x-0 top-7 h-px bg-border" />
          <div className="absolute top-[18px] w-px bg-fg-subtle" style={{ left: `${pos(median)}%`, height: 20 }} />
          <span className="absolute font-body text-[10px] text-fg-subtle" style={{ left: `${pos(median)}%`, top: 0, transform: "translateX(-50%)" }}>
            median 45.5%
          </span>
          {PEERS.map((v) => (
            <span key={v} className={cn("absolute size-2 rounded-full", v === 41.9 ? "hidden" : "bg-fg-subtle/40")}
              style={{ left: `${pos(v)}%`, top: 24, transform: "translateX(-50%)" }} aria-hidden />
          ))}
          <span className="absolute flex flex-col items-center" style={{ left: `${pos(41.9)}%`, top: 20, transform: "translateX(-50%)" }}>
            <span className="size-3.5 rounded-full bg-sirius ring-4 ring-sirius/20" aria-hidden />
            <span className="mt-1 whitespace-nowrap font-body text-[11px] font-semibold text-sirius">41.9%</span>
          </span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {[
          ["Top quartile starts at", "58%", "16 points above this account"],
          ["Cohort median", "45.5%", "3.6 points above"],
          ["Accounts below this one", "10 of 18", "not an outlier — a laggard"],
        ].map(([l, v, s]) => (
          <div key={l} className="rounded-lg bg-bg-muted/50 px-3 py-2.5">
            <p className="font-body text-[11px] text-fg-subtle">{l}</p>
            <p className="tabular mt-0.5 font-display text-[17px] font-bold text-fg">{v}</p>
            <p className="font-body text-[11px] text-fg-subtle">{s}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ====================================================== 3. COMMERCIAL */

function Commercial() {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <p className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-sirius">What the usage is worth</p>
      <h3 className="mt-1 font-display text-[19px] font-semibold leading-snug text-fg">
        440 seats are paid for and unused &mdash; that is the number procurement will find
      </h3>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <div className="flex h-9 w-full overflow-hidden rounded-lg">
            <span className="flex items-center justify-center bg-sirius font-body text-[11px] font-semibold text-white" style={{ width: "41.9%" }}>
              317 active
            </span>
            <span className="flex items-center justify-center bg-[#C2610E]/25 font-body text-[11px] font-semibold text-[#C2610E]" style={{ width: "57%" }}>
              440 assigned, never active
            </span>
            <span className="bg-bg-muted" style={{ width: "1.1%" }} />
          </div>
          <p className="mt-1.5 font-body text-[11px] text-fg-subtle">757 seats · 748 licences consumed · 9 unassigned</p>

          <dl className="mt-4 flex flex-col divide-y divide-border-subtle">
            {[
              ["Annual value", "SAR 1.42m", <Fake key="a" />],
              ["Per seat", "SAR 1,876", <Fake key="b" />],
              ["Per ACTIVE user", "SAR 4,479", <span key="c" className="font-body text-[11px] text-[#C2610E]">2.4× the per-seat price</span>],
              ["At risk on unused seats", "SAR 825,440", <span key="d" className="font-body text-[11px] text-[#C2610E]">58% of the contract</span>],
            ].map(([l, v, note]) => (
              <div key={l as string} className="flex items-baseline gap-3 py-2">
                <dt className="min-w-0 flex-1 font-body text-[12.5px] text-fg-muted">{l as string}</dt>
                <dd className="tabular font-body text-[14px] font-bold text-fg">{v as string}</dd>
                <dd className="w-[10.5rem] text-right">{note}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="rounded-xl border border-[#C2610E]/30 bg-[#C2610E]/[0.06] p-3.5">
            <p className="font-body text-[12.5px] font-bold text-[#C2610E]">Downsell exposure</p>
            <p className="mt-1 font-body text-[12.5px] leading-relaxed text-fg-muted">
              At renewal they can cut 440 seats and lose nothing they currently use. Either activation
              rises before <span className="font-semibold text-fg">14 Nov 2026</span> or the renewal is
              negotiated at a lower number.
            </p>
            <p className="mt-2 font-body text-[11px] font-semibold text-fg">98 days out</p>
          </div>
          <div className="rounded-xl border border-[#1F9D63]/30 bg-[#1F9D63]/[0.06] p-3.5">
            <p className="font-body text-[12.5px] font-bold text-[#1F9D63]">Expansion trigger, if it turns</p>
            <p className="mt-1 font-body text-[12.5px] leading-relaxed text-fg-muted">
              98.8% of licences are already consumed. Any real activation growth hits the ceiling within
              a quarter &mdash; and that conversation is easier than the one above.
            </p>
          </div>
        </div>
      </div>
      <p className="mt-3 flex items-start gap-1.5 font-body text-[11px] leading-relaxed text-fg-subtle">
        <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
        &ldquo;Never active&rdquo; is licences-consumed minus monthly actives &mdash; a proxy. True
        never-opened counts need the usage-sync change. Money figures are illustrative; Signal holds the
        real ARR.
      </p>
    </section>
  );
}

/* ============================================================== page */

export function UsageInsights() {
  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-8 p-6">
      <header className="max-w-[72ch]">
        <p className="font-body text-[11px] font-bold uppercase tracking-[0.06em] text-sirius">Direction</p>
        <h1 className="mt-1 font-display text-[24px] font-semibold text-fg">
          Usage insights &mdash; three blocks a BI dashboard cannot produce
        </h1>
        <p className="mt-1.5 font-body text-[13px] leading-relaxed text-fg-muted">
          Each answers a question the CSM already has, from data Signal already holds, and each is a
          different <em>shape</em> &mdash; a trajectory, a distribution, a ledger. That is the fix for the
          last version, where thirteen identical cards meant nothing looked more important than anything else.
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl bg-bg-muted/40 p-5">
        <div style={{ width: 1232 }} className="flex max-w-full flex-col gap-4">
          <ChurnShape />
          <Cohort />
          <Commercial />
        </div>
      </div>

      <section className="max-w-[72ch]">
        <h2 className="font-display text-[15px] font-semibold text-fg">What each one needs</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {[
            ["Churn shape", "client_usage_monthly joined to churn dates. The 79 churned accounts already carry the history. Needs the shape computed once and cached, not per page load."],
            ["Cohort", "The same monthly table across accounts, filtered by seat band and months-since-go-live. Go-live comes from deal dates. No new collection."],
            ["Commercial", "ARR and renewal date are already on the client. The only new thing is dividing one by the other, which nothing in the product does today."],
          ].map(([t, d]) => (
            <li key={t} className="flex gap-2.5">
              <ArrowRight size={13} className="mt-1 shrink-0 text-fg-subtle" aria-hidden />
              <p className="font-body text-[12.5px] leading-relaxed text-fg-muted">
                <span className="font-semibold text-fg">{t}</span> &mdash; {d}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
