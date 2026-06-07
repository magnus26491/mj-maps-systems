/**
 * components/ThemeContext.tsx
 * Provides dark/light theme system for both PRO and ENT tiers.
 */
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Appearance } from 'react-native';

export const DARK_THEME = {
  background:  '#0f1923',
  surface:     '#1c2a37',
  surfaceAlt:  '#253545',
  text:        '#e0eaf4',
  subtext:     '#607080',
  border:      '#1f2937',
  green:       '#2e7d32',
  greenBg:     '#0d3b1a',
  amber:       '#f57c00',
  amberBg:     '#2b1a00',
  red:         '#ef4444',
  redBg:       '#2b1111',
  blue:        '#4fc3f7',
  blueAlt:     '#1565c0',
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