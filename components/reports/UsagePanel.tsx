import { Activity, AlertCircle, MoonStar, Users } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { UsageRollup } from "@/lib/metrics/exec";
import type { UsageTier } from "@/lib/usage/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/cn";

/* Portfolio product usage.
   Renders the "as of" stamp and the coverage line prominently on purpose: this
   panel is the one block on the page that does NOT move with the period
   selector (there is no usage history in Postgres — see UsageRollup's note 1),
   and a reader who assumes otherwise would misread every number in it. */

const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/* Keyed by UsageTier rather than `string`, so adding a tier to the union is a
   compile error here instead of a silent fall-through to grey. The four values
   are the real ones the adoption scorer emits (lib/usage/types.ts:72) — the
   live book currently splits 28 growing / 14 at_risk / 6 dormant / 3 thriving. */
const TIER_TONE: Record<UsageTier, "aurora" | "stellar" | "nova"> = {
  thriving: "aurora",
  growing: "aurora",
  at_risk: "stellar",
  dormant: "nova",
};

const TIER_LABEL: Record<UsageTier, string> = {
  thriving: "thriving",
  growing: "growing",
  at_risk: "at risk",
  dormant: "dormant",
};

export function UsagePanel({ usage }: { usage: UsageRollup }) {
  const total = usage.covered + usage.unlinked + usage.errored;
  const seatSkew = usage.seatsConcentration && usage.seatsConcentration.share > 0.4;

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <CardEyebrow>Product usage · live book</CardEyebrow>
          <h3 className="h5">Adoption across accounts</h3>
        </div>
        <div className="text-right">
          <div className="caption">synced {ago(usage.newestFetch)}</div>
          <div className="caption text-fg-subtle">
            {usage.covered} of {total} accounts linked
          </div>
        </div>
      </div>

      {/* The honesty line. This panel ignores the period selector. */}
      <p className="caption mb-4 rounded-md bg-bg-subtle px-3 py-2">
        Point-in-time, not period-scoped — usage snapshots are overwritten on each sync, so there is no history to
        report against a quarter. These figures follow the filters above but always describe <em>now</em>.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric
          icon={Users}
          label="Monthly actives"
          value={formatNumber(usage.mau)}
          sub={`${formatNumber(usage.wau)} weekly`}
          tone="accent"
        />
        <Metric
          icon={Activity}
          label="Stickiness"
          value={pct(usage.stickiness)}
          sub="of monthly, active weekly"
          tone={usage.stickiness != null && usage.stickiness >= 0.4 ? "good" : "warn"}
        />
        <Metric
          icon={Users}
          label="Activation"
          value={pct(usage.activationVsUsers)}
          sub={`${formatNumber(usage.provisionedUsers)} provisioned users`}
          tone={usage.activationVsUsers != null && usage.activationVsUsers >= 0.3 ? "good" : "warn"}
        />
        <Metric
          icon={MoonStar}
          label="Dormant accounts"
          value={String(usage.dormant)}
          sub="zero monthly actives"
          tone={usage.dormant > 0 ? "warn" : "good"}
        />
      </div>

      {usage.adoptionTiers.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
          <span className="caption mr-1">Adoption tier</span>
          {usage.adoptionTiers.map((t) => (
            <Badge key={t.tier} tone={TIER_TONE[t.tier] ?? "neutral"}>
              {t.count} {TIER_LABEL[t.tier] ?? t.tier}
            </Badge>
          ))}
          {usage.avgAdoption != null && (
            <span className="caption tabular ml-auto">
              avg score <span className="font-semibold text-fg">{usage.avgAdoption}</span>
            </span>
          )}
        </div>
      )}

      {/* Concentration + seat-entitlement caveats — the two things that would
          otherwise turn these numbers into a bad board slide. */}
      <div className="mt-4 flex flex-col gap-2">
        {usage.mauConcentration && usage.mauConcentration.share > 0.25 && (
          <Note tone="info">
            <strong className="font-semibold">{usage.mauConcentration.name}</strong> is{" "}
            {pct(usage.mauConcentration.share)} of all monthly actives — the book&apos;s usage is concentrated in one
            account.
          </Note>
        )}
        {seatSkew && usage.seatsConcentration && (
          <Note tone="warn">
            Seat-based activation reads {pct(usage.activationVsSeats)}, but{" "}
            <strong className="font-semibold">{usage.seatsConcentration.name}</strong> alone holds{" "}
            {pct(usage.seatsConcentration.share)} of the {formatNumber(usage.seats)} licensed seats. Seats are a
            purchased entitlement, not provisioned users — the activation figure above uses real users instead.
          </Note>
        )}
        {usage.errored > 0 && (
          <Note tone="warn">
            {usage.errored} account{usage.errored === 1 ? "" : "s"} failed their last usage sync — broken, not idle.
          </Note>
        )}
        {usage.unlinked > 0 && (
          <Note tone="neutral">
            {usage.unlinked} account{usage.unlinked === 1 ? " has" : "s have"} no Metabase environment linked, so they
            contribute nothing above.
          </Note>
        )}
      </div>
    </Card>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  sub: string;
  tone: "good" | "warn" | "accent";
}) {
  const chip =
    tone === "good" ? "bg-success-bg text-success-fg" : tone === "warn" ? "bg-warning-bg text-warning-fg" : "bg-info-bg text-info-fg";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={cn("grid size-6 shrink-0 place-items-center rounded", chip)}>
          <Icon size={13} strokeWidth={2} />
        </span>
        <span className="eyebrow">{label}</span>
      </div>
      <span className="tabular font-display text-2xl font-bold leading-none tracking-tight text-fg">{value}</span>
      <span className="caption">{sub}</span>
    </div>
  );
}

function Note({ tone, children }: { tone: "info" | "warn" | "neutral"; children: React.ReactNode }) {
  const styles =
    tone === "warn"
      ? "border-warning-bg bg-warning-bg/50 text-warning-fg"
      : tone === "info"
        ? "border-info-bg bg-info-bg/50 text-info-fg"
        : "border-border-subtle bg-bg-subtle text-fg-muted";
  return (
    <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2", styles)}>
      <AlertCircle size={13} strokeWidth={2} className="mt-[3px] shrink-0" aria-hidden />
      <p className="font-body text-[12px] leading-relaxed">{children}</p>
    </div>
  );
}
