import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, MoonStar, Sparkles, TrendingDown, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Sparkline } from "@/components/ui/Sparkline";
import type { Movement, MovementKind } from "@/lib/metrics/movement";
import { formatCurrency } from "@/lib/format";
import { periodDisplay } from "@/lib/metrics/exec";
import { cn } from "@/lib/cn";

/* "What changed" — one ranked list of accounts that moved.

   IT WAS TWO SECTIONS, and the reason was real but the fix was wrong. A single
   money column can't carry both "−$23.9K lost" and "$181.1K at risk" under one
   header — those are different quantities, and a column header can only name
   one. I split the list to give each its own column.

   But the ambiguity lives in the COLUMN, not the list: put the qualifier on the
   ROW ("−$23.9K lost" / "$181.1K at risk") and one list is unambiguous, because
   each row says what its own number means. Two sections was a structural answer
   to a labelling problem, and it cost the reader a second thing to parse before
   reading any account.

   The other argument for splitting — that ranking a hypothetical above a fact
   would offend a CFO — doesn't survive either. SIAD Holding already churned;
   there is nothing to do about it. MEP is $181K you can still save. For a
   worklist, ranking by money involved is right, and "already gone" vs "still
   savable" is exactly what the row's kind badge says.

   What the split DID get right is kept: sparklines appear only on usage rows.
   On a churned row a sparkline misleads — history runs past the churn date, so
   the line climbs while the row says "Churned".
*/

/* Definitions are transcribed from the rules in lib/metrics/movement.ts, not
   from memory of them. "Usage falling" in particular hides two thresholds
   nobody could guess from the label — and a threshold you can't see is a number
   you can't argue with. */
const KIND: Record<MovementKind, { label: string; icon: typeof XCircle; tone: string; dot: string; def: string }> = {
  churned: {
    label: "Churned", icon: XCircle, tone: "text-danger-fg bg-danger-bg", dot: "bg-danger",
    def: "The ARR ledger recorded a churn event in this period — the account's revenue went to zero.",
  },
  downgraded: {
    label: "Downgraded", icon: ArrowDownRight, tone: "text-warning-fg bg-warning-bg", dot: "bg-warning",
    def: "ARR was reduced but the account is still live — a contraction, or a renewal that came in lower.",
  },
  usage_dormant: {
    label: "Went dormant", icon: MoonStar, tone: "text-danger-fg bg-danger-bg", dot: "bg-danger",
    def: "Had monthly active users last month, zero this month. No revenue change yet.",
  },
  usage_declined: {
    label: "Usage falling", icon: TrendingDown, tone: "text-warning-fg bg-warning-bg", dot: "bg-warning",
    def: "Monthly actives down 25% or more vs last month, on a base of at least 10 — below that, a percentage is noise (2 users becoming 1 is “down 50%”). No revenue change yet.",
  },
  expanded: {
    label: "Expanded", icon: ArrowUpRight, tone: "text-success-fg bg-success-bg", dot: "bg-success",
    def: "ARR increased on an existing account — an expansion, reactivation, or a renewal that came in higher.",
  },
  new: {
    label: "New business", icon: Sparkles, tone: "text-info-fg bg-info-bg", dot: "bg-info",
    def: "First ARR booked for this account — a new logo landing in this period.",
  },
};

/** A hover/focus definition, CSS-only so this panel stays a server component
 *  (a tooltip is not worth shipping every Client object to the browser for).
 *  Sits on the chip's own group, and never intercepts the pointer — the chip
 *  underneath is a link and must stay clickable. */
