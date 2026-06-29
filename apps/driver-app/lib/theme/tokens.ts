/**
 * lib/theme/tokens.ts
 *
 * SINGLE SOURCE OF TRUTH for all colour values used by the driver app.
 * Both the app chrome and the MapLibre map read from here.
 * No hardcoded hex values should appear outside this file in themed components.
 *
 * Each namespace mirrors the existing DARK_THEME / LIGHT_THEME structure
 * from components/ThemeContext.tsx so refactoring is incremental.
 */
export const DARK = {
  // ── App UI palette ──────────────────────────────────────────────────────
  app: {
    background:    '#0A0C10',
    surface:       '#12151B',
    surfaceAlt:    '#1A1F26',
    text:          '#F1F5F9',
    textFaint:     '#94A3B8',
    border:        '#334155',
    primary:       '#00C2A8',   // MJ teal
    primaryBright: '#00E8D4',
    primaryBg:     'rgba(0, 194, 168, 0.12)',
    success:       '#10B981',
    successBg:     'rgba(16, 185, 129, 0.12)',
    warning:       '#F59E0B',
    warningBg:     'rgba(245, 158, 11, 0.12)',
    danger:        '#EF4444',
    dangerBg:      'rgba(239, 68, 68, 0.12)',
    blue:          '#00C2A8',   // teal throughout
    blueAlt:       '#00E8D4',
    white:         '#ffffff',
    gray:          '#9ca3af',
    grayDark:      '#374151',
    yellow:        '#fbbf24',
    yellowText:    '#fef3c7',
    // Derived for convenience
    base:    '#0A0C10',
    surface1: '#12151B',
    surface2: '#1A1F26',
  },

  // ── MapLibre declarative layer paint colours ────────────────────────────
  // These feed v11 reactive paint props — recolouring happens in-place
  // without any style reload or tile re-fetch.
  map: {
    // Land / background
    background:    '#0D0F14',
    // Natural layers
    water:          '#0e1d2f',
    landuse:        '#131720',
    // Road network
    road:           '#1e2535',
    roadCasing:     '#0D0F14',
    // Buildings — dark extrusions with teal edge highlight
    buildingBase:   '#1a2030',
    buildingTop:    '#232b3e',
    // Route — brand teal, neon glow on dark land
    route:          '#00C2A8',
    routeCasing:    '#006b5e',
    routeGlow:      'rgba(0, 194, 168, 0.35)',
    // Labels
    label:          '#c8d0dc',
    labelHalo:      '#0D0F14',
    // Atmosphere
    sky:            '#0D0F14',
    terrainShadow:  'rgba(0, 0, 0, 0.6)',
    // POI / markers
    fuelMarker:     '#F59E0B',
    evMarker:       '#10B981',
    destMarker:     '#10B981',
    userDot:        '#00C2A8',
  },
} as const;

export const LIGHT = {
  // ── App UI palette ──────────────────────────────────────────────────────
  app: {
    background:    '#f0f4f8',
    surface:       '#ffffff',
    surfaceAlt:    '#e2e8f0',
    text:          '#1a2733',
    textFaint:     '#4a6274',
    border:        '#cbd5e1',
    primary:       '#00A891',   // slightly darker teal for contrast on white
    primaryBright: '#00C2A8',
    primaryBg:     'rgba(0, 168, 145, 0.10)',
    success:       '#1b5e20',
    successBg:     '#c8e6c9',
    warning:       '#e65100',
    warningBg:     '#fff3e0',
    danger:        '#b71c1c',
    dangerBg:      '#ffcdd2',
    blue:          '#1565c0',
    blueAlt:       '#1976d2',
    white:         '#1a2733',
    gray:          '#6b7280',
    grayDark:      '#374151',
    yellow:        '#f59e0b',
    yellowText:    '#451a03',
    // Derived for convenience
    base:    '#f0f4f8',
    surface1: '#ffffff',
    surface2: '#e2e8f0',
  },

  // ── MapLibre declarative layer paint colours ────────────────────────────
  map: {
    // Land / background — soft greys and whites
    background:    '#e8edf2',
    // Natural layers
    water:          '#b8d4e8',
    landuse:        '#dce4ec',
    // Road network — crisp whites and light greys
    road:           '#ffffff',
    roadCasing:     '#d0d8e0',
    // Buildings — light cream extrusions with soft shadow
    buildingBase:   '#d8dfe8',
    buildingTop:    '#f0f4f8',
    // Route — same teal, pops nicely on light land
    route:          '#00A891',
    routeCasing:    '#008070',
    routeGlow:      'rgba(0, 168, 145, 0.25)',
    // Labels — dark on light
    label:          '#2a3a4a',
    labelHalo:      '#e8edf2',
    // Atmosphere
    sky:            '#b8d4e8',
    terrainShadow:  'rgba(0, 0, 0, 0.15)',
    // POI / markers — slightly darker variants for light theme
    fuelMarker:     '#d97706',
    evMarker:       '#059669',
    destMarker:     '#059669',
    userDot:        '#00A891',
  },
} as const;

// Convenience type — used by useTheme() return value
export type ThemeColors = typeof DARK;
export type AppColors = typeof DARK.app;
export type MapColors = typeof DARK.map;