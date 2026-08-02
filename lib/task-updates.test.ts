/* =========================================================================
   Mention parsing — the security-relevant half of task updates.

   The tokens in an update's body are what the renderer draws. The mention ROWS
   are what notifies somebody. If those two can disagree, a hand-crafted request
   notifies anyone in the company — which is precisely the access-widening the
   "a mention grants no access" decision exists to prevent. These tests pin the
   parser that keeps them in step.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMentions } from "../app/(app)/today/task-update-actions";

test("pulls each mentioned email out of the body", () => {
  assert.deepEqual(
    parseMentions("Chased @[zainab@lumofy.com] on this, @[qasim@lumofy.com] has context"),
    ["zainab@lumofy.com", "qasim@lumofy.com"],
  );
});

test("naming someone twice notifies them once", () => {
  assert.deepEqual(
    parseMentions("@[zainab@lumofy.com] — and again @[zainab@lumofy.com]"),
    ["zainab@lumofy.com"],
  );
});

test("case is normalised, so Zainab and zainab are one person", () => {
  assert.deepEqual(parseMentions("@[Zainab@Lumofy.com] @[zainab@lumofy.com]"), ["zainab@lumofy.com"]);
});

test("plain text with no tokens mentions nobody", () => {
  assert.deepEqual(parseMentions("spoke to zainab@lumofy.com by email, all fine"), []);
  assert.deepEqual(parseMentions("@zainab is on it"), [], "a bare @name is not a mention");
  assert.deepEqual(parseMentions(""), []);
});

test("a malformed token is ignored rather than half-parsed", () => {
  assert.deepEqual(parseMentions("@[ ] @[] @[unclosed"), []);
});

test("the token survives punctuation and line breaks around it", () => {
  assert.deepEqual(
    parseMentions("(@[a@b.com])\n- @[c@d.com], next"),
    ["a@b.com", "c@d.com"],
  );
});
