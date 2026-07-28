/* =========================================================================
   Definition status — every state named, none inferred from a colour.

   The page previously carried a single amber dot whose meaning lived in a
   `title` attribute: it marked a use case sitting outside the published 23.
   Two problems. A tooltip is not a label — it is invisible on touch, to
   keyboards, and to anyone scanning. And one indicator was doing the work of
   two unrelated facts: whether an entry is part of the published taxonomy, and
   whether anyone has written its definition.

   Those are separated here. `DefinitionStatus` is about the WRITING; the
   taxonomy's own `unresolved` flag stays where it is and is rendered as its own
   labelled chip. Both are always text, never colour alone (WCAG 1.4.1).

   Status is explicit where the team has set it and derived otherwise, so the
   library is honest on day one — before anybody has touched a single entry —
   rather than showing 28 things as "Draft" because a field defaulted.
   ========================================================================= */

import { completeness, type UseCaseEntry } from "@/lib/use-case-library";

export const DEFINITION_STATUSES = ["needs_definition", "draft", "in_review", "published", "archived"] as const;
export type DefinitionStatus = (typeof DEFINITION_STATUSES)[number];

export const STATUS_LABEL: Record<DefinitionStatus, string> = {
  needs_definition: "Needs definition",
  draft: "Draft",
  in_review: "In review",
  published: "Published",
  archived: "Archived",
};

/** Wording is deliberately plain: a status a CSM has to decode is a status
 *  they will ignore. */
export const STATUS_HELP: Record<DefinitionStatus, string> = {
  needs_definition: "Nobody has written what this is yet, so it can't be used consistently across the team.",
  draft: "Being written. Usable, but not agreed.",
  in_review: "Written and waiting for someone to check it.",
  published: "Agreed. Safe to rely on with a client.",
  archived: "No longer offered. Kept because accounts still reference it.",
};

/** Tailwind classes per status. Colour SUPPORTS the label; it never replaces
 *  it, so every consumer renders STATUS_LABEL alongside these. */
export const STATUS_TONE: Record<DefinitionStatus, string> = {
  needs_definition: "border-border bg-bg-muted text-fg-subtle",
  draft: "border-[#C99A14]/30 bg-[#8A6D12]/5 text-[#8A6D12]",
  in_review: "border-sirius/30 bg-accent-soft text-sirius",
  published: "border-[#1F9D63]/25 bg-[#1F9D63]/10 text-[#1F9D63]",
  archived: "border-border bg-bg-muted text-fg-subtle",
};

/**
 * The status to show.
 *
 * An explicitly-set status wins. Otherwise it is derived from what has actually
 * been written, so nothing is ever presented as further along than it is:
 * nothing written reads "Needs definition", not "Draft".
 */
export function definitionStatus(entry: UseCaseEntry | undefined, explicit?: string | null): DefinitionStatus {
  if (explicit && (DEFINITION_STATUSES as readonly string[]).includes(explicit)) return explicit as DefinitionStatus;
  if (!entry || completeness(entry) === 0) return "needs_definition";
  return "draft";
}

/** What the minimum publishable definition requires, and what is missing from
 *  this one. Returned as prose the UI shows verbatim — the spec is explicit
 *  that a bare percentage explains nothing. */
export function publishBlockers(entry: UseCaseEntry | undefined): string[] {
  const missing: string[] = [];
  if (!entry?.goal) missing.push("the goal");
  if (!entry?.soundsLike.length) missing.push("how a client describes it");
  if (!entry?.delivers.length) missing.push("what we deliver");
  if (!entry?.modules.length) missing.push("at least one module");
  return missing;
}

/** e.g. "Definition 60% complete · missing what we deliver and at least one
 *  module". Percentage plus the actual gap, never the percentage alone. */
export function completenessLabel(entry: UseCaseEntry | undefined): string {
  const pct = Math.round(completeness(entry) * 100);
  const missing = publishBlockers(entry);
  if (!missing.length) return `Definition ${pct}% complete`;
  const list = missing.length === 1
    ? missing[0]
    : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Definition ${pct}% complete · missing ${list}`;
}
