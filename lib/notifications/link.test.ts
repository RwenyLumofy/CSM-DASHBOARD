/* =========================================================================
   Where a notification goes. These pin the two regressions that made the bell
   feel broken: a personal task assignment that did nothing when clicked, and
   a mention that landed on an account page without saying which task.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { notificationHref } from "./link";

test("a task on an account opens that account with the task named", () => {
  assert.equal(
    notificationHref({ clientId: "4020204985", entityType: "task", entityId: "tdt-9" }),
    "/clients/4020204985?task=tdt-9",
  );
});

test("a task with no account opens Today, not a dead click", () => {
  assert.equal(notificationHref({ clientId: null, entityType: "task", entityId: "tdt-9" }), "/today?task=tdt-9");
});

test("an account notification with no entity still opens the account", () => {
  assert.equal(notificationHref({ clientId: "acc_1", entityType: null, entityId: null }), "/clients/acc_1");
});

test("nothing to open returns null rather than a route that goes nowhere", () => {
  assert.equal(notificationHref({ clientId: null, entityType: null, entityId: null }), null);
  assert.equal(
    notificationHref({ clientId: null, entityType: "task", entityId: null }),
    null,
    "a task type with no id is not a task link",
  );
});

test("an unknown entity type falls back to the account rather than an invented route", () => {
  assert.equal(
    notificationHref({ clientId: "acc_1", entityType: "renewal", entityId: "r_1" }),
    "/clients/acc_1",
  );
});

test("an id with URL-significant characters is encoded, not concatenated", () => {
  assert.equal(
    notificationHref({ clientId: "acc_1", entityType: "task", entityId: "a b&c=d" }),
    "/clients/acc_1?task=a+b%26c%3Dd",
  );
});
