export interface PafAddress {
  uprn?:       string;
  line1:       string;
  line2?:      string;
  postTown:    string;
  postcode:    string;
  fullAddress: string;
}

function normalisePostio(raw: any): PafAddress[] {
  if (!Array.isArray(raw?.addresses)) return [];
  return raw.addresses.map((a: any): PafAddress => ({
    uprn:        a.uprn ?? undefined,
    line1:       [a.building_number, a.building_name, a.thoroughfare]
                 .filter(Boolean).join(' ').toUpperCase(),
    line2:       a.dependent_locality || undefined,
    postTown:    (a.post_town ?? '').toUpperCase(),
    postcode:    a.postcode ?? '',
    fullAddress: [
      a.building_number, a.building_name, a.thoroughfare,
      a.dependent_locality, a.post_town, a.postcode,
    ].filter(Boolean).join(', '),
  }));
}

function normaliseSelfHosted(raw: any): PafAddress[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((a: any): PafAddress => ({
    line1:       (a.delivery_point_address ?? a.line1 ?? '').toUpperCase(),
    postTown:    (a.post_town ?? '').toUpperCase(),
    postcode:    a.postcode ?? '',
    fullAddress: [a.line1, a.line2, a.post_town, a.postcode].filter(Boolean).join(', '),
  }));
}

export async function lookupPostcode(formattedPostcode: string): Promise<PafAddress[]> {
  const encoded = encodeURIComponent(formattedPostcode);

  // Primary: Postio
  const postioKey = process.env.POSTIO_KEY;
  if (postioKey) {
    try {
      const res = await fetch(
        `https://api.postio.co.uk/v1/address/postcode/${encoded}`,
        { headers: { 'x-api-key': postioKey }, signal: AbortSignal.timeout(3000) },
      );
      if (res.ok) {
        const data = await res.json();
        const addrs = normalisePostio(data);
        if (addrs.length > 0) return addrs;
      }
    } catch { /* fall through */ }
  }

  // Fallback: self-hosted paf-monorepo
  const selfHosted = process.env.PAF_SELF_HOSTED_URL;
  if (selfHosted) {
    try {
      const res = await fetch(
        `${selfHosted}/lookup/address?postcode=${encoded}`,
        { signal: AbortSignal.timeout(3000) },
      );
      if (res.ok) {
        const data = await res.json();
        const addrs = normaliseSelfHosted(data);
        if (addrs.length > 0) return addrs;
      }
    } catch { /* fall through */ }
  }

  return [];
}