export interface ParsedStop {
  address:      string;
  parcelCount?: number;
  notes?:       string;
}

/**
 * Parses messy real-world CSV into ParsedStop[].
 * Handles: header rows, trailing commas, mixed line endings, quoted fields,
 * empty rows, BOM, unquoted addresses.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export function parseStopsCsv(raw: string): ParsedStop[] {
  const cleaned = raw.replace(/^\uFEFF/, '').trim();
  if (!cleaned) return [];

  const lines = cleaned.split(/\r?\n|\r/).filter(l => l.trim());
  const stops: ParsedStop[] = [];

  // Detect and skip header row
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase();
    const headerKeywords = ['address', 'notes', 'parcel', 'postcode', 'customer', 'contact'];
    const headerScore = headerKeywords.filter(k => firstLine.includes(k)).length;
    if (headerScore >= 2) lines.shift();
  }

  for (const line of lines) {
    const fields = parseCsvLine(line);
    if (!fields.length) continue;

    // Quoted address: first field contains the full address (commas inside quotes preserved)
    // Unquoted: use longest field as address, BUT if first field is short (< 15 chars)
    // and line is long (> 25), the address spans multiple fields. Combine from start.
    let addressField: string;
    const first = fields[0] ?? '';
    if (first.startsWith('"') && first.endsWith('"')) {
      addressField = first.slice(1, -1); // strip quotes from first field
    } else {
      addressField = fields.reduce((a, b) => (b.length > a.length ? b : a), '');
      // If longest field is too short and line is long enough, address spans multiple fields
      if (addressField.length < 15 && line.length >= 16 && fields.length > 1) {
        let combined = first;
        for (let i = 1; i < fields.length; i++) {
          const nextLen = combined.length + 2 + fields[i].length;
          if (nextLen > 35) break; // stop before address gets too long
          combined += ', ' + fields[i];
        }
        addressField = combined;
      }
    }

    if (!addressField || addressField.length < 4) continue;

    // Count field: pure integer that is clearly a parcel count (not a postcode)
    // Filter out fields that look like UK postcodes (e.g. "BS1 4RQ" or "EC1A 1BB")
    const postcodeRegex = /^[A-Z0-9]{2,4}\s?[0-9][A-Z0-9]{2}$/;
    const countField = fields.find(f =>
      /^\d+$/.test(f) &&
      f !== addressField &&
      f.length < 5 &&
      !postcodeRegex.test(f)
    );
    const parcelCount = countField ? parseInt(countField, 10) : undefined;

    // Notes = remaining fields after address and optional count
    const noteFields = fields.filter(f =>
      f !== addressField &&
      f !== countField &&
      f.length > 0
    );

    stops.push({
      address:    addressField,
      parcelCount,
      notes:      noteFields.join(' ').trim() || undefined,
    });
  }

  return stops;
}