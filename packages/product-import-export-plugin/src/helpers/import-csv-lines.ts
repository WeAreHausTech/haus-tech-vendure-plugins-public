/**
 * The lines of an import CSV that the importer reads: blank and comma-only lines are dropped, so
 * the header is line 1 and data row N is line N + 1 for everything that reports a row.
 */
export function importCsvLines(csv: string): string[] {
  return csv.split('\n').filter((line) => {
    const trimmed = line.trim()
    return trimmed !== '' && !/^,+$/.test(trimmed)
  })
}

/** Splits one CSV line on commas that are not inside double quotes. */
export function splitCsvLine(line: string): string[] {
  return line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
}

/** A header cell as the CSV parser reads it: no byte order mark, no surrounding quotes or space. */
export function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^"(.*)"$/, '$1')
}

/** The header cells of the import CSV, read the same way by every step of an import. */
export function importCsvHeaders(lines: string[]): string[] {
  return lines.length === 0 ? [] : splitCsvLine(lines[0]).map(normalizeHeader)
}
