/**
 * LocaleProvider — React context for the selected locale.
 *
 * On mount: loads saved locale from AsyncStorage, falling back to device locale.
 * Exposes `locale`, `setLocale`, and `t()` bound to the current locale.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { t as translate, loadSavedLocale, saveLocale, detectDeviceLocale, SPEECH_LANG } from '../lib/i18n';
import type { Locale, TranslationKey } from '../lib/i18n';

interface LocaleContextValue {
  locale:    Locale;
  speechLang: string;
  setLocale: (l: Locale) => void;
  t:         (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale:     'en',
  speechLang: 'en-GB',
  setLocale:  () => {},
  t:          (key) => key,
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    (async () => {
      const saved = await loadSavedLocale();
      setLocaleState(saved ?? detectDeviceLocale());
    })();
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    saveLocale(l);
  }, []);

  const tBound = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) =>
      translate(key, locale, vars),
    [locale],
  );

  return (
    <LocaleContext.Provider value={{ locale, speechLang: SPEECH_LANG[locale], setLocale, t: tBound }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}