function Tip({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute right-0 top-[calc(100%+6px)] z-50 w-[min(80vw,260px)] rounded-lg border border-border bg-surface p-2.5 text-left font-body text-[11.5px] font-normal leading-relaxed text-fg-muted opacity-0 shadow-lg transition-opacity duration-[140ms] group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

const REVENUE_KINDS: MovementKind[] = ["churned", "downgraded", "expanded", "new"];

/* The panel speaks TWO taxonomies and only one was in the legend.
   The chips are KINDS (churned, dormant…); the sections are GROUPS (revenue
   moved / early warnings). So "Early warnings" existed as a heading with no
   chip, and "show me all 8 accounts to call" was unaskable — you'd have to
   select "dormant" and "usage falling" at once, which a single-value filter
   can't do.

   One `kind` param now accepts either level: a group key selects every kind
   inside it, a kind key selects just that one. Mutually exclusive by
   construction, so the two levels can't fight — which is what a second param
   would have allowed. */
type GroupKey = "revenue" | "warning";

const GROUPS: { key: GroupKey; label: string; kinds: MovementKind[]; def: string }[] = [
  {
    key: "revenue", label: "Revenue moved", kinds: REVENUE_KINDS,
    def: "Money that has actually moved this period, straight off the ARR ledger — the same source as the waterfall, so the two always agree.",
  },
  {
    key: "warning", label: "Early warnings", kinds: ["usage_dormant", "usage_declined"],
    def: "Usage has moved; revenue hasn't — yet. These are the accounts still worth a call.",
  },
];

const isGroupKey = (v: string | undefined): v is GroupKey => v === "revenue" || v === "warning";

/** Which kinds a selection covers — a group expands to its members, a kind is
 *  itself, nothing means everything. */
function kindsFor(sel: string | undefined): MovementKind[] | null {
  if (!sel) return null;
  if (isGroupKey(sel)) return GROUPS.find((g) => g.key === sel)!.kinds;
  return [sel as MovementKind];
}

const DEFAULT_LIMIT = 6;

/** A URL with one `kind` filter toggled — the chips are the obvious way to
 *  narrow this list, so they behave like it. Built server-side from the live
 *  params; re-clicking the active chip clears it. */
function withKind(params: Record<string, string | string[] | undefined>, kind: string | null): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) next.set(k, val);
  }
  const cur = next.get("kind");
  if (!kind || cur === kind) next.delete("kind");
  else next.set("kind", kind);
  const qs = next.toString();
  return qs ? `/reports?${qs}` : "/reports";
}

function withExpanded(params: Record<string, string | string[] | undefined>, on: boolean): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) next.set(k, val);
  }
  if (on) next.set("all", "1");
  else next.delete("all");
  const qs = next.toString();
  return qs ? `/reports?${qs}` : "/reports";
}

export function MovementPanel({
  movements,
  currency,
  period,
  usageMonth,
  params,
}: {
  movements: Movement[];
  currency: string;
  period: string;
  usageMonth: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const sel = Array.isArray(params.kind) ? params.kind[0] : params.kind;
  const expanded = (Array.isArray(params.all) ? params.all[0] : params.all) === "1";

  // Counts come from the UNFILTERED set so the chips keep offering every route
  // back out — a chip that vanishes when you click its neighbour is a trap.
  const counts = new Map<MovementKind, number>();
  for (const m of movements) counts.set(m.kind, (counts.get(m.kind) ?? 0) + 1);
  const groupCount = (g: GroupKey) =>
    GROUPS.find((x) => x.key === g)!.kinds.reduce((a, k) => a + (counts.get(k) ?? 0), 0);

  const selected = kindsFor(sel);
  const shown = selected ? movements.filter((m) => selected.includes(m.kind)) : movements;
  const revenue = shown.filter((m) => REVENUE_KINDS.includes(m.kind));
  const leading = shown.filter((m) => !REVENUE_KINDS.includes(m.kind));

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {GROUPS.filter((g) => groupCount(g.key) > 0).map((g) => {
            const on = sel === g.key;
            return (
              <Link
                key={g.key}
                href={withKind(params, g.key)}
                scroll={false}
                aria-pressed={on}
                className={cn(
                  "group relative inline-flex items-center gap-1.5 rounded-pill border px-2 py-1 font-body text-[11px] font-semibold transition-all duration-[140ms]",
                  on
                    ? "border-fg/25 bg-bg-inverse text-bg ring-2 ring-fg/15"
                    : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {groupCount(g.key)} {g.label.toLowerCase()}
                <Tip>
                  <strong className="font-semibold text-fg">{g.label}</strong> — {g.def}
                </Tip>
              </Link>
            );
          })}

          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

          {(Object.keys(KIND) as MovementKind[]).filter((k) => counts.get(k)).map((k) => {
            const K = KIND[k];
            const on = sel === k;
            return (
              <Link
                key={k}
                href={withKind(params, k)}
                scroll={false}
                aria-pressed={on}
                className={cn(
                  "group relative inline-flex items-center gap-1.5 rounded-pill px-2 py-1 font-body text-[11px] font-semibold transition-all duration-[140ms]",
                  K.tone,
                  on ? "ring-2 ring-fg/20" : "opacity-70 hover:opacity-100",
                )}
              >
                <span className={cn("size-1.5 rounded-pill", K.dot)} />
                {counts.get(k)} {K.label.toLowerCase()}
                <Tip>
                  <strong className="font-semibold text-fg">{K.label}</strong> — {K.def}
                </Tip>
              </Link>
            );
          })}

          {sel && (
            <Link
              href={withKind(params, null)}
              scroll={false}
              className="rounded-pill px-2 py-1 font-body text-[11px] font-semibold text-fg-subtle underline-offset-2 hover:text-fg hover:underline"
            >
              show all
            </Link>
          )}
        </div>

        {/* The column has no header: each row names its own quantity, because
            "lost" and "at risk" can't share one. */}
        <span className="caption tabular ml-auto">ranked by ARR involved</span>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-md bg-bg-subtle px-3 py-6 text-center">
          <p className="caption">
            Nothing matches that filter in {periodDisplay(period)}.{" "}
            <Link href={withKind(params, null)} scroll={false} className="font-semibold text-sirius hover:underline">
              Show all
            </Link>
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col">
            {(expanded ? shown : shown.slice(0, DEFAULT_LIMIT)).map((m) => (
              <Row key={`${m.client.id}-${m.kind}`} m={m} currency={currency} />
            ))}
          </ul>
          {shown.length > DEFAULT_LIMIT && (
            <Link
              href={withExpanded(params, !expanded)}
              scroll={false}
              className="mt-2 inline-block font-body text-[12px] font-semibold text-sirius underline-offset-2 hover:underline"
            >
              {expanded ? "Show fewer" : `Show ${shown.length - DEFAULT_LIMIT} more`}
            </Link>
          )}
        </>
      )}

      <p className="caption mt-4 border-t border-border-subtle pt-3">
        Revenue movement is {periodDisplay(period)}, off the ARR ledger — the same source as the waterfall. Usage
        compares {monthLabel(usageMonth)} against the month before (usage history is monthly, so it can&apos;t follow a
        part-quarter).
      </p>
    </Card>
  );
}

