import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { TrendingDown, TrendingUp } from "lucide-react";
import { getClients, getDowngrades, getPortfolioSummary, getRetention } from "@/lib/data";
import { formatCurrency, signed } from "@/lib/format";

export const metadata = { title: "Reports · Lumofy CS" };

export default async function ReportsPage() {
  const [retention, downgradeList, clients, portfolio] = await Promise.all([
    getRetention(),
    getDowngrades(),
    getClients(),
    getPortfolioSummary(),
  ]);

  const currency = portfolio.currency;
  const churned = clients.filter((c) => c.status === "churned");
  const grossChurnPct = retention.startingArr ? ((retention.churn + retention.contraction) / retention.startingArr) * 100 : 0;
  const logoRetention = retention.logoCount ? ((retention.logoCount - retention.logoChurnCount) / retention.logoCount) * 100 : 0;

  return (
    <div className="flex flex-col gap-7 p-8">
      <PageHeader
        eyebrow={`Retention · ${retention.period}`}
        title="Management reports"
        description="Net & gross revenue retention, churn, and downgrades across the ARR base. The numbers your leadership asks for."
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Net revenue retention"
          value={`${retention.nrr}%`}
          delta={signed(Math.round((retention.nrr - 100) * 10) / 10, "%")}
          deltaTone={retention.nrr >= 100 ? "up" : "down"}
          accent={retention.nrr >= 100 ? "aurora" : "nova"}
          icon={retention.nrr >= 100 ? TrendingUp : TrendingDown}
          sub="incl. expansion"
        />
        <StatCard
          label="Gross revenue retention"
          value={`${retention.grr}%`}
          accent={retention.grr >= 90 ? "aurora" : "stellar"}
          sub="excl. expansion"
        />
        <StatCard
          label="Gross ARR churn"
          value={`${grossChurnPct.toFixed(1)}%`}
          accent="nova"
          sub={`${formatCurrency(retention.churn + retention.contraction, currency, { compact: true })} lost`}
        />
        <StatCard
          label="Logo retention"
          value={`${logoRetention.toFixed(1)}%`}
          accent={logoRetention >= 90 ? "aurora" : "stellar"}
          sub={`${retention.logoChurnCount} of ${retention.logoCount} churned`}
        />
      </div>

      {/* Revenue bridge */}
      <Card>
        <CardEyebrow>Revenue bridge · {retention.period}</CardEyebrow>
        <div className="mt-2 grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Bridge retention={retention} currency={currency} />
          <div className="flex flex-col justify-center gap-2.5 border-t border-border-subtle pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <BridgeRow label="Starting ARR" value={formatCurrency(retention.startingArr, currency)} />
            <BridgeRow label="+ Expansion" value={formatCurrency(retention.expansion, currency)} tone="up" />
            <BridgeRow label="− Contraction" value={formatCurrency(retention.contraction, currency)} tone="down" />
            <BridgeRow label="− Churn" value={formatCurrency(retention.churn, currency)} tone="down" />
            <div className="mt-1 border-t border-border pt-2.5">
              <BridgeRow label="Ending ARR" value={formatCurrency(retention.endingArr, currency)} strong />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Downgrades */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <CardEyebrow>Contraction</CardEyebrow>
              <h3 className="h5">Downgrades</h3>
            </div>
            <Badge tone="stellar">{downgradeList.length}</Badge>
          </div>
          {downgradeList.length === 0 ? (
            <p className="caption">No downgrades this period.</p>
          ) : (
            <ul className="flex flex-col">
              {downgradeList.map(({ client, delta }) => (
                <li key={client.id} className="flex items-center justify-between border-b border-border-subtle py-2.5 last:border-0">
                  <Link href={`/clients/${client.id}`} className="font-body text-sm font-semibold text-fg hover:text-sirius">
                    {client.name}
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="caption tabular">
                      {formatCurrency(client.previousArr, currency, { compact: true })} → {formatCurrency(client.arr, currency, { compact: true })}
                    </span>
                    <span className="tabular font-body text-sm font-semibold text-[#B23A57]">
                      {formatCurrency(delta, currency, { compact: true })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Churn */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <CardEyebrow>Lost accounts</CardEyebrow>
              <h3 className="h5">Churn</h3>
            </div>
            <Badge tone="nova">{churned.length}</Badge>
          </div>
          {churned.length === 0 ? (
            <p className="caption">No churned accounts this period.</p>
          ) : (
            <ul className="flex flex-col">
              {churned.map((client) => (
                <li key={client.id} className="flex items-center justify-between border-b border-border-subtle py-2.5 last:border-0">
                  <Link href={`/clients/${client.id}`} className="font-body text-sm font-semibold text-fg hover:text-sirius">
                    {client.name}
                  </Link>
                  <div className="flex items-center gap-3">
                    <span className="caption">{client.csm?.name ?? "Unassigned"}</span>
                    <span className="tabular font-body text-sm font-semibold text-[#B23A57]">
                      −{formatCurrency(client.previousArr, currency, { compact: true })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function Bridge({ retention, currency }: { retention: Awaited<ReturnType<typeof getRetention>>; currency: string }) {
  const max = Math.max(retention.startingArr, retention.endingArr) || 1;
  const bar = (v: number) => `${Math.max(2, (v / max) * 100)}%`;
  return (
    <div className="flex flex-col justify-center gap-3">
      <BarLine label="Starting" value={retention.startingArr} width={bar(retention.startingArr)} color="var(--color-neutral-400)" currency={currency} />
      <BarLine label="Expansion" value={retention.expansion} width={bar(retention.expansion)} color="#2DB47A" currency={currency} sign="+" />
      <BarLine label="Contraction" value={retention.contraction} width={bar(retention.contraction)} color="#C99A14" currency={currency} sign="−" />
      <BarLine label="Churn" value={retention.churn} width={bar(retention.churn)} color="#D14B6B" currency={currency} sign="−" />
      <BarLine label="Ending" value={retention.endingArr} width={bar(retention.endingArr)} color="var(--color-sirius)" currency={currency} />
    </div>
  );
}

function BarLine({
  label,
  value,
  width,
  color,
  currency,
  sign = "",
}: {
  label: string;
  value: number;
  width: string;
  color: string;
  currency: string;
  sign?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 font-body text-[13px] text-fg-muted">{label}</span>
      <div className="flex-1">
        <div className="h-5 rounded-sm" style={{ width, background: color }} />
      </div>
      <span className="tabular w-24 shrink-0 text-right font-body text-[13px] font-semibold text-fg">
        {sign}
        {formatCurrency(value, currency, { compact: true })}
      </span>
    </div>
  );
}

function BridgeRow({ label, value, tone, strong }: { label: string; value: string; tone?: "up" | "down"; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`font-body text-[13px] ${strong ? "font-semibold text-fg" : "text-fg-muted"}`}>{label}</span>
      <span
        className={`tabular font-body text-sm font-semibold ${tone === "up" ? "text-[#1E8F61]" : tone === "down" ? "text-[#B23A57]" : "text-fg"} ${strong ? "text-base" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}
