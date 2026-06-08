/**
 * Vehicle Selector Screen — DB-driven
 *
 * Loads vehicle specs from /api/v1/vehicle-specs (authenticated).
 * Falls back to hardcoded FALLBACK_SPECS if API unavailable (offline resilience).
 *
 * Stores profileKey (e.g. 'TRANSIT_LWB_GB') in the shift store, NOT the DB id.
 * profileKey is what the route optimiser uses.
 */
import { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useShiftStore } from '../store/shift';
import { useAuthStore } from '../lib/auth';
import type { VehicleSpec } from '../lib/types';

const FALLBACK_SPECS: VehicleSpec[] = [
  {
    id:         'vs-transit-lwb',
    make:       'Ford',
    model:      'Transit LWB',
    year:       2023,
    heightM:    2.77,
    lengthM:    5.98,
    widthM:     2.05,
    gvwKg:      3500,
    payloadKg:  1400,
    hazmat:     false,
    profileKey: 'TRANSIT_LWB_GB',
  },
  {
    id:         'vs-transit-swb',
    make:       'Ford',
    model:      'Transit SWB',
    year:       2023,
    heightM:    2.77,
    lengthM:    4.97,
    widthM:     2.05,
    gvwKg:      3500,
    payloadKg:  1235,
    hazmat:     false,
    profileKey: 'TRANSIT_SWB_GB',
  },
  {
    id:         'vs-sprinter-lwb',
    make:       'Mercedes',
    model:      'Sprinter LWB',
    year:       2023,
    heightM:    2.80,
    lengthM:    6.95,
    widthM:     2.07,
    gvwKg:      3500,
    payloadKg:  1387,
    hazmat:     false,
    profileKey: 'SPRINTER_LWB_GB',
  },
  {
    id:         'vs-transit-custom',
    make:       'Ford',
    model:      'Transit Custom',
    year:       2023,
    heightM:    1.96,
    lengthM:    4.97,
    widthM:     1.97,
    gvwKg:      2800,
    payloadKg:  900,
    hazmat:     false,
    profileKey: 'TRANSIT_CUSTOM_GB',
  },
];

export default function VehicleSelectScreen() {
  const [specs,    setSpecs]    = useState<VehicleSpec[]>([]);
  const [selected,  setSelected]  = useState<string | null>(null);   // profileKey
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    const token = useAuthStore.getState().token;
    const API   = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

    fetch(`${API}/api/v1/vehicle-specs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok && Array.isArray(data.data)) {
          setSpecs(data.data);
        } else {
          setSpecs(FALLBACK_SPECS);
        }
      })
      .catch(() => {
        setError('Could not load vehicles. Using defaults.');
        setSpecs(FALLBACK_SPECS);
      })
      .finally(() => setLoading(false));
  }, []);

  const confirm = () => {
    if (!selected) return;
    useShiftStore.getState().vehicleId = selected;
    router.back();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4fc3f7" />
          <Text style={styles.loadingText}>Loading vehicles…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        {error && <Text style={styles.errorBanner}>{error}</Text>}
        <Text style={styles.title}>What are you driving today?</Text>
        <Text style={styles.sub}>
          Route and turn warnings are optimised for your vehicle size.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {specs.map(spec => (
          <TouchableOpacity
            key={spec.id}
            style={[styles.card, selected === spec.profileKey && styles.cardSelected]}
            onPress={() => setSelected(spec.profileKey)}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === spec.profileKey }}
            accessibilityLabel={`${spec.make} ${spec.model}`}
          >
            <View style={styles.cardMain}>
              <View style={styles.cardTop}>
                <Text style={[styles.cardLabel, selected === spec.profileKey && styles.cardLabelSelected]}>
                  {spec.make} {spec.model}
                </Text>
                <Text style={styles.cardYear}>{spec.year}</Text>
              </View>
              <View style={styles.cardMeta}>
                <Text style={styles.cardMetaItem}>🏔 {spec.heightM}m</Text>
                <Text style={styles.cardMetaItem}>⚖️ {(spec.gvwKg / 1000).toFixed(1)}t</Text>
                <Text style={styles.cardMetaItem}>📏 {spec.lengthM}m</Text>
              </View>
            </View>
            {selected === spec.profileKey && (
              <View style={styles.check}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.cta, !selected && styles.ctaDisabled]}
          onPress={confirm}
          disabled={!selected}
          accessibilityRole="button"
          accessibilityLabel="Confirm vehicle and continue"
        >
          <Text style={styles.ctaText}>Confirm Vehicle →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: '#0f1923' },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText:       { color: '#8fa0b0', marginTop: 12, fontSize: 15 },
  header:            { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16 },
  errorBanner:       { color: '#f59e0b', fontSize: 13, marginBottom: 8 },
  title:             { fontSize: 26, fontWeight: '700', color: '#ffffff', marginBottom: 6 },
  sub:               { fontSize: 15, color: '#8fa0b0', lineHeight: 22 },
  list:              { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1c2a37', borderRadius: 14,
    padding: 16, minHeight: 80,
    borderWidth: 2, borderColor: 'transparent',
  },
  cardSelected:      { borderColor: '#4fc3f7', backgroundColor: '#1a2f3f' },
  cardMain:          { flex: 1 },
  cardTop:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel:         { fontSize: 17, fontWeight: '700', color: '#c8d8e8' },
  cardLabelSelected: { color: '#4fc3f7' },
  cardYear:          { fontSize: 13, color: '#607080' },
  cardMeta:          { flexDirection: 'row', marginTop: 6, gap: 12 },
  cardMetaItem:      { fontSize: 13, color: '#8fa0b0' },
  check: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#4fc3f7', alignItems: 'center', justifyContent: 'center',
    marginLeft: 12,
  },
  checkMark:         { color: '#0f1923', fontWeight: '700', fontSize: 16 },
  footer: {
    paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#1c2a37',
  },
  cta: {
    backgroundColor: '#4fc3f7', borderRadius: 14,
    height: 56, alignItems: 'center', justifyContent: 'center',
  },
  ctaDisabled:       { backgroundColor: '#1c2a37' },
  ctaText:           { fontSize: 17, fontWeight: '700', color: '#0f1923' },
});
