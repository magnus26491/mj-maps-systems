/**
 * packages/design-tokens/index.ts
 * Single source of truth for design tokens across all MJ Maps surfaces.
 *
 * Tokens mirror the landing page design system exactly:
 * - Deep cartographic night-map palette
 * - Functional turn-score accent colours
 * - Space Grotesk / Inter / IBM Plex Mono typography
 * - Purposeful radius and elevation scale
 *
 * Usage:
 *   Web (CSS):       @import '@mj-maps/design-tokens/tokens.css';
 *   React Native:    import { tokens } from '@mj-maps/design-tokens';
 *   Tailwind:        extend theme with DESIGN_TOKENS.tailwindTheme
 *   JS/TS:           import { colors, spacing, typography } from '@mj-maps/design-tokens';
 */

// ─── Colour tokens ──────────────────────────────────────────────────────────

export const colors = {
  // Background layers
  base:      '#0A0C10',
  surface1:  '#12151B',
  surface2:  '#1A1F26',

  // Brand — teal (primary interactive)
  teal:      '#00C2A8',
  tealBright:'#00E8D4',
  tealDim:   '#006B5F',

  // Turn-score functional accents
  green:     '#10B981',
  amber:     '#F59E0B',
  red:       '#EF4444',

  // Text hierarchy
  textPrimary:   '#F1F5F9',
  textSecondary: '#94A3B8',
  textMuted:     '#64748B',

  // Borders
  border:       '#334155',
  borderFocus:  'rgba(0, 194, 168, 0.50)',

  // Semantic
  success:  '#10B981',
  warning:  '#F59E0B',
  danger:   '#EF4444',
  info:     '#00C2A8',
} as const;

export type ColorKey = keyof typeof colors;

// ─── Turn-score mapping ─────────────────────────────────────────────────────

export const TURN_SCORE_COLORS = {
  green: colors.green,
  amber: colors.amber,
  red:   colors.red,
} as const;

export type TurnScoreColor = keyof typeof TURN_SCORE_COLORS;

// ─── Elevation / shadows ─────────────────────────────────────────────────────

export const elevation = {
  sm: '0 1px 3px rgb(0 0 0 / 0.25)',
  md: '0 2px 8px rgb(0 0 0 / 0.30)',
  lg: '0 8px 24px rgb(0 0 0 / 0.40), 0 0 0 1px rgba(0, 194, 168, 0.08)',
  xl: '0 16px 48px rgb(0 0 0 / 0.50), 0 0 0 1px rgba(0, 194, 168, 0.12)',
} as const;

export type ElevationKey = keyof typeof elevation;

// ─── Border radius ──────────────────────────────────────────────────────────

export const radius = {
  sm:  '4px',
  md:  '8px',
  lg:  '12px',
  xl:  '16px',
  full:'9999px',
} as const;

export type RadiusKey = keyof typeof radius;

// ─── Typography ─────────────────────────────────────────────────────────────

export const typography = {
  display: "'Space Grotesk', system-ui, sans-serif",
  body:    "'Inter', system-ui, sans-serif",
  mono:    "'IBM Plex Mono', ui-monospace, monospace",
} as const;

// Fluid clamp() scale (matches global.css — single source of truth)
export const fontSize = {
  xs:   'clamp(0.70rem,  0.68rem + 0.10vw,  0.75rem)',
  sm:   'clamp(0.80rem,  0.77rem + 0.15vw,  0.875rem)',
  base: 'clamp(0.90rem,  0.87rem + 0.15vw,  1rem)',
  lg:   'clamp(1.05rem,  1.00rem + 0.25vw,  1.125rem)',
  xl:   'clamp(1.15rem,  1.10rem + 0.25vw,  1.25rem)',
  '2xl':'clamp(1.35rem,  1.25rem + 0.50vw,  1.50rem)',
  '3xl':'clamp(1.60rem,  1.45rem + 0.75vw,  1.875rem)',
  '4xl':'clamp(1.95rem,  1.70rem + 1.25vw,  2.25rem)',
  '5xl':'clamp(2.00rem,  1.70rem + 1.50vw,  3.00rem)',
  '6xl':'clamp(2.25rem,  1.80rem + 2.25vw,  3.75rem)',
  '7xl':'clamp(2.75rem,  2.10rem + 3.25vw,  4.50rem)',
} as const;

