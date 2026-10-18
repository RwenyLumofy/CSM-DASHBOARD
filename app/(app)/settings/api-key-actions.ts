"use server";

/* =========================================================================
   Settings → Integrations → API keys server actions.

   Super-admin only, checked here on the server — the hidden section is not
   the gate. A key reads every account through /api/v1, so issuing one is a
   workspace-level grant, the same tier that manages integrations.
   ========================================================================= */

import { revalidatePath } from "next/cache";
import { getCurrentUserEmail, isSuperAdmin } from "@/lib/auth";
import { hasDatabase } from "@/lib/config";
import { createApiKey, listApiKeys, revokeApiKey, type ApiKeySummary } from "@/lib/api/store";

export interface ApiKeyActionResult {
  ok: boolean;
  error?: string;
  /** Present only on create — the one time the full key is returned. */
  key?: string;
  keys?: ApiKeySummary[];
}

async function guard(): Promise<{ email: string } | { error: string }> {
  if (!(await isSuperAdmin())) return { error: "Super-admin access required." };
  if (!hasDatabase()) return { error: "No database configured." };
  // Auth off (local dev) has no email; the row still needs an author.
  return { email: (await getCurrentUserEmail()) ?? "local-dev" };
}

export async function createApiKeyAction(name: string): Promise<ApiKeyActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Give the key a name, so you know what to revoke later." };
  if (clean.length > 80) return { ok: false, error: "Keep the name under 80 characters." };
  try {
    const { key } = await createApiKey(clean, g.email);
    revalidatePath("/settings");
    return { ok: true, key, keys: await listApiKeys() };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function revokeApiKeyAction(id: string): Promise<ApiKeyActionResult> {
  const g = await guard();
  if ("error" in g) return { ok: false, error: g.error };
  try {
    const revoked = await revokeApiKey(id, g.email);
    revalidatePath("/settings");
    return revoked ? { ok: true, keys: await listApiKeys() } : { ok: false, error: "That key is already revoked or no longer exists." };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
