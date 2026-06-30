/**
 * hooks/useNavigation.ts
 * Navigation state machine using shared GPS and expo-speech.
 * Includes off-route detection with automatic re-routing.
 *
 * Uses the shared location singleton — no own watchPositionAsync.
 * startNav() triggers route fetch + subscribes to shared location.
 * stopNav() unsubscribes.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Speech from 'expo-speech';
import { fetchNavRoute, type NavRoute, type NavStep, type NavGuardWarning } from '../lib/navigation';
import { useShiftStore } from '../store/shift';
import { subscribeSharedLocation, getLatestLocation, setNavHighAccuracy, type SharedLocation } from '../lib/shared-location';
import { useVoiceSettingsStore } from '../store/voiceSettings';
import { SPEECH_LANG } from '../lib/i18n';
import { useLocale } from '../components/LocaleProvider';

const DEVIATION_THRESHOLD_M = 250;  // metres — if user is this far off route, re-route

// Haversine distance (metres)
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (x: number) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Check if a point is off the route polyline by more than thresholdM
function isOffRoute(
  userLat: number, userLng: number,
  polyline: { lat: number; lng: number }[],
  thresholdM: number,
): boolean {
  if (!polyline.length) return false;
  // Find the minimum distance from user position to any point on the polyline
  let minDist = Infinity;
  for (const pt of polyline) {
    const d = distanceM(userLat, userLng, pt.lat, pt.lng);
    if (d < minDist) minDist = d;
    if (minDist < thresholdM) return false;  // early exit
  }
  return minDist > thresholdM;
}

// Find the polyline index closest to a given lat/lng
function nearestPolylineIndex(
  polyline: { lat: number; lng: number }[],
  lat: number,
  lng: number,
): number {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < polyline.length; i++) {
    const d = distanceM(lat, lng, polyline[i].lat, polyline[i].lng);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

interface UseNavigationResult {
  route:               NavRoute | null;
  currentStep:         NavStep | null;
  stepIndex:           number;
  distanceToNext:      number;
  isNearDestination:   boolean;
  isLoading:           boolean;
  error:               string | null;
  userLat:             number | null;
  userLng:             number | null;
  bearing:             number;
  guardWarnings:       NavGuardWarning[];
  rerouteToast:        string | null;
  startNav:            (toLat: number, toLng: number, address?: string) => void;
  stopNav:             () => void;
  speakStep:           (step: NavStep) => void;
}

export function useNavigation(): UseNavigationResult {
  const vehicleId     = useShiftStore(s => s.vehicleId);
  const customHeightM = useShiftStore(s => s.customHeightM);

  // Voice settings — language follows UI locale automatically
  const { locale } = useLocale();
  const voiceEnabled = useVoiceSettingsStore(s => s.enabled);
  const voiceId      = useVoiceSettingsStore(s => s.voiceId);
  const voiceRate    = useVoiceSettingsStore(s => s.rate);
  const voicePitch   = useVoiceSettingsStore(s => s.pitch);
  const voiceVolume  = useVoiceSettingsStore(s => s.volume);
  const speechLang   = SPEECH_LANG[locale] ?? 'en-GB';
  const [route,    setRoute]      = useState<NavRoute | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error,    setError]      = useState<string | null>(null);
  const [userLat,  setUserLat]    = useState<number | null>(null);
  const [userLng,  setUserLng]    = useState<number | null>(null);
  const [bearing,  setBearing]    = useState(0);
  const [guardWarnings, setGuardWarnings] = useState<NavGuardWarning[]>([]);
  // Live distance to the next maneuver point (updated every GPS tick)
  const [liveDistanceToNext, setLiveDistanceToNext] = useState(0);
  // True when driver is within 30m of destination on the last step
  const [isNearDestination, setIsNearDestination] = useState(false);
  const arrivedRef = useRef(false);
  const [rerouteToast, setRerouteToast] = useState<string | null>(null);

  // stepIndex → highest phase spoken: 1=prepare, 2=warn, 3=execute
  const lastSpokenPhase = useRef<Map<number, number>>(new Map());
  // Latest GPS speed in m/s (updated every location tick, read in voice useEffect)
  const speedMpsRef = useRef(0);
  // Timestamp (ms) when driver first went off-route; null when on-route
  const offRouteSinceRef = useRef<number | null>(null);
  // Timer for the "Route updated" toast — tracked so it's cleaned up on unmount
  const rerouteToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Last liveDistanceToNext we set state for — avoids re-renders on sub-2m GPS noise
  const lastDistanceRef = useRef<number>(0);
  const destLat     = useRef<number | null>(null);
  const destLng     = useRef<number | null>(null);
  const destAddress = useRef<string | undefined>(undefined);
  // Keep a mutable ref to current route for use in the location callback
  const routeRef = useRef<NavRoute | null>(null);
  const isReroutingRef = useRef(false);
  // Shared location subscription (cleaned up in stopNav)
  const locUnsubRef = useRef<(() => void) | null>(null);

  const speakStep = useCallback((step: NavStep) => {
    if (!voiceEnabled) return;
    Speech.stop();
    Speech.speak(step.instruction, {
      language: speechLang,
      voice:    voiceId ?? undefined,
      rate:     voiceRate,
      pitch:    voicePitch,
      volume:   voiceVolume,
    });
  }, [voiceEnabled, speechLang, voiceId, voiceRate, voicePitch, voiceVolume]);

  // Advance step based on proximity to next manoeuvre point
  useEffect(() => {
    if (!route || userLat === null || userLng === null) return;
    const step = route.steps[stepIndex];
    if (!step) return;

    // FIX 2: Use the step's endpoint to find the correct polyline point rather
    // than assuming one polyline point per step.  We look at the next step's
    // start (which equals the current step's end maneuver point).  If there is
    // no next step we use the last polyline point (destination).
    let targetLat: number;
    let targetLng: number;

    const nextStep = route.steps[stepIndex + 1];
    if (nextStep == null) {
      // Last step — head for the destination / last polyline point
      const lastPt = route.polyline[route.polyline.length - 1];
      targetLat = lastPt?.lat ?? (destLat.current ?? 0);
      targetLng = lastPt?.lng ?? (destLng.current ?? 0);
    } else {
      // Find the polyline point closest to where the next step begins.
      // The next step begins at the maneuver point that concludes the current
      // step, which we approximate by finding the nearest polyline point to
      // the midpoint between the two steps' accumulated distance markers.
      // Since NavStep has no explicit end-coord we use the nearest polyline
      // point to the next step's own distanceM offset as a heuristic — but
      // the simplest robust approach is: take the polyline point nearest to
      // the user that is *ahead* of the current nearest point.  For now we
      // use the polyline point index nearest to the accumulated route
      // distance of the next step's start.
      //
      // Practical approach that works well: find the nearest polyline point
      // to the user position, then look forward from there.  But even
      // simpler: sum step distances to estimate the polyline index of the
      // current step's end and clamp.
      let accumulated = 0;
      for (let i = 0; i <= stepIndex; i++) {
        accumulated += route.steps[i]?.distanceM ?? 0;
      }
      // Estimate which polyline point corresponds to `accumulated` metres
      const totalDist = route.totalDistanceM || 1;
      const fraction  = Math.min(accumulated / totalDist, 1);
      const ptIndex   = Math.round(fraction * (route.polyline.length - 1));
      const pt = route.polyline[ptIndex];
      targetLat = pt?.lat ?? 0;
      targetLng = pt?.lng ?? 0;
    }

    const dist = distanceM(userLat, userLng, targetLat, targetLng);

    // Only update state when distance changes by >2m — avoids re-renders from GPS noise
    if (Math.abs(dist - lastDistanceRef.current) >= 2) {
      lastDistanceRef.current = dist;
      setLiveDistanceToNext(dist);
    }

    // 3-phase speed-adaptive voice (OsmAnd algorithm):
    //   prepare  — dist < speed×25 (300–600m), "Prepare to {instruction}"
    //   warn     — dist < speed×10 (≥100m),    "In Xm, {instruction}"
    //   execute  — dist < 30m,                 full instruction via speakStep
    const speedMps = speedMpsRef.current;
    const prepareM = Math.max(300, Math.min(600, speedMps * 25));
    const warnM    = Math.max(100, speedMps * 10);
    const phaseSpoken = lastSpokenPhase.current.get(stepIndex) ?? 0;
    if (dist < 30 && phaseSpoken < 3) {
      lastSpokenPhase.current.set(stepIndex, 3);
      speakStep(step);
    } else if (dist < warnM && phaseSpoken < 2) {
      lastSpokenPhase.current.set(stepIndex, 2);
      if (voiceEnabled) {
        const d = Math.round(dist / 10) * 10;
        Speech.speak(`In ${d} metres, ${step.instruction}`, {
          language: speechLang, voice: voiceId ?? undefined,
          rate: voiceRate, pitch: voicePitch, volume: voiceVolume,
        });
      }
    } else if (dist < prepareM && phaseSpoken < 1) {
      lastSpokenPhase.current.set(stepIndex, 1);
      if (voiceEnabled) {
        Speech.speak(`Prepare to ${step.instruction}`, {
          language: speechLang, voice: voiceId ?? undefined,
          rate: voiceRate, pitch: voicePitch, volume: voiceVolume,
        });
      }
    }

    if (dist < 30 && stepIndex < route.steps.length - 1) {
      setStepIndex(i => i + 1);
    }

    // FIX 3: Arrival detection — only on the last step
    if (nextStep == null && destLat.current != null && destLng.current != null) {
      const distToDest = distanceM(userLat, userLng, destLat.current, destLng.current);
      if (distToDest < 30 && !arrivedRef.current) {
        arrivedRef.current = true;
        setIsNearDestination(true);
      }
    }
  }, [userLat, userLng, route, stepIndex, speakStep]);

  const startNav = useCallback(async (toLat: number, toLng: number, address?: string) => {
    // Upgrade GPS to BestForNavigation for precise turn-by-turn tracking
    setNavHighAccuracy(true);
    setIsLoading(true);
    setError(null);
    setStepIndex(0);
    setLiveDistanceToNext(0);
    lastDistanceRef.current = 0;
    setIsNearDestination(false);
    arrivedRef.current = false;
    lastSpokenPhase.current.clear();
    offRouteSinceRef.current = null;
    setRerouteToast(null);

    // Get current position for route calculation
    const currentLoc = getLatestLocation();
    const fromLat = currentLoc?.latitude ?? 0;
    const fromLng = currentLoc?.longitude ?? 0;

    setUserLat(fromLat);
    setUserLng(fromLng);
    if (currentLoc?.heading !== null) setBearing(currentLoc.heading);

    const navRoute = await fetchNavRoute(
      fromLat, fromLng,
      toLat, toLng,
      vehicleId ?? 'lwb_van',
      customHeightM,
      address,
    );

    if (!navRoute) {
      setError('Could not fetch route. Check your connection.');
      setIsLoading(false);
      return;
    }

    setRoute(navRoute);
    routeRef.current = navRoute;
    setGuardWarnings(navRoute.guardWarnings ?? []);
    destLat.current     = toLat;
    destLng.current     = toLng;
    destAddress.current = address;
    setIsLoading(false);
    if (navRoute.steps[0]) speakStep(navRoute.steps[0]);

    // Subscribe to shared location for tracking + off-route detection
    locUnsubRef.current?.();
    locUnsubRef.current = subscribeSharedLocation((loc: SharedLocation) => {
      setUserLat(loc.latitude);
      setUserLng(loc.longitude);
      if (loc.heading !== null) setBearing(loc.heading);
      speedMpsRef.current = loc.speed ?? 0;

      // Silent auto-reroute — NHTSA-safe: no blocking Alert while driving.
      // Waits 15 s of continuous off-route before recalculating (filters GPS drift).
      const currentRoute = routeRef.current;
      if (currentRoute && !isReroutingRef.current) {
        const offRoute = isOffRoute(
          loc.latitude, loc.longitude,
          currentRoute.polyline,
          DEVIATION_THRESHOLD_M,
        );
        if (offRoute) {
          if (offRouteSinceRef.current === null) {
            offRouteSinceRef.current = Date.now();
          } else if (Date.now() - offRouteSinceRef.current > 15_000) {
            isReroutingRef.current = true;
            offRouteSinceRef.current = null;
            if (voiceEnabled) {
                Speech.speak('Recalculating', {
                  language: speechLang,
                  voice:    voiceId ?? undefined,
                  rate:     voiceRate,
                  pitch:    voicePitch,
                  volume:   voiceVolume,
                });
              }
            const cur = getLatestLocation();
            fetchNavRoute(
              cur?.latitude ?? loc.latitude, cur?.longitude ?? loc.longitude,
              destLat.current!, destLng.current!,
              vehicleId ?? 'lwb_van',
              customHeightM,
              destAddress.current,
            ).then(newRoute => {
              if (newRoute) {
                routeRef.current = newRoute;
                setRoute(newRoute);
                setStepIndex(0);
                lastSpokenPhase.current.clear();
                if (newRoute.steps[0]) speakStep(newRoute.steps[0]);
                if (rerouteToastTimerRef.current) clearTimeout(rerouteToastTimerRef.current);
                setRerouteToast('Route updated');
                rerouteToastTimerRef.current = setTimeout(() => setRerouteToast(null), 3_000);
              }
              isReroutingRef.current = false;
            }).catch(() => { isReroutingRef.current = false; });
          }
        } else {
          offRouteSinceRef.current = null;
        }
      }
    });
  }, [vehicleId, speakStep, customHeightM, voiceEnabled, speechLang, voiceId, voiceRate, voicePitch, voiceVolume]);

  const stopNav = useCallback(() => {
    // Drop back to Balanced GPS — driver is parked or delivering on foot
    setNavHighAccuracy(false);
    locUnsubRef.current?.();
    locUnsubRef.current = null;
    Speech.stop();
    if (rerouteToastTimerRef.current) clearTimeout(rerouteToastTimerRef.current);
    rerouteToastTimerRef.current = null;
    setRoute(null);
    routeRef.current = null;
    destLat.current     = null;
    destLng.current     = null;
    destAddress.current = undefined;
    setStepIndex(0);
    setLiveDistanceToNext(0);
    lastDistanceRef.current = 0;
    setIsNearDestination(false);
    arrivedRef.current = false;
    lastSpokenPhase.current.clear();
    offRouteSinceRef.current = null;
    setError(null);
    setGuardWarnings([]);
    setRerouteToast(null);
  }, []);

  useEffect(() => () => {
    setNavHighAccuracy(false);
    locUnsubRef.current?.();
    Speech.stop();
    if (rerouteToastTimerRef.current) clearTimeout(rerouteToastTimerRef.current);
  }, []);

  const currentStep = route?.steps[stepIndex] ?? null;

  return {
    route, currentStep, stepIndex,
    distanceToNext: liveDistanceToNext,
    isNearDestination,
    isLoading, error, userLat, userLng, bearing,
    guardWarnings, rerouteToast,
    startNav, stopNav, speakStep,
  };
}
