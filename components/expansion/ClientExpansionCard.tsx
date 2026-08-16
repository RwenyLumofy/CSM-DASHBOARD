import Link from "next/link";
import { attention } from "@/lib/expansion/attention";
import { money, moneyFull } from "@/lib/expansion/format";
import { STAGE_LABEL, type Opportunity } from "@/lib/expansion/types";
import { cn } from "@/lib/cn";

/* =========================================================================
   The account's expansion, on the client profile.

   Deliberately a SUMMARY and a list of links, not a second board: the profile
   answers "what is happening on this account", and the place to work an
   opportunity is /expansion. Both directions link, so neither surface is a
   dead end.

   The attention state on each row is read from attention() — the same function
   the board's count and the Action list use. There is no second rule here, and
   there must never be one.
   ========================================================================= */

const TONE: Record<string, string> = {
  danger: "text-danger-fg",
  warning: "text-warning-fg",
  info: "text-info-fg",
  muted: "text-fg-subtle",
  subtle: "text-fg-subtle",
};

export function ClientExpansionCard({ clientId, opportunities, today, canWrite }: {
  clientId: string;
  opportunities: Opportunity[];
  today: string;
  canWrite: boolean;
}) {
  const open = opportunities.filter((o) => o.outcome === null);
  const won = opportunities.filter((o) => o.outcome === "won");
  const openArr = open.reduce((s, o) => s + (o.expectedArr ?? 0), 0);
  const wonArr = won.reduce((s, o) => s + (o.finalArr ?? 0), 0);
  const needs = open.filter((o) => attention(o, today).needs).length;
  const currency = opportunities[0]?.currency ?? "USD";

  return (
    <section className="rounded-xl border border-border bg-surface px-5 py-4">
      <div className="flex items-baseline gap-3">
        <h2 className="font-body text-[13px] font-semibold text-fg">Expansion</h2>
        {needs > 0 && (
          <span className="rounded border border-danger/30 bg-danger-bg px-1.5 py-0.5 text-[10px] font-medium text-danger-fg">
            {needs} needs attention
          </span>
        )}
        <Link href={`/expansion?account=${clientId}`}
          className="ml-auto text-[11.5px] font-medium text-accent hover:underline">
          {canWrite ? "Add opportunity →" : "Open the board →"}
        </Link>
      </div>

      {!opportunities.length ? (
        <p className="mt-2 text-[12.5px] text-fg-muted">
          No expansion opportunities recorded on this account.
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <Stat n={String(open.length)} label="open" />
            <Stat n={moneyFull(openArr, currency)} label="open ARR" />
            {won.length > 0 && <Stat n={moneyFull(wonArr, currency)} label="won" tone="text-success-fg" />}
          </div>

          <ul className="mt-3 divide-y divide-border-subtle border-t border-border-subtle">
            {opportunities.map((o) => {
              const a = attention(o, today);
              return (
                <li key={o.id}>
                  <Link href="/expansion" className="flex items-baseline gap-3 py-2 hover:bg-bg-subtle">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{o.name}</span>
                    <span className="shrink-0 text-[11px] text-fg-subtle">
                      {o.outcome ? o.outcome : STAGE_LABEL[o.stage]}
                    </span>
                    <span className="shrink-0 text-[12px] font-medium tabular-nums text-fg">
                      {money(o.outcome === "won" ? o.finalArr : o.expectedArr, o.currency)}
                      {o.outcome && o.outcome !== "won" && o.expectedArr != null && (
                        <span className="ml-1 text-[10px] font-normal text-fg-subtle">potential</span>
                      )}
                    </span>
                    <span className={cn("w-[104px] shrink-0 truncate text-right text-[11px]", TONE[a.tone])}>
                      {a.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function Stat({ n, label, tone }: { n: string; label: string; tone?: string }) {
  return (
    <span className="whitespace-nowrap text-[12px]">
      <span className={cn("font-semibold tabular-nums", tone ?? "text-fg")}>{n}</span>{" "}
      <span className="text-fg-subtle">{label}</span>
    </span>
  );
}
