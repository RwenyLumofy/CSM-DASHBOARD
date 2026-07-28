import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeStakeholderProfile, normalizeStakeholderProfiles, normalizeStakeholderLinks,
  stakeholderName, stakeholderInitials, type StakeholderProfile,
} from "./profile";
import { stakeholderCoverage, CHAMPION_SILENT_DAYS, PROCUREMENT_LEAD_DAYS } from "./coverage";

const TODAY = "2026-07-28";

/** A fully-populated, well-covered account — the baseline the gap tests perturb. */
function profile(over: Partial<StakeholderProfile> = {}): StakeholderProfile {
  return normalizeStakeholderProfile({
    id: `sh_${Math.abs(JSON.stringify(over).length)}_${over.id ?? "x"}`,
    firstName: "Test", lastName: "Person", email: `${over.id ?? "x"}@example.com`,
    roles: ["champion"], influence: "medium", decisionAuthority: "recommender",
    sentiment: "supportive", relationshipStrength: "moderate", engagementStatus: "active",
    lastContactedAt: TODAY, ownerEmail: "csm@lumofy.com",
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  })!;
}

const covered = () => [
  profile({ id: "a", roles: ["executive_sponsor"] }),
  profile({ id: "b", roles: ["champion"] }),
  profile({ id: "c", roles: ["economic_buyer", "decision_maker"] }),
];
const ids = (gaps: { id: string }[]) => gaps.map((g) => g.id);

/* ------------------------------------------------------- normalisation */

test("a record without an id is dropped, not silently given one", () => {
  assert.equal(normalizeStakeholderProfile({ firstName: "No Id" }), null);
});

test("unknown enum values fall back to 'unknown' rather than corrupting the record", () => {
  const p = normalizeStakeholderProfile({ id: "x", sentiment: "furious", influence: "cosmic" })!;
  assert.equal(p.sentiment, "unknown");
  assert.equal(p.influence, "unknown");
});

test("bogus roles are filtered but valid ones survive", () => {
  const p = normalizeStakeholderProfile({ id: "x", roles: ["champion", "wizard", "procurement"] })!;
  assert.deepEqual(p.roles, ["champion", "procurement"]);
});

test("emails are lower-cased so duplicate detection can't be defeated by case", () => {
  assert.equal(normalizeStakeholderProfile({ id: "x", email: "Ahmed@Example.COM" })!.email, "ahmed@example.com");
});

test("duplicate ids collapse to the first occurrence", () => {
  const list = normalizeStakeholderProfiles([{ id: "dup", firstName: "First" }, { id: "dup", firstName: "Second" }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].firstName, "First");
});

test("a full ISO timestamp is stored as a date", () => {
  assert.equal(normalizeStakeholderProfile({ id: "x", lastContactedAt: "2026-03-04T11:22:33Z" })!.lastContactedAt, "2026-03-04");
});

test("links to deleted stakeholders are dropped so the map has no ghosts", () => {
  const links = normalizeStakeholderLinks(
    [{ id: "l1", fromId: "a", toId: "b", kind: "reports_to" }, { id: "l2", fromId: "a", toId: "GONE", kind: "influences" }],
    new Set(["a", "b"]),
  );
  assert.deepEqual(links.map((l) => l.id), ["l1"]);
});

test("self-links are rejected", () => {
  assert.equal(normalizeStakeholderLinks([{ id: "l", fromId: "a", toId: "a", kind: "works_with" }], new Set(["a"])).length, 0);
});

test("display name prefers a preferred name, then falls back to email", () => {
  assert.equal(stakeholderName({ preferredName: "Abu Khalid", firstName: "Khalid", lastName: "Al Sayed", email: null }), "Abu Khalid");
  assert.equal(stakeholderName({ preferredName: null, firstName: null, lastName: null, email: "x@y.com" }), "x@y.com");
  assert.equal(stakeholderInitials({ preferredName: null, firstName: "Layla", lastName: "Hassan", email: null }), "LH");
});

/* ----------------------------------------------------------- coverage */

test("a fully covered account raises no critical gaps", () => {
  const gaps = stakeholderCoverage({ profiles: covered(), links: [], today: TODAY, renewalDate: null });
  assert.equal(gaps.filter((g) => g.severity === "critical").length, 0);
});

test("every gap explains how it was derived", () => {
  const gaps = stakeholderCoverage({ profiles: [], links: [], today: TODAY, renewalDate: "2026-08-15" });
  assert.ok(gaps.length > 0);
  for (const g of gaps) assert.ok(g.derivation.length > 20, `"${g.title}" has no usable derivation`);
});

test("an empty account reports no-stakeholders and every missing critical role", () => {
  const gaps = stakeholderCoverage({ profiles: [], links: [], today: TODAY, renewalDate: null });
  assert.ok(ids(gaps).includes("no_stakeholders"));
  for (const r of ["executive_sponsor", "champion", "economic_buyer", "decision_maker"]) {
    assert.ok(ids(gaps).includes(`missing_${r}`), `expected missing_${r}`);
  }
});

