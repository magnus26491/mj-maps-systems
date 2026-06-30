/**
 * PermissionGate — full-screen onboarding wizard for OS permissions.
 *
 * Shows once after first login when location is not yet granted.
 * Steps: Location → Background Location → Notifications → Camera
 * Each step explains WHY before triggering the OS dialog.
 * On permanent denial, shows "Open Settings" instead of "Allow".
 * Skipping non-critical steps (notifications, camera) is allowed.
 * Cannot skip Location — it's required to use the app.
 */
import { useEffect, useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Dimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { usePermissions } from '../hooks/usePermissions';
import { useLocale } from './LocaleProvider';
import { useAuthStore } from '../lib/auth';
import type { PermStatus } from '../hooks/usePermissions';

const { width } = Dimensions.get('window');

interface PermStep {
  key:       'location' | 'locationBackground' | 'notifications' | 'camera';
  icon:      string;
  titleKey:  string;
  whyKey:    string;
  whyText?:  string; // overrides t(whyKey) when set — used for plan-specific copy
  critical:  boolean;
  request:   () => Promise<PermStatus>;
}

export function PermissionGate() {
  const { t } = useLocale();
  const user = useAuthStore(s => s.user);
  const isEnterprise = user?.planId === 'custom';
  const {
    perms, loaded,
    requestLocation, requestLocationBackground,
    requestNotifications, requestCamera,
    openSettings,
  } = usePermissions();

  const [stepIndex, setStepIndex] = useState(0);
  const [done, setDone]           = useState(false);
  const [requesting, setRequesting] = useState(false);
  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const steps: PermStep[] = [
    {
      key: 'location', icon: '📍',
      titleKey: 'perm_loc_title', whyKey: 'perm_loc_why',
      critical: true, request: requestLocation,
    },
    {
      key: 'locationBackground', icon: '🗺️',
      titleKey: 'perm_loc_bg_title', whyKey: 'perm_loc_bg_why',
      critical: false, request: requestLocationBackground,
    },
    {
      key: 'notifications', icon: '🔔',
      titleKey: 'perm_notif_title', whyKey: 'perm_notif_why',
      // Pro drivers: no dispatcher — explain self-service use case instead
      whyText: isEnterprise
        ? undefined
        : 'Get shift reminders and real-time route alerts — even when the screen is off.',
      critical: false, request: requestNotifications,
    },
    // Camera is only relevant for enterprise drivers — POD photos for fleet compliance
    ...(isEnterprise ? [{
      key: 'camera' as const, icon: '📷',
      titleKey: 'perm_camera_title', whyKey: 'perm_camera_why',
      critical: false, request: requestCamera,
    }] : []),
  ];

  // Skip steps that are already granted or denied (from a previous session)
  useEffect(() => {
    if (!loaded) return;
    // Check if all already resolved
    const allResolved = steps.every(s => perms[s.key] !== 'undetermined');
    if (allResolved) { setDone(true); return; }
    // Skip to the first undetermined step
    const firstPending = steps.findIndex(s => perms[s.key] === 'undetermined');
    if (firstPending === -1) { setDone(true); return; }
    setStepIndex(firstPending);
  }, [loaded]);

  // Also mark done if location becomes granted mid-flow
  useEffect(() => {
    if (!loaded) return;
    const remaining = steps.slice(stepIndex).filter(s => perms[s.key] === 'undetermined');
    if (remaining.length === 0) setDone(true);
  }, [perms, stepIndex, loaded]);

  function animateTransition(cb: () => void) {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(slideAnim, { toValue: -40, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    ]).start(() => {
      cb();
      slideAnim.setValue(40);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    });
  }

  function advance() {
    const next = steps.findIndex((s, i) => i > stepIndex && perms[s.key] === 'undetermined');
    if (next === -1) {
      animateTransition(() => setDone(true));
    } else {
      animateTransition(() => setStepIndex(next));
    }
  }

  async function handleAllow() {
    if (requesting) return;
    setRequesting(true);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await steps[stepIndex].request();
    } finally {
      setRequesting(false);
      advance();
    }
  }

  function handleSkip() {
    Haptics.selectionAsync();
    advance();
  }

  // Not ready or already done
  if (!loaded || done) return null;

  const step      = steps[stepIndex];
  const status    = perms[step.key];
  const isPermanentlyDenied = status === 'denied';
  const totalVisible = steps.length;
  const progressFraction = (stepIndex + 1) / totalVisible;

  return (
    <View style={styles.overlay}>
      <SafeAreaView style={styles.safe}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('perm_setup_title' as any)}</Text>
          <Text style={styles.headerSub}>{t('perm_setup_sub' as any)}</Text>
          {/* Progress dots */}
          <View style={styles.dots}>
            {steps.map((s, i) => (
              <View
                key={s.key}
                style={[
                  styles.dot,
                  i === stepIndex && styles.dotActive,
                  perms[s.key] === 'granted' && styles.dotGranted,
                  perms[s.key] === 'denied'  && styles.dotDenied,
                ]}
              />
            ))}
          </View>
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: `${progressFraction * 100}%` }]} />
          </View>
        </View>

        {/* ── Permission card ── */}
        <Animated.View style={[
          styles.card,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}>
          <Text style={styles.icon}>{step.icon}</Text>
          <Text style={styles.permTitle}>{t(step.titleKey as any)}</Text>
          <Text style={styles.permWhy}>{step.whyText ?? t(step.whyKey as any)}</Text>

          {isPermanentlyDenied && (
            <View style={styles.deniedTip}>
              <Text style={styles.deniedTipText}>
                {t('perm_denied_tip' as any)}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* ── Actions ── */}
        <View style={styles.actions}>
          {isPermanentlyDenied ? (
            <>
              <TouchableOpacity style={styles.primaryBtn} onPress={openSettings}>
                <Text style={styles.primaryBtnText}>{t('perm_open_settings' as any)} →</Text>
              </TouchableOpacity>
              {!step.critical && (
                <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                  <Text style={styles.skipBtnText}>{t('skip' as any)}</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.primaryBtn, requesting && styles.primaryBtnDisabled]}
                onPress={handleAllow}
                disabled={requesting}
              >
                <Text style={styles.primaryBtnText}>
                  {requesting ? '…' : `${t('perm_allow' as any)} →`}
                </Text>
              </TouchableOpacity>
              {!step.critical && (
                <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
                  <Text style={styles.skipBtnText}>{t('perm_not_now' as any)}</Text>
                </TouchableOpacity>
              )}
              {step.critical && (
                <Text style={styles.criticalNote}>
                  Location is required to use MJ Maps
                </Text>
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a1520',
    zIndex: 9999,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 32,
    marginBottom: 24,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f9fafb',
    marginBottom: 8,
    textAlign: 'center',
  },
  headerSub: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1f2937',
  },
  dotActive:  { backgroundColor: '#4fc3f7', width: 24 },
  dotGranted: { backgroundColor: '#22c55e' },
  dotDenied:  { backgroundColor: '#ef4444' },
  progressTrack: {
    width: width - 48,
    height: 3,
    backgroundColor: '#1f2937',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#4fc3f7',
    borderRadius: 2,
  },
  card: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  icon: {
    fontSize: 80,
    marginBottom: 28,
  },
  permTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#f9fafb',
    marginBottom: 16,
    textAlign: 'center',
  },
  permWhy: {
    fontSize: 17,
    color: '#9ca3af',
    lineHeight: 26,
    textAlign: 'center',
    maxWidth: 340,
  },
  deniedTip: {
    marginTop: 20,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  deniedTipText: {
    color: '#f59e0b',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  actions: {
    paddingBottom: Platform.OS === 'ios' ? 8 : 24,
    paddingTop: 16,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: '#4fc3f7',
    borderRadius: 16,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0a1520',
  },
  skipBtn: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: {
    fontSize: 15,
    color: '#4b5563',
    fontWeight: '500',
  },
  criticalNote: {
    textAlign: 'center',
    fontSize: 13,
    color: '#4b5563',
    paddingBottom: 4,
  },
});
