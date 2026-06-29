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
import { useEffect, useRef, useState } from 'react';
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
  const isActive            = useShiftStore(s => s.isActive);
  const stops               = useShiftStore(s => s.stops);
  const currentStop         = useShiftStore(s => s.currentStop);
  const completeStop        = useShiftStore(s => s.completeStop);
  const failStop            = useShiftStore(s => s.failStop);
  const endShift            = useShiftStore(s => s.endShift);
  const dispatcherMessage   = useShiftStore(s => s.dispatcherMessage);
  const dismissDispMsg      = useShiftStore(s => s.dismissDispatcherMessage);
  const user                = useAuthStore(s => s.user);

  useDriverLocation();
  const { score, alert, reason } = useTurnScore(currentStop, shift?.vehicleId);

  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const [lastAlert, setLastAlert] = useState<'GREEN' | 'AMBER' | 'RED'>('GREEN');
  const hasGreeted = useRef(false);
  const shiftCompleteEnteredRef = useRef(false);

  // FIX 4: End Shift handler — confirms before ending
  const handleEndShift = () => {
    Alert.alert(
      'End shift?',
      'This will close your current route. All completed stops are saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Shift',
          style: 'destructive',
          onPress: () => { endShift(); router.replace('/'); },
        },
      ],
    );
  };

  // Auto-dismiss dispatcher message after 15s
  useEffect(() => {
    if (!dispatcherMessage) return;
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
      Animated.timing(scaleAnim, { toValue: 1.04, duration: 120, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1.00, duration: 120, useNativeDriver: true }),
    ]).start();
  }, [alert]);

  // FIX 5: All stops done — shift completion summary
  const allStopsDone = isActive && shift && !currentStop
    && stops.length > 0
    && stops.every(s => s.status !== 'pending');

  if (allStopsDone) {
    // Haptic celebration — fires once
    if (!shiftCompleteEnteredRef.current) {
      shiftCompleteEnteredRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    const completed = stops.filter(s => s.status === 'completed').length;
    const failed    = stops.filter(s => s.status === 'failed').length;
    const totalParcels = stops
      .filter(s => s.status === 'completed')
      .reduce((sum, s) => sum + s.parcelCount, 0);
    const elapsedMs  = shift ? Date.now() - shift.startedAt : 0;
    const elapsedMin = Math.round(elapsedMs / 60_000);
    const elapsedStr = elapsedMin < 60
      ? `${elapsedMin} min`
      : `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m`;

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.app.background }}>
        <View style={styles.completionWrap}>
          <Text style={[styles.completionHeading, { color: colors.app.success }]}>
            Route complete!
          </Text>
          <Text style={[styles.completionSub, { color: colors.app.textFaint }]}>
            All stops delivered. Well done.
          </Text>

          <View style={[styles.completionCard, { backgroundColor: colors.app.surface }]}>
            <View style={styles.completionRow}>
              <Text style={[styles.completionLabel, { color: colors.app.textFaint }]}>Completed</Text>
              <Text style={[styles.completionValue, { color: colors.app.success }]}>{completed}</Text>
            </View>
            {failed > 0 && (
              <View style={styles.completionRow}>
                <Text style={[styles.completionLabel, { color: colors.app.textFaint }]}>Skipped</Text>
                <Text style={[styles.completionValue, { color: colors.app.danger }]}>{failed}</Text>
              </View>
            )}
            <View style={styles.completionRow}>
              <Text style={[styles.completionLabel, { color: colors.app.textFaint }]}>Parcels delivered</Text>
              <Text style={[styles.completionValue, { color: colors.app.text }]}>{totalParcels}</Text>
            </View>
            <View style={styles.completionRow}>
              <Text style={[styles.completionLabel, { color: colors.app.textFaint }]}>Shift duration</Text>
              <Text style={[styles.completionValue, { color: colors.app.text }]}>{elapsedStr}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.completionEndBtn, { backgroundColor: colors.app.success }]}
            onPress={() => { endShift(); router.replace('/'); }}
            accessibilityLabel="End shift and return home"
            accessibilityRole="button"
          >
            <Text style={[styles.completionEndBtnText, { color: colors.app.background }]}>
              End shift
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

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
          {/* FIX 4: End Shift also available from empty state if shift is active */}
          {isActive && (
            <TouchableOpacity
              style={[styles.emptyEndShiftBtn]}
              onPress={handleEndShift}
              accessibilityLabel="End shift"
              accessibilityRole="button"
            >
              <Text style={styles.emptyEndShiftText}>End shift</Text>
            </TouchableOpacity>
          )}
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

      {/* ── Dispatcher Message Banner ─────────────────────────── */}
      {dispatcherMessage && (
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

        {/* Google Maps escape hatch */}
        <TouchableOpacity
          onPress={() => Linking.openURL(
            `https://maps.google.com/?daddr=${encodeURIComponent(currentStop.address)}`,
          )}
        >
          <Text style={styles.gmapsLink}>Open in Google Maps</Text>
        </TouchableOpacity>

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

      {/* FIX 4: End Shift secondary action — small, below the card, not in primary thumb zone */}
      <TouchableOpacity
        style={styles.endShiftLink}
        onPress={handleEndShift}
        accessibilityLabel="End shift"
        accessibilityRole="button"
      >
        <Text style={[styles.endShiftLinkText, { color: colors.app.textFaint }]}>End shift</Text>
      </TouchableOpacity>

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
            onPress={failStop}
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
  gmapsLink:   {
    fontSize: 13, color: '#00C2A8', textDecorationLine: 'underline',
    marginTop: 10, fontWeight: '500',
  },
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

  // FIX 4: End Shift secondary link — low-prominence, below stop card
  endShiftLink: {
    alignSelf: 'center', marginTop: 10, paddingVertical: 6, paddingHorizontal: 16,
  },
  endShiftLinkText: { fontSize: 13, fontWeight: '500', textDecorationLine: 'underline' },

  // FIX 4: End Shift in empty state
  emptyEndShiftBtn: {
    marginTop: 12, paddingVertical: 10, paddingHorizontal: 24,
    borderRadius: 10, borderWidth: 1, borderColor: '#EF4444',
  },
  emptyEndShiftText: { color: '#EF4444', fontWeight: '600', fontSize: 15 },

  // FIX 5: Shift completion card
  completionWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  completionHeading: { fontSize: 32, fontWeight: '900', marginBottom: 8 },
  completionSub:     { fontSize: 16, marginBottom: 28, textAlign: 'center' },
  completionCard: {
    width: '100%', borderRadius: 16, padding: 20, marginBottom: 28, gap: 14,
  },
  completionRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  completionLabel: { fontSize: 15, fontWeight: '500' },
  completionValue: { fontSize: 18, fontWeight: '800' },
  completionEndBtn: {
    width: '100%', height: 60, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  completionEndBtnText: { fontSize: 18, fontWeight: '800' },
});