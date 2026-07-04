import { NextResponse } from "next/server";
import { getPropertyDefinitions } from "@/lib/data";
import { isSuperAdmin } from "@/lib/auth";

export async function GET() {
  const defs = await getPropertyDefinitions();
  return NextResponse.json(defs);
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { key, label, options, hiddenOptions, group, sortOrder } = body as {
    key: string;
    label?: string;
    options?: string[];
    hiddenOptions?: string[];
    group?: string;
    sortOrder?: number;
  };
  if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });

  // Editing ANY property definition (default or custom) is super-admin-only.
  // Per-client VALUES go through a different path (client.properties).
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Only an admin can edit properties." }, { status: 403 });
  }

  const defs = await getPropertyDefinitions();
  const existing = defs.find((d) => d.key === key);
  if (!existing) return NextResponse.json({ error: "property not found" }, { status: 404 });

  // Read-only definitions (the deal_* picklists reconciled from live HubSpot
  // on every sync — see reconcileDealSelectOptions) have their OPTION LIST
  // owned by the sync, not the admin: any manual edit here would just be
  // silently reverted on the next sync run, so reject it outright instead of
  // giving false confidence. Label/sortOrder/hiddenOptions are cosmetic and
  // stay admin-editable even for read-only definitions.
  if (existing.isReadOnly && options !== undefined) {
    return NextResponse.json(
      { error: "This property's options are synced automatically from HubSpot and can't be edited manually." },
      { status: 400 },
    );
  }

  const { upsertPropertyDefinition, updatePropertyHiddenOptions } = await import("@/lib/repo/drizzle");

  // Apply label/options/group/sortOrder changes if any
  if (label !== undefined || options !== undefined || group !== undefined || sortOrder !== undefined) {
    await upsertPropertyDefinition({
      ...existing,
      ...(label !== undefined && { label }),
      ...(options !== undefined && { options }),
      ...(group !== undefined && { group: group as typeof existing.group }),
      ...(sortOrder !== undefined && { sortOrder }),
    });
  }

  // Apply hiddenOptions change independently (upsert SET clause intentionally excludes it)
  if (hiddenOptions !== undefined) {
    await updatePropertyHiddenOptions(key, hiddenOptions);
  }

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  // Creating a property definition is super-admin-only.
  if (!(await isSuperAdmin())) {
    return NextResponse.json({ error: "Only an admin can create properties." }, { status: 403 });
  }
  const body = await req.json();
  const { key, label, type, options, group, sortOrder } = body as {
    key: string;
    label: string;
    type: string;
    options?: string[];
    group?: string;
    sortOrder?: number;
  };
  if (!key || !label || !type) {
    return NextResponse.json({ error: "key, label, type required" }, { status: 400 });
  }

  const { upsertPropertyDefinition } = await import("@/lib/repo/drizzle");
  await upsertPropertyDefinition({
    key,
    label,
    type: type as "text" | "number" | "currency" | "date" | "single_select" | "multi_select",
    options: options ?? [],
    hiddenOptions: [],
    group: (group ?? "general") as "contract" | "client" | "product" | "engagement" | "dates",
    sortOrder: sortOrder ?? 0,
    isSystem: false,
    isReadOnly: false,
  });
  return NextResponse.json({ ok: true });
}
