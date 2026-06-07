/**
 * MJ Maps Systems — Alert Dispatcher
 *
 * Takes the full array of EnrichedStops (output of road-enricher) and
 * produces a flat, time-sorted list of AlertEvents that the driver app
 * nav overlay consumes.
 *
 * Each AlertEvent represents one moment in the route where the driver
 * needs to do something non-trivial: slow down, choose an approach
 * side, plan a turn, or hard-stop before entering.
 *
 * The nav overlay fires each event when the driver's GPS position is
 * within `alertDistanceM` of the event's `triggerWaypoint`.
 *
 * Overlay colour codes:
 *   BLUE    — informational (USE_TURNING_HEAD, FORWARD_TURN)
 *   AMBER   — action required (THREE_POINT, REVERSE_OUT)
 *   RED     — stop immediately / do not enter (DO_NOT_ENTER)
 *
 * This file has zero external network calls — pure in-memory transformation.
 */

import type { LatLng } from '../../route-engine/src/types';
import type { TurnAroundMethod } from './approach-side';

// ─── TYPES ─────────────────────────────────────────────────────────────────

export type OverlayColour = 'BLUE' | 'AMBER' | 'RED';

export interface AlertEvent {
  stopId: string;
  stopSequence: number;
  stopAddress: string;
  /** GPS coord where the driver app fires this alert */
  triggerWaypoint: LatLng;
  /** The stop's delivery pin coord (displayed as destination marker) */
  stopCoord: LatLng;
  turnAroundMethod: TurnAroundMethod;
  alertDistanceM: number;
  overlayColour: OverlayColour;
  message: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  /** ISO timestamp of enrichment — allows client to decide if cache is stale */
  enrichedAt: string;
}

// Input shape — matches EnrichedStop from road-enricher.ts
export interface EnrichedStopInput {
  id: string;
  sequence: number;
  address: string;
  lat: number;
  lng: number;
  pin?: { lat: number; lng: number } | null;
  turn: {
    alertLevel: 'green' | 'amber' | 'red';
    approach: {
      turnAroundMethod: TurnAroundMethod;
      alertDistanceM: number;
      preAlertWaypoint: LatLng | null;
      message: string;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    };
  } | null;
  osmContext?: { fetchedAt: string } | null;
}

// ─── COLOUR MAPPING ─────────────────────────────────────────────────────────

const METHOD_TO_COLOUR: Record<TurnAroundMethod, OverlayColour> = {
  NOT_REQUIRED:     'BLUE',
  USE_TURNING_HEAD: 'BLUE',
  FORWARD_TURN:     'BLUE',
  THREE_POINT:      'AMBER',
  REVERSE_OUT:      'AMBER',
  DO_NOT_ENTER:     'RED',
};

// ─── DISPATCHER ─────────────────────────────────────────────────────────────

/**
 * Build the flat AlertEvent list for the driver nav overlay.
 *
 * Only stops where a non-trivial turn decision was made generate an event
 * (i.e. NOT_REQUIRED stops with preAlertWaypoint === null are skipped).
 *
 * Events are returned sorted by stopSequence (route order) so the nav
 * overlay can iterate through them in order.
 */
export function buildAlertEvents(stops: EnrichedStopInput[]): AlertEvent[] {
  const events: AlertEvent[] = [];
  const now = new Date().toISOString();

  for (const stop of stops) {
    if (!stop.turn) continue;

    const { approach, alertLevel } = stop.turn;
    const { turnAroundMethod, alertDistanceM, preAlertWaypoint, message, confidence } = approach;

    // Skip purely green no-action stops
    if (turnAroundMethod === 'NOT_REQUIRED') continue;

    // If the approach resolver couldn't project a waypoint, use stop coord as trigger
    const triggerWaypoint = preAlertWaypoint ?? {
      lat: stop.pin?.lat ?? stop.lat,
      lng: stop.pin?.lng ?? stop.lng,
    };

    const stopCoord: LatLng = {
      lat: stop.pin?.lat ?? stop.lat,
      lng: stop.pin?.lng ?? stop.lng,
    };

    events.push({
      stopId:           stop.id,
      stopSequence:     stop.sequence,
      stopAddress:      stop.address,
      triggerWaypoint,
      stopCoord,
      turnAroundMethod,
      alertDistanceM,
      overlayColour:    METHOD_TO_COLOUR[turnAroundMethod],
      message,
      confidence,
      enrichedAt:       stop.osmContext?.fetchedAt ?? now,
    });
  }

  // Sort by route sequence
  return events.sort((a, b) => a.stopSequence - b.stopSequence);
}

/**
 * Filter helper: returns only RED events (DO_NOT_ENTER stops).
 * Used by the dispatcher console to flag problematic stops before the
 * driver leaves the depot.
 */
export function getRedEvents(stops: EnrichedStopInput[]): AlertEvent[] {
  return buildAlertEvents(stops).filter(e => e.overlayColour === 'RED');
}

/**
 * Summary stats for the pre-departure dashboard.
 */
export function summariseAlerts(stops: EnrichedStopInput[]): {
  total: number;
  blue: number;
  amber: number;
  red: number;
  doNotEnterStops: string[];
} {
  const events = buildAlertEvents(stops);
  return {
    total:           events.length,
    blue:            events.filter(e => e.overlayColour === 'BLUE').length,
    amber:           events.filter(e => e.overlayColour === 'AMBER').length,
    red:             events.filter(e => e.overlayColour === 'RED').length,
    doNotEnterStops: events
      .filter(e => e.turnAroundMethod === 'DO_NOT_ENTER')
      .map(e => e.stopAddress),
  };
}
