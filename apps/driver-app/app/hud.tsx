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
 *
 * Visual: teal brand, turn-score colours, IBM Plex Mono for data, no emoji
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Vibration, Platform, Linking, Alert,
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
import { useTheme } from '../lib/theme';
import { useAuthStore } from '../lib/auth';
import { useLocale } from '../components/LocaleProvider';

// ── No emoji: use text-based indicators throughout HUD ──────────────────────────
// The nav button uses "Navigate →" text label, no icon needed.

// ─── Lifecycle greeting helper ─────────────────────────────────────────────────
type GreetingKey = 'voice_good_morning' | 'voice_good_afternoon' | 'voice_good_evening';
function getGreetingKey(): GreetingKey {
  const hour = new Date().getHours();
  if (hour < 12) return 'voice_good_morning';
  if (hour < 17) return 'voice_good_afternoon';
  return 'voice_good_evening';
}

function HudInner() {
  const { colors } = useTheme();
  const { isDriving } = useDrivingMode();
  const { speechLang, t } = useLocale();
  const shift               = useShiftStore(s => s.shift);
  const currentStop         = useShiftStore(s => s.currentStop);
  const completeStop        = useShiftStore(s => s.completeStop);
  const failStop            = useShiftStore(s => s.failStop);
  const skipStop            = useShiftStore(s => s.skipStop);
  const nextStop            = useShiftStore(s => s.nextStop);
  const dispatcherMessage   = useShiftStore(s => s.dispatcherMessage);
  const dismissDispMsg      = useShiftStore(s => s.dismissDispatcherMessage);
  const user                = useAuthStore(s => s.user);
  const isEnterprise        = user?.planId === 'custom';

  useDriverLocation();
  const { score, alert, reason } = useTurnScore(currentStop, shift?.vehicleId);

  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const [lastAlert, setLastAlert] = useState<'GREEN' | 'AMBER' | 'RED'>('GREEN');
  const hasGreeted = useRef(false);

  const handleFail = useCallback(() => {
    Alert.alert(
      'Why did this delivery fail?',
      undefined,
      [
        { text: 'No answer', onPress: () => failStop('no_answer') },
        { text: 'No access', onPress: () => failStop('no_access') },
        { text: 'Wrong address', onPress: () => failStop('wrong_address') },
        { text: 'Skip — come back later', onPress: () => skipStop() },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [failStop, skipStop]);

  // Auto-dismiss dispatcher message after 15s — enterprise only
  useEffect(() => {
    if (!dispatcherMessage || !isEnterprise) return;
    // Haptic + voice announcement on arrival
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Speech.speak(`Message from ${dispatcherMessage.from}: ${dispatcherMessage.message}`, {
        language: speechLang,
        rate: 0.95,
      });
    }
    const timer = setTimeout(dismissDispMsg, 15_000);
    return () => clearTimeout(timer);
  }, [dispatcherMessage]);

  // Lifecycle greeting: fires ONLY on ROUTE_PREPARED → READY_TO_GO (first HUD render with active shift)
  useEffect(() => {
    if (shift && currentStop && !hasGreeted.current) {
      hasGreeted.current = true;
      const driverName = user?.name?.split(' ')[0] || 'driver';
      const greeting = `${t(getGreetingKey())} ${driverName}. ${t('voice_route_ready', { n: shift.totalStops })}`;

      if (Platform.OS !== 'web') {
        Speech.speak(greeting, { language: speechLang, rate: 0.95 });
      }
    }
  }, [shift, currentStop, user, speechLang]);

  useEffect(() => {
    if (!alert || alert === lastAlert) return;
    setLastAlert(alert);

    if (alert === 'RED') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Vibration.vibrate(Platform.OS === 'android' ? [0, 300, 100, 300] : 400);
      Speech.speak(t('voice_turn_warning'), { language: speechLang, rate: 1.1 });
    } else if (alert === 'AMBER') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Speech.speak(t('voice_tight_road'), { language: speechLang, rate: 1.0 });
    }

    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.04, duration: 120, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(scaleAnim, { toValue: 1.00, duration: 120, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [alert]);

  if (!shift || !currentStop) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.app.background }}>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.app.background }}>

      {/* ── Turn Alert Banner ─────────────────────────────────── */}
      {alert !== 'GREEN' && (
        <Animated.View
          style={[
            styles.alertBanner,
            {
              backgroundColor: alert === 'RED' ? colors.app.danger : colors.app.warning,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Inline SVG-free alert indicator — large text is readable at a glance */}
          <View style={styles.alertIconWrap}>
            <Text style={[styles.alertIconText, { color: '#fff' }]}>
              {alert === 'RED' ? '!' : '!'}
            </Text>
          </View>
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
        </Animated.View>
      )}

      {/* ── Shift Progress ────────────────────────────────────── */}
      <ShiftProgressBar
        current={currentStop.index}
        total={shift.totalStops}
      />

      {/* ── Dispatcher Message Banner — enterprise drivers only ── */}
      {isEnterprise && dispatcherMessage && (
        <View style={[styles.dispMsgBanner, { backgroundColor: colors.app.surface, borderColor: colors.app.primary }]}>
          <View style={styles.dispMsgHeader}>
            <Text style={[styles.dispMsgLabel, { color: colors.app.primary }]}>Message from {dispatcherMessage.from}</Text>
            <TouchableOpacity
              onPress={dismissDispMsg}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Dismiss message"
              accessibilityRole="button"
            >
              <Text style={[styles.dispMsgClose, { color: colors.app.textFaint }]}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.dispMsgText, { color: colors.app.text }]}>{dispatcherMessage.message}</Text>
        </View>
      )}

      {/* ── Current Stop ──────────────────────────────────────── */}
      <View style={[styles.stopCard, { backgroundColor: colors.app.surface }]}>
        <Text style={[styles.stopIndex, { color: colors.app.textFaint }]}>
          Stop {currentStop.index + 1} of {shift.totalStops}
        </Text>
        <Text
          style={[styles.stopAddress, { color: colors.app.text }]}
          numberOfLines={3}
        >
          {currentStop.address}
        </Text>
        {currentStop.notes ? (
          <Text style={[styles.stopNotes, { color: colors.app.warning }]}>
            {currentStop.notes}
          </Text>
        ) : null}
        <View style={styles.stopMeta}>
          <Text style={[styles.metaItem, { color: colors.app.textFaint }]}>
            {currentStop.parcelCount} parcel{currentStop.parcelCount !== 1 ? 's' : ''}
          </Text>
          {currentStop.etaLabel && (
            <Text style={[styles.metaItem, { color: colors.app.textFaint }]}>
              ETA {currentStop.etaLabel}
            </Text>
          )}
          {currentStop.distanceM != null && (
            <Text style={[styles.metaItem, { color: colors.app.textFaint }]}>
              {currentStop.distanceM < 1000
                ? `${currentStop.distanceM}m`
                : `${(currentStop.distanceM / 1000).toFixed(1)}km`}
            </Text>
          )}
        </View>

        {/* Dynamic route confidence badge — driven by live turn score */}
        {alert === 'RED' ? (
          <View style={[styles.routeOkBadge, { backgroundColor: colors.app.dangerBg }]}>
            <Text style={[styles.routeOkText, { color: colors.app.danger }]}>
              Route restricted — do not enter
            </Text>
          </View>
        ) : alert === 'AMBER' ? (
          <View style={[styles.routeOkBadge, { backgroundColor: colors.app.warningBg }]}>
            <Text style={[styles.routeOkText, { color: colors.app.warning }]}>
              Tight access — proceed with care
            </Text>
          </View>
        ) : (
          <View style={[styles.routeOkBadge, { backgroundColor: colors.app.successBg }]}>
            <Text style={[styles.routeOkText, { color: colors.app.success }]}>
              Route clear for your vehicle
            </Text>
          </View>
        )}

        {/* Navigate button — teal brand, text-only */}
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => {
            if (currentStop.lat != null && currentStop.lng != null) {
              router.push({ pathname: '/navigation', params: { stopId: currentStop.id } });
            } else {
              Alert.alert('No pin', 'This stop has no GPS pin. Navigate manually or tap to search.');
            }
          }}
          accessibilityLabel="Navigate to stop"
          accessibilityRole="button"
        >
          <Text style={styles.navBtnText}>Navigate</Text>
          <Text style={styles.navBtnArrow}>→</Text>
        </TouchableOpacity>

        {/* Google Maps escape hatch + Add stop mid-shift */}
        <View style={styles.stopCardLinks}>
          <TouchableOpacity
            onPress={() => Linking.openURL(
              `https://maps.google.com/?daddr=${encodeURIComponent(currentStop.address)}`,
            )}
          >
            <Text style={styles.gmapsLink}>Open in Google Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/route-builder?addMode=1')}
            accessibilityRole="button"
            accessibilityLabel="Add a stop to your route"
          >
            <Text style={styles.addStopLink}>+ Add a stop</Text>
          </TouchableOpacity>
        </View>

        {/* Performance quick-access */}
        <TouchableOpacity
          style={styles.perfBtn}
          onPress={() => router.push('/performance')}
          accessibilityLabel="View performance and savings"
          accessibilityRole="button"
        >
          <Text style={styles.perfBtnText}>View performance</Text>
        </TouchableOpacity>
      </View>

      {/* Next stop preview — helps driver mentally prepare */}
      {nextStop && (
        <View style={[styles.nextStopCard, { backgroundColor: colors.app.surface }]}>
          <Text style={[styles.nextStopLabel, { color: colors.app.textFaint }]}>NEXT STOP</Text>
          <Text style={[styles.nextStopAddr, { color: colors.app.text }]} numberOfLines={1}>
            {nextStop.address}
          </Text>
          <Text style={[styles.nextStopMeta, { color: colors.app.textFaint }]}>
            {nextStop.parcelCount} parcel{nextStop.parcelCount !== 1 ? 's' : ''}
            {nextStop.alertLevel && nextStop.alertLevel !== 'GREEN'
              ? `  ·  ${nextStop.alertLevel === 'RED' ? 'Restricted access' : 'Tight access'}`
              : ''}
          </Text>
        </View>
      )}

      <View style={{ flex: 1 }} />

      {/* ── Bottom Action Bar — thumb zone ─────────────────────── */}
      <View style={styles.actions}>
        {/* Failed */}
        {isDriving ? (
          <View style={[styles.actionBtn, { backgroundColor: colors.app.surface, opacity: 0.3 }]}>
            <Text style={styles.actionIcon}>🔒</Text>
            <Text style={styles.actionLabel}>Parked only</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.app.dangerBg }]}
            onPress={handleFail}
            accessibilityRole="button"
            accessibilityLabel="Mark as failed"
          >
            <Text style={[styles.actionBtnText, { color: colors.app.danger }]}>Failed</Text>
          </TouchableOpacity>
        )}

        {/* Stops */}
        {isDriving ? (
          <View style={[styles.actionBtn, { backgroundColor: colors.app.surface, opacity: 0.4 }]}>
            <Text style={styles.actionIcon}>🔒</Text>
            <Text style={styles.actionLabel}>Parked only</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: colors.app.surface }]}
            onPress={() => router.push('/stop-list')}
            accessibilityRole="button"
            accessibilityLabel="View all stops"
          >
            <Text style={[styles.actionBtnText, { color: colors.app.primary }]}>All stops</Text>
          </TouchableOpacity>
        )}

        {/* Deliver */}
        <SlideToConfirm
          label="Deliver"
          sublabel={`${currentStop.parcelCount} parcel${currentStop.parcelCount !== 1 ? 's' : ''}`}
          color={colors.app.success}
          trackColor={colors.app.successBg}
          onConfirm={completeStop}
        />
      </View>
    </SafeAreaView>
  );
}

