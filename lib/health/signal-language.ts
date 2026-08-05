/* =========================================================================
   Health signals, in a CSM's language.

   The profile listed component names and numbers. "Completion and Outcomes 52"
   tells you nothing about what was measured or what to do — and the CS Pulse
   rows showed a bare 40 for a rating the CSM entered themselves as "Weak".

   Two things live here, both written once and keyed by id rather than
   generated per account, because per-account prose means inventing advice:

     MEANING  one sentence per signal, saying what it measures
     REMEDY   per gate/rule, what actually clears it

   Keyed to the engine's own ids. A signal with no entry falls back to showing
   just its number, which is what the whole card used to do.
   ========================================================================= */

/** What each signal measures, in the second person where the CSM owns it. */
export const SIGNAL_MEANING: Record<string, string> = {
  // Product adoption
  product: "What they actually do in the product. Half the score, and an account with none of it can't be scored at all.",
  reach: "Of the seats they pay for, how many people actually use the platform.",
  progress: "Of the learning people are enrolled in, how much is being completed.",
  outcomes: "Of the structured pathways people start, how many they finish.",
  breadth: "How many distinct use cases the account runs. One use case is fragile — a single budget review can end it.",

  // CS Pulse — the CSM's own ratings
  pulse: "Your monthly read on the relationship. The only judgement in the model.",
  stakeholder: "Your read on whether we know enough people — champion, buyer, admins — or lean on one.",
  engagement: "Whether the customer shows up and the success plan actually moves.",
  renewal: "How confident you are they'll renew — value realised, budget secure, no competitor circling.",

  // Support
  support: "How support has gone: SLA attainment, incidents, ageing tickets and satisfaction.",
  sla: "Of the support tickets we closed, how many met their resolution target.",
  incidents: "Critical and high-severity incidents — open ones hurt most.",
  aged: "Tickets left sitting open a long time.",
  ticket_sat: "Of the support conversations they rated, how many were positive.",

  sentiment: "Survey NPS, rescaled to 0–100. Above 50 means more promoters than detractors.",
};

/**
 * What actually clears a failed gate or a fired rule.
 *
 * Keyed by RULE ID, not by the sentence. Every threshold and every reason
 * sentence in the model is editable in Settings → Client health, so retuning
 * "CS Pulse ≥ 75" to 70 rewrites the reason text — a text-keyed remedy would
 * go quietly blank at exactly the moment somebody was tuning the model. Ids
 * are stable. (Text keys stay below as a fallback for health rows scored
 * before `reasonDetails` was stored.)
 */
export const REMEDY_BY_RULE: Record<string, string> = {
  // Healthy qualification gates — each one caps an otherwise-Healthy account.
  q_product: "Adoption is the biggest half of the score. Lift reach, progress or outcomes — open Product Adoption below to see which is lowest.",
  q_pulse: "Your own pulse ratings are what hold this back. Raise them honestly as the relationship improves, or leave them and work the underlying problem.",
  q_coverage: "Too little data to call it Healthy. Usually a missing pulse or no usage sync — fill the gaps and it re-scores.",
  q_multithreaded: "Get a second real relationship into the account, then clear the single-threaded flag on the next pulse.",
  q_pulse_valid: "No valid pulse on record. Complete one — an account can't be called Healthy on usage alone.",

  // Replacement and force-Critical rules.
  r_churned: "The relationship has ended. Record the churn reason so it counts in the churn analysis.",
  r_termination_notice: "Notice is in. Anything still winnable happens now, with the buyer, not the champion.",
  r_imminent_churn: "You logged imminent churn. Escalate today — this is not a next-QBR problem.",
  r_exec_escalation: "An executive escalation is open and unresolved. Close the loop with them personally, then clear the flag.",

  // Cap At Risk.
  r_critical_incident: "A critical incident is open. Get it resolved, then confirm with the customer that it landed.",
  r_negative_renewal: "You flagged negative renewal intent. This needs a save plan, not a check-in.",
  r_suspension: "They asked to suspend. Find out what would make them stay before the date lands.",
  r_scope_reduction: "They asked to cut scope. Understand what stopped delivering value before you agree the number.",
  r_no_activity_60: "Nothing meaningful has happened in the product for 60 days after launch. Re-run onboarding with the people who were meant to use it.",
  r_pulse_below_60: "Your pulse rates this relationship poorly across the board. Pick the weakest dimension below and work that one.",
  r_competitor: "A competitor is in an active replacement process — this is a save, and it needs help now.",

  // Cap Watch.
  r_low_adoption: "Adoption is under the bar. Open Product Adoption below — the lowest signal there is where to start.",
  r_single_threaded: "Get a second real relationship into the account, then clear the single-threaded flag on the next pulse.",
  r_no_sponsor: "Identify who signs the renewal and get a conversation with them.",
  r_champion_left: "Rebuild a champion before the renewal conversation starts.",
  r_renewal_eb_unknown: "Renewal is close and nobody has named the buyer — find them this month.",
};

