/**
 * POD (Proof of Delivery) — B2B feature module.
 *
 * STATUS: FEATURE FLAGGED — disabled by default for individual drivers.
 * Enabled when EXPO_PUBLIC_ENABLE_POD=true is set in the build env
 * (dispatcher-tier subscribers only).
 *
 * When enabled, this module adds:
 *  · Photo capture via expo-image-picker (quality 0.75 JPEG)
 *  · Digital signature pad via @amwebexpert/react-native-sign-here (SVG)
 *  · Parcel barcode scan via expo-camera CameraView (MLKit)
 *  · All captured assets attached to QueuedEvent before flush
 *
 * Individual driver builds (App Store / Play Store) compile this module
 * but it remains dormant — no UI is rendered, no permissions are requested.
 * This keeps the binary clean and avoids unnecessary permission prompts.
 *
 * To enable for a B2B customer build:
 *  1. Set EXPO_PUBLIC_ENABLE_POD=true in eas.json build profile
 *  2. POD screens will automatically appear in delivery flow
 *  3. AtStopScreen gains: Photo | Sign | Scan actions
 */

export const POD_ENABLED = process.env.EXPO_PUBLIC_ENABLE_POD === 'true';

export interface PodCapture {
  photoUri?:    string;   // Local file URI — uploaded async post-flush
  signatureSvg?: string;   // SVG string
  barcodeValue?: string;   // Barcode scan result
  capturedAt:    number;   // Unix ms
}

/**
 * Stub capture function for individual driver builds.
 * Returns null — no UI, no permissions, no overhead.
 */
export async function capturePod(
  _stopId: string,
  _type?: 'photo' | 'signature' | 'barcode',
): Promise<{ photoUri?: string; signatureSvg?: string; parcelId?: string } | null> {
  if (!POD_ENABLED) return null;
  throw new Error('POD capture not available in this build. Set EXPO_PUBLIC_ENABLE_POD=true.');
}

/**
 * Check if POD capture is available in this build.
 * Use this guard before rendering any POD UI elements.
 */
export function isPodAvailable(): boolean {
  return POD_ENABLED;
}

// Re-export individual capture components for use in AtStopScreen
export { usePodCapture } from './usePodCapture';
export type { PodCapture as PodCaptureType } from './usePodCapture';
export { PhotoCapture } from './PhotoCapture';
export { SignatureCapture } from './SignatureCapture';
export { BarcodeCapture } from './BarcodeCapture';
export { PodCaptureSection } from './PodCaptureSection';
