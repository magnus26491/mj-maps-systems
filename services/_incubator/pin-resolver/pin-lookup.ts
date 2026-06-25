/**
 * services/pin-resolver/pin-lookup.ts
 *
 * Bridges pin-resolver and the geocode_pins DB table.
 * Called during route enrichment to inject community-verified pins
 * into the resolver priority chain.
 */
import { getVerifiedPin } from '../db/pin-store.js';


export interface CommunityPin {
  lat: number;
  lng: number;
  verifyCount: number;
  verifiedAt: string;
}


/**
 * Look up a community-verified pin for a normalised address.
 * Returns null if no verified pin exists (confidence < 1 or no row).
 */
export async function lookupCommunityPin(
  normalisedAddress: string,
): Promise<CommunityPin | null> {
  const pin = await getVerifiedPin(normalisedAddress);
  if (!pin) return null;

  return {
    lat: pin.lat,
    lng: pin.lng,
    verifyCount: pin.contributorCount,
    verifiedAt: new Date().toISOString(),
  };
}


/**
 * Normalise an address string for consistent geocode_pins lookup.
 * Uppercases, strips extra whitespace, removes punctuation that varies
 * between geocoders (commas, full stops).
 */
export function normaliseAddress(address: string): string {
  return address
    .toUpperCase()
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
