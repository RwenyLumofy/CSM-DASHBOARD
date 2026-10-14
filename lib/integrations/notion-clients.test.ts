/* What a Signal client looks like as a Notion row, and how a row is matched
   back to its client. The weekly Notion sync depends on both. */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "@/lib/types";
import { clientToNotionProperties, signalIdOfPage, SIGNAL_ID_PROPERTY } from "./notion-clients";
import { parseNotionId } from "./notion";

const base = {
  id: "12345",
  name: "Acme, Inc.",
  domain: "acme.com",
  country: "Saudi Arabia",
  industry: "Oil, Gas & Energy",
  status: "active",
  segment: "mid_market",
  csm: { id: "u1", name: "Sara Ali", initials: "SA" },
  implementationOwner: null,
  currency: "USD",
  arr: 120000,
  startedAt: "2025-01-15T22:30:00.000Z",
  renewalDate: null,
  health: { score: 71.6, tier: "Healthy" },
  tags: ["Strategic", "Strategic", "a,b"],
} as unknown as Client;

const opts = { appUrl: "https://signal.example.com/", syncedAt: "2026-10-18T05:00:00.000Z" };

test("a client maps to the columns the sync owns", () => {
  const p = clientToNotionProperties(base, opts) as Record<string, any>;
  assert.equal(p.Name.title[0].text.content, "Acme, Inc.");
  assert.equal(p[SIGNAL_ID_PROPERTY].rich_text[0].text.content, "12345");
  assert.equal(p.Status.select.name, "Active");
  assert.equal(p.Segment.select.name, "Mid-market");
  assert.equal(p.CSM.rich_text[0].text.content, "Sara Ali");
  assert.equal(p.ARR.number, 120000);
  assert.equal(p["Health score"].number, 72);
  assert.equal(p["Health status"].select.name, "Healthy");
  assert.equal(p["Open in Signal"].url, "https://signal.example.com/clients/12345");
  assert.equal(p["Last synced"].date.start, "2026-10-18");
});

test("empty values clear the column instead of writing a blank option", () => {
  const p = clientToNotionProperties(base, opts) as Record<string, any>;
  assert.deepEqual(p["Implementation owner"].rich_text, []);
  assert.equal(p["Renewal date"].date, null);
  const bare = clientToNotionProperties({ ...base, country: null, health: null } as unknown as Client, opts) as Record<string, any>;
  assert.equal(bare.Country.select, null);
  assert.equal(bare["Health score"].number, null);
  assert.equal(bare["Health status"].select, null);
});

test("commas are removed from option names, which Notion rejects", () => {
  const p = clientToNotionProperties(base, opts) as Record<string, any>;
  assert.equal(p.Industry.select.name, "Oil Gas & Energy");
  assert.deepEqual(p.Tags.multi_select, [{ name: "Strategic" }, { name: "a b" }]);
});

test("dates are the UTC calendar day", () => {
  const p = clientToNotionProperties(base, opts) as Record<string, any>;
  assert.equal(p["Start date"].date.start, "2025-01-15");
});

test("no app URL leaves the link empty", () => {
  const p = clientToNotionProperties(base, { ...opts, appUrl: "" }) as Record<string, any>;
  assert.equal(p["Open in Signal"].url, null);
});

test("a row's Signal ID is read back; a hand-added row has none", () => {
  assert.equal(signalIdOfPage({ [SIGNAL_ID_PROPERTY]: { rich_text: [{ plain_text: "12345" }] } }), "12345");
  assert.equal(signalIdOfPage({ [SIGNAL_ID_PROPERTY]: { rich_text: [] } }), null);
  assert.equal(signalIdOfPage({}), null);
});

test("a Notion id is accepted bare, dashed or as a pasted page URL", () => {
  const id = "0123456789abcdef0123456789abcdef";
  assert.equal(parseNotionId(id), id);
  assert.equal(parseNotionId("01234567-89ab-cdef-0123-456789abcdef"), id);
  assert.equal(parseNotionId(`https://www.notion.so/lumofy/Signal-clients-${id}?pvs=4`), id);
  assert.equal(parseNotionId(`https://www.notion.so/Client-Database-${id}`), id);
  assert.equal(parseNotionId("not an id"), null);
});
