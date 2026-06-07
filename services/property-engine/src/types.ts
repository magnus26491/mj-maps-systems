/**
 * Property Engine — types
 *
 * Resolves UK delivery addresses to exact property-level coordinates.
 * Fixes the "last 50 metres" problem: postcode centroids can be 50-200m
 * from the actual front door, gate, or loading bay.
 *
 * Data sources (priority order):
 *   1. OS AddressBase Premium — official Royal Mail PAF + UPRN
 *   2. OS Names API — named properties (farms, estates, business parks)
 *   3. OpenStreetMap Nominatim — free fallback, ~60% property-level accuracy
 *   4. what3words — driver-reported pin corrections stored per UPRN
 *   5. Postcode centroid — last resort, flagged as LOW_CONFIDENCE
 */

export type PinConfidence = 'EXACT' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface PropertyPin {
  /** Unique Property Reference Number (UK government UPRN) */
  uprn:          string | null;
  lat:           number;
  lng:           number;
  confidence:    PinConfidence;
  /** Source that provided this pin */
  source:        'os_addressbase' | 'os_names' | 'nominatim' | 'w3w' | 'driver_reported' | 'postcode_centroid' | 'geoapify';
  /** Full formatted address as resolved */
  formattedAddress: string;
  /** Entrance-specific data if available */
  entrance?: {
    type:        'main' | 'side' | 'rear' | 'loading_bay' | 'gate';
    description: string | null;
    /** Buzzer/intercom code if driver-reported */
    accessCode:  string | null;
  };
  /** Driver-reported notes for this property */
  notes:         string | null;
  /** Photo URLs of entrance/gate (driver-uploaded) */
  photoUrls:     string[];
  resolvedAt:    number;
}

export interface AddressLookupRequest {
  rawAddress:  string;
  postcode?:   string;
  /** If true, also return alternative entrance points */
  withEntrances?: boolean;
}

export interface AddressLookupResult {
  primary:      PropertyPin;
  alternatives: PropertyPin[];
  resolvedIn:   number; // ms
}
