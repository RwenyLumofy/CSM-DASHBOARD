/* Sample board for the Projects prototype. Real domain types, invented content.
   Client names are real Lumofy accounts; every date and task is made up. */

import { DEFAULT_PROJECT_CONFIG } from "@/lib/projects/config";
import type { ProjectDetail, Task } from "@/lib/projects/types";

export const CONFIG = DEFAULT_PROJECT_CONFIG;

/** Fixed "today" so the prototype reads the same every time. */
export const NOW = new Date("2026-08-16T09:00:00Z");

const iso = (d: string) => new Date(`${d}T00:00:00Z`).toISOString();

let seq = 0;
const task = (
  name: string, status: string, delivery: string | null,
  owner: string | null = null, type: string | null = "internal",
): Task => {
  seq += 1;
  return {
    id: `t${seq}`, projectId: "", milestoneId: "", clientId: "c1",
    name, description: null, type, status,
    startDate: null, deliveryDate: delivery ? iso(delivery) : null,
    ownerEmail: owner, sortOrder: seq,
    completedAt: status === "done" ? iso("2026-08-01") : null,
    createdAt: iso("2026-06-01"), updatedAt: iso("2026-08-01"),
  };
};

const project = (
  id: string, name: string, type: string, status: string,
  delivery: string | null, owner: string | null,
  milestones: { name: string; due: string | null; tasks: Task[] }[],
): ProjectDetail => ({
  id, clientId: "c1", name, description: null, type, status,
  startDate: iso("2026-06-01"), deliveryDate: delivery ? iso(delivery) : null,
  ownerEmail: owner, implementerEmail: null, contactId: null,
  sortOrder: 0, createdByEmail: null,
  createdAt: iso("2026-06-01"), updatedAt: iso("2026-08-10"),
  completedAt: status === "completed" ? iso("2026-08-05") : null,
  milestones: milestones.map((m, i) => ({
    id: `${id}-m${i}`, projectId: id, clientId: "c1", name: m.name,
    description: null, dueDate: m.due ? iso(m.due) : null, sortOrder: i,
    createdAt: iso("2026-06-01"),
    tasks: m.tasks.map((t) => ({ ...t, projectId: id, milestoneId: `${id}-m${i}` })),
  })),
});

export const BOARD: ProjectDetail[] = [
  /* Project on time, but two tasks late underneath — invisible today. */
  project("p1", "Onboarding — Phase 1", "onboarding", "in_progress", "2026-09-30", "sara@lumofy.com", [
    { name: "Kick-off", due: "2026-06-20", tasks: [
      task("Kick-off call", "done", "2026-06-18", "sara@lumofy.com", "meeting"),
      task("Provision workspace", "done", "2026-06-25", null),
    ]},
    { name: "Configuration", due: "2026-08-14", tasks: [
      task("SSO configuration", "blocked", "2026-08-10", "ali@lumofy.com"),
      task("Import user list", "in_progress", "2026-08-12", "ali@lumofy.com", "client"),
      task("Branding and domains", "todo", "2026-09-05", null),
    ]},
    { name: "Go-live", due: "2026-09-28", tasks: [
      task("Admin training", "todo", "2026-09-20", "sara@lumofy.com", "call"),
      task("Go-live sign-off", "todo", "2026-09-30", "sara@lumofy.com"),
    ]},
  ]),

  /* Project itself overdue. */
  project("p2", "Perform rollout", "implementation", "at_risk", "2026-08-11", "qasim@lumofy.com", [
    { name: "Cycle setup", due: "2026-08-05", tasks: [
      task("Define review cycle", "done", "2026-08-01", "qasim@lumofy.com"),
      task("Manager briefing", "in_progress", "2026-08-08", "qasim@lumofy.com", "meeting"),
    ]},
    { name: "Launch", due: "2026-08-11", tasks: [
      task("Publish cycle", "todo", "2026-08-11", null),
    ]},
  ]),

  /* Due soon — inside the 7-day project window. */
  project("p3", "Comply tier migration", "implementation", "in_progress", "2026-08-21", "ali@lumofy.com", [
    { name: "Migration", due: "2026-08-21", tasks: [
      task("Export current records", "done", "2026-08-05", null),
      task("Load into new tier", "in_progress", "2026-08-19", "ali@lumofy.com"),
    ]},
  ]),

  /* Healthy, nothing to say. */
  project("p4", "Content authoring pilot", "training", "in_progress", "2026-11-15", "sara@lumofy.com", [
    { name: "Author enablement", due: "2026-10-01", tasks: [
      task("Select pilot authors", "done", "2026-08-08", null),
      task("Authoring workshop", "todo", "2026-09-25", "sara@lumofy.com", "meeting"),
    ]},
  ]),

  /* On hold — a real state the current tab renders as merely "not done". */
  project("p5", "Engage rollout", "implementation", "on_hold", "2026-08-09", "qasim@lumofy.com", [
    { name: "Survey design", due: "2026-08-09", tasks: [
      task("Draft question set", "todo", "2026-08-09", "qasim@lumofy.com"),
    ]},
  ]),

  /* Cancelled — today this renders green, with a tick, like a success. */
  project("p6", "Skills framework build", "implementation", "cancelled", "2026-07-31", "qasim@lumofy.com", [
    { name: "Framework design", due: "2026-07-20", tasks: [
      task("Competency workshop", "todo", "2026-07-15", "qasim@lumofy.com"),
    ]},
  ]),

  /* Genuinely delivered. */
  project("p7", "Assessment centre build", "implementation", "completed", "2026-08-05", "sara@lumofy.com", [
    { name: "Build", due: "2026-08-01", tasks: [
      task("Design assessment", "done", "2026-07-20", null),
      task("Handover", "done", "2026-08-04", null),
    ]},
  ]),
];

export const PEOPLE: Record<string, string> = {
  "sara@lumofy.com": "Sara Nasser",
  "ali@lumofy.com": "Ali Abbas",
  "qasim@lumofy.com": "Qasim Alshakhoori",
};

export const personName = (e: string | null) => (e ? PEOPLE[e] ?? e : "Unassigned");
export const initials = (e: string | null) =>
  personName(e).split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase();

export const fmtDate = (isoStr: string | null) => {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getUTCDate()} ${M[d.getUTCMonth()]}`;
};
