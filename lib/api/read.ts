/* =========================================================================
   Unscoped reads behind /api/v1. Server-only.

   These deliberately bypass lib/data.ts: its reads are scoped to the signed-in
   Clerk user (scopeClientsToUser), and a machine caller has no user, so the
   facade would return an empty book. An API key reads everything — see
   lib/api/http.ts for why that is acceptable and who can issue one.
   ========================================================================= */

import { and, asc, desc, eq, isNotNull, type SQL } from "drizzle-orm";
import { getDb, schema, withDbTimeout } from "@/lib/db/client";
import { toApiAccount, type ApiAccount } from "@/lib/api/serialize";

export async function readAccounts(today: string): Promise<ApiAccount[]> {
  const { getClientsFromDb } = await import("@/lib/repo/drizzle");
  const clients = await withDbTimeout(getClientsFromDb());
  return clients.map((c) => toApiAccount(c, today)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function readAccount(id: string, today: string): Promise<ApiAccount | null> {
  const { getClientByIdFromDb } = await import("@/lib/repo/drizzle");
  const c = await withDbTimeout(getClientByIdFromDb(id));
  return c ? toApiAccount(c, today) : null;
}

/* ------------------------------------------------------------------ tasks */

export const TASK_STATUSES = ["open", "done"] as const;

export interface ApiTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  due_date: string | null;
  account_id: string;
  project_id: string | null;
  owner_email: string;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
}

export async function readTasks(f: { status?: string; accountId?: string; ownerEmail?: string }): Promise<ApiTask[]> {
  const t = schema.todayTasks;
  // Account tasks only. today_tasks also holds people's personal to-dos with no
  // account; those are not CS data and stay out of the API.
  const where: SQL[] = [isNotNull(t.accountId)];
  if (f.status) where.push(eq(t.status, f.status));
  if (f.accountId) where.push(eq(t.accountId, f.accountId));
  if (f.ownerEmail) where.push(eq(t.ownerEmail, f.ownerEmail.toLowerCase()));
  const rows = await withDbTimeout(
    getDb().select().from(t).where(and(...where)).orderBy(asc(t.dueDate), desc(t.createdAt)),
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    category: r.category,
    due_date: r.dueDate ? r.dueDate.toISOString().slice(0, 10) : null,
    account_id: r.accountId!,
    project_id: r.projectId,
    owner_email: r.ownerEmail,
    created_by_email: r.createdByEmail,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  }));
}

/* -------------------------------------------------------------- expansion */

export const EXPANSION_STAGES = ["identified", "qualified", "proposed", "closed"] as const;
export const EXPANSION_OUTCOMES = ["won", "lost", "dropped"] as const;

export interface ApiExpansion {
  id: string;
  account_id: string;
  name: string;
  stage: string;
  outcome: string | null;
  expansion_type: string;
  product: string | null;
  expected_arr: number | null;
  final_arr: number | null;
  currency: string;
  confidence: string | null;
  owner_email: string | null;
  expected_close_date: string | null;
  outcome_date: string | null;
  stage_changed_at: string;
  last_activity_at: string;
  created_at: string;
}

export async function readExpansion(f: { stage?: string[]; outcome?: string; accountId?: string; ownerEmail?: string }): Promise<ApiExpansion[]> {
  const e = schema.expansionOpportunities;
  const where: SQL[] = [];
  if (f.outcome) where.push(eq(e.outcome, f.outcome));
  if (f.accountId) where.push(eq(e.clientId, f.accountId));
  if (f.ownerEmail) where.push(eq(e.ownerEmail, f.ownerEmail.toLowerCase()));
  const rows = await withDbTimeout(
    getDb().select().from(e).where(where.length ? and(...where) : undefined).orderBy(desc(e.lastActivityAt)),
  );
  return rows
    .filter((r) => !f.stage?.length || f.stage.includes(r.stage))
    .map((r) => ({
      id: r.id,
      account_id: r.clientId,
      name: r.name,
      stage: r.stage,
      outcome: r.outcome,
      expansion_type: r.expansionType,
      product: r.product,
      expected_arr: r.expectedArr,
      final_arr: r.finalArr,
      currency: r.currency,
      confidence: r.confidence,
      owner_email: r.ownerEmail,
      expected_close_date: r.expectedCloseDate,
      outcome_date: r.outcomeDate,
      stage_changed_at: r.stageChangedAt.toISOString(),
      last_activity_at: r.lastActivityAt.toISOString(),
      created_at: r.createdAt.toISOString(),
    }));
}
