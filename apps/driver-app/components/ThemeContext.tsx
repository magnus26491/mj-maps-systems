/**
 * components/ThemeContext.tsx
 * Provides dark/light theme system for both PRO and ENT tiers.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Appearance } from 'react-native';

export const DARK_THEME = {
  // ── Base palette — matches landing design tokens ───────────────────────
  background:  '#0A0C10',
  surface:       '#12151B',
  surfaceAlt:   '#1A1F26',
  text:         '#F1F5F9',
  subtext:      '#94A3B8',
  border:       '#334155',
  // ── MJ teal (brand) — primary accent for nav buttons, links, active states ──
  teal:         '#00C2A8',
  tealBright:   '#00E8D4',
  tealBg:       'rgba(0, 194, 168, 0.12)',
  // ── Turn-score colours — exact tokens from landing ───────────────────────
  green:       '#10B981',
  greenBg:     'rgba(16, 185, 129, 0.12)',
  amber:       '#F59E0B',
  amberBg:     'rgba(245, 158, 11, 0.12)',
  red:         '#EF4444',
  redBg:       'rgba(239, 68, 68, 0.12)',
  // ── Misc ─────────────────────────────────────────────────────────────
  blue:        '#00C2A8',  // teal replaces generic blue throughout
  blueAlt:     '#00E8D4',
  white:       '#ffffff',
  gray:        '#9ca3af',
  grayDark:    '#374151',
  yellow:      '#fbbf24',
  yellowText:  '#fef3c7',
};

export const LIGHT_THEME = {
  background:  '#f0f4f8',
  surface:     '#ffffff',
  surfaceAlt:  '#e2e8f0',
  text:        '#1a2733',
  subtext:     '#4a6274',
  border:      '#cbd5e1',
  green:       '#1b5e20',
  greenBg:     '#c8e6c9',
  amber:       '#e65100',
  amberBg:     '#fff3e0',
  red:         '#b71c1c',
  redBg:       '#ffcdd2',
  blue:        '#1565c0',
  blueAlt:     '#1976d2',
  white:       '#1a2733',
  gray:        '#6b7280',
  grayDark:    '#374151',
  yellow:      '#f59e0b',
  yellowText:  '#451a03',
};

export type Theme = typeof DARK_THEME;

interface ThemeContextValue {
  colors: Theme;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: DARK_THEME,
  isDark: true,
});

interface ThemeProviderProps {
  children: React.ReactNode;
  forceDark?: boolean;
}

export function ThemeProvider({ children, forceDark }: ThemeProviderProps) {
  const [scheme, setScheme] = useState(Appearance.getColorScheme() ?? 'dark');

  useEffect(() => {
    if (forceDark !== undefined) return;
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setScheme(colorScheme ?? 'dark');
    });
    return () => sub.remove();
  }, [forceDark]);

  const isDark = forceDark !== undefined ? forceDark : scheme === 'dark';
  return (
    <ThemeContext.Provider value={{ colors: isDark ? DARK_THEME : LIGHT_THEME, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}