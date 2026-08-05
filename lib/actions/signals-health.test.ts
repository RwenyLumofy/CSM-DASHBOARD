/* =========================================================================
   The Recommendations panel sits directly beneath the Health signals card and
   claims to say "what to do about the readings above". It did not read them.

   Both failures below were live: Bank of Bahrain, 73, held on Watch by a
   failed CS Pulse gate and a single-threaded flag, got one recommendation
   reading "breadth is dragging it down" — a raw engine id, naming the cheapest
   signal on the account, mentioning neither of the two things actually holding
   it back.
   ========================================================================= */

import { test } from "node:test";
import assert from "node:assert/strict";
import { MODEL_V1_1 } from "@/lib/health/model-v1";
import { accountDrag } from "@/lib/health/drag";
import { detectSignals, type SignalInputs } from "./signals";

/** Bank of Bahrain & Kuwait, production, 5 Aug 2026. */
const BBK_COMPONENTS = {
  product: 77, reach: 99, progress: 78, outcomes: 52, breadth: 35,
  pulse: 63, stakeholder: 40, engagement: 75, renewal: 75,
  support: 78, sla: 67, incidents: 75, aged: 100, sentiment: 72,
};

const health = (over: Record<string, unknown> = {}) => ({
  score: 73, tier: "Watch", tierColor: "#C99A14", trend: 0, updatedAt: "",
  band: "Healthy", coverage: 1, components: BBK_COMPONENTS, ...over,
});

function inputs(over: Record<string, unknown> = {}): SignalInputs {
  const client = {
    id: "bbk", name: "Bank of Bahrain & Kuwait", status: "active",
    health: health((over.health as Record<string, unknown>) ?? {}),
    support: { slaBreaches: [], tickets: [] },
    properties: {}, csat: null, nps: null,
  };
  return {
    client, trackedDeals: [], dealDates: {}, contacts: [], stakeholders: [],
    projectDeadlines: [], usage: { status: "error", message: "skip" },
    model: MODEL_V1_1,
    ...over,
  } as unknown as SignalInputs;
}

const healthSignals = (i: SignalInputs) => detectSignals(i).filter((s) => s.category === "health");

test("the reasons holding the account back each become a recommendation", () => {
  const s = healthSignals(inputs({
    health: {
      reasonDetails: [
        { id: "q_pulse", text: "CS Pulse below the Healthy minimum of 75", shortfall: { metric: "cs_pulse_score", actual: 63, target: 75 } },
        { id: "q_multithreaded", text: "Account is single-threaded" },
      ],
    },
  }));
  assert.equal(s.length, 2, "one per active reason");
  assert.deepEqual(s.map((x) => x.title), [
    "CS Pulse below the Healthy minimum of 75",
    "Account is single-threaded",
  ]);
});

test("a threshold reason carries the distance and the remedy, not just the rule", () => {
  const [pulse] = healthSignals(inputs({
    health: { reasonDetails: [{ id: "q_pulse", text: "CS Pulse below the Healthy minimum of 75", shortfall: { metric: "cs_pulse_score", actual: 63, target: 75 } }] },
  }));
  assert.match(pulse.insight, /CS Pulse is 63 and needs 75/);
  assert.match(pulse.insight, /12 points short/);
  assert.match(pulse.insight, /pulse ratings/i, "the remedy has to be in there");
});

test("no raw engine key ever reaches CSM-facing prose", () => {
  /* The bug this replaces: COMPONENT_LABEL held the retired formula's keys, so
     every lookup missed and printed the id. Any of these appearing verbatim
     means a label lookup has silently started falling through again. */
  const s = healthSignals(inputs());
  const prose = s.map((x) => `${x.title} ${x.insight}`).join(" ");
  for (const key of Object.keys(BBK_COMPONENTS)) {
    assert.ok(!new RegExp(`\\b${key}\\b`).test(prose), `raw key "${key}" leaked into: ${prose}`);
  }
});

test("the biggest drag is by weight, not by lowest number", () => {
  /* Use Case Breadth reads 35 — the lowest number on the account, and what the
     old "weakest signal" line named. It carries 5% of the score, so it costs
     3.25 points. Stakeholder Coverage reads 40 at 8.8% and costs 5.25.

     The clearest case is Workflow Progress: it reads 78, a perfectly healthy
     figure, and at 15% of the score it still costs MORE than breadth does.
     Sorting by the lowest bar cannot see that. */
  const drag = accountDrag({ components: BBK_COMPONENTS }, MODEL_V1_1);
  const of = (k: string) => drag.find((d) => d.key === k)!;

  assert.equal(drag[0].key, "stakeholder", "heaviest cost, not lowest score");
  assert.ok(of("breadth").value < of("stakeholder").value, "breadth IS the lowest number");
  assert.ok(of("breadth").cost < of("stakeholder").cost, "and still not the biggest problem");
  assert.ok(of("progress").cost > of("breadth").cost, "78 at 15% outweighs 35 at 5%");
});

test("with no reasons, the account is told what costs it most", () => {
  const s = healthSignals(inputs({ health: { reasonDetails: [] } }));
  assert.equal(s.length, 1);
  assert.match(s[0].title, /Stakeholder Coverage/);
  assert.match(s[0].insight, /9% of the score/);
  assert.match(s[0].insight, /5\.3 points/);
});

test("a capped account is not also handed the weaker errand", () => {
  /* Clearing the cap is the whole job. Adding "and also look at outcomes"
     underneath buries the two things that actually move the status. */
  const s = healthSignals(inputs({
    health: { reasonDetails: [{ id: "q_multithreaded", text: "Account is single-threaded" }] },
  }));
  assert.equal(s.length, 1);
  assert.ok(!s.some((x) => x.signalKey.startsWith("health_drag")));
});

test("a component with no reading is never blamed", () => {
  const drag = accountDrag({ components: { ...BBK_COMPONENTS, outcomes: undefined } as never }, MODEL_V1_1);
  assert.ok(!drag.some((d) => d.key === "outcomes"), "absent is not the same as zero");
});

test("lifecycle states raise nothing at all", () => {
  for (const tier of ["Churned", "Not Assessed", "Implementation"]) {
    const s = healthSignals(inputs({ health: { tier, reasonDetails: [{ id: "q_pulse", text: "whatever" }] } }));
    assert.equal(s.length, 0, `${tier} needs a decision or a data fix, not a recommendation`);
  }
});

test("rows scored before rule ids were stored still produce recommendations", () => {
  const s = healthSignals(inputs({ health: { reasons: ["Account is single-threaded"] } }));
  assert.equal(s.length, 1);
  assert.match(s[0].insight, /second real relationship/);
});