test("a missing economic buyer escalates to critical only when renewal is close", () => {
  const without = covered().filter((p) => !p.roles.includes("economic_buyer"));
  const far = stakeholderCoverage({ profiles: without, links: [], today: TODAY, renewalDate: "2027-06-01" });
  const near = stakeholderCoverage({ profiles: without, links: [], today: TODAY, renewalDate: "2026-08-10" });
  assert.equal(far.find((g) => g.id === "missing_economic_buyer")?.severity, "warning");
  assert.equal(near.find((g) => g.id === "missing_economic_buyer")?.severity, "critical");
});

test("a silent champion is flagged, and doubling the silence escalates it", () => {
  const quiet = (days: number) => {
    const d = new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
    return stakeholderCoverage({
      profiles: [...covered().filter((p) => !p.roles.includes("champion")), profile({ id: "ch", roles: ["champion"], lastContactedAt: d })],
      links: [], today: TODAY, renewalDate: null,
    }).find((g) => g.id.startsWith("champion_silent"));
  };
  assert.equal(quiet(CHAMPION_SILENT_DAYS - 1), undefined, "should not fire below the threshold");
  assert.equal(quiet(CHAMPION_SILENT_DAYS + 1)?.severity, "warning");
  assert.equal(quiet(CHAMPION_SILENT_DAYS * 2 + 1)?.severity, "critical");
});

test("a champion with no contact date is flagged rather than assumed healthy", () => {
  const gaps = stakeholderCoverage({
    profiles: [profile({ id: "ch", roles: ["champion"], lastContactedAt: null })],
    links: [], today: TODAY, renewalDate: null,
  });
  assert.ok(ids(gaps).some((i) => i.startsWith("champion_never_contacted")));
});

test("single-threading is critical, and someone who left doesn't count as coverage", () => {
  const one = stakeholderCoverage({ profiles: [profile({ id: "only" })], links: [], today: TODAY, renewalDate: null });
  assert.equal(one.find((g) => g.id === "single_threaded")?.severity, "critical");

  const departed = stakeholderCoverage({
    profiles: [profile({ id: "here" }), profile({ id: "gone", engagementStatus: "left_company" })],
    links: [], today: TODAY, renewalDate: null,
  });
  assert.ok(ids(departed).includes("single_threaded"), "a departed stakeholder must not pad the count");
});

test("procurement is only demanded inside the renewal window", () => {
  const base = covered();
  const far = stakeholderCoverage({ profiles: base, links: [], today: TODAY, renewalDate: "2027-01-01" });
  const near = stakeholderCoverage({ profiles: base, links: [], today: TODAY, renewalDate: "2026-09-01" });
  assert.ok(!ids(far).includes("procurement_missing_pre_renewal"));
  assert.ok(ids(near).includes("procurement_missing_pre_renewal"));
  assert.ok(near.find((g) => g.id === "procurement_missing_pre_renewal")!.derivation.includes(String(PROCUREMENT_LEAD_DAYS)));
});

test("an influential detractor is critical; a powerless one is not", () => {
  const loud = stakeholderCoverage({
    profiles: [...covered(), profile({ id: "d1", sentiment: "detractor", influence: "high" })],
    links: [], today: TODAY, renewalDate: null,
  });
  assert.ok(ids(loud).some((i) => i.startsWith("influential_detractor")));

  const quiet = stakeholderCoverage({
    profiles: [...covered(), profile({ id: "d2", sentiment: "detractor", influence: "low", decisionAuthority: "none" })],
    links: [], today: TODAY, renewalDate: null,
  });
  assert.ok(!ids(quiet).some((i) => i.startsWith("influential_detractor")));
});

test("'not assessed' on a decision-maker is surfaced, not treated as neutral", () => {
  const gaps = stakeholderCoverage({
    profiles: [...covered(), profile({ id: "u", roles: ["decision_maker"], sentiment: "unknown" })],
    links: [], today: TODAY, renewalDate: null,
  });
  assert.ok(ids(gaps).includes("unassessed_decision_makers"));
});

test("gaps are ordered critical first", () => {
  const gaps = stakeholderCoverage({
    profiles: [profile({ id: "solo", roles: ["champion"], sentiment: "detractor", influence: "high" })],
    links: [], today: TODAY, renewalDate: "2026-08-01",
  });
  const rank = { critical: 0, warning: 1, info: 2 } as const;
  for (let i = 1; i < gaps.length; i++) {
    assert.ok(rank[gaps[i - 1].severity] <= rank[gaps[i].severity], "gaps must be sorted by severity");
  }
});

test("isolated stakeholders are reported once the account is big enough to have a shape", () => {
  const three = covered();
  const linked = stakeholderCoverage({
    profiles: three,
    links: normalizeStakeholderLinks(
      [{ id: "l1", fromId: three[0].id, toId: three[1].id, kind: "works_with" },
       { id: "l2", fromId: three[1].id, toId: three[2].id, kind: "works_with" }],
      new Set(three.map((p) => p.id)),
    ),
    today: TODAY, renewalDate: null,
  });
  assert.ok(!ids(linked).includes("isolated_stakeholders"));

  const unlinked = stakeholderCoverage({ profiles: three, links: [], today: TODAY, renewalDate: null });
  assert.equal(unlinked.find((g) => g.id === "isolated_stakeholders")?.stakeholderIds.length, 3);
});
