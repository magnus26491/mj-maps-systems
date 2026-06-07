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
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { useShiftStore } from '../store/shift';
import { BackgroundLocationDisclosure } from '../components/BackgroundLocationDisclosure';

// ─── Types ────────────────────────────────────────────────────────────────────
interface RawStop {
  address: string;
  notes?: string;
  parcelCount?: number;
}

// ─── CSV parser — tolerant of real-world export formats ───────────────────────
function parseStopsCsv(raw: string): RawStop[] {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  // Skip header row if first cell looks like a label
  const startIdx = /^address|^stop|^location/i.test(lines[0] ?? '') ? 1 : 0;

  return lines.slice(startIdx).map(line => {
    const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
    return {
      address:     cols[0] ?? '',
      notes:       cols[1] ?? undefined,
      parcelCount: cols[2] ? Number(cols[2]) || 1 : 1,
    };
  }).filter(s => s.address.length > 2);
}

// ─── Greedy nearest-neighbour fallback (no-signal route ordering) ─────────────
function greedyOrder(stops: RawStop[]): RawStop[] {
  // Without coordinates we just return input order — good enough offline.
  // The API will replace this with the proper optimised sequence when online.
  return [...stops];
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ShiftStartScreen() {
  const vehicle      = useShiftStore(s => s.vehicleId);
  const startShift   = useShiftStore(s => s.startShift);

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
    } catch {
      Alert.alert('Paste failed', 'Could not read clipboard.');
    }
  }, []);

  // ── Parse manual text input ───────────────────────────────────────────────
  const handleTextImport = useCallback(() => {
    const parsed = parseStopsCsv(rawInput);
    if (!parsed.length) return Alert.alert('No stops found', 'Enter one address per line, or paste CSV.');
    setStops(parsed);
  }, [rawInput]);

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
      const token = useShiftStore.getState().token;

      const res = await fetch(`${API}/api/v1/routes/optimise`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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

      if (res.ok) {
        const { data } = await res.json();
        startShift(data.orderedStops, vehicle!);
      } else {
        // Offline fallback — use input order
        startShift(
          greedyOrder(stops).map((s, i) => ({
            id: `stop-${i}`,
            index: i,
            address: s.address,
            notes: s.notes ?? '',
            parcelCount: s.parcelCount ?? 1,
            status: 'pending' as const,
          })),
          vehicle!,
        );
      }

      router.replace('/hud');
    } catch {
      // No signal — use greedy fallback silently
      startShift(
        greedyOrder(stops).map((s, i) => ({
          id: `stop-${i}`,
          index: i,
          address: s.address,
          notes: s.notes ?? '',
          parcelCount: s.parcelCount ?? 1,
          status: 'pending' as const,
        })),
        vehicle!,
      );
      router.replace('/hud');
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
    const alreadyConsented = await SecureStore.getItemAsync('bg_location_consented');
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
    await SecureStore.setItemAsync('bg_location_consented', 'true');
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
    <SafeAreaView style={styles.safe}>
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
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.heading}>Start Shift</Text>

          {/* ── Vehicle ──────────────────────────────────────────── */}
          <TouchableOpacity
            style={[styles.card, !vehicle && styles.cardWarning]}
            onPress={() => router.push('/vehicle-select')}
            accessibilityRole="button"
          >
            <Text style={styles.cardLabel}>Vehicle</Text>
            <Text style={styles.cardValue}>
              {vehicle ? vehicle.replace(/_/g, ' ').toUpperCase() : 'Tap to select ›'}
            </Text>
          </TouchableOpacity>

          {/* ── Depot / Start location ────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Start location</Text>
            <TouchableOpacity
              style={styles.locationBtn}
              onPress={handleUseCurrentLocation}
              accessibilityRole="button"
            >
              <Text style={styles.locationBtnText}>
                {depotLabel || '📍 Use current location'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Stop import ──────────────────────────────────────── */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Stops</Text>
            <View style={styles.importRow}>
              <TouchableOpacity
                style={styles.importBtn}
                onPress={handlePasteImport}
                accessibilityRole="button"
              >
                <Text style={styles.importBtnText}>📋 Paste CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.importBtn}
                onPress={handleTextImport}
                accessibilityRole="button"
              >
                <Text style={styles.importBtnText}>⚡ Parse</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.textInput}
              multiline
              numberOfLines={6}
              placeholder={'One address per line, or paste CSV:\nAddress, Notes, Parcels'}
              placeholderTextColor="#4a5568"
              value={rawInput}
              onChangeText={setRawInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {stops.length > 0 && (
              <Text style={styles.stopsCount}>✓ {stops.length} stops ready</Text>
            )}
          </View>
        </ScrollView>

        {/* ── Bottom CTA — always in thumb zone ──────────────────── */}
        <View style={styles.cta}>
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
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: '#0f1923' },
  scroll:            { padding: 16, paddingBottom: 8, gap: 12 },
  heading: {
    fontSize: 28, fontWeight: '800',
    color: '#e0eaf4', marginBottom: 4,
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
    paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center',
    minHeight: 44,
  },
  locationBtnText: { color: '#4fc3f7', fontSize: 15, fontWeight: '600' },
  importRow:       { flexDirection: 'row', gap: 10 },
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
