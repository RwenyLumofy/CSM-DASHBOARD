"use server";

/* Settings-side mutations for the project-management module:
   - the option vocabularies (status/type) — super-admin only;
   - the shared template library — any CSM/super-admin can create a template;
     editing/deleting is limited to the creator or a super-admin. */

import { isAdminOrSuper } from "@/lib/auth";
import { getCurrentActor } from "@/lib/projects/actor";
import { createTemplate, editTemplate, getTemplate, removeTemplate, saveProjectConfig } from "@/lib/projects/data";
import { normalizeProjectConfig, type ProjectConfig } from "@/lib/projects/config";
import type { ProjectTemplateStructure } from "@/lib/projects/types";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/* ------------------------------------------------------------------- config */

export async function saveProjectConfigAction(config: ProjectConfig): Promise<ActionResult> {
  if (!(await isAdminOrSuper())) return { ok: false, error: "Only super-admins can change project options." };
  try {
    await saveProjectConfig(normalizeProjectConfig(config));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/* ---------------------------------------------------------------- templates */

/** Any signed-in CSM (or super-admin) may create a shared template. */
export async function createTemplateAction(input: {
  name: string;
  description?: string | null;
  type?: string | null;
  structure: ProjectTemplateStructure;
}): Promise<ActionResult & { templateId?: string }> {
  const actor = await getCurrentActor();
  if (!actor.email) return { ok: false, error: "You must be signed in to create a template." };
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "A template name is required." };
  try {
    const t = await createTemplate({
      name,
      description: input.description ?? null,
      type: input.type ?? null,
      structure: input.structure ?? { milestones: [] },
      createdByEmail: actor.email,
      createdByName: actor.name,
    });
    return { ok: true, templateId: t.id };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Editable by the template's creator or any super-admin. */
async function canManageTemplate(templateId: string): Promise<{ ok: true } | ActionResult> {
  const template = await getTemplate(templateId);
  if (!template) return { ok: false, error: "Template not found." };
  if (await isAdminOrSuper()) return { ok: true };
  const actor = await getCurrentActor();
  if (actor.email && template.createdByEmail && actor.email === template.createdByEmail.toLowerCase()) return { ok: true };
  return { ok: false, error: "Only the template's creator or a super-admin can change it." };
}

export async function updateTemplateAction(
  templateId: string,
  patch: { name?: string; description?: string | null; type?: string | null; structure?: ProjectTemplateStructure },
): Promise<ActionResult> {
  const auth = await canManageTemplate(templateId);
  if (!auth.ok) return auth;
  if (patch.name !== undefined && !patch.name.trim()) return { ok: false, error: "A template name is required." };
  try {
    await editTemplate(templateId, patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function deleteTemplateAction(templateId: string): Promise<ActionResult> {
  const auth = await canManageTemplate(templateId);
  if (!auth.ok) return auth;
  try {
    await removeTemplate(templateId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
