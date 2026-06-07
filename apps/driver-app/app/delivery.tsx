/**
 * Delivery Screen — replaces the old HUD
 *
 * Implements the complete driver delivery experience with three phases:
 *   EN_ROUTE → ARRIVING → AT_STOP
 *
 * This is the main active delivery view that drivers see during a shift.
 */
import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useShiftStore } from '../store/shift';
import { useDeliveryStore, EnrichedRoute } from '../store/deliveryStore';
import { DeliveryScreen } from '../features/delivery';

export default function DeliveryRoute() {
  const shift = useShiftStore(s => s.shift);
  const stops = useShiftStore(s => s.stops);
  const isActive = useShiftStore(s => s.isActive);
  const loadRoute = useDeliveryStore(s => s.loadRoute);
  const deliveryPhase = useDeliveryStore(s => s.phase);
  const currentStop = useDeliveryStore(s => s.currentStop);

  // Convert shift stops to EnrichedRoute format for the delivery store
  useEffect(() => {
    if (isActive && stops.length > 0) {
      const enrichedStops = stops.map((stop, index) => ({
        id: stop.id,
        lat: stop.lat ?? 0,
        lng: stop.lng ?? 0,
        address: stop.address,
        parcelCount: stop.parcelCount,
        totalWeightKg: 1, // default weight
        requiresSignature: false,
        isOversize: false,
        sequence: index,
        access_notes: stop.notes ?? undefined,
        clusterId: -1,
        // Map turn score to alert level
        turn: stop.alertLevel === 'RED' ? {
          alertLevel: 'red' as const,
          message: stop.turnReason ?? 'Road alert',
          alertDistanceM: 0,
          approachBearing: 0,
          approach: { turnAroundMethod: '', message: '' },
        } : stop.alertLevel === 'AMBER' ? {
          alertLevel: 'amber' as const,
          message: stop.turnReason ?? 'Caution ahead',
          alertDistanceM: 0,
          approachBearing: 0,
          approach: { turnAroundMethod: '', message: '' },
        } : undefined,
      }));

      const enrichedRoute: EnrichedRoute = {
        stops: enrichedStops,
        summary: {
          totalStops: stops.length,
          pinsResolved: 0,
          pinsFromCommunity: 0,
          pinsFromW3W: 0,
          pinsFromOsm: 0,
          pinsAtPostcodeFallback: 0,
          redTurnWarnings: 0,
          amberTurnWarnings: 0,
          walkClusters: 0,
          walkTimeSavedMin: 0,
          levelCrossings: 0,
          enrichmentTimeMs: 0,
        },
      };

      loadRoute(enrichedRoute);
    }
  }, [isActive, stops.length]);

  // Render delivery screen (handles vehicle picker, phases, etc.)
  return <DeliveryScreen />;
}