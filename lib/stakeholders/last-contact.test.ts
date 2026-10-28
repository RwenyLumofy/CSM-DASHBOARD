import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeStakeholderProfile, type StakeholderProfile } from "./profile";
import {
  addressesIn, effectiveLastContact, indexActivity, lastContactByStakeholder,
  type ContactActivity, type ContactEmail, type ContactNote,
} from "./last-contact";
import { stakeholderCoverage } from "./coverage";

/* Beyon (client 15842113420) is the worked example: James Farrell is the
   Champion, Marwa Badow the power user. Addresses arrive from HubSpot in mixed
   case and `;`-joined, exactly as below. */
const JAMES = "james.farrell@beyon.com";
const MARWA = "marwa.badow@beyon.com";

const email = (over: Partial<ContactEmail>): ContactEmail => ({ fromEmail: "zali@lumofy.com", toEmail: null, sentAt: null, ...over });
const note = (over: Partial<ContactNote>): ContactNote => ({ mentions: [], occurredAt: null, createdAt: "2026-01-01T00:00:00Z", ...over });
const none: ContactActivity = { emails: [], notes: [] };

function person(over: Partial<StakeholderProfile>): StakeholderProfile {
  return normalizeStakeholderProfile({
    id: "sh_james", firstName: "James", lastName: "Farrell", email: JAMES, roles: ["champion"],
    lastContactedAt: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  })!;
}
const lc = (p: StakeholderProfile, a: ContactActivity) => effectiveLastContact(p, indexActivity(a));

/* ---------------------------------------------------------- addresses */

test("addresses split on ; and are lower-cased and trimmed", () => {
  assert.deepEqual(addressesIn("bmomani@lumofy.com; Marwa.Badow@Beyon.com ;zali@lumofy.com"),
    ["bmomani@lumofy.com", MARWA, "zali@lumofy.com"]);
  assert.deepEqual(addressesIn("Marwa Badow <Marwa.Badow@Beyon.com>"), [MARWA]);
  assert.deepEqual(addressesIn(null), []);
});

/* -------------------------------------------------------------- email */

test("an email TO the stakeholder counts, whatever the case of the address", () => {
  const got = lc(person({}), { ...none, emails: [email({ toEmail: "James.Farrell@Beyon.COM", sentAt: "2026-07-06T17:27:46Z" })] });
  assert.deepEqual(got, { date: "2026-07-06", source: "email" });
});

test("an email FROM the stakeholder counts", () => {
  const got = lc(person({}), { ...none, emails: [email({ fromEmail: JAMES, toEmail: "zali@lumofy.com", sentAt: "2026-07-01T09:00:00Z" })] });
  assert.equal(got?.date, "2026-07-01");
});

test("the stakeholder anywhere in a multi-recipient list counts", () => {
  const got = lc(person({ email: MARWA }), {
    ...none, emails: [email({ toEmail: `bmomani@lumofy.com;${JAMES};Marwa.Badow@Beyon.com`, sentAt: "2026-07-26T08:46:37Z" })],
  });
  assert.equal(got?.date, "2026-07-26");
});

test("the newest matching email wins, not the first one in the list", () => {
  const got = lc(person({}), {
    ...none,
    emails: [
      email({ toEmail: JAMES, sentAt: "2026-05-01T00:00:00Z" }),
      email({ toEmail: JAMES, sentAt: "2026-07-06T00:00:00Z" }),
      email({ toEmail: JAMES, sentAt: "2026-06-01T00:00:00Z" }),
    ],
  });
  assert.equal(got?.date, "2026-07-06");
});

test("a partial address is not a match", () => {
  const got = lc(person({ email: "ames.farrell@beyon.com" }), { ...none, emails: [email({ toEmail: JAMES, sentAt: "2026-07-06T00:00:00Z" })] });
  assert.equal(got, null);
});

test("other people's emails on the account don't count", () => {
  const got = lc(person({}), { ...none, emails: [email({ toEmail: MARWA, sentAt: "2026-07-26T00:00:00Z" })] });
  assert.equal(got, null);
});

test("an email with no send time is ignored rather than dated by the sync", () => {
  assert.equal(lc(person({}), { ...none, emails: [email({ toEmail: JAMES, sentAt: null })] }), null);
});

/* -------------------------------------------------------------- notes */

test("a note mentioning the stakeholder counts, dated by when it happened", () => {
  const got = lc(person({}), {
    ...none, notes: [note({ mentions: [JAMES], occurredAt: "2026-07-20T10:00:00Z", createdAt: "2026-07-22T10:00:00Z" })],
  });
  assert.deepEqual(got, { date: "2026-07-20", source: "note" });
});

test("a note with no occurred date falls back to when it was written", () => {
  const got = lc(person({}), { ...none, notes: [note({ mentions: [JAMES], createdAt: "2026-07-22T10:00:00Z" })] });
  assert.equal(got?.date, "2026-07-22");
});

