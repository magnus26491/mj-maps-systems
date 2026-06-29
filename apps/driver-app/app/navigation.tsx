/**
 * app/navigation.tsx
 * Full-screen turn-by-turn navigation.
 *
 * Route params: { stopId: string }
 * Gets stop from shift store, starts nav automatically.
 *
 * Features:
 *  · Next Stop — completes current stop, immediately navigates to next
 *  · Hamburger menu — Skip, Google Maps, View Stops, Settings, End Shift
 *  · Skip Stop — marks stop as failed/skipped, moves to next
 *  · Reroute prompt — off-route detection asks driver before rerouting
 *  · Back button — resumes correctly (same stop) from HUD
 */
import { useEffect, useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Linking, Modal,
} from 'react-native';
import MapView, { Polyline, Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '../hooks/useNavigation';
import { useShiftStore } from '../store/shift';
import { maneuverArrow, formatDistance, formatDuration } from '../lib/navigation';
import { useDrivingMode } from '../hooks/useDrivingMode';
import { useNearbyPOI } from '../hooks/useNearbyPOI';
import { FuelMarker, EVMarker, POIToggle } from '../components/POIMarkers';

export default function NavigationScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();

  const stops       = useShiftStore(s => s.stops);
  const nextStop    = useShiftStore(s => s.nextStop);
  const completeStop = useShiftStore(s => s.completeStop);
  const failStop    = useShiftStore(s => s.failStop);
  const endShift    = useShiftStore(s => s.endShift);

  const { isDriving } = useDrivingMode();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showFuel, setShowFuel] = useState(true);
  const [showEV,   setShowEV]   = useState(true);

  const {
    route, currentStep, stepIndex, distanceToNext,
    isLoading, error, userLat, userLng,
    guardWarnings,
    startNav, stopNav, speakStep,
  } = useNavigation();

  const { fuel, evCharging } = useNearbyPOI(userLat ?? null, userLng ?? null);

  const stop    = stops.find(s => s.id === stopId);
  const destLat = stop?.lat ?? 0;
  const destLng = stop?.lng ?? 0;

  // Start navigation automatically when screen mounts
  useEffect(() => {
    if (!stopId) return;
    if (!stop) {
      Alert.alert('Stop not found', 'This stop is no longer in your route.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      return;
    }
    if (stop.lat == null || stop.lng == null) {
      Alert.alert(
        'No GPS pin',
        'This stop has no GPS pin. Navigate manually or tap to search.',
        [{ text: 'OK', onPress: () => router.back() }],
      );
      return;
    }
    startNav(stop.lat, stop.lng, stop.address);
  }, [stopId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    Alert.alert(
      'Return to home screen?',
      'Your current stop is saved. Tap "Navigate" on the home screen to resume from this stop.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Go back',
          onPress: () => { stopNav(); router.back(); },
        },
      ],
    );
  }, [stopNav]);

  const handleArrived = useCallback(() => {
    stopNav();
    router.replace(`/stop-delivery?stopId=${stopId}`);
  }, [stopNav, stopId]);

  // Complete current stop and begin navigation to the next one immediately
  const handleNextStop = useCallback(() => {
    completeStop();
    // After completeStop() the store's currentStop advances — read it fresh
    const newCurrent = useShiftStore.getState().currentStop;
    stopNav();
    if (newCurrent && newCurrent.lat != null && newCurrent.lng != null) {
      router.replace({ pathname: '/navigation', params: { stopId: newCurrent.id } });
    } else {
      router.replace('/hud');
    }
  }, [completeStop, stopNav]);

  // Skip this stop (mark as failed/skipped) and navigate to next
  const handleSkip = useCallback(() => {
    setMenuOpen(false);
    Alert.alert(
      'Skip this stop?',
      'The stop will be marked as skipped and you'll move to the next one.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          style: 'destructive',
          onPress: () => {
            failStop();
            const newCurrent = useShiftStore.getState().currentStop;
            stopNav();
            if (newCurrent && newCurrent.lat != null && newCurrent.lng != null) {
              router.replace({ pathname: '/navigation', params: { stopId: newCurrent.id } });
            } else {
              router.replace('/hud');
            }
          },
        },
      ],
    );
  }, [failStop, stopNav]);

  const handleEndShift = useCallback(() => {
    setMenuOpen(false);
    Alert.alert(
      'End shift?',
      'This will close your active route.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Shift',
          style: 'destructive',
          onPress: () => { stopNav(); endShift(); router.replace('/hud'); },
        },
      ],
    );
  }, [stopNav, endShift]);

  const openGoogleMaps = useCallback(() => {
    setMenuOpen(false);
    if (stop) {
      Linking.openURL(`https://maps.google.com/?daddr=${destLat},${destLng}`);
    }
  }, [stop, destLat, destLng]);

  // ── Derived display values ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#4fc3f7" />
          <Text style={styles.loadingText}>Getting route…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => stop && startNav(stop.lat!, stop.lng!, stop.address)}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openGoogleMaps}>
            <Text style={styles.gmapsLink}>Open in Google Maps ↗</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const urgent   = distanceToNext < 50;
  const etaStr   = route
    ? `${formatDuration(route.totalDurationSec)} · ${formatDistance(route.totalDistanceM)} remaining`
    : '';
  const mapRegion = userLat && userLng
    ? { latitude: userLat, longitude: userLng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : undefined;

  const stopLabel = stop?.address
    ? (stop.address.length > 40 ? stop.address.slice(0, 38) + '…' : stop.address)
    : 'Navigate';

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} hitSlop={12} style={styles.headerSide}>
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{stopLabel}</Text>
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          hitSlop={12}
          style={styles.headerSide}
          accessibilityLabel="Open menu"
          accessibilityRole="button"
        >
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
      </View>

      {/* ── Instruction banner ──────────────────────────────────── */}
      <View style={[styles.banner, urgent && styles.bannerUrgent]}>
        <Text style={styles.arrow}>{currentStep ? maneuverArrow(currentStep.maneuver) : '↑'}</Text>
        <View style={styles.bannerText}>
          <Text style={styles.instruction} numberOfLines={2}>
            {currentStep?.instruction ?? 'Calculating route…'}
          </Text>
          <Text style={styles.bannerDist}>
            {currentStep ? `in ${formatDistance(distanceToNext)}` : ''}
          </Text>
        </View>
      </View>

      {/* ── Guard warnings ──────────────────────────────────────── */}
      {guardWarnings.filter(w => w.stepIndex === stepIndex).map((w, i) => (
        <View
          key={i}
          style={[
            styles.guardBanner,
            w.severity === 'critical' ? styles.guardBannerCritical : styles.guardBannerWarning,
          ]}
        >
          <Text style={styles.guardTitle}>
            {w.severity === 'critical' ? '🚫 ' : '⚠️ '}{w.title}
          </Text>
          <Text style={styles.guardMsg}>{w.message}</Text>
        </View>
      ))}

      {/* ── Map ─────────────────────────────────────────────────── */}
      <View style={styles.mapWrap}>
        {mapRegion && (
          <MapView
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            region={mapRegion}
            showsUserLocation
            followsUserLocation
            rotateEnabled
          >
            {route && (
              <Polyline
                coordinates={route.polyline.map(p => ({ latitude: p.lat, longitude: p.lng }))}
                strokeColor="#4fc3f7"
                strokeWidth={4}
              />
            )}
            {destLat !== 0 && (
              <Marker
                coordinate={{ latitude: destLat, longitude: destLng }}
                pinColor="green"
              />
            )}
            {showFuel && fuel.map(s => <FuelMarker key={s.id} station={s} />)}
            {showEV   && evCharging.map(c => <EVMarker key={c.id} charger={c} />)}
          </MapView>
        )}
        <View style={styles.poiToggleWrap} pointerEvents="box-none">
          <POIToggle
            showFuel={showFuel}
            showEV={showEV}
            onToggleFuel={() => setShowFuel(v => !v)}
            onToggleEV={() => setShowEV(v => !v)}
          />
        </View>
      </View>

      {/* ── Status bar ──────────────────────────────────────────── */}
      <View style={styles.statusBar}>
        <Text style={styles.etaText}>📍 {etaStr || 'Calculating…'}</Text>
        <Text style={styles.stepCount}>
          Step {stepIndex + 1} of {route?.steps.length ?? '—'}
        </Text>
      </View>

      {/* ── Action buttons ──────────────────────────────────────── */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => currentStep && speakStep(currentStep)}
          accessibilityLabel="Repeat navigation instruction"
        >
          <Text style={styles.actionText}>🔊{'\n'}Repeat</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionPrimary]}
          onPress={handleArrived}
          accessibilityLabel="Mark as arrived at stop"
        >
          <Text style={styles.actionPrimaryText}>✓{'\n'}Arrived</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, nextStop ? styles.actionNext : styles.actionNextDisabled]}
          onPress={nextStop ? handleNextStop : undefined}
          disabled={!nextStop}
          accessibilityLabel={nextStop ? 'Complete stop and navigate to next' : 'No more stops'}
        >
          <Text style={nextStop ? styles.actionNextText : styles.actionNextDisabledText}>
            ⏭{'\n'}Next
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Hamburger menu (bottom sheet modal) ─────────────────── */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.menuBackdrop}
          onPress={() => setMenuOpen(false)}
          activeOpacity={1}
        >
          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />

            <TouchableOpacity style={styles.menuItem} onPress={handleSkip}>
              <Text style={styles.menuItemText}>⏭  Skip this stop</Text>
              <Text style={styles.menuItemSub}>Move to next stop without delivering</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={styles.menuItem} onPress={openGoogleMaps}>
              <Text style={styles.menuItemText}>🗺  Open in Google Maps</Text>
              <Text style={styles.menuItemSub}>Backup navigation</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuOpen(false); router.push('/stop-list'); }}
            >
              <Text style={styles.menuItemText}>📋  View all stops</Text>
              <Text style={styles.menuItemSub}>See your full route list</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => { setMenuOpen(false); router.push('/vehicle-select'); }}
            >
              <Text style={styles.menuItemText}>⚙️  Vehicle & settings</Text>
              <Text style={styles.menuItemSub}>Change vehicle, height, preferences</Text>
            </TouchableOpacity>

            <View style={styles.menuDivider} />

            <TouchableOpacity style={[styles.menuItem, styles.menuItemDanger]} onPress={handleEndShift}>
              <Text style={styles.menuItemDangerText}>🔚  End shift</Text>
              <Text style={styles.menuItemSub}>Close your active route</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuCancel} onPress={() => setMenuOpen(false)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#0f1923' },
  loading:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText:   { color: '#8fa0b0', marginTop: 12, fontSize: 15 },
  errorWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:     { color: '#f87171', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    backgroundColor: '#4fc3f7', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12, marginBottom: 16,
  },
  retryText:     { color: '#0f1923', fontWeight: '700', fontSize: 15 },
  gmapsLink:     { color: '#8fa0b0', fontSize: 13, textDecorationLine: 'underline' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    height: 52, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: '#1c2a37',
  },
  headerSide:    { minWidth: 56, alignItems: 'flex-start' },
  backBtn:       { color: '#4fc3f7', fontSize: 16 },
  headerTitle: {
    flex: 1, fontSize: 14, fontWeight: '600', color: '#c8d8e8',
    textAlign: 'center', paddingHorizontal: 4,
  },
  menuIcon:      { color: '#4fc3f7', fontSize: 22, textAlign: 'right' },

  // Instruction banner
  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1c2a37', padding: 16, minHeight: 80,
  },
  bannerUrgent:  { backgroundColor: '#1b5e20' },
  arrow:         { fontSize: 48, marginRight: 14 },
  bannerText:    { flex: 1 },
  instruction:   { fontSize: 20, fontWeight: '700', color: '#ffffff', lineHeight: 26 },
  bannerDist:    { fontSize: 16, color: '#8fa0b0', marginTop: 4 },

  // Guard warnings
  guardBanner:         { paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
  guardBannerCritical: { backgroundColor: '#2b1111' },
  guardBannerWarning:  { backgroundColor: '#2b1a00' },
  guardTitle:          { fontSize: 15, fontWeight: '700', color: '#f87171' },
  guardMsg:            { fontSize: 13, color: '#c8d8e8' },

  // Map
  mapWrap:       { flex: 1 },
  map:           { flex: 1 },
  poiToggleWrap: { position: 'absolute', bottom: 12, left: 12, flexDirection: 'row' },

  // Status bar
  statusBar: {
    height: 44, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: '#1c2a37', backgroundColor: '#0f1923',
  },
  etaText:       { fontSize: 13, color: '#c8d8e8' },
  stepCount:     { fontSize: 13, color: '#607080' },

  // Action buttons
  actions: {
    flexDirection: 'row', gap: 10, padding: 12,
    borderTopWidth: 1, borderTopColor: '#1c2a37',
  },
  actionBtn: {
    flex: 1, backgroundColor: '#1c2a37', borderRadius: 12,
    height: 72, alignItems: 'center', justifyContent: 'center',
  },
  actionPrimary:      { backgroundColor: '#4fc3f7' },
  actionNext:         { backgroundColor: '#1a3a2a' },
  actionNextDisabled: { backgroundColor: '#131e27', opacity: 0.4 },
  actionText:         { fontSize: 13, fontWeight: '600', color: '#c8d8e8', textAlign: 'center' },
  actionPrimaryText:  { fontSize: 13, fontWeight: '700', color: '#0f1923', textAlign: 'center' },
  actionNextText:     { fontSize: 13, fontWeight: '700', color: '#4ade80', textAlign: 'center' },
  actionNextDisabledText: { fontSize: 13, fontWeight: '600', color: '#607080', textAlign: 'center' },

  // Hamburger menu
  menuBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#131e27', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32, paddingTop: 8,
  },
  menuHandle: {
    width: 36, height: 4, backgroundColor: '#3a4a5a',
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  menuItem: {
    paddingVertical: 14, paddingHorizontal: 24,
  },
  menuItemText:    { fontSize: 17, fontWeight: '600', color: '#e0eaf4' },
  menuItemSub:     { fontSize: 13, color: '#607080', marginTop: 2 },
  menuItemDanger:  {},
  menuItemDangerText: { fontSize: 17, fontWeight: '600', color: '#f87171' },
  menuDivider: {
    height: 1, backgroundColor: '#1c2a37', marginVertical: 4, marginHorizontal: 24,
  },
  menuCancel: {
    marginTop: 8, marginHorizontal: 16, height: 52, backgroundColor: '#1c2a37',
    borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  menuCancelText: { fontSize: 16, fontWeight: '700', color: '#8fa0b0' },
});
