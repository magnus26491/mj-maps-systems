/**
 * Vehicle Selector Screen
 * Large touch targets (min 56px), bottom-anchored CTA.
 * One-handed operation — driver picks vehicle at shift start.
 */
import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useShiftStore } from '../store/shift';

const VEHICLES = [
  { id: 'car_estate', label: 'Car / Estate',   sub: 'Small delivery · up to 4m',       icon: '🚗' },
  { id: 'van_swb',    label: 'SWB Van',         sub: 'Transit Connect · up to 4.5m',    icon: '🚐' },
  { id: 'van_lwb',    label: 'LWB Van',         sub: 'Transit LWB · up to 5.5m',        icon: '🚐' },
  { id: 'luton',      label: 'Luton Van',       sub: 'Box body · up to 6.5m',           icon: '🛻' },
  { id: 'hgv_75t',    label: '7.5t HGV',        sub: 'Two-axle rigid · up to 8m',       icon: '🚚' },
  { id: 'hgv_18t',    label: '18t Rigid',       sub: 'Three-axle rigid · up to 10m',    icon: '🚚' },
  { id: 'artic',      label: 'Articulated',     sub: 'Semi-trailer · up to 16.5m',      icon: '🛻' },
] as const;

export default function VehicleSelectScreen() {
  const [selected, setSelected] = useState<string | null>(null);
  const startShift = useShiftStore(s => s.startShift);

  const confirm = () => {
    if (!selected) return;
    startShift(selected);
    router.replace('/hud');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>What are you driving today?</Text>
        <Text style={styles.sub}>
          MJ Maps optimises your route and turn warnings for your vehicle size.
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {VEHICLES.map(v => (
          <TouchableOpacity
            key={v.id}
            style={[styles.card, selected === v.id && styles.cardSelected]}
            onPress={() => setSelected(v.id)}
            activeOpacity={0.75}
            accessibilityRole="radio"
            accessibilityState={{ selected: selected === v.id }}
            accessibilityLabel={v.label}
          >
            <Text style={styles.cardIcon}>{v.icon}</Text>
            <View style={styles.cardText}>
              <Text style={[styles.cardLabel, selected === v.id && styles.cardLabelSelected]}>
                {v.label}
              </Text>
              <Text style={styles.cardSub}>{v.sub}</Text>
            </View>
            {selected === v.id && (
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
          accessibilityLabel="Start shift"
        >
          <Text style={styles.ctaText}>Start Shift</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: '#0f1923' },
  header:            { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16 },
  title:             { fontSize: 26, fontWeight: '700', color: '#ffffff', marginBottom: 6 },
  sub:               { fontSize: 15, color: '#8fa0b0', lineHeight: 22 },
  list:              { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1c2a37', borderRadius: 14,
    padding: 16, minHeight: 72,
    borderWidth: 2, borderColor: 'transparent',
  },
  cardSelected:      { borderColor: '#4fc3f7', backgroundColor: '#1a2f3f' },
  cardIcon:          { fontSize: 28, marginRight: 14 },
  cardText:          { flex: 1 },
  cardLabel:         { fontSize: 17, fontWeight: '600', color: '#c8d8e8' },
  cardLabelSelected: { color: '#4fc3f7' },
  cardSub:           { fontSize: 13, color: '#607080', marginTop: 2 },
  check: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#4fc3f7', alignItems: 'center', justifyContent: 'center',
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
