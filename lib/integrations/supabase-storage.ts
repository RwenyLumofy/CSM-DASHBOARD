/* =========================================================================
   Supabase Storage — hosts manually-uploaded client attachments (PDF, images,
   Office docs, CSV). The project URL is derived from DATABASE_URL's pooled
   `postgres.<project-ref>` username so the app only needs two Supabase API
   keys configured (see lib/config.ts): SUPABASE_SERVICE_ROLE_KEY (server-only)
   and NEXT_PUBLIC_SUPABASE_ANON_KEY (safe to expose — the browser only ever
   uses it alongside a one-time signed upload token, never on its own).

   Files upload directly from the browser to Supabase via a signed upload URL
   — they never pass through our Next.js server, so they aren't subject to
   Vercel's serverless request-body size limit (~4.5MB). This module is
   server-only; never import it from a client component (see lib/attachments.ts
   for the pure constants/validation that ARE safe to import from the client).
   ========================================================================= */

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config";
import { ATTACHMENTS_BUCKET, extensionOf, isAllowedAttachmentExtension } from "@/lib/attachments";

/** Derive the Supabase project URL from the pooled connection string's
 *  `postgres.<project-ref>` username — one less env var to configure, and it
 *  can never drift out of sync with the database the app actually talks to. */
function deriveSupabaseUrl(): string {
  const raw = env.directDatabaseUrl || env.databaseUrl;
  if (!raw) throw new Error("DATABASE_URL is required to derive the Supabase project URL.");
  const user = new URL(raw).username; // "postgres.<project-ref>" on the Supabase pooler
  const ref = user.split(".")[1];
  if (!ref) throw new Error("Could not derive the Supabase project ref from DATABASE_URL's username.");
  return `https://${ref}.supabase.co`;
}

/** The project's public API URL — safe to hand to a client component as a
 *  prop (it's not a secret; only the keys used alongside it are). */
export function getSupabaseProjectUrl(): string {
  return deriveSupabaseUrl();
}

let adminClient: SupabaseClient | null = null;

/** Service-role client — required to create signed URLs against a private
 *  bucket. Server-only; never expose SUPABASE_SERVICE_ROLE_KEY to the client. */
function getAdminClient(): SupabaseClient {
  if (!env.supabaseServiceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  if (!adminClient) {
    adminClient = createClient(deriveSupabaseUrl(), env.supabaseServiceRoleKey, { auth: { persistSession: false } });
  }
  return adminClient;
}

let bucketEnsured = false;

/** Idempotently create the private attachments bucket on first use. */
async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  const { error } = await getAdminClient().storage.createBucket(ATTACHMENTS_BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) throw error;
  bucketEnsured = true;
}

export interface UploadTarget {
  path: string;
  signedUrl: string;
  token: string;
}

/** One-time signed upload URL for a new attachment. The browser uploads
 *  directly to this URL (via the Supabase client + returned token). */
export async function createAttachmentUploadTarget(clientId: string, fileName: string): Promise<UploadTarget> {
  const ext = extensionOf(fileName);
  if (!isAllowedAttachmentExtension(ext)) throw new Error(`.${ext || "?"} files aren't supported.`);
  await ensureBucket();
  const path = `${clientId}/${randomUUID()}.${ext}`;
  const { data, error } = await getAdminClient().storage.from(ATTACHMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "Failed to create the upload URL.");
  return { path, signedUrl: data.signedUrl, token: data.token };
}

/** A long-lived (10yr) signed URL, generated ONCE at upload time and stored
 *  as the attachment's `url` — matching how HubSpot-sourced attachments
 *  already store a ready-to-use link. It is never re-signed on read (that
 *  would cost a Storage API round trip per attachment on every page load);
 *  storagePath (see lib/db/schema.ts) is what deletion uses instead. The
 *  bucket stays private either way — nothing can list or guess this path
 *  without the signed link. */
export async function createAttachmentDownloadUrl(path: string): Promise<string> {
  const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60;
  const { data, error } = await getAdminClient().storage.from(ATTACHMENTS_BUCKET).createSignedUrl(path, TEN_YEARS_SECONDS);
  if (error || !data) throw new Error(error?.message ?? "Failed to create a download URL.");
  return data.signedUrl;
}

/** Delete the underlying file for a manually-uploaded attachment. */
export async function deleteAttachmentFile(path: string): Promise<void> {
  const { error } = await getAdminClient().storage.from(ATTACHMENTS_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}
