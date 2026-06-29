// Web stub for expo-haptics — vibration API where available, no-op otherwise.

export enum ImpactFeedbackStyle {
  Light  = 'light',
  Medium = 'medium',
  Heavy  = 'heavy',
}

export enum NotificationFeedbackType {
  Success = 'success',
  Warning = 'warning',
  Error   = 'error',
}

export enum SelectionFeedbackStyle {
  Selection = 'selection',
}

export async function impactAsync(_style?: ImpactFeedbackStyle): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

export async function notificationAsync(_type?: NotificationFeedbackType): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate([10, 50, 10]);
  }
}

export async function selectionAsync(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(5);
  }
}

export default {
  impactAsync,
  notificationAsync,
  selectionAsync,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
};
