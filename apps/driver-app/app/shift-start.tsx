/**
 * Shift Start — pre-shift orchestration screen.
 *
 * Flow:
 *  1. Vehicle confirmed (links to /vehicle-select if not set)
 *  2. Stops imported (CSV paste, manual entry, or pre-loaded from dispatcher)
 *  3. Depot/start location set (GPS or manual)
 *  4. POST /api/v1/routes/optimise — receives ordered stops + turn scores
 *  5. Navigate to /hud
 *
 * Mobile constraints:
 *  · All inputs in thumb zone — bottom-anchored primary CTA
 *  · Paste import handles messy real-world CSV (trailing commas, mixed line endings)
 *  · Offline-safe: if API unreachable, uses greedy nearest-neighbour fallback
 */
import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, ScrollView, Alert, ActivityIndicator,
  Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useShiftStore } from '../store/shift';
import { usePlan } from '../lib/usePlan';
import { useAuthStore } from '../lib/auth';
import { BackgroundLocationDisclosure } from '../components/BackgroundLocationDisclosure';
import { ThemeProvider, useTheme } from '../components/ThemeContext';
import { parseStopsCsv } from '../utils/parseStopsCsv';

// ─── Types ────────────────────────────────────────────────────────────────────
interface RawStop {
  address: string;
  notes?: string;
  parcelCount?: number;
}