export default function HudScreen() {
  return <HudInner />;
}

const styles = StyleSheet.create({
  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText:     { color: '#94A3B8', fontSize: 17, marginBottom: 16 },
  emptyBtn: {
    backgroundColor: '#00C2A8', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 28,
  },
  emptyBtnText:  { color: '#0A0C10', fontWeight: '700', fontSize: 16 },
  alertBanner: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, paddingHorizontal: 20,
    marginHorizontal: 12, marginTop: 8,
    borderRadius: 16, gap: 12, minHeight: 72,
  },
  alertIconWrap: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  alertIconText: { fontSize: 24, fontWeight: '900' },
  dispMsgBanner: {
    marginHorizontal: 12, marginTop: 8,
    backgroundColor: '#12151B',
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 168, 0.3)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  dispMsgHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 6,
  },
  dispMsgLabel: {
    fontSize: 13, fontWeight: '700', color: '#00C2A8', letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  dispMsgClose: {
    fontSize: 16, color: '#94A3B8', fontWeight: '600',
  },
  dispMsgText: {
    fontSize: 16, color: '#F1F5F9', lineHeight: 22,
  },
  alertTextWrap: { flex: 1 },
  alertLabel:    { fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  alertReason:   { fontSize: 13, marginTop: 2 },
  stopCard: {
    marginHorizontal: 12, marginTop: 16,
    borderRadius: 16, padding: 18,
  },
  stopIndex:   { fontSize: 15, marginBottom: 4, fontWeight: '600' },
  stopAddress: { fontSize: 24, fontWeight: '800', lineHeight: 32 },
  stopNotes:   { fontSize: 15, marginTop: 8, lineHeight: 22 },
  stopMeta:    { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  metaItem:    { fontSize: 16 },
  routeOkBadge: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  routeOkText: { fontSize: 14, fontWeight: '600' },
  // Teal navigate button — matches brand token
  navBtn: {
    backgroundColor: '#00C2A8', borderRadius: 12,
    height: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center',
    marginTop: 12, flexDirection: 'row', gap: 8,
  },
  navBtnText:  { fontSize: 17, fontWeight: '700', color: '#0A0C10' },
  navBtnArrow: { fontSize: 17, fontWeight: '700', color: '#0A0C10' },
  stopCardLinks: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10,
  },
  gmapsLink:   { fontSize: 13, color: '#00C2A8', textDecorationLine: 'underline', fontWeight: '500' },
  addStopLink: { fontSize: 13, color: '#00C2A8', fontWeight: '600' },
  nextStopCard: {
    marginHorizontal: 12, marginTop: 8,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
  },
  nextStopLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 4 },
  nextStopAddr:  { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  nextStopMeta:  { fontSize: 13, marginTop: 4 },
  perfBtn: {
    marginTop: 10,
    backgroundColor: '#12151B',
    borderWidth: 1,
    borderColor: 'rgba(0, 194, 168, 0.25)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  perfBtnText: { fontSize: 13, fontWeight: '600', color: '#00C2A8' },
  actions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 12, paddingBottom: 16, paddingTop: 12,
  },
  actionBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, minHeight: 72,
  },
  actionIcon:  { fontSize: 20, color: '#94A3B8' },
  actionLabel: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
  actionBtnText: { fontSize: 16, fontWeight: '700' },
});