test("deleted notes and notes about someone else don't count", () => {
  const got = lc(person({}), {
    ...none,
    notes: [
      note({ mentions: [JAMES], createdAt: "2026-07-22T10:00:00Z", deletedAt: "2026-07-23T00:00:00Z" }),
      note({ mentions: [MARWA], createdAt: "2026-07-24T10:00:00Z" }),
    ],
  });
  assert.equal(got, null);
});

/* ---------------------------------------------- max with manual date */

test("activity newer than the manual date wins", () => {
  const got = lc(person({ lastContactedAt: "2026-05-24" }), { ...none, emails: [email({ toEmail: JAMES, sentAt: "2026-07-06T00:00:00Z" })] });
  assert.deepEqual(got, { date: "2026-07-06", source: "email" });
});

test("a manual date newer than any activity wins", () => {
  const got = lc(person({ lastContactedAt: "2026-07-27" }), {
    emails: [email({ toEmail: JAMES, sentAt: "2026-07-06T00:00:00Z" })],
    notes: [note({ mentions: [JAMES], occurredAt: "2026-07-20T00:00:00Z" })],
  });
  assert.deepEqual(got, { date: "2026-07-27", source: "manual" });
});

test("the latest of all three is taken, and the manual date wins a tie", () => {
  const activity: ContactActivity = {
    emails: [email({ toEmail: JAMES, sentAt: "2026-07-06T00:00:00Z" })],
    notes: [note({ mentions: [JAMES], occurredAt: "2026-07-20T00:00:00Z" })],
  };
  assert.deepEqual(lc(person({ lastContactedAt: "2026-06-01" }), activity), { date: "2026-07-20", source: "note" });
  assert.deepEqual(lc(person({ lastContactedAt: "2026-07-20" }), activity), { date: "2026-07-20", source: "manual" });
});

test("no manual date and no activity means no last contact", () => {
  assert.equal(lc(person({}), none), null);
  assert.equal(lc(person({ email: null }), { ...none, emails: [email({ toEmail: JAMES, sentAt: "2026-07-06T00:00:00Z" })] }), null);
});

test("lastContactByStakeholder keys by profile id and skips the uncontacted", () => {
  const james = person({});
  const marwa = person({ id: "sh_marwa", firstName: "Marwa", lastName: "Badow", email: MARWA });
  const nobody = person({ id: "sh_nobody", email: "nobody@beyon.com" });
  const map = lastContactByStakeholder([james, marwa, nobody], {
    ...none,
    emails: [email({ toEmail: `${JAMES};${MARWA}`, sentAt: "2026-07-06T00:00:00Z" }), email({ toEmail: "Marwa.Badow@Beyon.com", sentAt: "2026-07-26T00:00:00Z" })],
  });
  assert.deepEqual(map, { sh_james: { date: "2026-07-06", source: "email" }, sh_marwa: { date: "2026-07-26", source: "email" } });
});

/* ------------------------------------------------ coverage integration */

test("the champion warning reads the effective date and names its source", () => {
  const james = person({ lastContactedAt: "2026-05-24" });
  const lastContact = lastContactByStakeholder([james], { ...none, emails: [email({ toEmail: JAMES, sentAt: "2026-10-20T09:00:00Z" })] });

  const quiet = stakeholderCoverage({ profiles: [james], links: [], today: "2026-10-28", lastContact });
  assert.ok(!quiet.some((g) => g.id.startsWith("champion_")), "8 days ago is not silent");

  const late = stakeholderCoverage({ profiles: [james], links: [], today: "2026-12-20", lastContact });
  const gap = late.find((g) => g.id.startsWith("champion_silent"))!;
  assert.match(gap.derivation, /^Last contact 2026-10-20 \(email\), which is 61 days ago/);
  assert.match(gap.derivation, /Meetings aren't counted/);
});

test("without activity the manual date is labelled as entered by hand", () => {
  const james = person({ lastContactedAt: "2026-05-24" });
  const gaps = stakeholderCoverage({ profiles: [james], links: [], today: "2026-07-28", lastContact: lastContactByStakeholder([james], none) });
  assert.match(gaps.find((g) => g.id.startsWith("champion_silent"))!.derivation, /^Last contact 2026-05-24 \(entered by hand\), which is 65 days ago/);
});

test("a champion with nothing at all says what was checked, meetings included", () => {
  const james = person({});
  const gaps = stakeholderCoverage({ profiles: [james], links: [], today: "2026-07-28", lastContact: {} });
  const gap = gaps.find((g) => g.id.startsWith("champion_never_contacted"))!;
  assert.match(gap.derivation, /no synced email to or from james\.farrell@beyon\.com, and no note mentioning them/);
  assert.match(gap.derivation, /Meetings aren't counted/);
});
