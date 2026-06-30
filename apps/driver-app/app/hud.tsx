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
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { SlideToConfirm } from '../components/SlideToConfirm';
import { ShiftProgressBar } from '../components/ShiftProgressBar';
import DifficultyReportSheet from '../components/DifficultyReportSheet';
import DriverMenu from '../components/DriverMenu';
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
  const isPaused            = useShiftStore(s => s.isPaused);
  const pauseShift          = useShiftStore(s => s.pauseShift);
  const resumeShift         = useShiftStore(s => s.resumeShift);
  const dispatcherMessage   = useShiftStore(s => s.dispatcherMessage);
  const dismissDispMsg      = useShiftStore(s => s.dismissDispatcherMessage);
  const user                = useAuthStore(s => s.user);
  const isEnterprise        = user?.planId === 'custom';

  const driverId = user?.id;
  const { enqueue } = useOfflineQueue();
  const driverLoc = useDriverLocation();
  const { score, alert, reason } = useTurnScore(currentStop, shift?.vehicleId, driverLoc?.lat, driverLoc?.lng);

  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const [lastAlert,      setLastAlert]      = useState<'GREEN' | 'AMBER' | 'RED'>('GREEN');
  const [showDifficulty, setShowDifficulty] = useState(false);
  const [ddReported,     setDdReported]     = useState(false);
  const [showMenu,       setShowMenu]       = useState(false);
  const hasGreeted = useRef(false);

  // Reset DD badge when the driver moves to a new stop
  useEffect(() => { setDdReported(false); }, [currentStop?.id]);

  const handleDifficultySubmit = useCallback((categories: string[], note: string) => {
    if (!currentStop) { setShowDifficulty(false); return; }
    enqueue({
      type:       'DIFFICULTY_REPORT',
      stopId:     currentStop.id,
      address:    currentStop.address,
      driverId:   driverId ?? 'unknown',
      routeId:    shift?.routeId ?? 'unknown',
      categories,
      notes:      note,
    } as any);
    setDdReported(true);
    setShowDifficulty(false);
  }, [currentStop, shift, driverId, enqueue]);

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

  if (isPaused) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.app.background }}>
        <ShiftProgressBar current={currentStop.index} total={shift.totalStops} />
        <View style={styles.breakWrap}>
          <Text style={[styles.breakIcon, { color: colors.app.textFaint }]}>II</Text>
          <Text style={[styles.breakTitle, { color: colors.app.text }]}>On a break</Text>
          <Text style={[styles.breakSub, { color: colors.app.textFaint }]}>
            {currentStop.index + 1} of {shift.totalStops} stops remaining
          </Text>
          <TouchableOpacity
            style={[styles.resumeBtn, { backgroundColor: colors.app.success }]}
            onPress={resumeShift}
            accessibilityRole="button"
            accessibilityLabel="Resume shift"
          >
            <Text style={[styles.resumeBtnText, { color: '#fff' }]}>Resume shift</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stopListLink]}
            onPress={() => router.push('/stop-list')}
            accessibilityRole="button"
            accessibilityLabel="View all stops"
          >
            <Text style={[styles.stopListLinkText, { color: colors.app.primary }]}>View all stops</Text>
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
              {alert === 'RED' ? '✕' : '!'}
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
        <View style={styles.stopHeaderRow}>
          <Text style={[styles.stopIndex, { color: colors.app.textFaint }]}>
            Stop {currentStop.index + 1} of {shift.totalStops}
          </Text>
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={() => setShowMenu(true)}
            accessibilityLabel="Driver menu"
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.menuBtnText, { color: colors.app.textFaint }]}>≡</Text>
          </TouchableOpacity>
        </View>
        <Text
          style={[styles.stopAddress, { color: colors.app.text }]}
          numberOfLines={3}
        >
          {currentStop.address}
        </Text>
        {currentStop.communityWarning ? (
          <View style={[styles.communityStrip, { backgroundColor: colors.app.warningBg }]}>
            <Text style={[styles.communityStripText, { color: colors.app.warning }]} numberOfLines={2}>
              {'⚠️'}  {currentStop.communityWarning}
            </Text>
          </View>
        ) : null}
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
                ? `${Math.round(currentStop.distanceM)}m`
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

        {/* Google Maps escape hatch + Break + Add stop mid-shift */}
        <View style={styles.stopCardLinks}>
          <TouchableOpacity
            onPress={() => Linking.openURL(
              `https://maps.google.com/?daddr=${encodeURIComponent(currentStop.address)}`,
            )}
          >
            <Text style={styles.gmapsLink}>Open in Google Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={pauseShift}
            accessibilityRole="button"
            accessibilityLabel="Take a break"
          >
            <Text style={styles.breakLink}>Break</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/route-builder?addMode=1')}
            accessibilityRole="button"
            accessibilityLabel="Add a stop to your route"
          >
            <Text style={styles.addStopLink}>+ Add a stop</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/stop-list')}
            accessibilityRole="button"
            accessibilityLabel="View all stops"
          >
            <Text style={styles.allStopsLink}>All stops</Text>
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

        {/* DD — Difficult Delivery flag (optional, any time before sliding) */}
        {isDriving ? (
          <View style={[styles.actionBtn, { backgroundColor: colors.app.surface, opacity: 0.3 }]}>
            <Text style={styles.actionIcon}>🔒</Text>
            <Text style={styles.actionLabel}>Parked only</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[
              styles.actionBtn,
              { backgroundColor: ddReported ? colors.app.successBg : colors.app.warningBg },
            ]}
            onPress={() => setShowDifficulty(true)}
            accessibilityRole="button"
            accessibilityLabel="Flag a difficult delivery"
          >
            <Text style={[styles.ddBtnText, { color: ddReported ? colors.app.success : colors.app.warning }]}>
              {ddReported ? '✓ DD' : 'DD'}
            </Text>
            <Text style={[styles.actionLabel, { color: ddReported ? colors.app.success : colors.app.warning }]}>
              {ddReported ? 'Reported' : 'Difficult?'}
            </Text>
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

      {/* DD — Difficult Delivery report sheet */}
      {currentStop && (
        <DifficultyReportSheet
          stopId={currentStop.id}
          address={currentStop.address}
          visible={showDifficulty}
          onDismiss={() => setShowDifficulty(false)}
          onSubmit={handleDifficultySubmit}
        />
      )}

      {/* Driver menu — weather + roadworks */}
      <DriverMenu
        visible={showMenu}
        onDismiss={() => setShowMenu(false)}
        lat={driverLoc?.lat ?? null}
        lng={driverLoc?.lng ?? null}
      />
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
  stopHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  menuBtn:       { padding: 4 },
  menuBtnText:   { fontSize: 22, fontWeight: '700', letterSpacing: 1 },
  stopIndex:     { fontSize: 15, fontWeight: '600' },
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
  breakLink:   { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  addStopLink: { fontSize: 13, color: '#00C2A8', fontWeight: '600' },
  // Break / pause screen
  breakWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  breakIcon:     { fontSize: 40, fontWeight: '900', letterSpacing: 8, marginBottom: 16 },
  breakTitle:    { fontSize: 28, fontWeight: '800', marginBottom: 8 },
  breakSub:      { fontSize: 16, marginBottom: 40, textAlign: 'center' },
  resumeBtn: {
    borderRadius: 14, width: '100%', height: 64,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  resumeBtnText: { fontSize: 18, fontWeight: '800' },
  stopListLink:  { paddingVertical: 12 },
  stopListLinkText: { fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
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
  actionIcon:    { fontSize: 20, color: '#94A3B8' },
  actionLabel:   { fontSize: 12, color: '#94A3B8', fontWeight: '600', marginTop: 2 },
  actionBtnText: { fontSize: 16, fontWeight: '700' },
  ddBtnText:     { fontSize: 18, fontWeight: '900' },
  allStopsLink:  { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  communityStrip: {
    marginTop: 10,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  communityStripText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});