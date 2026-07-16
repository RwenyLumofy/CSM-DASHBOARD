import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, MoonStar, Sparkles, TrendingDown, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Sparkline } from "@/components/ui/Sparkline";
import type { Movement, MovementKind } from "@/lib/metrics/movement";
import { formatCurrency } from "@/lib/format";
import { periodDisplay } from "@/lib/metrics/exec";
import { cn } from "@/lib/cn";

/* "What changed" — accounts that moved, in TWO groups.

   The single ranked list mixed realized loss with potential loss: SIAD Holding
   ACTUALLY churned for −$23.9K, while MEP has not churned and $181.1K is what's
   exposed if it does. Sorting both by "at stake" put a hypothetical above a
   fact, and forced one column to mean two things ("−$23.9K ARR" beside "$181.1K
   at stake") — the same two-scales-in-one-column bug already fixed on the health
   panel and reintroduced here.

   Splitting by whether revenue has MOVED fixes all three at once: each group's
   money column has one meaning, the ranking is like-for-like, and sparklines
   appear only in the group where usage IS the story. On a churned row a
   sparkline actively misleads — usage history runs past the churn date, so the
   line rises while the row says "Churned".
*/

const KIND: Record<MovementKind, { label: string; icon: typeof XCircle; tone: string; dot: string }> = {
  churned: { label: "Churned", icon: XCircle, tone: "text-danger-fg bg-danger-bg", dot: "bg-danger" },
  downgraded: { label: "Downgraded", icon: ArrowDownRight, tone: "text-warning-fg bg-warning-bg", dot: "bg-warning" },
  usage_dormant: { label: "Went dormant", icon: MoonStar, tone: "text-danger-fg bg-danger-bg", dot: "bg-danger" },
  usage_declined: { label: "Usage falling", icon: TrendingDown, tone: "text-warning-fg bg-warning-bg", dot: "bg-warning" },
  expanded: { label: "Expanded", icon: ArrowUpRight, tone: "text-success-fg bg-success-bg", dot: "bg-success" },
  new: { label: "New business", icon: Sparkles, tone: "text-info-fg bg-info-bg", dot: "bg-info" },
};

const REVENUE_KINDS: MovementKind[] = ["churned", "downgraded", "expanded", "new"];
const CHIP_ORDER: MovementKind[] = ["churned", "downgraded", "usage_dormant", "usage_declined", "expanded", "new"];

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

