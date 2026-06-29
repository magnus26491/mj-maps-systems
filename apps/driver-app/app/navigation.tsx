/**
 * app/navigation.tsx
 * Full-screen turn-by-turn navigation using MapLibre React Native.
 *
 * Key design decisions:
 * - Uses MapLibre v10 (v10.4.2) declarative layer paint props — colours are
 *   read from useTheme() so toggling the app theme recolours the map in-place
 *   without any style reload or tile re-fetch.
 * - OpenFreeMap vector tiles (free, no API key) as the base map source.
 * - Route polyline overlaid via ShapeSource + GeoJSON so it never interferes
 *   with the tile source.
 * - 3D buildings via FillExtrusionLayer from the OSM building layer in the style.
 * - Heading-up driving camera with pitch ~55°.
 * - Routing/voice/reroute logic unchanged (hooks/useNavigation.ts).
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Linking, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  MapView,
  Camera,
  UserLocation,
  ShapeSource,
  LineLayer,
  FillExtrusionLayer,
  MarkerView,
  UserTrackingMode,
} from '@maplibre/maplibre-react-native';
import { useNavigation } from '../hooks/useNavigation';
import { useShiftStore } from '../store/shift';
import { maneuverArrow, formatDistance, formatDuration } from '../lib/navigation';
import { useDrivingMode } from '../hooks/useDrivingMode';
import { useNearbyPOI } from '../hooks/useNearbyPOI';
import { FuelMarker, EVMarker, POIToggle } from '../components/POIMarkers';
import { useTheme } from '../lib/theme';

// ── Constants ─────────────────────────────────────────────────────────────────

/** OpenFreeMap — free vector tiles, no API key, OSM data */
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export default function NavigationScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const { stops }  = useShiftStore();
  const { isDriving } = useDrivingMode();
  const { colors } = useTheme();

  const {
    route, currentStep, stepIndex, distanceToNext,
    isNearDestination,
    isLoading, error, userLat, userLng, bearing,
    guardWarnings,
    startNav, stopNav, speakStep,
  } = useNavigation();

  const [showFuel, setShowFuel] = useState(true);
  const [showEV,   setShowEV]   = useState(true);
  const { fuel, evCharging } = useNearbyPOI(userLat ?? null, userLng ?? null);

  // Map camera ref for programmatic control
  const cameraRef = useRef<any>(null);

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

  // FIX 3: Arrival auto-detection — fires once when isNearDestination becomes true
  const arrivalAlertShownRef = useRef(false);
  useEffect(() => {
    if (!isNearDestination || arrivalAlertShownRef.current) return;
    arrivalAlertShownRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const addressLabel = stop?.address ?? 'your destination';
    Alert.alert(
      "You've arrived!",
      `You've arrived at ${addressLabel}. Mark delivery as complete?`,
      [
        {
          text: 'Mark Complete',
          onPress: () => {
            stopNav();
            router.replace(`/stop-delivery?stopId=${stopId}`);
          },
        },
        {
          text: 'Dismiss',
          style: 'cancel',
        },
      ],
    );
  }, [isNearDestination, stop, stopId, stopNav]);

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

  // Build GeoJSON route geometry for ShapeSource
  const routeGeoJson = route
    ? {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: route.polyline.map(p => [p.lng, p.lat]),
        },
        properties: {},
      }
    : null;

  // Build map colours from theme — these are reactive and update instantly on theme toggle
  const map = colors.map;

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.app.background }]}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.app.primary} />
          <Text style={[styles.loadingText, { color: colors.app.textFaint }]}>Getting route…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.app.background }]}>
        <View style={styles.errorWrap}>
          <Text style={[styles.errorText, { color: colors.app.danger }]}>{error}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: colors.app.primary }]}
            onPress={() => stop && startNav(stop.lat!, stop.lng!)}
          >
            <Text style={[styles.retryText, { color: colors.app.white }]}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={openGoogleMaps}>
            <Text style={[styles.gmapsLink, { color: colors.app.primary }]}>Open in Google Maps</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const urgent = distanceToNext < 50;
  const etaStr = route
    ? `${formatDuration(route.totalDurationSec)} · ${formatDistance(route.totalDistanceM)} remaining`
    : '';

  const hasUserLocation = userLat !== null && userLng !== null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.app.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.app.border }]}>
        <TouchableOpacity onPress={handleBack} hitSlop={12}>
          <Text style={[styles.backBtn, { color: colors.app.primary }]}>Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.app.text }]}>Navigate</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Instruction banner */}
      <View
        style={[
          styles.banner,
          { backgroundColor: colors.app.surface },
          urgent && { backgroundColor: colors.app.dangerBg },
        ]}
      >
        <Text style={[styles.arrow, { color: colors.app.primary }]}>
          {currentStep ? maneuverArrow(currentStep.maneuver) : '→'}
        </Text>
        <View style={styles.bannerText}>
          <Text
            style={[styles.instruction, { color: colors.app.text }]}
            numberOfLines={2}
          >
            {currentStep?.instruction ?? 'Calculating route…'}
          </Text>
          <Text style={[styles.bannerDist, { color: colors.app.textFaint }]}>
            {currentStep ? `in ${formatDistance(distanceToNext)}` : ''}
          </Text>
        </View>
      </View>

      {/* Guard warnings */}
      {guardWarnings.filter(w => w.stepIndex === stepIndex).map((w, i) => (
        <View
          key={i}
          style={[
            styles.guardBanner,
            w.severity === 'critical'
              ? { backgroundColor: colors.app.dangerBg }
              : { backgroundColor: colors.app.warningBg },
          ]}
        >
          <Text style={[styles.guardTitle, { color: colors.app.danger }]}>{w.title}</Text>
          <Text style={[styles.guardMsg, { color: colors.app.textFaint }]}>{w.message}</Text>
        </View>
      ))}

      {/* ── MapLibre Map ─────────────────────────────────────────────────── */}
      <View style={styles.mapWrap}>
        {/* Use a fixed fallback centre if no GPS yet */}
        <MapView
          style={styles.map}
          mapStyle={MAP_STYLE_URL}
          logoEnabled={true}
          compassEnabled={true}
          attributionEnabled={true}
        >
          {/* Driving camera — pitch 55°, heading-up, zoom 17 */}
          <Camera
            defaultSettings={{
              centerCoordinate: hasUserLocation
                ? [userLng, userLat]
                : (destLng && destLat ? [destLng, destLat] : [-0.1276, 51.5074]),
              zoomLevel: 17,
              pitch: 55,
              heading: bearing,
            }}
            followUserLocation={hasUserLocation}
            followUserMode={UserTrackingMode.FollowWithHeading}
            followZoomLevel={17}
            followPitch={55}
          />

          {/* User location dot */}
          <UserLocation
            visible={hasUserLocation}
            animated={true}
            showsUserHeadingIndicator={true}
          />

          {/* Route polyline — two layers: glow halo + crisp teal line */}
          {routeGeoJson && (
            <>
              {/* Glow halo — wider, blurred teal */}
              <ShapeSource id="route-source" shape={routeGeoJson}>
                <LineLayer
                  id="route-glow"
                  style={{
                    lineColor: map.routeGlow,
                    lineWidth: 14,
                    lineBlur: 6,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                {/* Casing — dark border around route */}
                <LineLayer
                  id="route-casing"
                  style={{
                    lineColor: map.routeCasing,
                    lineWidth: 7,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
                {/* Main route — bright teal */}
                <LineLayer
                  id="route-line"
                  style={{
                    lineColor: map.route,
                    lineWidth: 5,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </ShapeSource>
            </>
          )}

          {/* 3D Buildings — FillExtrusionLayer from OSM building source */}
          {/* Rendered only at zoom 14+ so they don't overwhelm at low zoom */}
          <FillExtrusionLayer
            id="buildings-3d"
            sourceID="openfreemap"
            minZoomLevel={14}
            style={{
              fillExtrusionColor: [
                'interpolate',
                ['linear'],
                ['get', 'height'],
                0,     map.buildingBase,
                50,    map.buildingTop,
                150,   map.buildingTop,
              ],
              fillExtrusionHeight: ['get', 'render_height'],
              fillExtrusionBase:   ['get', 'render_min_height'],
              fillExtrusionOpacity: 0.88,
            }}
          />

          {/* Destination marker — custom teardrop pin via MarkerView */}
          {destLat !== 0 && destLng !== 0 && (
            <MarkerView
              coordinate={[destLng, destLat]}
              anchor={{ x: 0.5, y: 1 }}
            >
              <View style={[styles.destMarker, { backgroundColor: colors.app.success }]}>
                <Text style={styles.destPinText}>📍</Text>
              </View>
            </MarkerView>
          )}
        </MapView>

        {/* POI layer toggles */}
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
      <View style={[styles.statusBar, { borderTopColor: colors.app.border, backgroundColor: colors.app.background }]}>
        <Text style={[styles.etaText, { color: colors.app.textFaint }]}>ETA: {etaStr || '—'}</Text>
        <Text style={[styles.stepCount, { color: colors.app.textFaint }]}>
          Step {stepIndex + 1} of {route?.steps.length ?? '—'}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={[styles.actions, { borderTopColor: colors.app.border }]}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.app.surface }]}
          onPress={() => currentStep && speakStep(currentStep)}
          accessibilityLabel="Repeat navigation instruction"
        >
          <Text style={[styles.actionText, { color: colors.app.textFaint }]}>Repeat</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionPrimary, { backgroundColor: colors.app.primary }]}
          onPress={handleArrived}
          accessibilityLabel="Mark as arrived at stop"
        >
          <Text style={[styles.actionPrimaryText, { color: colors.app.white }]}>Arrived</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  loading:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText:   { marginTop: 12, fontSize: 15 },
  errorWrap:     { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText:     { fontSize: 16, textAlign: 'center', marginBottom: 16 },
  retryBtn:      { borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginBottom: 16 },
  retryText:     { fontWeight: '700', fontSize: 15 },
  gmapsLink:     { fontSize: 13, textDecorationLine: 'underline', fontWeight: '500' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 44, paddingHorizontal: 16, borderBottomWidth: 1,
  },
  backBtn:       { fontSize: 16, fontWeight: '500' },
  headerTitle:   { fontSize: 17, fontWeight: '600' },
  banner: {
    flexDirection: 'row', alignItems: 'center', padding: 16, minHeight: 80,
  },
  arrow:         { fontSize: 48, marginRight: 14 },
  bannerText:    { flex: 1 },
  instruction:   { fontSize: 20, fontWeight: '700', lineHeight: 26 },
  bannerDist:    { fontSize: 16, marginTop: 4 },
  mapWrap:       { flex: 1 },
  map:           { flex: 1 },
  poiToggleWrap: { position: 'absolute', bottom: 12, left: 12, flexDirection: 'row' },
  statusBar:     { height: 44, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, borderTopWidth: 1 },
  etaText:       { fontSize: 14 },
  stepCount:     { fontSize: 13 },
  actions:       { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
  actionBtn:     { flex: 1, borderRadius: 12, height: 72, alignItems: 'center', justifyContent: 'center' },
  actionPrimary: {},
  actionText:    { fontSize: 16, fontWeight: '600' },
  actionPrimaryText: { fontSize: 16, fontWeight: '700' },
  guardBanner:   { paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
  guardTitle:    { fontSize: 15, fontWeight: '700' },
  guardMsg:      { fontSize: 13 },
  // Destination pin
  destMarker:    { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  destPinText:   { fontSize: 20 },
});