import { NextResponse } from "next/server";
import { buildTemplateXlsx, parseWorkbook, rowsToRecords, validateRows } from "@/lib/import/clients";
import { csmDirectory, getClients, persistImport } from "@/lib/data";
import { isSuperAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Download the import template (.xlsx). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("template") != null) {
    const buf = buildTemplateXlsx();
    return new NextResponse(buf.buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="lumofy-clients-template.xlsx"',
      },
    });
  }
  return NextResponse.json({ ok: true, message: "POST a file (multipart/form-data) with mode=preview|commit." });
}

/** Preview (dry-run) or commit a bulk client import. */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") ?? "preview");

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });
    }

    const buf = await file.arrayBuffer();
    const raw = parseWorkbook(buf);
    if (raw.length === 0) {
      return NextResponse.json({ ok: false, error: "The file has no data rows." }, { status: 400 });
    }

    const existingIds = new Set((await getClients()).map((c) => c.id));
    const { preview, rows } = validateRows(raw, existingIds);

    if (mode === "commit") {
      // Commit writes across the whole clients table, unscoped by owner — had
      // no auth check at all beyond "signed in". Preview stays open (it's a
      // read-only dry run); only the actual write is admin-gated.
      if (!(await isSuperAdmin())) {
        return NextResponse.json({ ok: false, error: "Only an admin can import clients." }, { status: 403 });
      }
      if (rows.length === 0) {
        return NextResponse.json({ ok: false, error: "No valid rows to import.", preview }, { status: 400 });
      }
      const records = rowsToRecords(rows, await csmDirectory());
      const imported = await persistImport(records);
      return NextResponse.json({ ok: true, imported, preview });
    }

    return NextResponse.json({ ok: true, preview });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
