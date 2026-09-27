export function serializeCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value: unknown) => {
    let text = String(value ?? "");
    // Preserve numeric signs; guard text supplied by users against spreadsheet formulas.
    if (typeof value !== "number" && /^[=+@\-\t\r]/.test(text))
      text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return [
    headers.map(escape).join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\r\n");
}
