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

   There are two states, not five. Draft / In review / Published / Archived
   describes a publishing workflow this team does not run, and a status nobody
   maintains decays into noise — everything sits on whatever it was created as
   and the field stops meaning anything. Either it has been described or it
   hasn't, which is a fact the app can determine for itself and can never be
   wrong about.
   ========================================================================= */

import { completeness, type UseCaseEntry } from "@/lib/use-case-library";

export const DEFINITION_STATUSES = ["needs_definition", "described"] as const;
export type DefinitionStatus = (typeof DEFINITION_STATUSES)[number];

export const STATUS_LABEL: Record<DefinitionStatus, string> = {
  needs_definition: "Needs a description",
  described: "Described",
};

export const STATUS_HELP: Record<DefinitionStatus, string> = {
  needs_definition: "Nobody has written what this is yet, so it can't be used consistently across the team.",
  described: "Someone has written what this is.",
};

/** Colour SUPPORTS the label and never replaces it — every consumer renders
 *  STATUS_LABEL alongside these. */
export const STATUS_TONE: Record<DefinitionStatus, string> = {
  needs_definition: "border-border bg-bg-muted text-fg-subtle",
  described: "border-[#1F9D63]/25 bg-[#1F9D63]/10 text-[#1F9D63]",
};

/** Derived, never stored: whether anything has been written. Nothing to keep
 *  up to date, and nothing that can drift out of step with reality. */
export function definitionStatus(entry: UseCaseEntry | undefined): DefinitionStatus {
  return !entry || completeness(entry) === 0 ? "needs_definition" : "described";
}
