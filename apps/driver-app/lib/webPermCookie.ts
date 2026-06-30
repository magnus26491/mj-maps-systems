/**
 * webPermCookie — web-only persistence for permission consents.
 *
 * Writes to both localStorage AND a 1-year cookie so that the driver's
 * choices survive localStorage clears (e.g. "Clear browsing data" in Chrome
 * does not clear cookies unless the user also ticks "Cookies and site data").
 *
 * On native this module is never imported — callers gate with Platform.OS.
 */

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year in seconds

export function saveWebConsent(key: string): void {
  const safeKey = encodeURIComponent(key);
  try { localStorage.setItem(key, '1'); } catch { /* private/restricted mode */ }
  try {
    document.cookie = `${safeKey}=1; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Strict`;
  } catch { /* non-DOM env (SSR, test) */ }
}

export function loadWebConsent(key: string): boolean {
  // localStorage is fastest — check it first
  try { if (localStorage.getItem(key) === '1') return true; } catch { /* ignore */ }
  // Fall back to cookie (survives localStorage clears)
  try {
    const enc = encodeURIComponent(key);
    return document.cookie.split(';').some(c => c.trim().startsWith(`${enc}=`));
  } catch {
    return false;
  }
}