function Row({ m, currency }: { m: Movement; currency: string }) {
  const K = KIND[m.kind];
  const Icon = K.icon;
  const fmt = (v: number) => formatCurrency(Math.abs(v), currency, { compact: true });
  // Realized money is signed and coloured; exposed money is neither — it hasn't
  // moved. The word is what disambiguates, per row, which is what a shared
  // column header could never do.
  const realized = m.arrDelta !== 0;

  return (
    <li className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-0">
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", K.tone)}>
        <Icon size={14} strokeWidth={2} />
      </span>

      <div className="min-w-0 flex-1">
        <Link
          href={`/clients/${m.client.id}`}
          className="block truncate font-body text-sm font-semibold text-fg underline-offset-2 transition-colors hover:text-sirius hover:underline"
        >
          {m.client.name}
        </Link>
        <span className="caption block truncate">
          {m.note}
          {m.date && ` · ${m.date}`}
          {m.client.csm?.name ? ` · ${m.client.csm.name}` : ""}
        </span>
      </div>

      {/* Sparkline only where usage IS the story. On a churned row it misleads:
          history runs past the churn date, so the line climbs while the row
          says "Churned". */}
      {!realized && m.usage && m.usage.series.length > 1 && (
        <Sparkline
          data={m.usage.series.map((s) => s.mau)}
          min={0}
          width={64}
          height={22}
          color="var(--color-danger)"
          className="hidden shrink-0 sm:block"
        />
      )}

      <div className="w-24 shrink-0 text-right">
        <span
          className={cn(
            "tabular block font-body text-sm font-semibold",
            realized ? (m.arrDelta > 0 ? "text-success-fg" : "text-danger-fg") : "text-fg",
          )}
        >
          {realized ? `${m.arrDelta > 0 ? "+" : "−"}${fmt(m.arrDelta)}` : fmt(m.arrAtStake)}
        </span>
        <span className="caption block">{realized ? (m.arrDelta > 0 ? "added" : "lost") : "at risk"}</span>
      </div>
    </li>
  );
}

function monthLabel(ym: string): string {
  const names = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(ym.slice(5, 7))] ?? ym} ${ym.slice(0, 4)}`;
}
