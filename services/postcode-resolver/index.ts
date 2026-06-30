/** Stub — postcode-resolver service (planned, not yet implemented). */

export interface AddressCandidate {
  id:          string;
  address:     string;
  fullAddress: string;
  line1:       string;
  line2?:      string;
  postTown:    string;
  postcode:    string;
  lat?:        number;
  lng?:        number;
  uprn?:       string;
  confidence:  number;
  source?:     string;
}

/** Normalise a UK postcode to uppercase with standard spacing (e.g. "sw1a2aa" → "SW1A 2AA"). */
export function normalisePostcode(postcode: string): string {
  const clean = postcode.toUpperCase().replace(/\s+/g, '');
  if (clean.length > 3) return `${clean.slice(0, -3)} ${clean.slice(-3)}`;
  return clean;
}

/** Resolve a UK postcode to a list of address candidates. */
export async function resolvePostcode(
  _postcode: string,
  _apiKey: string,
): Promise<{ candidates: AddressCandidate[] }> {
  return { candidates: [] };
}
