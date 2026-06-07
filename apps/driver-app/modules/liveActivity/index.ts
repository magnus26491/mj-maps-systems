/**
 * modules/liveActivity/index.ts
 *
 * React Native JS bridge to iOS Live Activity (WidgetKit / Dynamic Island).
 * Uses react-native-widget-extension package.
 *
 * Safe no-op on Android and older iOS versions — areActivitiesEnabled() guards all calls.
 */
import { Platform } from 'react-native';

// react-native-widget-extension — typed bridge to native ActivityKit
// eslint-disable-next-line @typescript-eslint/no-var-requires
const widgetExt = require('react-native-widget-extension');

export interface ShiftActivityState {
  stopNumber:  number;
  totalStops:  number;
  streetName:  string;
  etaMinutes:  number;
  progressPct: number;
}

function areActivitiesEnabled(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return widgetExt.areActivitiesEnabled?.() ?? false;
  } catch {
    return false;
  }
}

export async function startShiftActivity(state: ShiftActivityState): Promise<void> {
  if (!areActivitiesEnabled()) return;
  try {
    await widgetExt.startActivity(state);
  } catch { /* non-fatal */ }
}

export async function updateShiftActivity(state: ShiftActivityState): Promise<void> {
  if (!areActivitiesEnabled()) return;
  try {
    await widgetExt.updateActivity(state);
  } catch { /* non-fatal */ }
}

export async function endShiftActivity(): Promise<void> {
  if (!areActivitiesEnabled()) return;
  try {
    await widgetExt.endActivity();
  } catch { /* non-fatal */ }
}