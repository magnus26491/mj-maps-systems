/**
 * Shift store — Zustand
 * Holds active shift state: vehicle, stops, current position, scores.
 */
import { create } from 'zustand';

export interface DeliveryStop {
  id:          string;
  index:       number;
  address:     string;
  notes:       string | null;
  lat:         number;
  lng:         number;
  parcelCount: number;
  etaLabel:    string | null;
  distanceM:   number | null;
  alertLevel:  'GREEN' | 'AMBER' | 'RED' | null;
  status:      'pending' | 'completed' | 'failed';
}

export interface Shift {
  id:         string;
  vehicleId:  string;
  totalStops: number;
  startedAt:  number;
}

interface ShiftState {
  isActive:        boolean;
  shift:           Shift | null;
  stops:           DeliveryStop[];
  currentStop:     DeliveryStop | null;
  nextStop:        DeliveryStop | null;
  startShift:      (vehicleId: string) => void;
  endShift:        () => void;
  completeStop:    () => void;
  failStop:        () => void;
  setStops:        (stops: DeliveryStop[]) => void;
  updateStopAlert: (stopId: string, alert: 'GREEN' | 'AMBER' | 'RED') => void;
}

const nextPending = (stops: DeliveryStop[]) =>
  stops.find(s => s.status === 'pending') ?? null;

export const useShiftStore = create<ShiftState>((set, get) => ({
  isActive: false, shift: null, stops: [], currentStop: null, nextStop: null,

  startShift: (vehicleId) => set({
    isActive: true,
    shift: { id: `shift-${Date.now()}`, vehicleId, totalStops: 0, startedAt: Date.now() },
  }),

  endShift: () => set({ isActive: false, shift: null, stops: [], currentStop: null, nextStop: null }),

  setStops: (stops) => {
    const current = nextPending(stops);
    const next    = stops.find(s => s.status === 'pending' && s.id !== current?.id) ?? null;
    set(s => ({
      stops, currentStop: current, nextStop: next,
      shift: s.shift ? { ...s.shift, totalStops: stops.length } : null,
    }));
  },

  completeStop: () => {
    const { stops, currentStop } = get();
    if (!currentStop) return;
    const updated  = stops.map(s => s.id === currentStop.id ? { ...s, status: 'completed' as const } : s);
    const next     = nextPending(updated);
    const afterNext = updated.find(s => s.status === 'pending' && s.id !== next?.id) ?? null;
    set({ stops: updated, currentStop: next, nextStop: afterNext });
  },

  failStop: () => {
    const { stops, currentStop } = get();
    if (!currentStop) return;
    const updated   = stops.map(s => s.id === currentStop.id ? { ...s, status: 'failed' as const } : s);
    const next      = nextPending(updated);
    const afterNext = updated.find(s => s.status === 'pending' && s.id !== next?.id) ?? null;
    set({ stops: updated, currentStop: next, nextStop: afterNext });
  },

  updateStopAlert: (stopId, alert) => set(s => ({
    stops: s.stops.map(stop => stop.id === stopId ? { ...stop, alertLevel: alert } : stop),
    currentStop: s.currentStop?.id === stopId
      ? { ...s.currentStop, alertLevel: alert }
      : s.currentStop,
  })),
}));
