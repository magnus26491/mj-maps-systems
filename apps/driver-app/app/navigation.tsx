/**
 * app/navigation.tsx
 * Full-screen turn-by-turn navigation.
 *
 * Route params: { stopId: string }
 * Gets stop from shift store, starts nav automatically.
 */
import { useEffect, useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Linking,
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
  const { stops }  = useShiftStore();
  const { isDriving } = useDrivingMode();

  const {
    route, currentStep, stepIndex, distanceToNext,
    isLoading, error, userLat, userLng,
    guardWarnings,
    startNav, stopNav, speakStep,
  } = useNavigation();

  const [showFuel, setShowFuel] = useState(true);
  const [showEV,   setShowEV]   = useState(true);
  const { fuel, evCharging } = useNearbyPOI(userLat ?? null, userLng ?? null);

  // Resolve stop from shift store and start navigation
  useEffect(() => {
    if (!stopId) return;
    const stop = stops.find(s => s.id === stopId);
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
    startNav(stop.lat, stop.lng);
  }, [stopId, stops, startNav]);

  const stop = stops.find(s => s.id === stopId);
  const destLat = stop?.lat ?? 0;
  const destLng = stop?.lng ?? 0;

  const handleBack = () => {
    Alert.alert('Stop navigation?', 'Your progress will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop',
        style: 'destructive',
        onPress: () => { stopNav(); router.back(); },
      },
    ]);
  };

  const handleArrived = () => {
    stopNav();
    router.replace(`/stop-delivery?stopId=${stopId}`);
  };

  const openGoogleMaps = () => {
    if (stop) {
      Linking.openURL(
        `https://maps.google.com/?daddr=${destLat},${destLng}`,
      );
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#00C2A8" />
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
          <TouchableOpacity style={styles.retryBtn} onPress={() => stop && startNav(stop.lat!, stop.lng!)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openGoogleMaps}>
            <Text style={styles.gmapsLink}>Open in Google Maps</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const urgent = distanceToNext < 50;
  const etaStr = route
    ? `${formatDuration(route.totalDurationSec)} · ${formatDistance(route.totalDistanceM)} remaining`
    : '';

  const mapRegion = userLat && userLng
    ? { latitude: userLat, longitude: userLng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : undefined;

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} hitSlop={12}>
          <Text style={styles.backBtn}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Navigate</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Instruction banner */}
      <View style={[styles.banner, urgent && styles.bannerUrgent]}>
        <Text style={styles.arrow}>{currentStep ? maneuverArrow(currentStep.maneuver) : '→'}</Text>
        <View style={styles.bannerText}>
          <Text style={styles.instruction} numberOfLines={2}>
            {currentStep?.instruction ?? 'Calculating route…'}
          </Text>
          <Text style={styles.bannerDist}>
            {currentStep ? `in ${formatDistance(distanceToNext)}` : ''}
          </Text>
        </View>
      </View>

      {/* Guard warnings — shown when the route has vehicle restrictions */}
      {guardWarnings.filter(w => w.stepIndex === stepIndex).map((w, i) => (
        <View
          key={i}
          style={[
            styles.guardBanner,
            w.severity === 'critical' ? styles.guardBannerCritical : styles.guardBannerWarning,
          ]}
        >
          <Text style={styles.guardTitle}>
            {w.title}
          </Text>
          <Text style={styles.guardMsg}>{w.message}</Text>
        </View>
      ))}

      {/* Map */}
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
            {/* Route polyline — teal brand colour */}
            {route && (
              <Polyline
                coordinates={route.polyline.map(p => ({ latitude: p.lat, longitude: p.lng }))}
                strokeColor="#00C2A8"
                strokeWidth={4}
              />
            )}

            {/* Destination */}
            {destLat !== 0 && (
              <Marker
                coordinate={{ latitude: destLat, longitude: destLng }}
                pinColor="#10B981"
              />
            )}

            {/* Fuel stations */}
            {showFuel && fuel.map(s => (
              <FuelMarker key={s.id} station={s} />
            ))}

            {/* EV charging points */}
            {showEV && evCharging.map(c => (
              <EVMarker key={c.id} charger={c} />
            ))}
          </MapView>
        )}

        {/* POI layer toggles — bottom-left corner of map */}
        <View style={styles.poiToggleWrap} pointerEvents="box-none">
          <POIToggle
            showFuel={showFuel}
            showEV={showEV}
            onToggleFuel={() => setShowFuel(v => !v)}
            onToggleEV={() => setShowEV(v => !v)}
          />
        </View>
      </View>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.etaText}>ETA: {etaStr || '—'}</Text>
        <Text style={styles.stepCount}>
          Step {stepIndex + 1} of {route?.steps.length ?? '—'}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => currentStep && speakStep(currentStep)}
          accessibilityLabel="Repeat navigation instruction"
        >
          <Text style={styles.actionText}>Repeat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionPrimary]}
          onPress={handleArrived}
          accessibilityLabel="Mark as arrived at stop"
        >
          <Text style={styles.actionPrimaryText}>Arrived</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#0A0C10' },
  loading:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText:   { color: '#94A3B8', marginTop: 12, fontSize: 15 },
  errorWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:     { color: '#EF4444', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  retryBtn:      {
    backgroundColor: '#00C2A8', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12, marginBottom: 16,
  },
  retryText:     { color: '#0A0C10', fontWeight: '700', fontSize: 15 },
  gmapsLink:     { color: '#00C2A8', fontSize: 13, textDecorationLine: 'underline', fontWeight: '500' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 44, paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backBtn:       { color: '#00C2A8', fontSize: 16, fontWeight: '500' },
  headerTitle:   { fontSize: 17, fontWeight: '600', color: '#F1F5F9' },
  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#12151B', padding: 16,
    minHeight: 80,
  },
  bannerUrgent:  { backgroundColor: 'rgba(239, 68, 68, 0.15)' },
  arrow:         { fontSize: 48, marginRight: 14, color: '#00C2A8' },
  bannerText:    { flex: 1 },
  instruction:   { fontSize: 20, fontWeight: '700', color: '#F1F5F9', lineHeight: 26 },
  bannerDist:     { fontSize: 16, color: '#94A3B8', marginTop: 4 },
  mapWrap:       { flex: 1 },
  map:           { flex: 1 },
  poiToggleWrap: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
  },
  statusBar: {
    height: 44, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    backgroundColor: '#0A0C10',
  },
  etaText:       { fontSize: 14, color: '#94A3B8' },
  stepCount:     { fontSize: 13, color: '#64748B' },
  actions: {
    flexDirection: 'row', gap: 12, padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  actionBtn: {
    flex: 1, backgroundColor: '#12151B', borderRadius: 12,
    height: 72, alignItems: 'center', justifyContent: 'center',
  },
  actionPrimary:  { backgroundColor: '#00C2A8' },
  actionText:     { fontSize: 16, fontWeight: '600', color: '#94A3B8' },
  actionPrimaryText: { fontSize: 16, fontWeight: '700', color: '#0A0C10' },
  guardBanner: {
    paddingHorizontal: 16, paddingVertical: 10, gap: 2,
  },
  guardBannerCritical: { backgroundColor: 'rgba(239, 68, 68, 0.12)' },
  guardBannerWarning:  { backgroundColor: 'rgba(245, 158, 11, 0.10)' },
  guardTitle: { fontSize: 15, fontWeight: '700', color: '#EF4444' },
  guardMsg:   { fontSize: 13, color: '#94A3B8' },
});