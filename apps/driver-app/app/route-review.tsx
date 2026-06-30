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
import { useAuthStore } from '../lib/auth';
import { useTheme } from '../components/ThemeContext';
import { useOfflineMap } from '../hooks/useOfflineMap';

const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

export default function RouteReviewScreen() {
  const { departureEpochMs } = useLocalSearchParams<{ departureEpochMs: string }>();
  const depMs = parseInt(departureEpochMs ?? '0', 10) || Date.now();
  const departureDate = new Date(depMs);

  const rawStaged = useShiftStore(s => s.stagedStops);
  const [stops,    setStops]   = useState<any[]>(rawStaged ?? []);
  // Track which stop IDs were staged (pre-optimised by shift-start) so we
  // can skip a redundant re-optimize if the driver doesn't remove any stops.
  const [originalStopIds] = useState<Set<string>>(() => new Set((rawStaged ?? []).map((s: any) => s.id)));
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

  const [apiEtaSec,   setApiEtaSec]   = useState<number | null>(null);
  const [optimising,  setOptimising]  = useState(false);

  // Pre-fetch ETA from the already-optimised staged stops so the stats bar
  // shows a real number immediately (shift-start already called optimise; we
  // just read totalDurationSec from the staged payload if it was stored).
  useEffect(() => {
    const first = rawStaged?.[0] as any;
    if (first?._totalDurationSec) setApiEtaSec(first._totalDurationSec);
  }, []);

  const handleReoptimise = useCallback(async () => {
    if (!stops.length || optimising) return;
    setOptimising(true);
    const vehicleId = useShiftStore.getState().vehicle?.id ?? useShiftStore.getState().vehicleId ?? 'lwb_van';
    const token     = useAuthStore.getState().token ?? '';
    let depotLat = 0, depotLng = 0;
    try {
      const { getLatestLocation } = await import('../lib/shared-location');
      const loc = getLatestLocation();
      if (loc) { depotLat = loc.latitude; depotLng = loc.longitude; }
    } catch { /* non-fatal */ }
    try {
      const res = await fetch(`${API}/api/v1/routes/optimise`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          stops: stops.map((s: any) => {
            const hasCoords = s.lat && s.lng && !(s.lat === 0 && s.lng === 0);
            return { id: s.id, address: s.address, ...(hasCoords ? { lat: s.lat, lng: s.lng } : {}), parcelCount: s.parcelCount ?? 1, serviceMinutes: 3, notes: s.notes };
          }),
          config: { vehicleId, depotLat, depotLng, returnToDepot: false, shiftStartEpoch: Math.floor(departureDate.getTime() / 1000) },
        }),
      });
      if (res.ok) {
        const json = await res.json();
        const payload = json?.data ?? json;
        if (payload?.orderedStops?.length) setStops(payload.orderedStops);
        if (payload?.totalDurationSec)     setApiEtaSec(payload.totalDurationSec);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch { /* non-fatal — keeps existing order */ }
    setOptimising(false);
  }, [stops, departureDate, optimising]);

  const handleStartShift = useCallback(async () => {
    if (!stops.length) return;
    setStarting(true);
    const vehicle   = useShiftStore.getState().vehicle;
    const vehicleId = vehicle?.id ?? useShiftStore.getState().vehicleId ?? 'lwb_van';
    const token     = useAuthStore.getState().token ?? '';

    // If the driver didn't remove any stops, shift-start already optimised the
    // order — skip the redundant second API call and start immediately.
    const stopsUnchanged = stops.length === originalStopIds.size
      && stops.every((s: any) => originalStopIds.has(s.id));
    if (stopsUnchanged) {
      const routeId = `offline-${Date.now()}`;
      useShiftStore.getState().startShift(stops as any, vehicleId, routeId);
      useShiftStore.getState().clearStagedStops();
      setStarting(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/hud');
      return;
    }

    // Best-effort GPS depot — falls back to 0,0 only when no fix
    let depotLat = 0, depotLng = 0;
    try {
      const { getLatestLocation } = await import('../lib/shared-location');
      const loc = getLatestLocation();
      if (loc) { depotLat = loc.latitude; depotLng = loc.longitude; }
    } catch { /* non-fatal */ }

    try {
      const res = await fetch(`${API}/api/v1/routes/optimise`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          stops: stops.map((s: any) => {
            const hasCoords = s.lat && s.lng && !(s.lat === 0 && s.lng === 0);
            return {
              id: s.id, address: s.address,
              ...(hasCoords ? { lat: s.lat, lng: s.lng } : {}),
              parcelCount: s.parcelCount ?? 1,
              serviceMinutes: 3,
              notes: s.notes,
            };
          }),
          config: {
            vehicleId,
            depotLat,
            depotLng,
            returnToDepot: false,
            shiftStartEpoch: Math.floor(departureDate.getTime() / 1000),
            shiftEndEpoch:   Math.floor(departureDate.getTime() / 1000) + 10 * 3600,
          },
        }),
      });
      const json = res.ok ? await res.json() : null;
      const payload  = json?.data ?? json;
      const routeId  = payload?.routeId ?? `offline-${Date.now()}`;
      const ordered  = payload?.orderedStops ?? stops;
      if (payload?.totalDurationSec) setApiEtaSec(payload.totalDurationSec);
      useShiftStore.getState().startShift(ordered, vehicleId, routeId);
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
  // Use API duration when available; fall back to 3 min/stop estimate
  const etaMins    = apiEtaSec != null ? Math.round(apiEtaSec / 60) : stops.length * 3;
  const etaHrs     = Math.floor(etaMins / 60);
  const etaMinsRem = etaMins % 60;
  const etaDisplay = etaHrs > 0 ? `~${etaHrs}h ${etaMinsRem}m` : `~${etaMins}m`;

  const { status: offlineStatus, progress: offlineProgress, download: downloadOffline } = useOfflineMap();
  const handleDownloadOffline = useCallback(() => {
    const packName = `route-${Date.now()}`;
    downloadOffline(stops, packName);
  }, [stops, downloadOffline]);

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

      {/* OFFLINE MAP BANNER — shown until download completes */}
      {offlineStatus !== 'complete' && (
        <View style={[styles.offlineBanner, {
          backgroundColor: offlineStatus === 'error' ? '#3a1a1a' : '#1a2a3a',
        }]}>
          {offlineStatus === 'downloading' ? (
            <>
              <ActivityIndicator color="#4a9eff" size="small" style={{ marginRight: 8 }} />
              <Text style={styles.offlineText}>
                Downloading offline maps… {offlineProgress}%
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.offlineText}>
                {offlineStatus === 'error'
                  ? '⚠️  Map download failed — navigation needs data signal'
                  : '📥  No signal area? Download maps to use offline'}
              </Text>
              {offlineStatus !== 'error' && (
                <TouchableOpacity
                  style={styles.offlineBtn}
                  onPress={handleDownloadOffline}
                  disabled={stops.length === 0}
                >
                  <Text style={styles.offlineBtnText}>Download</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}

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
        <View style={styles.footerRow}>
          <TouchableOpacity
            style={[styles.reoptBtn, { borderColor: colors.green }]}
            onPress={handleReoptimise}
            disabled={stops.length === 0 || optimising || starting}
            accessibilityRole="button"
            accessibilityLabel="Re-optimise stop order"
          >
            {optimising
              ? <ActivityIndicator color={colors.green} size="small" />
              : (
                <>
                  <Text style={[styles.reoptBtnText, { color: colors.green }]}>Re-optimize</Text>
                  <Text style={[styles.reoptBtnSub, { color: colors.subtext }]}>Finds the fastest order</Text>
                </>
              )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.startBtn, {
              backgroundColor: stops.length > 0 ? colors.green : '#1c2a37',
            }]}
            onPress={handleStartShift}
            disabled={stops.length === 0 || starting || optimising}
            accessibilityRole="button"
            accessibilityLabel={`Start shift with ${stops.length} stops`}
          >
            {starting
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.startBtnText}>Start Shift  →</Text>}
          </TouchableOpacity>
        </View>
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
  footerRow:       { flexDirection: 'row', gap: 10 },
  reoptBtn:        { height: 60, borderRadius: 14, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, paddingHorizontal: 20 },
  reoptBtnText:    { fontSize: 15, fontWeight: '700' },
  reoptBtnSub:     { fontSize: 10, marginTop: 1 },
  startBtn:        { flex: 1, height: 60, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  startBtnText:    { color: '#fff', fontSize: 18, fontWeight: '800' },
  offlineBanner:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
                     paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#0d1c2a' },
  offlineText:     { flex: 1, fontSize: 12, color: '#a0c4e8', lineHeight: 16 },
  offlineBtn:      { marginLeft: 10, backgroundColor: '#1c4a7a', borderRadius: 8,
                     paddingHorizontal: 12, paddingVertical: 6 },
  offlineBtnText:  { color: '#7ec8ff', fontSize: 12, fontWeight: '700' },
});