/**
 * TurnWarningOverlay — full-screen modal overlay triggered when
 * turn score drops to RED (<0.40) within 500m of a stop.
 *
 * Lives above all navigation via the root _layout.tsx portal.
 * Dismissed automatically when score recovers to AMBER/GREEN,
 * or manually by the driver.
 *
 * Design: maximum visibility at a glance — huge red fill, white text,
 * no small detail. Driver may be moving. Single tap to dismiss.
 */
import { useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity,
  StyleSheet, Animated, Dimensions,
  StatusBar,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

const { width: W, height: H } = Dimensions.get('window');

interface Props {
  visible: boolean;
  reason:  string;
  score:   number;
  address: string;
  onDismiss: () => void;
}

export function TurnWarningOverlay({ visible, reason, score, address, onDismiss }: Props) {
  const opacity  = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    if (visible) {
      // Haptic burst + voice on show
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Speech.speak(
        `Warning. Do not enter. ${reason}. Turn around is not possible for your vehicle.`,
        { language: 'en-GB', rate: 1.05 },
      );
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 1,  duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0,  duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity,    { toValue: 0,  duration: 160, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 60, duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <StatusBar backgroundColor="#b71c1c" barStyle="light-content" />
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss turn warning"
      >
        <Animated.View style={[styles.sheet, { opacity, transform: [{ translateY }] }]}>
          {/* Icon */}
          <Text style={styles.icon}>🚨</Text>

          {/* Main warning */}
          <Text style={styles.heading}>DO NOT ENTER</Text>
          <Text style={styles.subheading}>Vehicle cannot turn around</Text>

          {/* Road/reason detail */}
          <View style={styles.reasonBox}>
            <Text style={styles.reasonText}>{reason}</Text>
          </View>

          {/* Address */}
          <Text style={styles.addressLabel}>Stop ahead:</Text>
          <Text style={styles.address} numberOfLines={2}>{address}</Text>

          {/* Score badge */}
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreLabel}>Suitability</Text>
            <Text style={styles.scoreValue}>{Math.round(score * 100)}/100</Text>
          </View>

          {/* Dismiss */}
          <TouchableOpacity
            style={styles.dismissBtn}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="I understand, continue"
          >
            <Text style={styles.dismissText}>I understand — continue anyway</Text>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#b71c1ccc',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#b71c1c',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 28,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 12,
    minHeight: H * 0.55,
    justifyContent: 'center',
  },
  icon:       { fontSize: 64, marginBottom: 4 },
  heading: {
    fontSize: 38, fontWeight: '900',
    color: '#ffffff', letterSpacing: 1.2,
    textAlign: 'center',
  },
  subheading: {
    fontSize: 20, fontWeight: '700',
    color: '#ffcdd2', textAlign: 'center',
  },
  reasonBox: {
    backgroundColor: '#7f0000',
    borderRadius: 12, paddingVertical: 12,
    paddingHorizontal: 16, width: '100%', marginTop: 4,
  },
  reasonText: {
    color: '#ffcdd2', fontSize: 15,
    textAlign: 'center', lineHeight: 22,
  },
  addressLabel: { fontSize: 13, color: '#ef9a9a', fontWeight: '600', marginTop: 4 },
  address: {
    fontSize: 17, color: '#ffffff',
    fontWeight: '700', textAlign: 'center', lineHeight: 24,
  },
  scoreBadge: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: '#7f0000',
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 16,
    marginTop: 4,
  },
  scoreLabel: { fontSize: 13, color: '#ef9a9a', fontWeight: '600' },
  scoreValue: { fontSize: 18, color: '#ffffff', fontWeight: '900' },
  dismissBtn: {
    marginTop: 12,
    borderWidth: 1.5, borderColor: '#ef9a9a',
    borderRadius: 12, paddingVertical: 14,
    paddingHorizontal: 24, minHeight: 56,
    justifyContent: 'center',
  },
  dismissText: { color: '#ffcdd2', fontSize: 15, fontWeight: '600' },
});
