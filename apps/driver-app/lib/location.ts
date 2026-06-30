/**
 * lib/location.ts
 * Thin wrapper over hooks/useDriverLocation that sends LOCATION_UPDATE
 * events to the server via the offline queue.
 *
 * The background task fires every 10s (MJ_MAPS_LOCATION background mode).
 * Foreground watches every 3s with high accuracy.
 *
 * Events are sent via apiDriverEvent — offline queue handles signal loss.
 */
import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useDriverLocation } from '../hooks/useDriverLocation';
import { useShiftStore } from '../store/shift';
import { apiDriverEvent } from './api';
import { enqueue } from './offline-queue';
import { DriverEventType } from '../constants/events';

/**
 * Must be called inside a component that is mounted during an active shift.
 * Uses driverId / routeId from the shift store.
 */
export function useLocationSender() {
  const location = useDriverLocation();
  const driverId = useShiftStore(s => s.driverId);
  const routeId  = useShiftStore(s => s.shift?.routeId ?? null);

  // Cache network state via subscription instead of calling NetInfo.fetch()
  // on every GPS tick (every 8–2s). The ref is synchronous — no await needed.
  const isOnlineRef = useRef(true);
  useEffect(() => {
    NetInfo.fetch().then(s => {
      isOnlineRef.current = Boolean(s.isConnected && s.isInternetReachable);
    });
    return NetInfo.addEventListener(s => {
      isOnlineRef.current = Boolean(s.isConnected && s.isInternetReachable);
    });
  }, []);

  useEffect(() => {
    if (!location || !driverId || !routeId) return;

    const payload = {
      type:     DriverEventType.LOCATION_UPDATE,
      driverId,
      routeId,
      lat:      location.lat,
      lng:      location.lng,
      heading:  location.headingDeg ?? 0,
      speedMs:  location.speedMps ?? 0,
      epochSec: Math.floor(Date.now() / 1000),
    };

    if (isOnlineRef.current) {
      apiDriverEvent(payload).catch(() => {
        enqueue(DriverEventType.LOCATION_UPDATE, payload).catch(() => {});
      });
    } else {
      enqueue(DriverEventType.LOCATION_UPDATE, payload).catch(() => {});
    }
  }, [location, driverId, routeId]);
}