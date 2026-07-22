/* =========================================================================
   Today page — analytics hooks. The project has no analytics library, so this
   is a typed placeholder: a single `track()` entry point with a closed event
   union. Swap the implementation for the real transport later without touching
   call sites. Never throws; safe to call from anywhere.
   ========================================================================= */

export type TodayAnalyticsEvent =
  | "today_viewed"
  | "scope_changed"
  | "date_changed"
  | "historical_mode_entered"
  | "historical_comparison_selected"
  | "summary_card_opened"
  | "priority_opened"
  | "signal_evidence_viewed"
  | "account_drawer_opened"
  | "action_created"
  | "action_completed"
  | "action_outcome_recorded"
  | "signal_accepted"
  | "signal_dismissed"
  | "signal_snoozed"
  | "opportunity_created"
  | "commitment_opened"
  | "pattern_opened"
  | "account_mention_selected"
  | "user_mention_selected"
  | "page_mention_selected"
  | "user_profile_opened"
  | "signal_page_created"
  | "signal_page_opened"
  | "ask_signal_submitted"
  | "return_to_today";

/** Fire-and-forget analytics. Replace the body with the real transport. */
export function track(event: TodayAnalyticsEvent, props: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  // Placeholder: structured console breadcrumb until a transport exists.
  // eslint-disable-next-line no-console
  if (process.env.NODE_ENV !== "production") console.debug("[analytics]", event, props);
}
