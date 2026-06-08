export interface ParsedStop {
  address:      string;
  parcelCount?: number;
  notes?:       string;
}

/**
 * Parses messy real-world CSV into ParsedStop[].
 * Handles: trailing commas, mixed line endings, quoted fields, empty rows, BOM.
 */
export function parseStopsCsv(raw: string): ParsedStop[] {
  const cleaned = raw.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  const lines = cleaned.split(/\r?\n|\r/).filter(l => l.trim());
  const stops: ParsedStop[] = [];

  for (const line of lines) {
    const fields = line.match(/(".*?"|[^,]+)/g)?.map(f =>
      f.replace(/^"|"$/g, '').trim()
    ) ?? [];

    if (!fields.length) continue;

    const addressField = fields.reduce((a, b) => (b.length > a.length ? b : a), '');
    if (!addressField || addressField.length < 4) continue;

    const countField  = fields.find(f => /^\d+$/.test(f) && f !== addressField);
    const parcelCount = countField ? parseInt(countField, 10) : undefined;
    const noteFields  = fields.filter(f => f !== addressField && f !== countField);

    stops.push({
      address:     addressField,
      parcelCount,
      notes:       noteFields.join(' ').trim() || undefined,
    });
  }

  return stops;
}