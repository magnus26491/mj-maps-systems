/**
 * Driver HUD — main active delivery view.
 *
 * Mobile design constraints:
 *  · One-handed, all primary actions in bottom thumb zone
 *  · Touch targets >= 56px
 *  · High contrast — readable in direct sunlight
 *  · No hover states
 *  · Screen stays awake (KeepAwake in _layout.tsx)
 *  · Voice + haptic alerts so driver doesn't need to look at screen
 *  · Turn warning fires at 300m (AMBER) and 500m (RED)
 */
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Vibration, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useShiftStore } from '../store/shift';
import { useTurnScore } from '../hooks/useTurnScore';
import { useDriverLocation } from '../hooks/useDriverLocation';

const ALERT_COLOURS = {
  GREEN: { bg: '#0d3b0d', banner: '#2e7d32', text: '#a5d6a7', emoji: '✅' },
  AMBER: { bg: '#3b2a0d', banner: '#f57c00', text: '#ffe082', emoji: '⚠️' },
  RED:   { bg: '#3b0d0d', banner: '#c62828', text: '#ef9a9a', emoji: '🚨' },
} as const;

export default function HudScreen() {
  const shift        = useShiftStore(s => s.shift);
  const currentStop  = useShiftStore(s => s.currentStop);
  const completeStop = useShiftStore(s => s.completeStop);
  const failStop     = useShiftStore(s => s.failStop);

  useDriverLocation(); // starts background tracking
  const { score, alert, reason } = useTurnScore(currentStop, shift?.vehicleId);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [lastAlert, setLastAlert] = useState<'GREEN' | 'AMBER' | 'RED'>('GREEN');

  useEffect(() => {
    if (!alert || alert === lastAlert) return;
    setLastAlert(alert);

    if (alert === 'RED') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Vibration.vibrate(Platform.OS === 'android' ? [0, 300, 100, 300] : 400);
      Speech.speak('Warning. Do not enter. Vehicle too large to turn around.', {
        language: 'en-GB', rate: 1.1,
      });
    } else if (alert === 'AMBER') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Speech.speak('Caution. Tight ahead. Turn around may be difficult.', {
        language: 'en-GB', rate: 1.0,
      });
    }

    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.04, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1.00, duration: 120, useNativeDriver: true }),
    ]).start();
  }, [alert]);

  if (!shift || !currentStop) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No active route.</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.replace('/vehicle-select')}
          >
            <Text style={styles.emptyBtnText}>Start a new shift</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const colours = ALERT_COLOURS[alert ?? 'GREEN'];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colours.bg }]}>

      {/* ── Turn Alert Banner ─────────────────────────────────── */}
      <Animated.View style={[
        styles.alertBanner,
        { backgroundColor: colours.banner, transform: [{ scale: scaleAnim }] },
      ]}>
        <Text style={styles.alertEmoji}>{colours.emoji}</Text>
        <View style={styles.alertTextWrap}>
          <Text style={[styles.alertLabel, { color: colours.text }]}>
            {alert === 'GREEN' && 'Clear to enter'}
            {alert === 'AMBER' && 'Caution — tight ahead'}
            {alert === 'RED'   && 'DO NOT ENTER'}
          </Text>
          {reason ? (
            <Text style={[styles.alertReason, { color: colours.text }]}>{reason}</Text>
          ) : null}
        </View>
        <Text style={[styles.alertScore, { color: colours.text }]}>
          {score !== null ? Math.round(score * 100) : '--'}
        </Text>
      </Animated.View>

      {/* ── Current Stop ──────────────────────────────────────── */}
      <View style={styles.stopCard}>
        <Text style={styles.stopIndex}>
          Stop {currentStop.index + 1} of {shift.totalStops}
        </Text>
        <Text style={styles.stopAddress} numberOfLines={3}>
          {currentStop.address}
        </Text>
        {currentStop.notes ? (
          <Text style={styles.stopNotes}>{currentStop.notes}</Text>
        ) : null}
        <View style={styles.stopMeta}>
          <Text style={styles.metaItem}>📦 {currentStop.parcelCount} parcels</Text>
          {currentStop.etaLabel && (
            <Text style={styles.metaItem}>🕐 {currentStop.etaLabel}</Text>
          )}
          {currentStop.distanceM != null && (
            <Text style={styles.metaItem}>
              📍 {currentStop.distanceM < 1000
                ? `${currentStop.distanceM}m`
                : `${(currentStop.distanceM / 1000).toFixed(1)}km`}
            </Text>
          )}
        </View>
      </View>

      <View style={{ flex: 1 }} />

      {/* ── Bottom Action Bar — thumb zone ─────────────────────── */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.failBtn]}
          onPress={failStop}
          accessibilityRole="button"
          accessibilityLabel="Failed delivery"
        >
          <Text style={styles.actionIcon}>✗</Text>
          <Text style={styles.actionLabel}>Failed</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.navBtn]}
          onPress={() => router.push('/stop-list')}
          accessibilityRole="button"
          accessibilityLabel="View all stops"
        >
          <Text style={styles.actionIcon}>☰</Text>
          <Text style={styles.actionLabel}>Stops</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.doneBtn]}
          onPress={completeStop}
          accessibilityRole="button"
          accessibilityLabel="Mark as delivered"
        >
          <Text style={styles.actionIcon}>✓</Text>
          <Text style={styles.actionLabel}>Delivered</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:          { flex: 1 },
  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText:     { color: '#8fa0b0', fontSize: 17, marginBottom: 16 },
  emptyBtn: {
    backgroundColor: '#4fc3f7', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 28,
  },
  emptyBtnText:  { color: '#0f1923', fontWeight: '700', fontSize: 16 },
  alertBanner: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 20,
    marginHorizontal: 12, marginTop: 8,
    borderRadius: 16, gap: 12, minHeight: 72,
  },
  alertEmoji:    { fontSize: 28 },
  alertTextWrap: { flex: 1 },
  alertLabel:    { fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  alertReason:   { fontSize: 13, marginTop: 2, opacity: 0.85 },
  alertScore:    { fontSize: 26, fontWeight: '900', opacity: 0.9 },
  stopCard: {
    marginHorizontal: 12, marginTop: 16,
    backgroundColor: '#1c2a37', borderRadius: 16, padding: 18,
  },
  stopIndex:   { fontSize: 13, color: '#607080', marginBottom: 4, fontWeight: '600' },
  stopAddress: { fontSize: 22, color: '#e0eaf4', fontWeight: '700', lineHeight: 30 },
  stopNotes:   { fontSize: 14, color: '#f0c040', marginTop: 8, lineHeight: 20 },
  stopMeta:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  metaItem:    { fontSize: 14, color: '#8fa0b0' },
  actions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 12, paddingBottom: 16, paddingTop: 12,
  },
  actionBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, minHeight: 64, gap: 4,
  },
  failBtn:     { backgroundColor: '#3b1a1a' },
  navBtn:      { backgroundColor: '#1c2a37' },
  doneBtn:     { backgroundColor: '#0d3b1a' },
  actionIcon:  { fontSize: 22, color: '#e0eaf4' },
  actionLabel: { fontSize: 12, color: '#8fa0b0', fontWeight: '600' },
});
