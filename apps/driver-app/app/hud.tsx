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
import { useDrivingMode } from '../hooks/useDrivingMode';
import { SlideToConfirm } from '../components/SlideToConfirm';
import { ShiftProgressBar } from '../components/ShiftProgressBar';
import { ThemeProvider, useTheme } from '../components/ThemeContext';

function HudInner() {
  const { colors } = useTheme();
  const { isDriving } = useDrivingMode();
  const shift        = useShiftStore(s => s.shift);
  const currentStop = useShiftStore(s => s.currentStop);
  const completeStop = useShiftStore(s => s.completeStop);
  const failStop     = useShiftStore(s => s.failStop);

  useDriverLocation();
  const { score, alert, reason } = useTurnScore(currentStop, shift?.vehicleId);

  const scaleAnim   = useRef(new Animated.Value(1)).current;
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
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>

      {/* ── Turn Alert Banner ─────────────────────────────────── */}
      {alert !== 'GREEN' && (
        <Animated.View
          style={[
            styles.alertBanner,
            {
              backgroundColor: alert === 'RED' ? colors.red : colors.amber,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Text style={styles.alertEmoji}>{alert === 'RED' ? '🚨' : '⚠️'}</Text>
          <View style={styles.alertTextWrap}>
            <Text style={[styles.alertLabel, { color: '#fff' }]}>
              {alert === 'AMBER' ? 'Caution — tight ahead' : 'DO NOT ENTER'}
            </Text>
            {reason ? (
              <Text style={[styles.alertReason, { color: 'rgba(255,255,255,0.85)' }]}>
                {reason}
              </Text>
            ) : null}
          </View>
          <Text style={[styles.alertScore, { color: '#fff' }]}>
            {score !== null ? Math.round(score * 100) : '--'}
          </Text>
        </Animated.View>
      )}

      {/* ── Shift Progress ────────────────────────────────────── */}
      <ShiftProgressBar
        current={currentStop.index}
        total={shift.totalStops}
      />

      {/* ── Current Stop ──────────────────────────────────────── */}
      <View style={[styles.stopCard, { backgroundColor: colors.surface }]}>
        <Text style={[styles.stopIndex, { color: colors.subtext }]}>
          Stop {currentStop.index + 1} of {shift.totalStops}
        </Text>
        <Text
          style={[styles.stopAddress, { color: colors.text }]}
          numberOfLines={3}
        >
          {currentStop.address}
        </Text>
        {currentStop.notes ? (
          <Text style={[styles.stopNotes, { color: colors.amber }]}>
            {currentStop.notes}
          </Text>
        ) : null}
        <View style={styles.stopMeta}>
          <Text style={[styles.metaItem, { color: colors.subtext }]}>
            📦 {currentStop.parcelCount} parcel{currentStop.parcelCount !== 1 ? 's' : ''}
          </Text>
          {currentStop.etaLabel && (
            <Text style={[styles.metaItem, { color: colors.subtext }]}>
              🕐 {currentStop.etaLabel}
            </Text>
          )}
          {currentStop.distanceM != null && (
            <Text style={[styles.metaItem, { color: colors.subtext }]}>
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
        {/* Failed */}
        {isDriving ? (
          <View style={[styles.actionBtn, { backgroundColor: colors.surface, opacity: 0.3 }]}>
            <Text style={styles.actionIcon}>🔒</Text>
            <Text style={styles.actionLabel}>Parked only</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.redBg }]}
            onPress={failStop}
            accessibilityRole="button"
            accessibilityLabel="Mark as failed"
          >
            <Text style={styles.actionIcon}>✗</Text>
            <Text style={styles.actionLabel}>Failed</Text>
          </TouchableOpacity>
        )}

        {/* Stops */}
        {isDriving ? (
          <View style={[styles.actionBtn, { backgroundColor: colors.surface, opacity: 0.4 }]}>
            <Text style={styles.actionIcon}>🔒</Text>
            <Text style={styles.actionLabel}>Parked only</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.surface }]}
            onPress={() => router.push('/stop-list')}
            accessibilityRole="button"
            accessibilityLabel="View all stops"
          >
            <Text style={styles.actionIcon}>☰</Text>
            <Text style={styles.actionLabel}>Stops</Text>
          </TouchableOpacity>
        )}

        {/* Deliver */}
        <SlideToConfirm
          label="Deliver"
          sublabel={`${currentStop.parcelCount} parcel${currentStop.parcelCount !== 1 ? 's' : ''}`}
          color={colors.green}
          trackColor={colors.greenBg}
          onConfirm={completeStop}
        />
      </View>
    </SafeAreaView>
  );
}

export default function HudScreen() {
  return (
    <ThemeProvider>
      <HudInner />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
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
  alertReason:   { fontSize: 13, marginTop: 2 },
  alertScore:    { fontSize: 26, fontWeight: '900', opacity: 0.9 },
  stopCard: {
    marginHorizontal: 12, marginTop: 16,
    borderRadius: 16, padding: 18,
  },
  stopIndex:   { fontSize: 15, marginBottom: 4, fontWeight: '600' },
  stopAddress: { fontSize: 24, fontWeight: '800', lineHeight: 32 },
  stopNotes:   { fontSize: 15, marginTop: 8, lineHeight: 22 },
  stopMeta:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  metaItem:    { fontSize: 16 },
  actions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 12, paddingBottom: 16, paddingTop: 12,
  },
  actionBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, minHeight: 72, gap: 4,
  },
  actionIcon:  { fontSize: 22, color: '#e0eaf4' },
  actionLabel: { fontSize: 16, color: '#8fa0b0', fontWeight: '600' },
});