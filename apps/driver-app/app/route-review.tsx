import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, SectionList, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Haptics from 'expo-haptics';
import { useShiftStore } from '../store/shift';
import { useTheme } from '../components/ThemeContext';

const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

export default function RouteReviewScreen() {
  const { departureEpochMs } = useLocalSearchParams<{ departureEpochMs: string }>();
  const depMs = parseInt(departureEpochMs ?? '0', 10) || Date.now();
  const departureDate = new Date(depMs);

  const rawStaged = useShiftStore(s => s.stagedStops);
  const [stops,    setStops]   = useState<any[]>(rawStaged ?? []);
  const [starting, setStarting] = useState(false);
  const [undoState, setUndoState] = useState<{ stop: any; index: number } | null>(null);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!rawStaged?.length) router.back();
  }, []);

  useEffect(() => {
    if (!undoState) return;
    const t = setTimeout(() => setUndoState(null), 4000);
    return () => clearTimeout(t);
  }, [undoState]);

  const handleRemove = useCallback((stop: any, index: number) => {
    setStops(prev => prev.filter((_, i) => i !== index));
    setUndoState({ stop, index });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoState) return;
    setStops(prev => {
      const next = [...prev];
      next.splice(undoState.index, 0, undoState.stop);
      return next;
    });
    setUndoState(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [undoState]);

  const handleStartShift = useCallback(async () => {
    if (!stops.length) return;
    setStarting(true);
    const vehicle = useShiftStore.getState().vehicle;
    const vehicleId = vehicle?.id ?? useShiftStore.getState().vehicleId ?? 'TRANSIT_LWB_GB';
    const token   = (useShiftStore.getState() as any).token ?? '';
    try {
      const res = await fetch(`${API}/api/v1/optimise`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          depot:                { lat: 0, lng: 0 },
          stops:                stops.map((s: any) => ({
                                  id: s.id, address: s.address,
                                  lat: s.lat ?? 0, lng: s.lng ?? 0,
                                  parcelCount: s.parcelCount ?? 1,
                                })),
          vehicleProfileKey:    vehicle?.profileKey ?? 'TRANSIT_LWB_GB',
          plannedDepartureTime: departureDate.toISOString(),
        }),
      });
      const data = res.ok ? await res.json() : null;
      const routeId = data?.routeId ?? `offline-${Date.now()}`;
      useShiftStore.getState().startShift(
        data?.optimized?.orderedStops ?? stops,
        vehicleId,
        routeId,
      );
    } catch {
      useShiftStore.getState().startShift(stops as any, vehicleId, `offline-${Date.now()}`);
    } finally {
      useShiftStore.getState().clearStagedStops();
      setStarting(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/hud');
    }
  }, [stops, departureDate]);

  const totalParcels = stops.reduce((n: number, s: any) => n + (s.parcelCount ?? 1), 0);
  const etaMins      = stops.length * 3;
  const etaHrs       = Math.floor(etaMins / 60);
  const etaMinsRem   = etaMins % 60;
  const etaDisplay   = etaHrs > 0 ? `~${etaHrs}h ${etaMinsRem}m` : `~${etaMins}m`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>

      {/* HEADER */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={[styles.backText, { color: colors.green }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Review Route</Text>
        <View style={[styles.countBadge, { backgroundColor: colors.green }]}>
          <Text style={styles.countText}>{stops.length}</Text>
        </View>
      </View>

      {/* INFO BANNER */}
      <View style={[styles.infoBanner, { backgroundColor: '#1a3a1a' }]}>
        <Text style={styles.infoText}>
          📦  Swipe left on any stop you don't have parcels for to remove it
        </Text>
      </View>

      {/* STATS BAR */}
      <View style={styles.statsBar}>
        {([
          ['🚏', `${stops.length} stop${stops.length !== 1 ? 's' : ''}`],
          ['📦', `${totalParcels} parcel${totalParcels !== 1 ? 's' : ''}`],
          ['⏱', etaDisplay],
        ] as const).map(([icon, label]) => (
          <View key={String(label)} style={[styles.statPill, { backgroundColor: colors.surface }]}>
            <Text style={{ fontSize: 14 }}>{icon}</Text>
            <Text style={[styles.statText, { color: colors.text }]}>{label}</Text>
          </View>
        ))}
      </View>

      {/* STOP LIST */}
      <SectionList
        sections={[{ title: '', data: stops }]}
        keyExtractor={(item: any, i) => item.id ?? String(i)}
        contentContainerStyle={{ paddingBottom: 160 }}
        renderSectionHeader={() => null}
        renderItem={({ item, index }: { item: any; index: number }) => (
          <Swipeable
            renderRightActions={() => (
              <TouchableOpacity
                style={styles.swipeRemove}
                onPress={() => handleRemove(item, index)}
                accessibilityRole="button"
                accessibilityLabel={`Remove stop: ${item.address}`}
              >
                <Text style={styles.swipeRemoveText}>Remove</Text>
              </TouchableOpacity>
            )}
          >
            <View style={[styles.stopRow, { backgroundColor: colors.surface }]}>
              <View style={[styles.seqBadge, { backgroundColor: colors.green }]}>
                <Text style={styles.seqText}>{index + 1}</Text>
              </View>
              <View style={styles.stopContent}>
                <Text style={[styles.stopAddress, { color: colors.text }]} numberOfLines={2}>
                  {item.address}
                </Text>
                <Text style={[styles.stopMeta, { color: colors.subtext }]}>
                  {item.parcelCount ?? 1} parcel{(item.parcelCount ?? 1) !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
          </Swipeable>
        )}
      />

      {/* UNDO SNACKBAR */}
      {undoState && (
        <View style={styles.snackbar}>
          <Text style={styles.snackText}>Stop removed</Text>
          <TouchableOpacity
            onPress={handleUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo stop removal"
          >
            <Text style={styles.snackUndo}>UNDO</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CTA FOOTER */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Text style={[styles.departureNote, { color: colors.subtext }]}>
          Departing at {departureDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
        <TouchableOpacity
          style={[styles.startBtn, {
            backgroundColor: stops.length > 0 ? colors.green : '#1c2a37',
          }]}
          onPress={handleStartShift}
          disabled={stops.length === 0 || starting}
          accessibilityRole="button"
          accessibilityLabel={`Start shift with ${stops.length} stops`}
        >
          {starting
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.startBtnText}>Start Shift  →</Text>}
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1 },
  header:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
                     paddingVertical: 14, borderBottomWidth: 1 },
  backBtn:         { paddingRight: 12 },
  backText:        { fontSize: 18, fontWeight: '500' },
  title:           { flex: 1, fontSize: 18, fontWeight: '700' },
  countBadge:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  countText:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  infoBanner:      { margin: 16, padding: 12, borderRadius: 10 },
  infoText:        { color: '#a5d6a7', fontSize: 14, lineHeight: 20 },
  statsBar:        { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  statPill:        { flex: 1, flexDirection: 'row', gap: 6, padding: 10, borderRadius: 10,
                     alignItems: 'center', justifyContent: 'center' },
  statText:        { fontSize: 13, fontWeight: '600' },
  stopRow:         { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16,
                     marginVertical: 4, padding: 14, borderRadius: 10, minHeight: 64 },
  seqBadge:        { width: 28, height: 28, borderRadius: 14, justifyContent: 'center',
                     alignItems: 'center', marginRight: 12 },
  seqText:         { color: '#fff', fontWeight: '800', fontSize: 13 },
  stopContent:     { flex: 1 },
  stopAddress:     { fontSize: 15, fontWeight: '600' },
  stopMeta:        { fontSize: 12, marginTop: 2 },
  swipeRemove:     { backgroundColor: '#c62828', justifyContent: 'center',
                     alignItems: 'center', width: 80, marginVertical: 4, borderRadius: 10 },
  swipeRemoveText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  snackbar:        { position: 'absolute', bottom: 100, left: 16, right: 16, height: 56,
                     backgroundColor: '#1c2a37', borderRadius: 12, flexDirection: 'row',
                     alignItems: 'center', justifyContent: 'space-between',
                     paddingHorizontal: 16 },
  snackText:       { color: '#e0eaf4', fontSize: 14 },
  snackUndo:       { color: '#4fc3f7', fontWeight: '800', fontSize: 14 },
  footer:          { paddingHorizontal: 16, paddingTop: 12 },
  departureNote:   { fontSize: 12, textAlign: 'center', marginBottom: 8 },
  startBtn:        { height: 60, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  startBtnText:    { color: '#fff', fontSize: 18, fontWeight: '800' },
});