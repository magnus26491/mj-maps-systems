/**
 * useOfflineMap — downloads map tiles for the current route so navigation
 * works without a data signal.
 *
 * Calculates a bounding box from the stops' coordinates (+ ~5 km padding),
 * then calls offlineManager.createPack() to cache zoom levels 6–16.
 *
 * Status lifecycle: idle → downloading → complete | error
 * A completed pack persists across app restarts via MapLibre's native cache.
 */
import { useState, useCallback } from 'react';
import { Platform } from 'react-native';

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const DEG_PAD      = 0.06; // ~6 km padding around the route bbox

export type OfflineMapStatus = 'idle' | 'downloading' | 'complete' | 'error';

export function useOfflineMap() {
  const [status,   setStatus]   = useState<OfflineMapStatus>('idle');
  const [progress, setProgress] = useState(0);

  const download = useCallback(async (
    stops: Array<{ lat?: number | null; lng?: number | null }>,
    packName: string,
  ) => {
    // Web has no native tile cache — silently succeed so callers stay simple.
    if (Platform.OS === 'web') { setStatus('complete'); return; }

    const valid = stops.filter(
      s => s.lat != null && s.lng != null && !(s.lat === 0 && s.lng === 0),
    ) as Array<{ lat: number; lng: number }>;

    if (valid.length === 0) { setStatus('error'); return; }

    const south = Math.min(...valid.map(s => s.lat)) - DEG_PAD;
    const north = Math.max(...valid.map(s => s.lat)) + DEG_PAD;
    const west  = Math.min(...valid.map(s => s.lng)) - DEG_PAD;
    const east  = Math.max(...valid.map(s => s.lng)) + DEG_PAD;

    setStatus('downloading');
    setProgress(0);

    try {
      // Dynamic import keeps the web bundle free of native-only code.
      const { offlineManager } = await import('@maplibre/maplibre-react-native');

      // Delete any existing pack with the same name before re-creating,
      // so repeated "Download" taps on the same route don't accumulate packs.
      try { await offlineManager.deletePack(packName); } catch { /* new pack */ }

      await offlineManager.createPack(
        {
          name:     packName,
          styleURL: MAP_STYLE_URL,
          bounds:   [[west, south], [east, north]],
          minZoom:  6,
          maxZoom:  16,
        },
        (_pack: unknown, status: any) => {
          const pct = Math.round(status?.percentage ?? 0);
          setProgress(pct);
          if (status?.state === 2 /* complete */) {
            setStatus('complete');
          }
        },
        (_pack: unknown, _err: unknown) => {
          setStatus('error');
        },
      );
    } catch {
      setStatus('error');
    }
  }, []);

  return { status, progress, download };
}