// ─── Spacing (8px rhythm) ───────────────────────────────────────────────────

export const spacing = {
  0:  '0',
  1:  '4px',
  2:  '8px',
  3:  '12px',
  4:  '16px',
  5:  '20px',
  6:  '24px',
  8:  '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
} as const;

export type SpacingKey = keyof typeof spacing;

// ─── Animation ───────────────────────────────────────────────────────────────

export const animation = {
  fast:   '150ms',
  base:   '250ms',
  slow:   '400ms',
  spring: '600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// ─── React Native StyleSheet theme object ────────────────────────────────────

export const rnTheme = {
  colors: {
    background:      colors.base,
    surface:         colors.surface1,
    surfaceAlt:      colors.surface2,
    primary:         colors.teal,
    primaryBright:   colors.tealBright,
    primaryDim:      colors.tealDim,
    success:         colors.green,
    warning:         colors.amber,
    danger:          colors.red,
    text:            colors.textPrimary,
    textSecondary:   colors.textSecondary,
    textMuted:       colors.textMuted,
    border:          colors.border,
    borderFocus:     colors.borderFocus,
  },
  typography: {
    display: { fontFamily: typography.display },
    body:    { fontFamily: typography.body    },
    mono:    { fontFamily: typography.mono    },
  },
  elevation,
  radius,
  animation,
} as const;

export type RNTheme = typeof rnTheme;

// ─── Tailwind theme extension ───────────────────────────────────────────────

export const tailwindTheme = {
  colors: {
    base:         colors.base,
    surface1:     colors.surface1,
    surface2:     colors.surface2,
    teal:         colors.teal,
    'teal-bright':colors.tealBright,
    'teal-dim':   colors.tealDim,
    green:        colors.green,
    amber:        colors.amber,
    red:          colors.red,
    'text-primary':  colors.textPrimary,
    'text-secondary':colors.textSecondary,
    'text-muted':    colors.textMuted,
    border:       colors.border,
    'border-focus':colors.borderFocus,
  },
  fontFamily: {
    display: ['Space Grotesk', 'system-ui', 'sans-serif'],
    body:    ['Inter',         'system-ui', 'sans-serif'],
    mono:    ['IBM Plex Mono', 'ui-monospace', 'monospace'],
  },
  borderRadius: {
    sm:   '4px',
    md:   '8px',
    lg:   '12px',
    xl:   '16px',
    full: '9999px',
  },
  boxShadow: {
    'elevation-sm': elevation.sm,
    'elevation-md': elevation.md,
    'elevation-lg': elevation.lg,
    'elevation-xl': elevation.xl,
  },
  transitionDuration: {
    fast:   '150ms',
    base:   '250ms',
    slow:   '400ms',
  },
} as const;

export type TailwindTheme = typeof tailwindTheme;

// ─── CSS custom properties string (for web / CSS-in-JS) ─────────────────────

export const CSS_VARS = `
  :root {
    --color-base:       ${colors.base};
    --color-surface-1: ${colors.surface1};
    --color-surface-2: ${colors.surface2};
    --color-teal:      ${colors.teal};
    --color-teal-bright:${colors.tealBright};
    --color-teal-dim:  ${colors.tealDim};
    --color-green:     ${colors.green};
    --color-amber:     ${colors.amber};
    --color-red:       ${colors.red};
    --color-text-primary:  ${colors.textPrimary};
    --color-text-secondary:${colors.textSecondary};
    --color-text-muted:    ${colors.textMuted};
    --color-border:    ${colors.border};
    --color-border-focus: ${colors.borderFocus};

    --elevation-sm: ${elevation.sm};
    --elevation-md: ${elevation.md};
    --elevation-lg: ${elevation.lg};
    --elevation-xl: ${elevation.xl};

    --r-sm:   ${radius.sm};
    --r-md:   ${radius.md};
    --r-lg:   ${radius.lg};
    --r-xl:   ${radius.xl};
    --r-full: ${radius.full};

    --font-display: ${typography.display};
    --font-body:    ${typography.body};
    --font-mono:    ${typography.mono};

    --focus-ring: 0 0 0 3px ${colors.borderFocus};
  }
` as const;

export default {
  colors,
  TURN_SCORE_COLORS,
  elevation,
  radius,
  typography,
  fontSize,
  spacing,
  animation,
  rnTheme,
  tailwindTheme,
  CSS_VARS,
};
