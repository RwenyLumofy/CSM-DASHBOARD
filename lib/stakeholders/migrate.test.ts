/* =========================================================================
   The backfill runs against real customer relationships and cannot be undone
   by re-running it differently. Every rule that protects a record a CSM typed,
   or a role they recorded, is pinned here.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { planClientMigration, resolveLegacyRole, legacyKeyFor, type MigrationContact } from "./migrate";
import { MIGRATION_VERSION, normalizeStakeholderProfile, type StakeholderProfile } from "./profile";

const NOW = "2026-08-05T12:00:00.000Z";
const contact = (over: Partial<MigrationContact> & { id: string }): MigrationContact => ({
  firstName: "Ahmed", lastName: "Ali", email: "ahmed@acme.com", jobTitle: "Head of L&D", phone: null, ...over,
});

const plan = (over: Partial<Parameters<typeof planClientMigration>[0]> = {}) =>
  planClientMigration({
    clientId: "c1", clientName: "Acme",
    mappings: [{ type: "Champion", contactIds: ["k1"], staffIds: [] }],
    contacts: [contact({ id: "k1" })],
    existing: [], now: NOW, newId: (seed) => `sh_${seed}`,
    ...over,
  });

test("one legacy mapping becomes one profile carrying that role", () => {
  const p = plan();
  assert.equal(p.created, 1);
  assert.equal(p.upserts.length, 1);
  assert.deepEqual(p.upserts[0].roles, ["champion"]);
  assert.equal(p.upserts[0].contactId, "k1");
  assert.equal(p.rolesPreserved, 1);
});

test("every role a person holds is preserved on one profile, not split across duplicates", () => {
  /* 24 of 79 mapped people hold more than one role. The legacy matrix is
     role-keyed, so they appear in several rows; inverting it must produce ONE
     person with several roles, never several people. */
  const p = plan({
    mappings: [
      { type: "Executive Sponsor", contactIds: ["k1"], staffIds: [] },
      { type: "Champion", contactIds: ["k1"], staffIds: [] },
      { type: "Power User", contactIds: ["k1"], staffIds: [] },
    ],
  });
  assert.equal(p.upserts.length, 1, "one person, one profile");
  assert.deepEqual(p.upserts[0].roles, ["champion", "executive_sponsor", "power_user"]);
  assert.equal(p.rolesPreserved, 3);
});

test("the two roles the old matrix used and the new model lacked are real roles now", () => {
  /* 43 of 107 associations. Folding them into a near-neighbour would have
     silently reinterpreted 40% of the data. */
  assert.equal(resolveLegacyRole("Power User"), "power_user");
  assert.equal(resolveLegacyRole("Gatekeeper"), "gatekeeper");
  assert.equal(resolveLegacyRole("Executive Sponsor"), "executive_sponsor");
  assert.equal(resolveLegacyRole("Decision Maker"), "decision_maker");
});

test("nothing is invented — every graded field stays unassessed", () => {
  /* A migrated Champion showing sentiment "Neutral" reads as a judgement a CSM
     never made, and the coverage rules deliberately tell unknown from neutral. */
  const [p] = plan().upserts;
  assert.equal(p.influence, "unknown");
  assert.equal(p.sentiment, "unknown");
  assert.equal(p.relationshipStrength, "unknown");
  assert.equal(p.engagementStatus, "unknown");
  assert.equal(p.decisionAuthority, "unknown");
  assert.equal(p.preferredChannel, "unknown");
  assert.equal(p.notes, null);
  assert.equal(p.source, "migration");
});

test("re-running produces no duplicates and no writes", () => {
  const first = plan();
  const existing = first.upserts.map((u) => normalizeStakeholderProfile(u)!);
  const second = plan({ existing });
  assert.equal(second.created, 0);
  assert.equal(second.upserts.length, 0, "a second pass must write nothing");
  assert.equal(second.unchanged, 1);
});

test("an existing profile is reconciled, never overwritten", () => {
  const existing: StakeholderProfile[] = [normalizeStakeholderProfile({
    id: "sh_manual", contactId: "k1", firstName: "Ahmed", roles: ["administrator"],
    influence: "high", sentiment: "supportive", notes: "Met at the QBR", ownerEmail: "csm@lumofy.ai",
    createdAt: "2026-01-01T00:00:00.000Z",
  })!];
  const p = plan({ existing });
  assert.equal(p.created, 0);
  assert.equal(p.reconciled, 1);
  const [u] = p.upserts;
  assert.equal(u.id, "sh_manual", "the same record, not a second one");
  assert.deepEqual(u.roles, ["administrator", "champion"], "the legacy role is merged in");
  assert.equal(u.influence, "high", "user-entered values survive");
  assert.equal(u.sentiment, "supportive");
  assert.equal(u.notes, "Met at the QBR");
  assert.equal(u.ownerEmail, "csm@lumofy.ai");
  assert.equal(u.source, "manual", "it stays the record they created");
  assert.equal(u.migration?.reconciledWith, "sh_manual");
});

