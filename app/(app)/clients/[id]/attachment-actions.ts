"use server";

/* Manual attachment upload from the client profile — any user who can view
   the client may upload. Files go straight from the browser to Supabase
   Storage via a signed upload URL (see lib/integrations/supabase-storage.ts);
   these actions only issue that URL and then record the resulting metadata. */

import { getClientById, getAttachmentUploadTarget, recordAttachment, deleteAttachment } from "@/lib/data";
import { integrations } from "@/lib/config";
import { isAllowedAttachmentExtension, extensionOf, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import type { Attachment } from "@/lib/types";

export interface AttachmentActionResult {
  ok: boolean;
  error?: string;
}

async function guard(clientId: string): Promise<AttachmentActionResult | null> {
  if (!integrations.supabaseStorage()) {
    return { ok: false, error: "File storage isn't configured yet — set SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY." };
  }
  const client = await getClientById(clientId);
  if (!client) return { ok: false, error: "Not found or you don't have access to this account." };
  return null;
}

export async function createAttachmentUploadUrlAction(
  clientId: string,
  fileName: string,
  size: number,
): Promise<AttachmentActionResult & { path?: string; signedUrl?: string; token?: string }> {
  const blocked = await guard(clientId);
  if (blocked) return blocked;
  const ext = extensionOf(fileName);
  if (!isAllowedAttachmentExtension(ext)) {
    return { ok: false, error: `.${ext || "?"} files aren't supported.` };
  }
  if (size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: `File is larger than ${Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB.` };
  }
  try {
    const target = await getAttachmentUploadTarget(clientId, fileName);
    return { ok: true, ...target };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function recordAttachmentAction(
  clientId: string,
  input: { path: string; name: string; size: number; dealId: string | null },
): Promise<AttachmentActionResult & { attachment?: Attachment }> {
  const blocked = await guard(clientId);
  if (blocked) return blocked;
  try {
    const attachment = await recordAttachment({
      clientId,
      dealId: input.dealId,
      path: input.path,
      name: input.name,
      extension: extensionOf(input.name),
      size: input.size,
    });
    return { ok: true, attachment };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteAttachmentAction(clientId: string, attachmentId: string): Promise<AttachmentActionResult> {
  const blocked = await guard(clientId);
  if (blocked) return blocked;
  try {
    await deleteAttachment(clientId, attachmentId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
