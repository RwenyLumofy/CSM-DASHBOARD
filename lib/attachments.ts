/* =========================================================================
   Attachment constants shared by server and client code (pure data, no
   Supabase/Node imports) — see lib/integrations/supabase-storage.ts for the
   server-only signed-URL logic that actually talks to Supabase.
   ========================================================================= */

export const ATTACHMENTS_BUCKET = "client-attachments";

/** Extensions accepted for manually-uploaded attachments. */
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  "pdf", "png", "jpg", "jpeg", "ppt", "pptx", "doc", "docx", "xls", "xlsx", "csv",
] as const;

export const MAX_ATTACHMENT_BYTES = 30 * 1024 * 1024; // 30MB

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
}

export function isAllowedAttachmentExtension(ext: string): boolean {
  return (ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}
