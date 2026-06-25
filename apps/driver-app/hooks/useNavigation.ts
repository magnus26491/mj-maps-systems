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
import { subscribeSharedLocation, type SharedLocation } from '../lib/shared-location';

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

interface UseNavigationResult {
  route:          NavRoute | null;
  currentStep:    NavStep | null;
  stepIndex:      number;
  distanceToNext: number;
  isLoading:      boolean;
  error:          string | null;
  userLat:        number | null;
  userLng:        number | null;
  bearing:        number;
  guardWarnings:  NavGuardWarning[];
  startNav:       (toLat: number, toLng: number) => void;
  stopNav:        () => void;
  speakStep:      (step: NavStep) => void;
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
  const lastSpokenStep = useRef(-1);
  const destLat = useRef<number | null>(null);
  const destLng = useRef<number | null>(null);
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

    const segmentEnd = route.polyline[Math.min(stepIndex + 1, route.polyline.length - 1)];
    if (!segmentEnd) return;

    const distM = distanceM(userLat, userLng, segmentEnd.lat, segmentEnd.lng);

    if (distM < 200 && lastSpokenStep.current !== stepIndex) {
      lastSpokenStep.current = stepIndex;
      speakStep(step);
    }

    if (distM < 30 && stepIndex < route.steps.length - 1) {
      setStepIndex(i => i + 1);
    }
  }, [userLat, userLng, route, stepIndex, speakStep]);

  const startNav = useCallback(async (toLat: number, toLng: number) => {
    setIsLoading(true);
    setError(null);
    setStepIndex(0);
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
    );

    if (!navRoute) {
      setError('Could not fetch route. Check your connection.');
      setIsLoading(false);
      return;
    }

    setRoute(navRoute);
    routeRef.current = navRoute;
    setGuardWarnings(navRoute.guardWarnings ?? []);
    destLat.current = toLat;
    destLng.current = toLng;
    setIsLoading(false);
    if (navRoute.steps[0]) speakStep(navRoute.steps[0]);

    // Subscribe to shared location for tracking + off-route detection
    locUnsubRef.current?.();
    locUnsubRef.current = subscribeSharedLocation((loc: SharedLocation) => {
      setUserLat(loc.latitude);
      setUserLng(loc.longitude);
      if (loc.heading !== null) setBearing(loc.heading);

      // Off-route detection — re-fetch route if driver deviates
      const currentRoute = routeRef.current;
      if (currentRoute && !isReroutingRef.current) {
        const offRoute = isOffRoute(
          loc.latitude, loc.longitude,
          currentRoute.polyline,
          DEVIATION_THRESHOLD_M,
        );
        if (offRoute) {
          isReroutingRef.current = true;
          console.log('[useNavigation] Off route — re-routing...');
          fetchNavRoute(
            loc.latitude, loc.longitude,
            destLat.current!, destLng.current!,
            vehicleId ?? 'lwb_van',
            customHeightM,
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
        }
      }
    });
  }, [vehicleId, speakStep]);

  const stopNav = useCallback(() => {
    locUnsubRef.current?.();
    locUnsubRef.current = null;
    Speech.stop();
    setRoute(null);
    routeRef.current = null;
    destLat.current = null;
    destLng.current = null;
    setStepIndex(0);
    setError(null);
    setGuardWarnings([]);
  }, []);

  useEffect(() => () => {
    locUnsubRef.current?.();
    Speech.stop();
  }, []);

  const currentStep    = route?.steps[stepIndex] ?? null;
  const distanceToNext = currentStep?.distanceM ?? 0;

  return {
    route, currentStep, stepIndex, distanceToNext,
    isLoading, error, userLat, userLng, bearing,
    guardWarnings,
    startNav, stopNav, speakStep,
  };
}