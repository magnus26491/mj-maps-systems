/**
 * Delivery Intake Engine
 * 
 * Pure service functions for processing delivery stops.
 * No UI logic - input validation, geocoding, duplicate detection, risk assessment.
 * 
 * Input:
 *   - postcode
 *   - address
 *   - customer reference
 *   - optional delivery notes
 * 
 * Output:
 *   - validated stop object with lat/lng/confidence/duplicateStatus/riskFactors
 */

export interface IntakeStopInput {
  /** Raw address or postcode entered by driver */
  postcode?: string;
  address: string;
  /** Customer reference (parcel ID, order number) */
  reference?: string;
  /** Delivery notes (access instructions, etc.) */
  notes?: string;
  /** Number of parcels for this stop */
  parcelCount?: number;
}

export interface IntakeStopOutput {
  id: string;
  /** Normalised address for display */
  address: string;
  /** UK postcode (formatted) or null */
  postcode: string | null;
  /** Latitude from geocoding */
  lat: number | null;
  /** Longitude from geocoding */
  lng: number | null;
  /** Geocoding confidence level */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED';
  /** Geocoding source */
  source: 'geoapify' | 'postcode_centroid' | 'community_verified' | 'none';
  /** Duplicate detection status */
  duplicateStatus: 'UNIQUE' | 'DUPLICATE_EXACT' | 'DUPLICATE_SIMILAR';
  /** If duplicate, reference to original stop ID */
  duplicateOf?: string;
  /** Risk factors for this delivery */
  riskFactors: RiskFactor[];
  /** Customer reference */
  reference?: string;
  /** Delivery notes */
  notes?: string;
  /** Number of parcels */
  parcelCount: number;
  /** Time to resolve in ms (0 if from cache) */
  resolvedIn: number;
}

export interface RiskFactor {
  type: 'PARKING' | 'ACCESS' | 'HISTORICAL_FAILURE' | 'APARTMENT' | 'TIGHT_ROAD' | 'BRIDGE' | 'WEIGHT_RESTRICTION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  label: string;
  description: string;
}

export interface BulkIntakeInput {
  stops: IntakeStopInput[];
  /** Options for bulk processing */
  options?: {
    /** Max concurrent API calls (default: 5) */
    concurrency?: number;
    /** Skip duplicate detection (faster for known-good data) */
    skipDuplicateCheck?: boolean;
    /** Skip risk assessment (faster for quick entry) */
    skipRiskAssessment?: boolean;
  };
}

export interface BulkIntakeProgress {
  total: number;
  processed: number;
  successful: number;
  failed: number;
  duplicates: number;
  currentItem?: string;
}

export interface BulkIntakeResult {
  stops: IntakeStopOutput[];
  summary: {
    total: number;
    successful: number;
    failed: number;
    duplicates: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    unresolved: number;
    totalResolvedIn: number;
  };
}

/**
 * Generate unique stop ID
 */
export function generateStopId(): string {
  return `stop-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Normalise UK postcode
 */
export function normalisePostcode(postcode: string): string | null {
  const cleaned = postcode.toUpperCase().replace(/\s+/g, '').trim();
  const UK_PC_REGEX = /^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/;
  const match = UK_PC_REGEX.exec(cleaned);
  if (!match) return null;
  return `${match[1]} ${match[2]}`;
}

/**
 * Check if string is a valid UK postcode
 */
export function isPostcode(input: string): boolean {
  return normalisePostcode(input) !== null;
}

/**
 * Normalise address for comparison (lowercase, remove extra spaces)
 */
export function normaliseAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .trim();
}

/**
 * Check if two addresses are similar (for duplicate detection)
 */
export function addressesAreSimilar(a: string, b: string, threshold = 0.8): boolean {
  const normA = normaliseAddress(a);
  const normB = normaliseAddress(b);
  
  // Exact match after normalisation
  if (normA === normB) return true;
  
  // Levenshtein-based similarity for fuzzy matching
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return true;
  
  const distance = levenshteinDistance(normA, normB);
  const similarity = (maxLen - distance) / maxLen;
  
  return similarity >= threshold;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1       // deletion
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

/**
 * Parse bulk input (multiple postcodes/addresses separated by newlines)
 */
export function parseBulkInput(input: string): IntakeStopInput[] {
  const lines = input
    .split(/[\r\n]+/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  return lines.map(line => {
    // Try to extract postcode from line
    const postcodeMatch = line.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
    const postcode = postcodeMatch ? normalisePostcode(postcodeMatch[1]) : undefined;
    
    // Clean the address (remove postcode if found)
    let address = line;
    if (postcode) {
      address = address.replace(postcodeMatch![0], '').replace(/\s+/g, ' ').trim();
    }
    
    // Try to extract parcel count
    const parcelMatch = address.match(/(\d+)\s*(?:parcel|item|box)/i);
    const parcelCount = parcelMatch ? parseInt(parcelMatch[1], 10) : 1;
    
    // Clean parcel count from address
    if (parcelMatch) {
      address = address.replace(parcelMatch[0], '').replace(/\s+/g, ' ').trim();
    }
    
    return {
      postcode: postcode ?? undefined,
      address: address || line, // Fallback to original line if cleaning removed everything
      parcelCount,
    };
  });
}
