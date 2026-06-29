/**
 * lib/theme/ThemeProvider.tsx
 *
 * Provides app-wide theme state.
 * Drives BOTH the app UI and the MapLibre map's declarative layer paint props.
 *
 * Because a single `setMode()` call updates one React state object,
 * the app chrome and the map recolour in the SAME commit — instant, flicker-free.
 *
 * ── Persistence ────────────────────────────────────────────────────────
 * Theme mode is persisted to AsyncStorage. On first render we initialise
 * with the default ('dark') so no flash is visible; after AsyncStorage resolves
 * we switch if the user had a different preference.
 *
 * ── System mode ────────────────────────────────────────────────────────
 * When mode === 'system', we subscribe to Appearance.addChangeListener so
 * OS appearance changes propagate live. We unsubscribe when mode is not 'system'.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { Appearance, ColorSchemeName } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK, LIGHT, type ThemeColors } from './tokens';

const STORAGE_KEY = '@mj_maps_theme_mode';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeContextValue {
  /** 'system' | 'light' | 'dark' */
  mode: ThemeMode;
  /** Whether the effective resolved theme is dark */
  isDark: boolean;
  /** Full colour tokens — app + map namespaces */
  colors: ThemeColorsValue;
  /** Switch theme mode; persists to AsyncStorage */
  setMode: (m: ThemeMode) => void;
}

// Use a plain object type for the context value so TypeScript accepts both DARK and LIGHT
type ThemeColorsValue = {
  app: Record<string, string>;
  map: Record<string, string>;
  // Legacy flat keys for backward compatibility with existing screens
  background: string; surface: string; surfaceAlt: string;
  text: string; subtext: string; border: string;
  primary: string; primaryBright: string; primaryBg: string;
  success: string; successBg: string; green: string; greenBg: string;
  warning: string; warningBg: string; amber: string; amberBg: string;
  danger: string; dangerBg: string; red: string; redBg: string;
  blue: string; blueAlt: string; teal: string; tealBright: string; tealBg: string;
  white: string; gray: string; grayDark: string;
  yellow: string; yellowText: string;
};

function buildLegacyColors(theme: ThemeColorsValue): ThemeColorsValue {
  const a = theme.app;
  return {
    ...theme,
    background: a.background,
    surface: a.surface,
    surfaceAlt: a.surfaceAlt,
    text: a.text,
    subtext: a.textFaint,
    border: a.border,
    primary: a.primary,
    primaryBright: a.primaryBright,
    primaryBg: a.primaryBg,
    teal: a.primary,
    tealBright: a.primaryBright,
    tealBg: a.primaryBg,
    success: a.success,
    successBg: a.successBg,
    green: a.success,
    greenBg: a.successBg,
    warning: a.warning,
    warningBg: a.warningBg,
    amber: a.warning,
    amberBg: a.warningBg,
    danger: a.danger,
    dangerBg: a.dangerBg,
    red: a.danger,
    redBg: a.dangerBg,
    blue: a.blue,
    blueAlt: a.blueAlt,
    white: a.white,
    gray: a.gray,
    grayDark: a.grayDark,
    yellow: a.yellow,
    yellowText: a.yellowText,
  };
}

const ThemeContext = createContext<{
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColorsValue;
  setMode: (m: ThemeMode) => void;
}>({
  mode: 'dark',
  isDark: true,
  colors: buildLegacyColors(DARK as unknown as ThemeColorsValue),
  setMode: () => {},
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveIsDark(mode: ThemeMode, systemScheme: ColorSchemeName): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return systemScheme !== 'light'; // default dark when unknown
}

// ── Provider ─────────────────────────────────────────────────────────────────

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>('dark');
  const [systemScheme, setSystemScheme] = useState<ColorSchemeName>(
    Appearance.getColorScheme(),
  );

  // Load persisted mode from AsyncStorage on mount
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then(saved => {
      if (cancelled) return;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setModeState(saved);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Subscribe to OS appearance changes only when mode is 'system'
  useEffect(() => {
    if (mode !== 'system') return;
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? 'dark');
    });
    return () => sub.remove();
  }, [mode]);

  // Persist mode to AsyncStorage and update state
  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(err =>
      console.warn('[ThemeProvider] Failed to persist theme mode', err),
    );
  }, []);

  const isDark = resolveIsDark(mode, systemScheme);
  const themeTokens = isDark ? DARK : LIGHT;
  const colors = buildLegacyColors(themeTokens as unknown as ThemeColorsValue);

  return (
    <ThemeContext.Provider value={{ mode, isDark, colors, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme(): {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColorsValue;
  setMode: (m: ThemeMode) => void;
} {
  return useContext(ThemeContext);
}