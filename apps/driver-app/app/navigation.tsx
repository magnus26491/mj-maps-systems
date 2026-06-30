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
import * as Speech from 'expo-speech';
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
import { useAuthStore } from '../lib/auth';
import { maneuverArrow, formatDistance, formatDuration, fetchNavRoute } from '../lib/navigation';
import { useDrivingMode } from '../hooks/useDrivingMode';
import { useNearbyPOI } from '../hooks/useNearbyPOI';
import { FuelMarker, EVMarker, POIToggle } from '../components/POIMarkers';
import { useTheme } from '../lib/theme';

// ── Constants ─────────────────────────────────────────────────────────────────

/** OpenFreeMap — free vector tiles, no API key, OSM data */
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

interface TurnaroundPoint {
  tooNarrow:     boolean;
  turnaroundLat: number | null;
  turnaroundLng: number | null;
  distanceM:     number | null;
  reason:        string;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (x: number) => x * Math.PI / 180;
  const dLat  = toRad(lat2 - lat1);
  const dLng  = toRad(lng2 - lng1);
  const a     = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Compass bearing (degrees, 0 = north) from point A to point B
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (x: number) => x * Math.PI / 180;
  const toDeg = (x: number) => x * 180 / Math.PI;
  const dLng  = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
          - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Shortest angular difference between two headings (0–180)
function angleDiff(a: number, b: number): number {
  return Math.abs(((a - b) + 540) % 360 - 180);
}

// ── Web fallback — text-based navigation (no MapLibre) ───────────────────────

function WebNavigationScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const { stops }  = useShiftStore();
  const stop = stops.find(s => s.id === stopId);

  const lat = stop?.pin?.lat ?? stop?.lat ?? 0;
  const lng = stop?.pin?.lng ?? stop?.lng ?? 0;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

  return (
    <View style={{ flex: 1, backgroundColor: '#030712', padding: 24, paddingTop: 60 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: 24 }}>
        <Text style={{ color: '#60a5fa', fontSize: 16 }}>← Back</Text>
      </TouchableOpacity>
      <Text style={{ color: '#9ca3af', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 }}>
        Navigating to
      </Text>
      <Text style={{ color: '#f9fafb', fontSize: 20, fontWeight: '700', marginBottom: 24, lineHeight: 28 }}>
        {stop?.address ?? 'Unknown address'}
      </Text>
      {stop?.notes ? (
        <View style={{ backgroundColor: '#1f2937', borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: '600', marginBottom: 4 }}>ACCESS NOTES</Text>
          <Text style={{ color: '#d1d5db', fontSize: 14, lineHeight: 20 }}>{stop.notes}</Text>
        </View>
      ) : null}
      <TouchableOpacity
        style={{ backgroundColor: '#3b82f6', borderRadius: 14, paddingVertical: 18, alignItems: 'center', marginBottom: 12 }}
        onPress={() => Linking.openURL(mapsUrl)}
      >
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>🗺️ Open in Google Maps</Text>
      </TouchableOpacity>
      <Text style={{ color: '#4b5563', fontSize: 12, textAlign: 'center' }}>
        Turn-by-turn navigation requires the mobile app
      </Text>
    </View>
  );
}

