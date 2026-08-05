/* =========================================================================
   Support metrics derived from the ticket list.

   The bug these replace: Incident Burden and Aged & Reopened were declared in
   the model, fed by nothing, and fell through to default_score 100 — so every
   account scored a perfect Support mark on zero observations. The tests below
   pin the distinction that makes the fix a fix: an ABSENT ticket list means we
   never looked, an EMPTY one means we looked and found nothing.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAccountFacts, type SupportTicketFact } from "./facts";

const NOW = new Date("2026-08-03T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const facts = (support: unknown) =>
  buildAccountFacts({ clientId: "c1", status: "active", support: support as never }, NOW).metrics;

const ticket = (o: Partial<SupportTicketFact>): SupportTicketFact => ({
  state: "closed", priority: "P3", createdAt: daysAgo(1), slaBreaches: [], ...o,
});

test("no ticket list at all feeds nothing — we never looked", () => {
  const m = facts({ csat: null, csatResponses: 0 });
  for (const k of ["active_critical_incidents", "aged_or_reopened_tickets", "eligible_resolved_tickets"]) {
    assert.equal(m[k], undefined, `${k} must be absent, not zero`);
  }
});

test("an EMPTY ticket list is a real reading of zero", () => {
  const m = facts({ tickets: [], supportLevelUsed: "Level 1" });
  assert.equal(m.active_critical_incidents?.value, 0);
  assert.equal(m.aged_or_reopened_tickets?.value, 0);
  assert.equal(m.eligible_resolved_tickets?.value, 0);
});

test("open P1s are active critical incidents; closed ones are not", () => {
  const m = facts({ tickets: [
    ticket({ state: "open", priority: "P1" }),
    ticket({ state: "snoozed", priority: "P1" }),
    ticket({ state: "closed", priority: "P1" }),
    ticket({ state: "open", priority: "P2" }),
  ] });
  assert.equal(m.active_critical_incidents?.value, 2, "open + snoozed count, closed does not");
  assert.equal(m.resolved_high_severity_incidents?.value, 1);
});

test("high-severity tickets age past a fortnight", () => {
  const m = facts({ tickets: [
    ticket({ state: "open", priority: "P1", createdAt: daysAgo(20) }),
    ticket({ state: "open", priority: "P2", createdAt: daysAgo(15) }),
    ticket({ state: "open", priority: "P2", createdAt: daysAgo(3) }),
    ticket({ state: "open", priority: "P3", createdAt: daysAgo(90) }),
  ] });
  assert.equal(m.aged_high_severity_incidents?.value, 2, "P3 never counts, however old");
});

test("SLA is only computed when the account has a support level", () => {
  const tickets = [ticket({ slaBreaches: [{ kind: "resolution" }] }), ticket({})];
  const withLevel = facts({ tickets, supportLevelUsed: "Level 2" });
  assert.equal(withLevel.eligible_resolved_tickets?.value, 2);
  assert.equal(withLevel.tickets_resolved_within_target?.value, 1);

  // No level: the sync leaves every breach list empty, so a clean ticket
  // proves nothing and scoring it 100% on-target would be a fabrication.
  const noLevel = facts({ tickets, supportLevelUsed: null });
  assert.equal(noLevel.eligible_resolved_tickets, undefined);
  assert.equal(noLevel.tickets_resolved_within_target, undefined);
});

test("a response-kind breach does not count against resolution SLA", () => {
  const m = facts({
    tickets: [ticket({ slaBreaches: [{ kind: "response" }] })],
    supportLevelUsed: "Level 1",
  });
  assert.equal(m.tickets_resolved_within_target?.value, 1, "only resolution breaches miss the target");
});

test("aged tickets count past a month, whatever their priority", () => {
  const m = facts({ tickets: [
    ticket({ state: "open", createdAt: daysAgo(40) }),
    ticket({ state: "open", createdAt: daysAgo(31) }),
    ticket({ state: "open", createdAt: daysAgo(10) }),
    ticket({ state: "closed", createdAt: daysAgo(400) }),
  ] });
  assert.equal(m.aged_or_reopened_tickets?.value, 2, "closed tickets never age");
});
