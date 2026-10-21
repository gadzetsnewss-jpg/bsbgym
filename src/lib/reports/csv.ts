/**
 * Browser CSV download. This is not a PDF or Excel export.
 */

export function toCsvCell(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildCsv(headers: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const lines = [headers.map(toCsvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(toCsvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadCsvTable<T>(
  filename: string,
  columns: readonly { header: string; value: (row: T) => string | number | null | undefined }[],
  rows: readonly T[],
): void {
  const csv = buildCsv(
    columns.map((column) => column.header),
    rows.map((row) => columns.map((column) => column.value(row))),
  );
  downloadCsv(filename, csv);
}
