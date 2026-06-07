/**
 * hooks/usePodDrain.ts
 *
 * React hook that wires NetInfo → outbox drain.
 * Mount this once in _layout.tsx.
 *
 * On mount: drains any entries that were queued while offline.
 * On reconnect: drains again (fire-and-forget).
 */
import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { drainOutbox, purgeOldEntries } from '../lib/podOutbox';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

export function usePodDrain(): void {
  useEffect(() => {
    // Drain once on mount (in case app was offline and just relaunched)
    drainOutbox(API_BASE).catch(() => {});
    purgeOldEntries().catch(() => {});

    // Subscribe: drain whenever connection is restored
    const unsub = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        drainOutbox(API_BASE).catch(() => {});
      }
    });

    return () => unsub();
  }, []);
}