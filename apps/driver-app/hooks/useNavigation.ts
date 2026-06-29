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
import { Alert } from 'react-native';
import * as Speech from 'expo-speech';
import { fetchNavRoute, type NavRoute, type NavStep, type NavGuardWarning } from '../lib/navigation';
import { useShiftStore } from '../store/shift';
import { subscribeSharedLocation, getLatestLocation, type SharedLocation } from '../lib/shared-location';

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
  startNav:            (toLat: number, toLng: number, address?: string) => void;
  stopNav:             () => void;
  speakStep:           (step: NavStep) => void;
}

export function useNavigation(): UseNavigationResult {
  const vehicleId     = useShiftStore(s => s.vehicleId);
  const customHeightM = useShiftStore(s => s.customHeightM);
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

  const lastSpokenStep = useRef(-1);
  const destLat     = useRef<number | null>(null);
  const destLng     = useRef<number | null>(null);
  const destAddress = useRef<string | undefined>(undefined);
  // Keep a mutable ref to current route for use in the location callback
  const routeRef = useRef<NavRoute | null>(null);
  const isReroutingRef = useRef(false);
  // Shared location subscription (cleaned up in stopNav)
  const locUnsubRef = useRef<(() => void) | null>(null);

  const speakStep = useCallback((step: NavStep) => {
    Speech.stop();
    Speech.speak(step.instruction, {
      language: 'en-GB',
      rate:  0.9,
      pitch: 1.0,
    });
  }, []);

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

    // FIX 1: update live distance state so the hook consumer gets a real-time value
    setLiveDistanceToNext(dist);

    if (dist < 200 && lastSpokenStep.current !== stepIndex) {
      lastSpokenStep.current = stepIndex;
      speakStep(step);
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
    setIsLoading(true);
    setError(null);
    setStepIndex(0);
    setLiveDistanceToNext(0);
    setIsNearDestination(false);
    arrivedRef.current = false;
    lastSpokenStep.current = -1;

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

      // Off-route detection — prompt driver before rerouting
      const currentRoute = routeRef.current;
      if (currentRoute && !isReroutingRef.current) {
        const offRoute = isOffRoute(
          loc.latitude, loc.longitude,
          currentRoute.polyline,
          DEVIATION_THRESHOLD_M,
        );
        if (offRoute) {
          isReroutingRef.current = true; // prevent repeated prompts
          Alert.alert(
            '🔄 Off Route',
            'You appear to be off your planned route. Reroute now?',
            [
              {
                text: 'Keep Going',
                style: 'cancel',
                onPress: () => {
                  // Re-arm after 90s so the prompt can fire again if still off-route
                  setTimeout(() => { isReroutingRef.current = false; }, 90_000);
                },
              },
              {
                text: 'Reroute',
                onPress: () => {
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
                      if (newRoute.steps[0]) speakStep(newRoute.steps[0]);
                    }
                    isReroutingRef.current = false;
                  }).catch(() => {
                    isReroutingRef.current = false;
                  });
                },
              },
            ],
            { cancelable: true, onDismiss: () => { isReroutingRef.current = false; } },
          );
        }
      }
    });
  }, [vehicleId, speakStep, customHeightM]);

  const stopNav = useCallback(() => {
    locUnsubRef.current?.();
    locUnsubRef.current = null;
    Speech.stop();
    setRoute(null);
    routeRef.current = null;
    destLat.current     = null;
    destLng.current     = null;
    destAddress.current = undefined;
    setStepIndex(0);
    setLiveDistanceToNext(0);
    setIsNearDestination(false);
    arrivedRef.current = false;
    setError(null);
    setGuardWarnings([]);
  }, []);

  useEffect(() => () => {
    locUnsubRef.current?.();
    Speech.stop();
  }, []);

  const currentStep = route?.steps[stepIndex] ?? null;

  return {
    route, currentStep, stepIndex,
    distanceToNext: liveDistanceToNext,
    isNearDestination,
    isLoading, error, userLat, userLng, bearing,
    guardWarnings,
    startNav, stopNav, speakStep,
  };
}