test("a role the person already has is not added twice", () => {
  const existing = [normalizeStakeholderProfile({ id: "sh_x", contactId: "k1", roles: ["champion"] })!];
  const p = plan({ existing });
  assert.deepEqual(p.upserts[0]?.roles ?? existing[0].roles, ["champion"]);
});

test("an unmapped legacy role is reported, never guessed at", () => {
  const p = plan({ mappings: [{ type: "Chief Vibes Officer", contactIds: ["k1"], staffIds: [] }] });
  assert.equal(p.created, 0);
  assert.equal(p.exceptions.length, 1);
  assert.match(p.exceptions[0].reason, /no equivalent/);
  assert.match(p.exceptions[0].resolution, /STAKEHOLDER_ROLES/);
});

test("a mapping pointing at a contact that no longer exists is an exception", () => {
  const p = plan({ mappings: [{ type: "Champion", contactIds: ["ghost"], staffIds: [] }] });
  assert.equal(p.created, 0);
  assert.equal(p.exceptions.length, 1);
  assert.match(p.exceptions[0].reason, /no longer exists/);
});

test("a contact with no name and no email cannot become a person", () => {
  const p = plan({ contacts: [contact({ id: "k1", firstName: null, lastName: null, email: null })] });
  assert.equal(p.created, 0);
  assert.match(p.exceptions[0].reason, /nothing to identify/);
});

test("client boundaries hold — a contact from another account is never matched", () => {
  /* `contacts` is the account's own list, so a same-email person on a
     different client simply is not in it and lands in exceptions. */
  const p = plan({ contacts: [contact({ id: "other-client-contact" })] });
  assert.equal(p.created, 0);
  assert.equal(p.exceptions.length, 1);
});

test("the Lumofy staff named against a role becomes the relationship owner", () => {
  const p = plan({
    mappings: [{ type: "Executive Sponsor", contactIds: ["k1"], staffIds: ["s1"] }],
    staffEmails: { s1: "Lead@Lumofy.ai" },
  });
  assert.equal(p.upserts[0].ownerEmail, "lead@lumofy.ai");
});

test("two different staff against one person sets no owner and says so", () => {
  const p = plan({
    mappings: [
      { type: "Executive Sponsor", contactIds: ["k1"], staffIds: ["s1"] },
      { type: "Champion", contactIds: ["k1"], staffIds: ["s2"] },
    ],
    staffEmails: { s1: "a@lumofy.ai", s2: "b@lumofy.ai" },
  });
  assert.equal(p.upserts[0].ownerEmail, null, "picking one would assert an ownership nobody agreed");
  assert.equal(p.exceptions.length, 1);
  assert.match(p.exceptions[0].reason, /different Lumofy staff/);
});

test("an empty role slot is not data loss and not an exception", () => {
  const p = plan({ mappings: [{ type: "Champion", contactIds: [], staffIds: [] }] });
  assert.equal(p.created, 0);
  assert.equal(p.exceptions.length, 0);
});

test("no stakeholder links are invented", () => {
  /* The legacy matrix holds no evidence of who reports to whom. An org chart
     drawn from nothing is worse than an empty one. */
  const p = plan({ mappings: [
    { type: "Executive Sponsor", contactIds: ["k1"], staffIds: [] },
    { type: "Champion", contactIds: ["k2"], staffIds: [] },
  ], contacts: [contact({ id: "k1" }), contact({ id: "k2", email: "b@acme.com" })] });
  assert.equal(p.created, 2);
  assert.ok(!("links" in p), "the plan has no link output at all");
});

test("provenance carries the key a re-run matches on", () => {
  const [u] = plan().upserts;
  assert.equal(u.migration?.legacyKey, legacyKeyFor("c1", "champion", "k1"));
  assert.equal(u.migration?.version, MIGRATION_VERSION);
  assert.equal(u.migration?.from, "stakeholder_mappings");
  assert.equal(u.createdBy, "system:stakeholder-migration");
});

test("a superseded migration version re-runs rather than being skipped", () => {
  const existing = [normalizeStakeholderProfile({
    id: "sh_old", contactId: "k1", roles: ["champion"],
    migration: { legacyKey: legacyKeyFor("c1", "champion", "k1"), version: 0, migratedAt: "2026-01-01", from: "stakeholder_mappings" },
  })!];
  const p = plan({ existing });
  assert.equal(p.reconciled, 1, "version 0 was written by a superseded pass");
  assert.equal(p.upserts[0].migration?.version, MIGRATION_VERSION);
});
