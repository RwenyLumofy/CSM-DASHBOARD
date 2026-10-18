/* =========================================================================
   api_keys persistence. Server-only. Callers gate on isSuperAdmin() for
   create/list/revoke; findActiveApiKey is the per-request lookup.
   ========================================================================= */

import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { getDb, schema, withDbTimeout } from "@/lib/db/client";
import { generateApiKey } from "@/lib/api/keys";

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  createdByEmail: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedByEmail: string | null;
}

type Row = typeof schema.apiKeys.$inferSelect;

function toSummary(r: Row): ApiKeySummary {
  return {
    id: r.id,
    name: r.name,
    prefix: r.keyPrefix,
    createdByEmail: r.createdByEmail,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
    revokedByEmail: r.revokedByEmail,
  };
}

export async function listApiKeys(): Promise<ApiKeySummary[]> {
  const rows = await withDbTimeout(getDb().select().from(schema.apiKeys).orderBy(desc(schema.apiKeys.createdAt)));
  return rows.map(toSummary);
}

/** Creates a key and returns the full secret — the only time it exists
 *  outside the caller's hands. */
export async function createApiKey(name: string, createdByEmail: string): Promise<{ key: string; summary: ApiKeySummary }> {
  const { key, prefix, hash } = generateApiKey();
  const [row] = await withDbTimeout(
    getDb()
      .insert(schema.apiKeys)
      .values({ id: `key-${randomUUID()}`, name, keyPrefix: prefix, keyHash: hash, createdByEmail })
      .returning(),
  );
  return { key, summary: toSummary(row) };
}

/** Revocation is permanent and immediate: the next request with the key 401s.
 *  The row stays, so Settings still shows who had access and until when. */
export async function revokeApiKey(id: string, revokedByEmail: string): Promise<boolean> {
  const rows = await withDbTimeout(
    getDb()
      .update(schema.apiKeys)
      .set({ revokedAt: new Date(), revokedByEmail })
      .where(and(eq(schema.apiKeys.id, id), isNull(schema.apiKeys.revokedAt)))
      .returning({ id: schema.apiKeys.id }),
  );
  return rows.length > 0;
}

/** The active (unrevoked) key with this hash, or null. */
export async function findActiveApiKey(hash: string): Promise<{ id: string; name: string } | null> {
  const rows = await withDbTimeout(
    getDb()
      .select({ id: schema.apiKeys.id, name: schema.apiKeys.name })
      .from(schema.apiKeys)
      .where(and(eq(schema.apiKeys.keyHash, hash), isNull(schema.apiKeys.revokedAt)))
      .limit(1),
    10_000,
  );
  return rows[0] ?? null;
}

/** Stamps last_used_at, at most once a minute per key, so a busy integration
 *  doesn't turn every read into a write. */
export async function touchApiKey(id: string): Promise<void> {
  const cutoff = new Date(Date.now() - 60_000);
  await getDb()
    .update(schema.apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(schema.apiKeys.id, id), or(isNull(schema.apiKeys.lastUsedAt), lt(schema.apiKeys.lastUsedAt, cutoff))));
}
