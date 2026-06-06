/**
 * Root layout — mounts above all screens.
 *
 * Responsibilities:
 *  · GestureHandler + SafeArea + React Query providers
 *  · Keep screen awake for entire shift (KeepAwake)
 *  · TurnWarningOverlay portal — renders above all navigation
 *    so RED alerts appear regardless of which screen is active
 *  · WebSocket connection lifecycle tied to active shift
 */
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as KeepAwake from 'expo-keep-awake';
import { StyleSheet } from 'react-native';
import { useShiftStore } from '../store/shift';
import { TurnWarningOverlay } from './turn-warning';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTurnScore } from '../hooks/useTurnScore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:  5 * 60 * 1000,   // 5 min
      gcTime:    30 * 60 * 1000,   // 30 min offline fallback
      retry: 2,
      retryDelay: 3000,
    },
  },
});

// ─── Inner component — needs store access ────────────────────────────────────
function ShiftAwareProviders({ children }: { children: React.ReactNode }) {
  const isActive    = useShiftStore(s => s.isActive);
  const shift       = useShiftStore(s => s.shift);
  const currentStop = useShiftStore(s => s.currentStop);
  const driverId    = useShiftStore(s => s.driverId);
  const vehicleId   = useShiftStore(s => s.vehicleId);

  // Live WebSocket — only active during a shift
  useWebSocket(
    isActive ? (driverId ?? null) : null,
    isActive ? (shift?.routeId ?? null) : null,
  );

  // Turn score — polled at root level so overlay can fire from any screen
  const { alert, score, reason } = useTurnScore(currentStop, vehicleId);

  // Local dismiss state — driver can override a RED and continue
  const [dismissed, setDismissed] = useState(false);

  // Reset dismiss when stop changes or alert clears
  useEffect(() => {
    setDismissed(false);
  }, [currentStop?.id, alert]);

  const showWarning = alert === 'RED' && !dismissed && isActive;

  return (
    <>
      {children}
      <TurnWarningOverlay
        visible={showWarning}
        reason={reason ?? 'Road too narrow for your vehicle'}
        score={score ?? 0}
        address={currentStop?.address ?? ''}
        onDismiss={() => setDismissed(true)}
      />
    </>
  );
}

// ─── Root layout ─────────────────────────────────────────────────────────────
export default function RootLayout() {
  useEffect(() => {
    KeepAwake.activateKeepAwakeAsync();
    return () => { KeepAwake.deactivateKeepAwake(); };
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <ShiftAwareProviders>
            <Stack
              screenOptions={{
                headerShown:  false,
                animation:    'slide_from_right',
                contentStyle: { backgroundColor: '#0f1923' },
              }}
            />
          </ShiftAwareProviders>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