export default function NavigationScreen() {
  if (Platform.OS === 'web') return <WebNavigationScreen />;

  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const { stops }  = useShiftStore();
  const nextStop   = useShiftStore(s => s.nextStop);
  const vehicleId  = useShiftStore(s => s.vehicleId);
  const { isDriving, speedKmh } = useDrivingMode();
  const { colors } = useTheme();
  const token = useAuthStore(s => s.token);

  const {
    route, currentStep, stepIndex, distanceToNext,
    isLoading, error, userLat, userLng, bearing,
    guardWarnings, isNearDestination, rerouteToast,
    startNav, stopNav, speakStep,
  } = useNavigation();

  const [showFuel, setShowFuel] = useState(true);
  const [showEV,   setShowEV]   = useState(true);
  const { fuel, evCharging } = useNearbyPOI(userLat ?? null, userLng ?? null);

  // Turnaround recalculation — find safer turning point when road is too narrow
  const [turnaroundPoint, setTurnaroundPoint] = useState<TurnaroundPoint | null>(null);
  const turnaroundFetchedFor = useRef<string | null>(null);

  // Map camera ref for programmatic control
  const cameraRef = useRef<any>(null);

  // Ghost route — preview of next-stop leg shown behind the live route
  const [nextRouteGeoJson, setNextRouteGeoJson] = useState<any>(null);
  const nextRouteFetchedRef = useRef<string | null>(null);

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
    if (stop.lat == null || stop.lng == null || (stop.lat === 0 && stop.lng === 0)) {
      Alert.alert(
        'No GPS pin',
        'This stop has no GPS coordinates. Open in Google Maps to navigate manually.',
        [
          { text: 'Open Google Maps', onPress: () => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(stop.address ?? '')}`) },
          { text: 'OK', onPress: () => router.back() },
        ],
      );
      return;
    }
    startNav(stop.lat, stop.lng);
    // Announce destination so driver doesn't need to look at screen
    if (Platform.OS !== 'web') {
      Speech.speak(`Navigating to ${stop.address}`, { rate: 0.92 });
    }
  }, [stopId, stops, startNav]);

  const stop = stops.find(s => s.id === stopId);
  const destLat = stop?.lat ?? 0;
  const destLng = stop?.lng ?? 0;

  const distToDestM = (userLat !== null && userLng !== null && destLat !== 0 && destLng !== 0)
    ? haversineM(userLat, userLng, destLat, destLng)
    : Infinity;
  const isApproaching = !isNearDestination && distToDestM < 250;

  // Turnaround detection — compare direction to next stop vs current heading
  const bearingToNext = (
    nextStop?.lat != null && nextStop?.lng != null
    && nextStop.lat !== 0 && nextStop.lng !== 0
    && destLat !== 0 && destLng !== 0
  ) ? bearingDeg(destLat, destLng, nextStop.lat, nextStop.lng) : null;

  const needsTurnaround = (
    bearingToNext !== null
    && distToDestM < 500
    && angleDiff(bearing, bearingToNext) > 140
  );

  // Fetch a safe turning point from the backend when turnaround is needed
  useEffect(() => {
    if (!needsTurnaround || !stopId || destLat === 0 || destLng === 0 || !token) return;
    const cacheKey = `${stopId}:${destLat.toFixed(5)},${destLng.toFixed(5)}`;
    if (turnaroundFetchedFor.current === cacheKey) return;
    turnaroundFetchedFor.current = cacheKey;
    setTurnaroundPoint(null);

    fetch(
      `${API}/api/v1/routes/turnaround-point?lat=${destLat}&lng=${destLng}&vehicleId=${vehicleId ?? 'lwb_van'}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
      .then(r => r.json())
      .then((data: TurnaroundPoint) => setTurnaroundPoint(data))
      .catch(() => {});
  }, [needsTurnaround, stopId, destLat, destLng, vehicleId, token]);

  // Reset turnaround state when navigating to a different stop
  useEffect(() => {
    setTurnaroundPoint(null);
    turnaroundFetchedFor.current = null;
  }, [stopId]);

  // Determine where to show the U-turn marker:
  // - If road is confirmed too narrow and we have an alternative point, use that
  // - Otherwise fall back to the stop itself
  const uturnLat = (turnaroundPoint?.tooNarrow && turnaroundPoint.turnaroundLat != null)
    ? turnaroundPoint.turnaroundLat : destLat;
  const uturnLng = (turnaroundPoint?.tooNarrow && turnaroundPoint.turnaroundLng != null)
    ? turnaroundPoint.turnaroundLng : destLng;
  const turnaroundReason = turnaroundPoint?.reason ?? 'Prepare to turn around';

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

  const handleArrived = useCallback(() => {
    stopNav();
    router.replace(`/stop-delivery?stopId=${stopId}`);
  }, [stopId, stopNav]);

  // Auto-prompt arrival when within 30m of destination
  const arrivedRef = useRef(false);
  useEffect(() => {
    if (isNearDestination && !arrivedRef.current) {
      arrivedRef.current = true;
      Alert.alert(
        "You've arrived",
        stop?.address ?? 'at your destination',
        [
          { text: 'Not yet', style: 'cancel' },
          { text: 'Mark arrived', onPress: handleArrived },
        ],
      );
    }
  }, [isNearDestination]);

  // Reset flag when stop changes
  useEffect(() => { arrivedRef.current = false; }, [stopId]);

  // Speak access notes once when approaching destination
  const notesSpokenRef = useRef(false);
  useEffect(() => {
    if (isApproaching && !notesSpokenRef.current && stop?.notes && Platform.OS !== 'web') {
      notesSpokenRef.current = true;
      Speech.speak(`Approaching. ${stop.notes}`, { rate: 0.90 });
    }
  }, [isApproaching]);
  useEffect(() => { notesSpokenRef.current = false; }, [stopId]);

  // Pre-fetch next-stop ghost route once we know the current destination
  useEffect(() => {
    if (
      !nextStop || nextStop.lat == null || nextStop.lng == null
      || (nextStop.lat === 0 && nextStop.lng === 0)
      || destLat === 0 || destLng === 0
    ) {
      setNextRouteGeoJson(null);
      nextRouteFetchedRef.current = null;
      return;
    }
    const key = `${destLat},${destLng}->${nextStop.lat},${nextStop.lng}`;
    if (nextRouteFetchedRef.current === key) return;
    nextRouteFetchedRef.current = key;
    fetchNavRoute(destLat, destLng, nextStop.lat, nextStop.lng, vehicleId ?? 'lwb_van')
      .then(r => {
        if (!r) return;
        setNextRouteGeoJson({
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: r.polyline.map(p => [p.lng, p.lat]),
          },
          properties: {},
        });
      })
      .catch(() => {});
  }, [nextStop?.id, destLat, destLng, vehicleId]);

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
  // Adaptive zoom: pull back at speed to see further ahead; tighten for last-metre precision
  const followZoom = speedKmh > 80 ? 15 : speedKmh > 40 ? 16 : 17;
  const etaStr = route
    ? `${formatDuration(route.totalDurationSec)} · ${formatDistance(route.totalDistanceM)} remaining`
    : '';

  const hasUserLocation = userLat !== null && userLng !== null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.app.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.app.border }]}>
        <TouchableOpacity onPress={handleBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
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

      {/* TODO: Pre-entry narrow road warning — amber banner when the road AHEAD is too
          narrow for this vehicle, before the driver turns onto it. Infrastructure:
          subscribe to road-context events as driver approaches an upcoming turn segment;
          compare way width against VEHICLE_PROFILES[vehicleId].widthM. The turnaround
          banner already handles post-entry narrow roads. */}

      {/* TODO: what3words chip — show the 3-word address of the delivery stop for
          last-metre precision (e.g. "///filled.count.soap"). Tap opens w3words.com.
          Infrastructure: add w3w?: string to DeliveryStop; call GET
          https://api.what3words.com/v3/convert-to-3wa?coordinates={lat},{lng}&key=KEY
          when the stop is loaded. w3words free tier = 10k req/month. DHL reports
          42% faster last-mile delivery in rural areas with w3w integration. */}

      {/* Access notes — ambient when idle, highlighted when approaching */}
      {stop?.notes && (
        <View style={[
          styles.accessNotes,
          { backgroundColor: isApproaching ? colors.app.warningBg : colors.app.surface },
        ]}>
          <Text style={[styles.accessNotesLabel, { color: colors.app.textFaint }]}>
            {isApproaching ? 'APPROACHING — ACCESS' : 'ACCESS NOTES'}
          </Text>
          <Text style={[
            styles.accessNotesText,
            { color: isApproaching ? colors.app.warning : colors.app.text },
          ]}>
            {stop.notes}
          </Text>
        </View>
      )}

      {/* Turnaround warning — shown when next stop is behind the driver */}
      {needsTurnaround && nextStop && (
        <View style={[styles.turnaroundBanner, { backgroundColor: colors.app.warningBg }]}>
          <Text style={[styles.turnaroundIcon, { color: colors.app.warning }]}>↩</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.turnaroundTitle, { color: colors.app.warning }]}>
              {turnaroundPoint?.tooNarrow ? 'Road too narrow — find turning point' : 'Prepare to turn around'}
            </Text>
            <Text style={[styles.turnaroundSub, { color: colors.app.textFaint }]} numberOfLines={2}>
              {turnaroundPoint?.tooNarrow
                ? turnaroundReason
                : `Next stop is behind you — ${nextStop.address}`}
            </Text>
          </View>
        </View>
      )}

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
              zoomLevel: followZoom,
              pitch: 55,
              heading: bearing,
            }}
            followUserLocation={hasUserLocation}
            followUserMode={UserTrackingMode.FollowWithHeading}
            followZoomLevel={followZoom}
            followPitch={55}
          />

          {/* User location dot */}
          <UserLocation
            visible={hasUserLocation}
            animated={true}
            showsUserHeadingIndicator={true}
          />

          {/* Ghost route — next stop preview, dashed and faded, drawn underneath */}
          {nextRouteGeoJson && (
            <ShapeSource id="next-route-source" shape={nextRouteGeoJson}>
              <LineLayer
                id="next-route-ghost"
                style={{
                  lineColor: map.route,
                  lineWidth: 4,
                  lineOpacity: 0.28,
                  lineCap: 'round',
                  lineJoin: 'round',
                  lineDasharray: [2, 5],
                }}
              />
            </ShapeSource>
          )}

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

          {/* U-turn marker — at safe turning point (recalculated if road too narrow) */}
          {needsTurnaround && uturnLat !== 0 && uturnLng !== 0 && (
            <MarkerView
              coordinate={[uturnLng, uturnLat]}
              anchor={{ x: -0.3, y: 0.5 }}
            >
              <View style={[
                styles.uturnMarker,
                turnaroundPoint?.tooNarrow ? styles.uturnMarkerNarrow : null,
              ]}>
                <Text style={styles.uturnText}>↩</Text>
              </View>
            </MarkerView>
          )}

          {/* Next-stop destination pin — lighter marker so driver can see endpoint of ghost route */}
          {nextStop?.lat != null && nextStop.lng != null
            && nextStop.lat !== 0 && nextStop.lng !== 0
            && nextRouteGeoJson && (
            <MarkerView
              coordinate={[nextStop.lng, nextStop.lat]}
              anchor={{ x: 0.5, y: 1 }}
            >
              <View style={styles.nextStopPin}>
                <Text style={styles.nextStopPinText}>⬡</Text>
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

      {/* Silent reroute toast — non-blocking, auto-dismisses after 3 s */}
      {rerouteToast && (
        <View style={[styles.rerouteToast, { backgroundColor: colors.app.success }]}>
          <Text style={[styles.rerouteToastText, { color: '#fff' }]}>↺ {rerouteToast}</Text>
        </View>
      )}

      {/* Status bar */}
      <View style={[styles.statusBar, { borderTopColor: colors.app.border, backgroundColor: colors.app.background }]}>
        <Text style={[styles.etaText, { color: colors.app.textFaint }]}>ETA: {etaStr || '—'}</Text>

        {/* Live speed display */}
        <View style={styles.speedWidget}>
          <Text style={[styles.speedValue, { color: isDriving ? colors.app.text : colors.app.textFaint }]}>
            {speedKmh}
          </Text>
          <Text style={[styles.speedUnit, { color: colors.app.textFaint }]}>km/h</Text>
          {/* TODO: Speed limit badge — render a red-outlined circle showing maxspeedKph here.
              Highlight red when speedKmh > maxspeedKph. Requires road-context polling:
              GET /api/v1/road-context?lat=X&lng=Y every ~10 s during navigation. */}
        </View>

        <Text style={[styles.stepCount, { color: colors.app.textFaint }]}>
          Step {stepIndex + 1} / {route?.steps.length ?? '—'}
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
  statusBar:     { height: 52, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, borderTopWidth: 1 },
  etaText:       { fontSize: 13, flex: 1 },
  stepCount:     { fontSize: 12, flex: 1, textAlign: 'right' },
  speedWidget:   { alignItems: 'center', minWidth: 52 },
  speedValue:    { fontSize: 22, fontWeight: '800', lineHeight: 26 },
  speedUnit:     { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  rerouteToast:  {
    position: 'absolute', bottom: 180, alignSelf: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    borderRadius: 20, zIndex: 100,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, elevation: 10,
  },
  rerouteToastText: { fontSize: 15, fontWeight: '700' },
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
  // Access notes strip
  accessNotes:      { paddingHorizontal: 16, paddingVertical: 10 },
  accessNotesLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  accessNotesText:  { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  // Turnaround banner
  turnaroundBanner: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  turnaroundIcon:  { fontSize: 28, fontWeight: '900' },
  turnaroundTitle: { fontSize: 15, fontWeight: '700' },
  turnaroundSub:   { fontSize: 13, marginTop: 2 },
  // U-turn map pin
  uturnMarker: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#F59E0B',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, elevation: 8,
  },
  uturnMarkerNarrow: {
    backgroundColor: '#EF4444',
  },
  uturnText: { fontSize: 22, color: '#fff' },
  // Next-stop ghost pin
  nextStopPin: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(79, 195, 247, 0.35)',
    borderWidth: 2, borderColor: 'rgba(79, 195, 247, 0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  nextStopPinText: { fontSize: 14, color: '#4fc3f7' },
});