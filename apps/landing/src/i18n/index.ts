/**
 * src/i18n/index.ts
 *
 * i18n helper — single export point.
 * All Astro components import from here.
 *
 * Currently supports English only.
 * To add a locale:
 *   1. Create src/i18n/fr.ts, de.ts, etc. with the same shape as en.ts
 *   2. Detect the locale from Accept-Language header or URL prefix
 *   3. Import the correct translations file here and use it
 *
 * Current design: single-language (English) at build time.
 * All strings are extracted so future i18n requires no component changes.
 */
export { translations, t, tHtml } from './en';
export type { TranslationKey } from './en';
