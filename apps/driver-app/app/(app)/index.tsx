import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, RefreshControl, Alert,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { useAuthStore } from '../../lib/auth';
import { apiGetDriverRoute, apiGetAlerts } from '../../lib/api';
import { useLocationSender } from '../../lib/location';
import { flushQueue, getQueueLength } from '../../lib/offline-queue';
import { useDriverWs } from '../../lib/ws';
import { DriverEventType } from '../../constants/events';
import StopCard from '../../components/StopCard';
import ApproachBrief from '../../components/ApproachBrief';
import WorkloadBanner from '../../components/WorkloadBanner';
import type { ServerMessage } from '../../lib/types';
import { useShiftStore } from '../../store/shift';

export default function HomeScreen() {
  const router = useRouter();
  const qc     = useQueryClient();
  const user   = useAuthStore(s => s.user);
  const driverId = useShiftStore(s => s.driverId);

  // routeId comes from the active shift store (set after route accepted)
  const routeId  = useShiftStore(s => s.shift?.routeId ?? null);
  const [approachBrief, setApproachBrief] = useState<ServerMessage | null>(null);
  const [workloadMsg,   setWorkloadMsg]   = useState<ServerMessage | null>(null);
  const [queueLen,      setQueueLen]     = useState(0);
  const [online,        setOnline]        = useState(true);

  // Monitor network → flush queue on reconnect
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const isOnline = !!state.isConnected;
      setOnline(isOnline);
      if (isOnline) flushQueue().then(() => getQueueLength().then(setQueueLen));
    });
    return unsub;
  }, []);

  // Poll queue length
  useEffect(() => {
    const t = setInterval(() => getQueueLength().then(setQueueLen), 15_000);
    return () => clearInterval(t);
  }, []);

  // Route detail query
  const { data, isLoading, refetch } = useQuery({
    queryKey:        ['driver-route', routeId],
    queryFn:         () => apiGetDriverRoute(routeId!),
    enabled:         !!routeId,
    staleTime:       30_000,
  });

  const { data: alertsData } = useQuery({
    queryKey: ['alerts', routeId],
    queryFn:  () => apiGetAlerts(routeId!),
    enabled:  !!routeId,
  });

  const stops     = (data?.data?.stops ?? []) as import('../../lib/types').Stop[];
  const redAlerts = (alertsData?.data?.events ?? []) as import('../../lib/types').Alert[];

  // WebSocket
  const { connected, sendEvent } = useDriverWs({
    driverId:       user?.id ?? '',
    routeId:        routeId ?? '',
    onApproachBrief:   setApproachBrief,
    onPlanUpdate:      () => qc.invalidateQueries({ queryKey: ['driver-route', routeId] }),
    onWorkloadWarning: setWorkloadMsg,
    onOverload:        setWorkloadMsg,
  });

  // GPS location sender (uses shift store driverId/routeId)
  useLocationSender();

  // Start route — called when driver accepts the plan
  async function handleStartRoute() {
    if (!routeId || !user) return;
    await sendEvent(DriverEventType.ROUTE_STARTED, { epochSec: Math.floor(Date.now() / 1000) });
  }

  // Complete route
  async function handleCompleteRoute() {
    if (!routeId || !user) return;
    Alert.alert(
      'Complete Route',
      'Mark all stops done and end the route?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          style: 'default',
          onPress: async () => {
            await sendEvent(DriverEventType.ROUTE_COMPLETED, { epochSec: Math.floor(Date.now() / 1000) });
          },
        },
      ],
    );
  }

  const pending   = stops.filter(s => s.status === 'pending').length;
  const completed = stops.filter(s => s.status === 'completed').length;
  const failed    = stops.filter(s => s.status === 'failed').length;

  if (!routeId) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>No route assigned today</Text>
        <Text style={styles.sub}>
          Contact your dispatcher to get a route assigned.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.heading}>Today's Route</Text>
          <View style={[styles.dot, connected ? styles.dotGreen : styles.dotRed]} />
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.stat}>
            <Text style={styles.statNum}>{completed}</Text> done
          </Text>
          <Text style={styles.stat}>
            <Text style={[styles.statNum, { color: '#f87171' }]}>{failed}</Text> failed
          </Text>
          <Text style={styles.stat}>
            <Text style={styles.statNum}>{pending}</Text> pending
          </Text>
        </View>
        {queueLen > 0 && (
          <Text style={styles.queueWarn}>⚠ {queueLen} events queued offline</Text>
        )}
        {workloadMsg && (
          <WorkloadBanner
            message={workloadMsg}
            onDismiss={() => setWorkloadMsg(null)}
          />
        )}
        {redAlerts.length > 0 && (
          <View style={styles.alertBanner}>
            <Text style={styles.alertText}>
              🚫 {redAlerts.length} DO NOT ENTER stop{redAlerts.length > 1 ? 's' : ''} on this route
            </Text>
          </View>
        )}
      </View>

      <FlatList
        data={stops}
        keyExtractor={s => s.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        renderItem={({ item }) => (
          <StopCard
            stop={item}
            onPress={() => router.push(`/(app)/stop/${item.id}`)}
          />
        )}
        ListFooterComponent={
          pending === 0 && stops.length > 0 ? (
            <TouchableOpacity style={styles.completeBtn} onPress={handleCompleteRoute}>
              <Text style={styles.completeBtnText}>Complete Route</Text>
            </TouchableOpacity>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {approachBrief && (
        <ApproachBrief
          message={approachBrief}
          onDismiss={() => setApproachBrief(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#030712' },
  center:           { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header:           { backgroundColor: '#111827', padding: 16, borderBottomWidth: 1, borderColor: '#1f2937' },
  headerRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  heading:          { color: '#f9fafb', fontSize: 18, fontWeight: '700' },
  sub:              { color: '#9ca3af', fontSize: 14, marginTop: 8, textAlign: 'center' },
  statsRow:         { flexDirection: 'row', gap: 16 },
  stat:             { color: '#9ca3af', fontSize: 13 },
  statNum:          { color: '#f9fafb', fontWeight: '700' },
  dot:              { width: 10, height: 10, borderRadius: 5 },
  dotGreen:         { backgroundColor: '#22c55e' },
  dotRed:           { backgroundColor: '#ef4444' },
  queueWarn:        { color: '#fbbf24', fontSize: 12, marginTop: 6 },
  alertBanner:      { backgroundColor: '#450a0a', borderRadius: 8, padding: 10, marginTop: 8 },
  alertText:        { color: '#fca5a5', fontSize: 13, fontWeight: '600' },
  completeBtn:      { backgroundColor: '#22c55e', margin: 16, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  completeBtnText:  { color: '#fff', fontWeight: '700', fontSize: 16 },
});