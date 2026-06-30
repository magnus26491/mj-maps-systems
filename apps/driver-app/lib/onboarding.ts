import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'mj_has_seen_onboarding_v1';

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch { /* non-fatal */ }
}
