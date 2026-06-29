/**
 * components/ThemeContext.tsx
 *
 * COMPATIBILITY SHIM — re-exports from the canonical lib/theme/ThemeProvider.
 * All new code should import from '../lib/theme' directly.
 * This file exists so existing imports like `import { ThemeProvider, useTheme } from '../components/ThemeContext'`
 * continue to work without changes.
 */
export { ThemeProvider, useTheme } from '../lib/theme';
export type { ThemeMode } from '../lib/theme';
// Keep the old DARK_THEME / LIGHT_THEME exports for any code that references them
export { DARK, LIGHT } from '../lib/theme';