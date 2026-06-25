/**
 * Lightweight i18n — no external packages required.
 * Supports 12 locales with type-safe key lookup, variable interpolation,
 * and AsyncStorage persistence.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';
import { TRANSLATIONS, type Locale, type TranslationKey } from '../locales/translations';

export type { Locale, TranslationKey };

export const SUPPORTED_LOCALES: { code: Locale; label: string; nativeLabel: string; flag: string; rtl: boolean }[] = [
  { code: 'en', label: 'English',    nativeLabel: 'English',       flag: '🇬🇧', rtl: false },
  { code: 'pl', label: 'Polish',     nativeLabel: 'Polski',        flag: '🇵🇱', rtl: false },
  { code: 'ro', label: 'Romanian',   nativeLabel: 'Română',        flag: '🇷🇴', rtl: false },
  { code: 'bg', label: 'Bulgarian',  nativeLabel: 'Български',     flag: '🇧🇬', rtl: false },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português',     flag: '🇧🇷', rtl: false },
  { code: 'es', label: 'Spanish',    nativeLabel: 'Español',       flag: '🇪🇸', rtl: false },
  { code: 'hi', label: 'Hindi',      nativeLabel: 'हिंदी',          flag: '🇮🇳', rtl: false },
  { code: 'pa', label: 'Punjabi',    nativeLabel: 'ਪੰਜਾਬੀ',        flag: '🇮🇳', rtl: false },
  { code: 'gu', label: 'Gujarati',   nativeLabel: 'ગુજરાતી',       flag: '🇮🇳', rtl: false },
  { code: 'ur', label: 'Urdu',       nativeLabel: 'اردو',           flag: '🇵🇰', rtl: true  },
  { code: 'bn', label: 'Bengali',    nativeLabel: 'বাংলা',          flag: '🇧🇩', rtl: false },
  { code: 'zh', label: 'Chinese',    nativeLabel: '中文',            flag: '🇨🇳', rtl: false },
];

export const SPEECH_LANG: Record<Locale, string> = {
  en: 'en-GB', pl: 'pl-PL', ro: 'ro-RO', bg: 'bg-BG',
  pt: 'pt-BR', es: 'es-ES', hi: 'hi-IN', pa: 'pa-IN',
  gu: 'gu-IN', ur: 'ur-PK', bn: 'bn-BD', zh: 'zh-CN',
};

// Geoapify lang codes for translated routing instructions
export const GEOAPIFY_LANG: Record<Locale, string> = {
  en: 'en', pl: 'en', ro: 'en', bg: 'en',
  pt: 'pt', es: 'es', hi: 'en', pa: 'en',
  gu: 'en', ur: 'en', bn: 'en', zh: 'zh',
};

const STORAGE_KEY = 'mj_locale';

const DEVICE_LOCALE_MAP: Record<string, Locale> = {
  pt: 'pt', ro: 'ro', bg: 'bg', es: 'es',
  hi: 'hi', pa: 'pa', gu: 'gu', pl: 'pl',
  ur: 'ur', bn: 'bn', zh: 'zh',
};

export function detectDeviceLocale(): Locale {
  try {
    const raw: string = Platform.OS === 'ios'
      ? (NativeModules.SettingsManager?.settings?.AppleLocale
          ?? NativeModules.SettingsManager?.settings?.AppleLanguages?.[0]
          ?? 'en')
      : (NativeModules.I18nManager?.localeIdentifier ?? 'en');
    const code = raw.slice(0, 2).toLowerCase();
    return DEVICE_LOCALE_MAP[code] ?? 'en';
  } catch {
    return 'en';
  }
}

export async function loadSavedLocale(): Promise<Locale | null> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (saved && TRANSLATIONS[saved as Locale]) return saved as Locale;
    return null;
  } catch {
    return null;
  }
}

export async function saveLocale(locale: Locale): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, locale);
  } catch { /* non-fatal */ }
}

export function t(
  key: TranslationKey,
  locale: Locale,
  vars?: Record<string, string | number>,
): string {
  const dict = TRANSLATIONS[locale] ?? TRANSLATIONS.en;
  let str = (dict as Record<string, string>)[key]
    ?? (TRANSLATIONS.en as Record<string, string>)[key]
    ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}
