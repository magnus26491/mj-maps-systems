/**
 * modules/shiftNotification/index.ts
 *
 * Android-only persistent notification using expo-notifications.
 * On iOS this is a no-op — Live Activity handles it instead.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const CHANNEL_ID = 'shift_progress';
const NOTIF_ID   = 'shift_progress_persistent';

export async function setupShiftNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name:        'Shift Progress',
    importance:  Notifications.AndroidImportance.LOW,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    showBadge:   false,
  });
}

export async function showShiftProgressNotification(
  stopNumber: number,
  totalStops: number,
  streetName: string,
): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_ID,
    content: {
      title:    `MJ Maps · Stop ${stopNumber} of ${totalStops}`,
      body:     streetName,
      data:     { stopNumber, totalStops },
      sticky:   true,
      priority: 'default',
      color:    '#4fc3f7',
    },
    trigger: null,
  });
}

export async function dismissShiftProgressNotification(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.dismissNotificationAsync(NOTIF_ID);
}