/**
 * app/route-builder.tsx
 *
 * Route builder screen — alternative to CSV paste for PRO tier.
 * Accessible from shift-start via "Build Route Manually" button.
 *
 * Features:
 *  - Address search via expo-location geocodeAsync (no API key needed)
 *  - Drag-to-reorder stops via react-native-draggable-flatlist
 *  - Optimise Route button → POST /api/v1/optimise
 *  - Start Shift → load stops into store → navigate to /hud
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { useShiftStore } from '../store/shiftStore';
import { useTheme } from '../components/ThemeContext';

interface AddressResult {
  address: string;
  lat: number;
  lng: number;
}

interface LocalStop {
  id:       string;
  address:  string;
  lat:      number;
  lng:      number;
  notes?:   string;
}

const DEBOUNCE_MS = 400;

// ─── Address Search ───────────────────────────────────────────────────────────

async function searchAddresses(query: string): Promise<AddressResult[]> {
  if (!query.trim()) return [];
  try {
    const results = await Location.geocodeAsync(query, { maxResults: 5 });
    return results.map(r => ({
      address: query, // geocodeAsync returns coords only; use query as label
      lat: r.latitude,
      lng: r.longitude,
    }));
  } catch {
    return [];
  }
}

// ─── Stop Row ─────────────────────────────────────────────────────────────────

function StopRow({ item, drag, isActive }: RenderItemParams<LocalStop>) {
  const { colors } = useTheme();
  return (
    <ScaleDecorator>
      <TouchableOpacity
        onLongPress={drag}
        disabled={isActive}
        style={[
          stopStyles.row,
          { backgroundColor: isActive ? colors.green : colors.surface },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Stop: ${item.address}. Long press to drag and reorder.`}
      >
        <Text style={[stopStyles.handle, { color: colors.subtext }]}>≡</Text>
        <View style={stopStyles.content}>
          <Text style={[stopStyles.address, { color: colors.text }]} numberOfLines={1}>
            {item.address}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {}}
          style={stopStyles.removeBtn}
          accessibilityRole="button"
          accessibilityLabel={`Remove stop: ${item.address}`}
        >
          <Text style={stopStyles.removeText}>✕</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </ScaleDecorator>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function RouteBuilderScreen() {
  const insets    = useSafeAreaInsets();
  const { colors } = useTheme();
  const startShift = useShiftStore(s => s.startShift);
  const vehicle    = useShiftStore(s => s.vehicle);

  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState<AddressResult[]>([]);
  const [stops,     setStops]     = useState<LocalStop[]>([]);
  const [searching, setSearching] = useState(false);
  const [optimising, setOptimising] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      const found = await searchAddresses(query);
      setResults(found);
      setSearching(false);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const handleAddStop = useCallback((result: AddressResult) => {
    const newStop: LocalStop = {
      id:      `stop-${Date.now()}`,
      address: result.address,
      lat:     result.lat,
      lng:     result.lng,
    };
    setStops(prev => [...prev, newStop]);
    setQuery('');
    setResults([]);
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleRemoveStop = useCallback((id: string) => {
    setStops(prev => prev.filter(s => s.id !== id));
  }, []);

  const handleDragEnd = useCallback(({ data }: { data: LocalStop[] }) => {
    setStops(data);
  }, []);

  const handleOptimise = useCallback(async () => {
    if (stops.length < 2) return;
    setOptimising(true);
    try {
      const res = await fetch('/api/v1/optimise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stops }),
      });
      if (!res.ok) throw new Error('Optimise failed');
      const data = await res.json();
      if (data.optimisedOrder) {
        const reordered = data.optimisedOrder.map((i: number) => stops[i]).filter(Boolean);
        setStops(reordered);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      Alert.alert('Could not optimise', 'Check your connection and try again.');
    } finally {
      setOptimising(false);
    }
  }, [stops]);

  const handleStartShift = useCallback(() => {
    if (!vehicle) {
      Alert.alert('Select a vehicle', 'Please select your vehicle before starting.');
      return;
    }
    startShift(stops as any, vehicle);
    router.replace('/hud');
  }, [stops, vehicle, startShift]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={[styles.backText, { color: colors.green }]}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Build Route</Text>
        {stops.length >= 2 && (
          <TouchableOpacity
            onPress={handleOptimise}
            disabled={optimising}
            style={styles.optimiseBtn}
            accessibilityRole="button"
            accessibilityLabel="Optimise route order"
          >
            {optimising
              ? <ActivityIndicator color={colors.green} size="small" />
              : <Text style={[styles.optimiseText, { color: colors.green }]}>Optimise</Text>
            }
          </TouchableOpacity>
        )}
      </View>

      {/* Address search */}
      <View style={styles.searchSection}>
        <TextInput
          style={[
            styles.searchInput,
            {
              backgroundColor: colors.surface,
              color: colors.text,
              borderColor: colors.border,
            },
          ]}
          placeholder="Search address..."
          placeholderTextColor={colors.subtext}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          accessibilityLabel="Address search"
          accessibilityHint="Enter an address to search for it on the map"
        />

        {/* Results dropdown */}
        {results.length > 0 && (
          <View style={[styles.resultsList, { backgroundColor: colors.surface }]}>
            {results.map((r, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.resultRow, { borderBottomColor: colors.border }]}
                onPress={() => handleAddStop(r)}
                accessibilityRole="button"
                accessibilityLabel={`Add stop: ${r.address}`}
              >
                <Text style={[styles.resultText, { color: colors.text }]}>
                  {r.address}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {searching && <ActivityIndicator color={colors.green} style={{ marginTop: 8 }} />}
      </View>

      {/* Stop list */}
      <View style={styles.listSection}>
        {stops.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.subtext }]}>
              Search and add addresses above to build your route
            </Text>
          </View>
        ) : (
          <DraggableFlatList
            data={stops}
            keyExtractor={item => item.id}
            onDragEnd={handleDragEnd}
            renderItem={({ item, drag, isActive }) => (
              <StopRow
                item={{ ...item, address: item.address }}
                drag={drag}
                isActive={isActive}
              />
            )}
            contentContainerStyle={{ paddingBottom: 120 }}
          />
        )}
      </View>

      {/* Start Shift button */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={[
            styles.startBtn,
            {
              backgroundColor: stops.length > 0 ? colors.green : colors.surfaceAlt,
            },
          ]}
          onPress={handleStartShift}
          disabled={stops.length === 0}
          accessibilityRole="button"
          accessibilityLabel={`Start shift with ${stops.length} stops`}
        >
          <Text style={styles.startBtnText}>
            Start Shift {stops.length > 0 ? `(${stops.length} stops)` : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn:  { paddingRight: 12 },
  backText: { fontSize: 18, fontWeight: '500' },
  title:    { flex: 1, fontSize: 18, fontWeight: '700' },
  optimiseBtn: { paddingLeft: 12 },
  optimiseText: { fontSize: 16, fontWeight: '600' },
  searchSection: {
    paddingHorizontal: 16, paddingVertical: 12,
  },
  searchInput: {
    height: 56, borderRadius: 12,
    paddingHorizontal: 16, fontSize: 16,
    borderWidth: 1,
  },
  resultsList: {
    marginTop: 8, borderRadius: 12, overflow: 'hidden',
  },
  resultRow: {
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  resultText: { fontSize: 15 },
  listSection: { flex: 1 },
  emptyState: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  startBtn: {
    height: 56, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});

const stopStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginVertical: 4,
    paddingHorizontal: 12, paddingVertical: 14,
    borderRadius: 10, minHeight: 56,
  },
  handle: { fontSize: 20, marginRight: 12 },
  content: { flex: 1 },
  address: { fontSize: 15, fontWeight: '500' },
  removeBtn: { paddingLeft: 12 },
  removeText: { fontSize: 16, color: '#ef5350' },
});