const GROUPS: { key: GroupKey; label: string; kinds: MovementKind[] }[] = [
  { key: "revenue", label: "Revenue moved", kinds: REVENUE_KINDS },
  { key: "warning", label: "Early warnings", kinds: ["usage_dormant", "usage_declined"] },
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
      {/* No <h3> here: the section heading above already says "What changed",
          and repeating it four pixels below was pure duplication. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="eyebrow">Accounts that moved</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* GROUP chips first — they're the two sections below, so the legend
              and the layout finally name the same things. Neutral-toned on
              purpose: they're a level up, not another kind. */}
          {GROUPS.filter((g) => groupCount(g.key) > 0).map((g) => {
            const on = sel === g.key;
            return (
              <Link
                key={g.key}
                href={withKind(params, g.key)}
                scroll={false}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-pill border px-2 py-1 font-body text-[11px] font-semibold transition-all duration-[140ms]",
                  on
                    ? "border-fg/25 bg-bg-inverse text-bg ring-2 ring-fg/15"
                    : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {groupCount(g.key)} {g.label.toLowerCase()}
              </Link>
            );
          })}

          <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />

          {CHIP_ORDER.filter((k) => counts.get(k)).map((k) => {
            const K = KIND[k];
            const on = sel === k;
            return (
              <Link
                key={k}
                href={withKind(params, k)}
                scroll={false}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-pill px-2 py-1 font-body text-[11px] font-semibold transition-all duration-[140ms]",
                  K.tone,
                  on ? "ring-2 ring-fg/20" : "opacity-70 hover:opacity-100",
                )}
              >
                <span className={cn("size-1.5 rounded-pill", K.dot)} />
                {counts.get(k)} {K.label.toLowerCase()}
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
      </div>

      {shown.length === 0 ? (
        <div className="rounded-md bg-bg-subtle px-3 py-6 text-center">
          <p className="caption">Nothing moved in {periodDisplay(period)}.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {revenue.length > 0 && (
            <Group
              title="Revenue moved"
              sub={`booked in ${periodDisplay(period)}`}
              rows={revenue}
              currency={currency}
              expanded={expanded}
              params={params}
              money="delta"
            />
          )}
          {leading.length > 0 && (
            <Group
              // "Leading indicators" was CS-literature jargon — it named the
              // category the metric belongs to rather than what the rows are
              // for. These are accounts to call before the revenue moves.
              title="Early warnings"
              sub={`usage ${monthLabel(usageMonth)} vs the month before · revenue hasn't moved yet`}
              rows={leading}
              currency={currency}
              expanded={expanded}
              params={params}
              money="stake"
            />
          )}
        </div>
      )}
    </Card>
  );
}

function Group({
  title,
  sub,
  rows,
  currency,
  expanded,
  params,
  money,
}: {
  title: string;
  sub: string;
  rows: Movement[];
  currency: string;
  expanded: boolean;
  params: Record<string, string | string[] | undefined>;
  /** Which number this group's column carries — one meaning per column, never
   *  both. `delta` is money that HAS moved; `stake` is money exposed. */
  money: "delta" | "stake";
}) {
  const visible = expanded ? rows : rows.slice(0, DEFAULT_LIMIT);
  const hidden = rows.length - visible.length;
  const fmt = (v: number) => formatCurrency(Math.abs(v), currency, { compact: true });

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2 border-b border-border-subtle pb-1.5">
        <span className="font-body text-[12.5px] font-semibold text-fg">{title}</span>
        <span className="caption">{sub}</span>
        <span className="caption tabular ml-auto">{money === "delta" ? "ARR change" : "ARR at stake"}</span>
      </div>

      <ul className="flex flex-col">
        {visible.map((m) => {
          const K = KIND[m.kind];
          const Icon = K.icon;
          return (
            <li key={`${m.client.id}-${m.kind}`} className="flex items-center gap-3 border-b border-border-subtle py-2.5 last:border-0">
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

              {/* Sparkline ONLY where usage is the story. On a revenue row it
                  misleads: history runs past the churn date, so the line climbs
                  while the row says "Churned". */}
              {money === "stake" && m.usage && m.usage.series.length > 1 && (
                <Sparkline
                  data={m.usage.series.map((s) => s.mau)}
                  min={0}
                  width={64}
                  height={22}
                  color="var(--color-danger)"
                  className="hidden shrink-0 sm:block"
                />
              )}

              <span
                className={cn(
                  "tabular w-20 shrink-0 text-right font-body text-sm font-semibold",
                  money === "delta" ? (m.arrDelta > 0 ? "text-success-fg" : "text-danger-fg") : "text-fg-muted",
                )}
              >
                {money === "delta" ? `${m.arrDelta > 0 ? "+" : "−"}${fmt(m.arrDelta)}` : fmt(m.arrAtStake)}
              </span>
            </li>
          );
        })}
      </ul>

      {(hidden > 0 || expanded) && (
        <Link
          href={hidden > 0 ? withExpanded(params, true) : withExpanded(params, false)}
          scroll={false}
          className="mt-2 inline-block font-body text-[12px] font-semibold text-sirius underline-offset-2 hover:underline"
        >
          {hidden > 0 ? `Show ${hidden} more` : "Show fewer"}
        </Link>
      )}
    </div>
  );
}

function monthLabel(ym: string): string {
  const names = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${names[Number(ym.slice(5, 7))] ?? ym} ${ym.slice(0, 4)}`;
}
