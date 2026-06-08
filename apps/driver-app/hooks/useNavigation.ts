/**
 * hooks/useNavigation.ts
 * Navigation state machine using live GPS and expo-speech.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import { fetchNavRoute, type NavRoute, type NavStep } from '../lib/navigation';
import { useShiftStore } from '../store/shift';

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
  startNav:       (toLat: number, toLng: number) => void;
  stopNav:        () => void;
  speakStep:      (step: NavStep) => void;
}

export function useNavigation(): UseNavigationResult {
  const vehicleId  = useShiftStore(s => s.vehicleId);
  const [route,    setRoute]      = useState<NavRoute | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error,    setError]      = useState<string | null>(null);
  const [userLat,  setUserLat]    = useState<number | null>(null);
  const [userLng,  setUserLng]    = useState<number | null>(null);
  const [bearing,  setBearing]    = useState(0);
  const locationSub = useRef<Location.LocationSubscription | null>(null);
  const lastSpokenStep = useRef(-1);

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

    const R   = 6371000;
    const dLat = (segmentEnd.lat - userLat) * Math.PI / 180;
    const dLng = (segmentEnd.lng - userLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(userLat * Math.PI / 180)
      * Math.cos(segmentEnd.lat * Math.PI / 180)
      * Math.sin(dLng / 2) ** 2;
    const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

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

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setUserLat(loc.coords.latitude);
    setUserLng(loc.coords.longitude);

    const navRoute = await fetchNavRoute(
      loc.coords.latitude, loc.coords.longitude,
      toLat, toLng,
      vehicleId ?? 'TRANSIT_LWB_GB',
    );

    if (!navRoute) {
      setError('Could not fetch route. Check your connection.');
      setIsLoading(false);
      return;
    }

    setRoute(navRoute);
    setIsLoading(false);
    if (navRoute.steps[0]) speakStep(navRoute.steps[0]);

    locationSub.current?.remove();
    locationSub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
      loc => {
        setUserLat(loc.coords.latitude);
        setUserLng(loc.coords.longitude);
        setBearing(loc.coords.heading ?? 0);
      },
    );
  }, [vehicleId, speakStep]);

  const stopNav = useCallback(() => {
    locationSub.current?.remove();
    locationSub.current = null;
    Speech.stop();
    setRoute(null);
    setStepIndex(0);
    setError(null);
  }, []);

  useEffect(() => () => {
    locationSub.current?.remove();
    Speech.stop();
  }, []);

  const currentStep    = route?.steps[stepIndex] ?? null;
  const distanceToNext = currentStep?.distanceM ?? 0;

  return {
    route, currentStep, stepIndex, distanceToNext,
    isLoading, error, userLat, userLng, bearing,
    startNav, stopNav, speakStep,
  };
}