/** Fallback for rows stored before rule ids were kept. Same sentences, keyed by
 *  the model's shipped default wording. */
export const REMEDY_BY_REASON: Record<string, string> = {
  "Account is single-threaded": REMEDY_BY_RULE.q_multithreaded,
  "No credible sponsor or economic-buyer access": REMEDY_BY_RULE.r_no_sponsor,
  "Renewal within 90 days and the economic buyer is unknown": REMEDY_BY_RULE.r_renewal_eb_unknown,
  "Champion has left without a replacement": REMEDY_BY_RULE.r_champion_left,
  "Renewal intent is explicitly negative": REMEDY_BY_RULE.r_negative_renewal,
  "A credible competitive replacement process is underway": REMEDY_BY_RULE.r_competitor,
  "CS Pulse below the Healthy minimum of 75": REMEDY_BY_RULE.q_pulse,
  "Product Adoption below the Healthy minimum of 65": REMEDY_BY_RULE.q_product,
  "Data Coverage below the Healthy minimum of 85%": REMEDY_BY_RULE.q_coverage,
  "No valid CS Pulse review on record": REMEDY_BY_RULE.q_pulse_valid,
  "Product Adoption score is below 65": REMEDY_BY_RULE.r_low_adoption,
  "Customer Success Pulse score is below 60": REMEDY_BY_RULE.r_pulse_below_60,
  "Active critical incident": REMEDY_BY_RULE.r_critical_incident,
  "Client requested suspension": REMEDY_BY_RULE.r_suspension,
  "Client requested a material scope reduction": REMEDY_BY_RULE.r_scope_reduction,
  "No meaningful product activity for 60 days after launch": REMEDY_BY_RULE.r_no_activity_60,
};

/** The prefix used when a signal is one of the CSM's own pulse ratings, so the
 *  card can say "You rated this Weak" rather than showing a bare 40. */
export const PULSE_RATED_IDS = new Set(["stakeholder", "engagement", "renewal"]);

/**
 * One line of evidence beneath a signal, built from the metrics the engine
 * actually read. Returns null when there is nothing worth saying — better a
 * blank than a fabricated "0 of 0".
 */
export function describeEvidence(
  id: string,
  ev: { key: string; value: number | null; numerator?: number | null; denominator?: number | null }[] | undefined,
  pulseLabel?: string | null,
): string | null {
  if (PULSE_RATED_IDS.has(id)) return pulseLabel ? `You rated this ${pulseLabel}` : null;
  if (!ev?.length) return null;
  const n = (x: number) => Math.round(x).toLocaleString("en-US");

  // A ratio reads best as "a of b" — the engine stores both sides.
  const [num, den] = ev;
  if (num?.value != null && den?.value != null && den.value > 0) {
    switch (id) {
      case "reach": return `${n(num.value)} of ${n(den.value)} seats active`;
      case "progress": return `${n(num.value)} of ${n(den.value)} enrolments completed`;
      case "outcomes": return `${n(num.value)} of ${n(den.value)} pathway enrolments completed`;
      case "sla": return `${n(num.value)} of ${n(den.value)} closed tickets met their target`;
      case "ticket_sat": return `${n(num.value)} of ${n(den.value)} rated conversations were positive`;
      default: return `${n(num.value)} of ${n(den.value)}`;
    }
  }

  if (id === "breadth") {
    const v = ev.find((e) => e.key === "live_use_cases")?.value;
    return v == null ? null : `${n(v)} use case${v === 1 ? "" : "s"} live`;
  }
  if (id === "sentiment") {
    const v = ev.find((e) => e.key === "sentiment_nps")?.value;
    // Stored normalised to 0–100; show the NPS the survey actually returned.
    return v == null ? null : `NPS ${Math.round(v * 2 - 100) > 0 ? "+" : ""}${Math.round(v * 2 - 100)}`;
  }
  if (id === "incidents" || id === "aged") {
    /* Counts, not ratios. Each needs its own sentence — "1 resolved high
       severity incidents" is what key-mangling produces, and it reads as a
       problem when it is the opposite. Only non-zero counts are listed; all
       zeroes is the good case and says so. */
    const parts = ev
      .filter((e) => e.value != null && e.value > 0)
      .map((e) => {
        const c = n(e.value!);
        const s = e.value === 1 ? "" : "s";
        switch (e.key) {
          case "active_critical_incidents": return `${c} critical incident${s} open now`;
          case "aged_high_severity_incidents": return `${c} high-severity incident${s} still open past target`;
          case "resolved_high_severity_incidents": return `${c} high-severity incident${s} resolved`;
          case "aged_or_reopened_tickets": return `${c} ticket${s} aged or reopened`;
          default: return `${c} ${e.key.replace(/_/g, " ")}`;
        }
      });
    return parts.length ? parts.join(" · ") : "nothing outstanding";
  }
  return null;
}
