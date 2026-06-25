/**
 * app/navigation.tsx
 * Full-screen turn-by-turn navigation.
 *
 * Route params: { stopId: string }
 * Gets stop from shift store, starts nav automatically.
 */
import { useEffect, useCallback } from 'react';
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
          <TouchableOpacity style={styles.retryBtn} onPress={() => stop && startNav(stop.lat!, stop.lng!)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openGoogleMaps}>
            <Text style={styles.gmapsLink}>Open in Google Maps ↗</Text>
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
          <Text style={styles.backBtn}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Navigate</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Instruction banner */}
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
            {w.severity === 'critical' ? '🚫 ' : '⚠️ '}{w.title}
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
          </MapView>
        )}
      </View>

      {/* Status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.etaText}>📍 ETA: {etaStr || '—'}</Text>
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
          <Text style={styles.actionText}>🔊 Repeat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionPrimary]}
          onPress={handleArrived}
          accessibilityLabel="Mark as arrived at stop"
        >
          <Text style={styles.actionPrimaryText}>✓ Arrived</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: '#0f1923' },
  loading:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText:   { color: '#8fa0b0', marginTop: 12, fontSize: 15 },
  errorWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:     { color: '#f87171', fontSize: 16, textAlign: 'center', marginBottom: 16 },
  retryBtn:      {
    backgroundColor: '#4fc3f7', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12, marginBottom: 16,
  },
  retryText:     { color: '#0f1923', fontWeight: '700', fontSize: 15 },
  gmapsLink:     { color: '#8fa0b0', fontSize: 13, textDecorationLine: 'underline' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 44, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1c2a37',
  },
  backBtn:       { color: '#4fc3f7', fontSize: 16 },
  headerTitle:   { fontSize: 17, fontWeight: '600', color: '#ffffff' },
  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1c2a37', padding: 16,
    minHeight: 80,
  },
  bannerUrgent:  { backgroundColor: '#1b5e20' },
  arrow:         { fontSize: 48, marginRight: 14 },
  bannerText:    { flex: 1 },
  instruction:   { fontSize: 20, fontWeight: '700', color: '#ffffff', lineHeight: 26 },
  bannerDist:     { fontSize: 16, color: '#8fa0b0', marginTop: 4 },
  mapWrap:       { flex: 1 },
  map:           { flex: 1 },
  statusBar: {
    height: 44, flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: '#1c2a37',
    backgroundColor: '#0f1923',
  },
  etaText:       { fontSize: 14, color: '#c8d8e8' },
  stepCount:     { fontSize: 13, color: '#607080' },
  actions: {
    flexDirection: 'row', gap: 12, padding: 16,
    borderTopWidth: 1, borderTopColor: '#1c2a37',
  },
  actionBtn: {
    flex: 1, backgroundColor: '#1c2a37', borderRadius: 12,
    height: 72, alignItems: 'center', justifyContent: 'center',
  },
  actionPrimary:  { backgroundColor: '#4fc3f7' },
  actionText:     { fontSize: 16, fontWeight: '600', color: '#c8d8e8' },
  actionPrimaryText: { fontSize: 16, fontWeight: '700', color: '#0f1923' },
  guardBanner: {
    paddingHorizontal: 16, paddingVertical: 10, gap: 2,
  },
  guardBannerCritical: { backgroundColor: '#2b1111' },
  guardBannerWarning:  { backgroundColor: '#2b1a00' },
  guardTitle: { fontSize: 15, fontWeight: '700', color: '#f87171' },
  guardMsg:   { fontSize: 13, color: '#c8d8e8' },
});