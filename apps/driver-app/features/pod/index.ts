/**
 * POD (Proof of Delivery) — B2B feature module.
 *
 * STATUS: FEATURE FLAGGED — disabled by default for individual drivers.
 * Enabled when EXPO_PUBLIC_ENABLE_POD=true is set in the build env
 * (dispatcher-tier subscribers only).
 *
 * When enabled, this module adds:
 *  · Photo capture at delivery (expo-camera)
 *  · Digital signature pad (react-native-signature-canvas)
 *  · Parcel barcode scan (expo-barcode-scanner)
 *  · POD receipt generation (PDF via expo-print)
 *  · All captured assets attached to QueuedEvent before flush
 *
 * Individual driver builds (App Store / Play Store) compile this module
 * but it remains dormant — no UI is rendered, no permissions are requested.
 * This keeps the binary clean and avoids unnecessary permission prompts.
 *
 * To enable for a B2B customer build:
 *  1. Set EXPO_PUBLIC_ENABLE_POD=true in eas.json build profile
 *  2. POD screens will automatically appear in delivery flow
 *  3. Stop delivery screen gains: [Photo] [Sign] [Scan] actions
 */

export const POD_ENABLED = process.env.EXPO_PUBLIC_ENABLE_POD === 'true';

export interface PodCapture {
  photoUri?:   string;  // Local file URI — uploaded async post-flush
  signature?:  string;  // Base64 SVG string
  parcelId?:   string;  // Barcode scan result
  capturedAt:  number;  // Unix ms
}

/**
 * Stub capture function for individual driver builds.
 * Returns null — no UI, no permissions, no overhead.
 * B2B build replaces this with the real camera/signature flow.
 */
export async function capturePod(
  _stopId: string,
): Promise<PodCapture | null> {
  if (!POD_ENABLED) return null;

  // B2B implementation injected here via EAS build profile.
  // This file is the integration point — do not add camera logic here directly.
  // See: apps/driver-app/features/pod/capture.tsx (built in B2B tier only)
  throw new Error('POD capture.tsx not bundled in this build. Set EXPO_PUBLIC_ENABLE_POD=true.');
}

/**
 * Check if POD capture is available in this build.
 * Use this guard before rendering any POD UI elements.
 */
export function isPodAvailable(): boolean {
  return POD_ENABLED;
}
