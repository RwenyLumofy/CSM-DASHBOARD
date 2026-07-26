/* =========================================================================
   CSV export helpers — shared by any table that offers "Export CSV".

   Two things here are easy to get wrong and both bite real users:

   1. ESCAPING. A value containing a comma, a double quote, or a newline must
      be quoted, with inner quotes doubled ("" per RFC 4180). Account names in
      this book genuinely contain commas ("Bank of Bahrain & Kuwait, B.S.C.").

   2. THE UTF-8 BOM. Excel on Windows assumes the ANSI codepage for a .csv
      with no byte-order mark, which renders Arabic account names
      (شركة الوم الطبية) as mojibake. A leading ﻿ makes Excel read it as
      UTF-8. Numbers/Sheets ignore the BOM, so it's safe everywhere.
   ========================================================================= */

export type CsvCell = string | number | null | undefined;

/** Quote a single field per RFC 4180, only when it actually needs it. */
function escapeCell(value: CsvCell): string {
  if (value == null) return "";
  const s = String(value);
  // Leading =, +, -, @ are treated as formulas by Excel/Sheets (CSV injection).
  // Prefix with a single quote so they render as literal text.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Build a CSV string from a header row + data rows. */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCell).join(","));
  // CRLF is what RFC 4180 specifies and what Excel expects.
  return lines.join("\r\n");
}

/** Trigger a browser download of `csv` as `filename`. Client-side only. */
export function downloadCsv(filename: string, csv: string): void {
  // ﻿ = UTF-8 BOM — see the note at the top of this file.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so Safari has taken the blob.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `clients-2026-07-26.csv` — a date-stamped, filesystem-safe filename. */
export function stampedFilename(base: string, date = new Date()): string {
  return `${base}-${date.toISOString().slice(0, 10)}.csv`;
}
