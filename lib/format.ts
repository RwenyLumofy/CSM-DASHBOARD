import { formatDistanceToNowStrict, parseISO } from "date-fns";

export function formatCurrency(value: number, currency = "USD", opts: { compact?: boolean } = {}): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : 0,
  }).format(value);
}

export function formatNumber(value: number, opts: { compact?: boolean } = {}): string {
  return new Intl.NumberFormat("en-US", {
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : 0,
  }).format(value);
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${value.toFixed(fractionDigits)}%`;
}

/** value is a 0–1 ratio. */
export function formatRatioPercent(ratio: number, fractionDigits = 0): string {
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}

/* timeZone is PINNED to UTC, and that is load-bearing twice over.

   Correctness: every value that reaches here is a calendar date, not a moment
   — a renewal date, a contract close date, a delivery date. They are stored
   in timestamptz columns at 00:00:00Z, so rendering them in the reader's own
   zone slides them a day backwards for anyone west of UTC: a renewal on
   1 Oct reads "30 Sep" in New York. The stored day IS the answer; the
   viewer's clock has no bearing on when a contract renews.

   Hydration: without the pin, the runtime's zone decides the output — UTC on
   the server, the reader's zone in the browser — so the two passes disagree
   whenever the local date differs, and React reports a mismatch. Several
   callers render in the SSR pass (ClientsTable's renewal column,
   ClientHeaderCard, the General tab's date fields), so this was a live
   mismatch, not a theoretical one.

   This is deliberately NOT the fix used for now-relative or wall-clock text
   (see the mount gate in components/notifications/NotificationsCentre.tsx).
   There, pinning UTC would agree on a value that is wrong for the reader —
   a 23:00 UTC event is not "today" in Riyadh. Here, pinning UTC agrees on the
   value that is right. lib/today/format.ts pins UTC for the same reason. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parseISO(iso));
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return `${formatDistanceToNowStrict(parseISO(iso))} ago`;
  } catch {
    return "—";
  }
}

export function signed(value: number, suffix = ""): string {
  const s = value > 0 ? "+" : "";
  return `${s}${value}${suffix}`;
}
