import { test } from "node:test";
import assert from "node:assert/strict";
import { extractMentions, filterMentions } from "./mentions";
import { isNoteType, noteDate, DEFAULT_NOTE_TYPE } from "./types";

/* Mentions will decide who gets notified once a `note_mentioned` type exists.
   The rules that have to hold before then are the same two: which tokens
   count, and that the server never takes the browser's word for who may be
   named. */

test("a token is found even when the editor split it across tags", () => {
  const html = "<p>Handing this to @[<strong>sakina@lumofy.com</strong>] before Friday</p>";
  // The tags fall away with the markup, so the token reads as written.
  assert.deepEqual(extractMentions(html.replace(/<\/?strong>/g, "")), ["sakina@lumofy.com"]);
});

test("mentions are lower-cased and de-duplicated", () => {
  const html = "<p>@[Sakina@Lumofy.com] and again @[sakina@lumofy.com]</p>";
  assert.deepEqual(extractMentions(html), ["sakina@lumofy.com"]);
});

test("an @ that is not a token is not a mention", () => {
  assert.deepEqual(extractMentions("<p>email me at sakina@lumofy.com or @sakina</p>"), []);
});

test("no mentions in an ordinary note", () => {
  assert.deepEqual(extractMentions("<p>Spoke with Neena about the renewal.</p>"), []);
});

test("a token naming someone not allowed is demoted to plain text, not deleted", () => {
  const allowed = new Set(["sakina@lumofy.com"]);
  const out = filterMentions("<p>@[sakina@lumofy.com] and @[outsider@example.com]</p>", allowed);
  assert.match(out, /@\[sakina@lumofy\.com\]/); // kept as a token
  assert.match(out, /@outsider@example\.com/); // kept as words
  assert.doesNotMatch(out, /@\[outsider@example\.com\]/); // but not as a mention
  // And the index that follows names only the permitted person.
  assert.deepEqual(extractMentions(out), ["sakina@lumofy.com"]);
});

test("filtering leaves a note with no mentions untouched", () => {
  const html = "<p>Nothing to see here.</p>";
  assert.equal(filterMentions(html, new Set(["sakina@lumofy.com"])), html);
});

/* The channel, and the date a note files under. */

test("only the four channels are accepted", () => {
  for (const t of ["meeting", "call", "message", "note"]) assert.ok(isNoteType(t));
  for (const t of ["risk", "internal", "", null, undefined, 7]) assert.ok(!isNoteType(t));
});

test("every note written before this shipped is a plain note", () => {
  assert.equal(DEFAULT_NOTE_TYPE, "note");
});

test("a note files under when it happened, not when it was typed", () => {
  assert.equal(
    noteDate({ occurredAt: "2026-08-02T00:00:00.000Z", createdAt: "2026-08-03T07:11:28.000Z" }),
    "2026-08-02T00:00:00.000Z",
  );
});

test("with no occurredAt it falls back to createdAt — which is every existing note", () => {
  assert.equal(
    noteDate({ occurredAt: null, createdAt: "2026-07-29T07:35:24.000Z" }),
    "2026-07-29T07:35:24.000Z",
  );
});