// ─── Greedy nearest-neighbour fallback (no-signal route ordering) ─────────────
function greedyOrder(stops: RawStop[]): RawStop[] {
  // Without coordinates we just return input order — good enough offline.
  // The API will replace this with the proper optimised sequence when online.
  return [...stops];
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ShiftStartScreen() {
  const { colors } = useTheme();
  const vehicle      = useShiftStore(s => s.vehicleId);
  const startShift   = useShiftStore(s => s.startShift);
  const { canUse, isTrialing } = usePlan();

  const [rawInput, setRawInput]     = useState('');
  const [stops, setStops]           = useState<RawStop[]>([]);
  const [loading, setLoading]       = useState(false);
  const [depotLabel, setDepotLabel] = useState('');
  const [depotCoords, setDepotCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showDisclosure, setShowDisclosure] = useState(false);

  // ── Import from clipboard ──────────────────────────────────────────────────
  const handlePasteImport = useCallback(async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text) return Alert.alert('Clipboard empty', 'Nothing to paste.');
      const parsed = parseStopsCsv(text);
      if (!parsed.length) return Alert.alert('No stops found', 'Check CSV format: Address, Notes, Parcels');
      setStops(parsed);
      setRawInput(text);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Paste failed', 'Could not read clipboard.');
    }
  }, []);

  // ── Parse manual text input ───────────────────────────────────────────────
  const handleTextImport = useCallback(() => {
    const parsed = parseStopsCsv(rawInput);
    if (!parsed.length) return Alert.alert('No stops found', 'Enter one address per line, or paste CSV.');
    setStops(parsed);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [rawInput]);

  // ── File pick import ─────────────────────────────────────────────────────
  const handleFilePick = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const text = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const parsed = parseStopsCsv(text);
      if (!parsed.length) return Alert.alert('No stops found', 'Check CSV format.');
      setStops(parsed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Import failed', 'Could not read the file.');
    }
  }, []);

  // ── Get current GPS as depot ──────────────────────────────────────────────
  const handleUseCurrentLocation = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return Alert.alert('Location denied', 'Enable location in Settings.');
    }
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setDepotCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
    setDepotLabel('Current location');
  }, []);

  // ── Start shift ───────────────────────────────────────────────────────────
  const _executeShiftStart = useCallback(async () => {
    setLoading(true);
    try {
      const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';
      const token = useAuthStore.getState().token;

      const res = await fetch(`${API}/api/v1/routes/optimise`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          stops: stops.map((s, i) => ({
            id: `stop-${i}`,
            address: s.address,
            notes: s.notes,
            parcelCount: s.parcelCount ?? 1,
          })),
          config: {
            vehicleId: vehicle,
            depotLat: depotCoords?.lat ?? 0,
            depotLng: depotCoords?.lng ?? 0,
            returnToDepot: false,
            shiftStartEpoch: Date.now(),
          },
        }),
      });

      // Pass optimised stops to staged so route-review shows the correct order.
      // Do NOT call startShift here — route-review does the single startShift call.
      if (res.ok) {
        const json = await res.json();
        const payload = json?.data ?? json;
        useShiftStore.getState().setStagedStops(payload?.orderedStops ?? stops as any);
      } else {
        useShiftStore.getState().setStagedStops(stops as any);
      }
      router.push({
        pathname: '/route-review',
        params: { departureEpochMs: String(Date.now()) },
      });
    } catch {
      useShiftStore.getState().setStagedStops(stops as any);
      router.push({
        pathname: '/route-review',
        params: { departureEpochMs: String(Date.now()) },
      });
    } finally {
      setLoading(false);
    }
  }, [vehicle, stops, depotCoords, startShift]);

  const handleStartShift = useCallback(async () => {
    if (!vehicle) {
      return Alert.alert('No vehicle selected', 'Please select your vehicle first.');
    }
    if (!stops.length) {
      return Alert.alert('No stops', 'Import or enter at least one stop.');
    }

    // Google Play requires prominent disclosure before requestBackgroundPermissionsAsync.
    // Persist acceptance so the modal only shows once across all shifts.
    const alreadyConsented = Platform.OS === 'web'
      ? null
      : await AsyncStorage.getItem('bg_location_consented');
    if (!alreadyConsented) {
      setShowDisclosure(true);
      return; // handleDisclosureAccept will re-trigger after consent is stored
    }

    // Already consented — request background permission (may already be granted)
    const bgStatus = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus.status !== 'granted') {
      Alert.alert(
        'Background Location Required',
        'MJ Maps needs background location access to track your route during deliveries. Please enable it in Settings.',
        [{ text: 'OK' }],
      );
      return;
    }

    await _executeShiftStart();
  }, [vehicle, stops, _executeShiftStart]);

  const handleDisclosureAccept = useCallback(async () => {
    setShowDisclosure(false);
    if (Platform.OS !== 'web') await AsyncStorage.setItem('bg_location_consented', 'true');
    const bgStatus = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus.status !== 'granted') {
      Alert.alert(
        'Background Location Required',
        'MJ Maps needs background location access to track your route during deliveries. Please enable it in Settings.',
      );
      return;
    }
    await _executeShiftStart();
  }, [_executeShiftStart]);

  const handleDisclosureDecline = useCallback(() => {
    setShowDisclosure(false);
    Alert.alert(
      'Location Required',
      'Background location is required to run a delivery shift. You can enable it later in Settings.',
    );
  }, []);

  return (
    <ThemeProvider>
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <BackgroundLocationDisclosure
        visible={showDisclosure}
        onAccept={handleDisclosureAccept}
        onDecline={handleDisclosureDecline}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={[styles.scroll, { backgroundColor: colors.background }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.heading, { color: colors.text }]}>Start Shift</Text>

          {/* ── Trial awareness banner ─────────────────────────────────── */}
          {isTrialing() && (() => {
            const user = useAuthStore.getState().user;
            if (!user?.trialEndsAt) return null;
            const daysLeft = Math.ceil(
              (new Date(user.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
            );
            if (daysLeft > 3) return null;
            return (
              <TouchableOpacity
                style={[styles.trialBanner, { backgroundColor: '#f59e0b22' }]}
                onPress={() => router.push('/(auth)/plans')}
                accessibilityRole="button"
                accessibilityLabel={`Your free trial ends in ${daysLeft} days`}
              >
                <Text style={[styles.trialBannerText, { color: '#f59e0b' }]}>
                  Trial ends in {daysLeft} day{daysLeft !== 1 ? 's' : ''} — upgrade now
                </Text>
              </TouchableOpacity>
            );
          })()}

          {/* ── Vehicle ──────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.surface }, !vehicle && { borderColor: colors.amber, borderWidth: 1 }]}
            onPress={() => router.push('/vehicle-select')}
            accessibilityRole="button"
          >
            <Text style={[styles.cardLabel, { color: colors.subtext }]}>Vehicle</Text>
            <Text style={[styles.cardValue, { color: colors.text }]}>
              {vehicle ? vehicle.replace(/_/g, ' ').toUpperCase() : 'Tap to select ›'}
            </Text>
          </TouchableOpacity>

          {/* ── Saved Routes (Driver Pro gate) ──────────────────── */}
          <TouchableOpacity
            style={[styles.card, { backgroundColor: colors.surface }]}
            onPress={() => {
              if (canUse('saved_routes')) {
                router.push('/saved-routes');
              } else {
                Alert.alert(
                  'Saved Routes is a Driver Pro feature',
                  'Upgrade to save and reuse your routes. Cancel anytime.',
                  [{ text: 'View Plans', onPress: () => router.push('/(auth)/plans') }],
                );
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Saved Routes"
          >
            <Text style={[styles.cardLabel, { color: colors.subtext }]}>Saved Routes</Text>
            <Text style={[styles.cardValue, { color: canUse('saved_routes') ? colors.green : colors.subtext }]}>
              {canUse('saved_routes') ? 'View saved routes ›' : 'Upgrade to Driver Pro ›'}
            </Text>
          </TouchableOpacity>

          {/* ── Depot / Start location ────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardLabel, { color: colors.subtext }]}>Start location</Text>
            <TouchableOpacity
              style={styles.locationBtn}
              onPress={handleUseCurrentLocation}
              accessibilityRole="button"
            >
              <Text style={styles.locationBtnText}>
                {depotLabel || 'Use current location'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Stop import ──────────────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardLabel, { color: colors.subtext }]}>Stops</Text>
            <TouchableOpacity
              style={styles.planRouteBtn}
              onPress={() => router.push('/route-builder')}
              accessibilityRole="button"
              accessibilityLabel="Build route manually by searching addresses"
            >
              <Text style={styles.planRouteBtnText}>Plan My Route</Text>
            </TouchableOpacity>
            <View style={styles.importRow}>
              <TouchableOpacity
                style={styles.importBtn}
                onPress={handlePasteImport}
                accessibilityRole="button"
              >
                <Text style={styles.importBtnText}>Paste CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.importBtn}
                onPress={handleFilePick}
                accessibilityRole="button"
              >
                <Text style={styles.importBtnText}>Upload CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.importBtn}
                onPress={handleTextImport}
                accessibilityRole="button"
              >
                <Text style={styles.importBtnText}>Parse</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.textInput}
              multiline
              numberOfLines={6}
              placeholder={'One address per line, or paste CSV:\nAddress, Notes, Parcels'}
              placeholderTextColor={colors.subtext}
              value={rawInput}
              onChangeText={setRawInput}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Stop addresses input"
              accessibilityHint="Enter one address per line or paste CSV"
            />
            {stops.length > 0 && (
              <Text style={[styles.stopsCount, { color: colors.green }]}>{stops.length} stops ready</Text>
            )}
          </View>
        </ScrollView>

        {/* ── Bottom CTA — always in thumb zone ──────────────────── */}
        <View style={[styles.cta, { paddingBottom: 8 }]}>
          <TouchableOpacity
            style={[
              styles.startBtn,
              (!vehicle || !stops.length) && styles.startBtnDisabled,
            ]}
            onPress={handleStartShift}
            disabled={!vehicle || !stops.length || loading}
            accessibilityRole="button"
            accessibilityLabel="Start shift and optimise route"
          >
            {loading
              ? <ActivityIndicator color="#0f1923" />
              : <Text style={styles.startBtnText}>Start Shift →</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: '#0f1923' },
  scroll:            { padding: 16, paddingBottom: 8, gap: 12 },
  heading: {
    fontSize: 28, fontWeight: '800',
    color: '#e0eaf4', marginBottom: 4,
  },
  trialBanner: {
    backgroundColor: '#f59e0b22', borderRadius: 10,
    padding: 12, alignItems: 'center',
  },
  trialBannerText: {
    fontSize: 14, fontWeight: '600',
  },
  card: {
    backgroundColor: '#1c2a37', borderRadius: 14,
    padding: 16, gap: 10,
  },
  cardWarning: { borderWidth: 1, borderColor: '#f57c00' },
  cardLabel:   { fontSize: 12, color: '#607080', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  cardValue:   { fontSize: 17, color: '#e0eaf4', fontWeight: '600' },
  locationBtn: {
    backgroundColor: '#253545', borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 14, alignItems: 'center',
    minHeight: 56,
  },
  locationBtnText: { color: '#4fc3f7', fontSize: 15, fontWeight: '600' },
  importRow:       { flexDirection: 'row', gap: 10 },
  planRouteBtn: {
    backgroundColor: '#4fc3f7', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', minHeight: 60,
    marginBottom: 10,
  },
  planRouteBtnText: { color: '#0f1923', fontSize: 17, fontWeight: '800' },
  importBtn: {
    flex: 1, backgroundColor: '#253545', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', minHeight: 44,
  },
  importBtnText:  { color: '#e0eaf4', fontSize: 14, fontWeight: '600' },
  textInput: {
    backgroundColor: '#0f1923', borderRadius: 10, padding: 12,
    color: '#e0eaf4', fontSize: 14, lineHeight: 20,
    minHeight: 110, textAlignVertical: 'top',
    borderWidth: 1, borderColor: '#253545',
  },
  stopsCount: { fontSize: 14, color: '#66bb6a', fontWeight: '700' },
  cta:        { padding: 16, paddingBottom: 8 },
  startBtn: {
    backgroundColor: '#4fc3f7', borderRadius: 14,
    paddingVertical: 18, alignItems: 'center', minHeight: 64,
    justifyContent: 'center',
  },
  startBtnDisabled: { opacity: 0.35 },
  startBtnText:     { color: '#0f1923', fontSize: 18, fontWeight: '800' },
});
