/**
 * Root layout — mounts above all screens.
 *
 * Responsibilities:
 *  · GestureHandler + SafeArea + React Query providers
 *  · Keep screen awake for entire shift (KeepAwake)
 *  · Auth guard — redirects to /(auth)/login when unauthenticated
 *  · FCM token registration after login
 *  · TurnWarningOverlay portal — renders above all navigation
 *    so RED alerts appear regardless of which screen is active
 *  · WebSocket connection lifecycle tied to active shift
 */
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as KeepAwake from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { StyleSheet } from 'react-native';
import { useShiftStore } from '../store/shift';
import { useAuthStore } from '../lib/auth';
import { TurnWarningOverlay } from './turn-warning';
import { useWebSocket } from '../hooks/useWebSocket';
import { useTurnScore } from '../hooks/useTurnScore';
import { apiRegisterFcmToken } from '../lib/api';
import { setupShiftNotificationChannel } from '../modules/shiftNotification';
import { usePodDrain } from '../hooks/usePodDrain';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:  5 * 60 * 1000,
      gcTime:    30 * 60 * 1000,
      retry: 2,
      retryDelay: 3000,
    },
  },
});

// FCM notification handler — silent pushes only
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge:  false,
  } as Notifications.NotificationBehavior),
});

// —— Auth guard component ———————————————————————————————
function AuthGuard({ children }: { children: React.ReactNode }) {
  const router   = useRouter();
  const segments = useSegments();
  const isReady  = useAuthStore(s => s.isReady);
  const token    = useAuthStore(s => s.token);
  const loadStored = useAuthStore(s => s.loadStored);

  useEffect(() => { loadStored(); }, []);

  useEffect(() => {
    if (!isReady) return;
    const inAuth = segments[0] === '(auth)';
    if (!token && !inAuth) router.replace('/(auth)/login');
    if (token  && inAuth)  router.replace('/(app)/');
  }, [isReady, token, segments]);

  return <>{children}</>;
}

// —— FCM registration ———————————————————————————————
function FcmRegistrar({ children }: { children: React.ReactNode }) {
  const isReady = useAuthStore(s => s.isReady);
  const token   = useAuthStore(s => s.token);

  useEffect(() => {
    if (!isReady || !token) return;
    (async () => {
      try {
        const perms = await Notifications.requestPermissionsAsync();
        if (perms.status === 'granted') {
          const { data } = await Notifications.getExpoPushTokenAsync();
          await apiRegisterFcmToken(data);
        }
      } catch { /* non-fatal */ }
    })();
  }, [isReady, token]);

  return <>{children}</>;
}

// —— Inner component — needs store access ————————————————————
function ShiftAwareProviders({ children }: { children: React.ReactNode }) {
  const isActive    = useShiftStore(s => s.isActive);
  const shift       = useShiftStore(s => s.shift);
  const currentStop = useShiftStore(s => s.currentStop);
  const driverId    = useShiftStore(s => s.driverId);
  const vehicleId   = useShiftStore(s => s.vehicleId);

  // Mount POD outbox drain — wires NetInfo → SQLite outbox drain
  usePodDrain();

  useWebSocket(
    isActive ? (driverId ?? null) : null,
    isActive ? (shift?.routeId ?? null) : null,
  );

  const { alert, score, reason } = useTurnScore(currentStop, vehicleId);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => { setDismissed(false); }, [currentStop?.id, alert]);

  const showWarning = alert === 'RED' && !dismissed && isActive;

  return (
    <>
      {children}
      <TurnWarningOverlay
        visible={showWarning}
        reason={reason ?? 'Road too narrow for your vehicle'}
        score={score ?? 0}
        address={String(currentStop?.address ?? '')}
        onDismiss={() => setDismissed(true)}
      />
    </>
  );
}

// —— Root layout ———————————————————————————————
export default function RootLayout() {
  useEffect(() => {
    KeepAwake.activateKeepAwakeAsync();
    setupShiftNotificationChannel().catch(() => {});
    return () => { KeepAwake.deactivateKeepAwake(); };
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <AuthGuard>
            <FcmRegistrar>
              <ShiftAwareProviders>
                <Stack
                  screenOptions={{
                    headerShown:  false,
                    animation:    'slide_from_right',
                    contentStyle: { backgroundColor: '#0f1923' },
                  }}
                />
              </ShiftAwareProviders>
            </FcmRegistrar>
          </AuthGuard>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
