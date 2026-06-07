/**
 * components/SlideToConfirm.tsx
 * Slide-to-confirm interaction for delivery actions.
 * Used in both PRO (hud.tsx, stop-delivery.tsx) and ENT (AtStopScreen via BottomButton variant='slide').
 */
import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Vibration,
} from 'react-native';
import * as Haptics from 'expo-haptics';

const THUMB_SIZE   = 68;
const TRACK_HEIGHT = 80;
const THUMB_LEFT   = 6;
const CONFIRM_ICON = '✓';
const DEFAULT_ICON  = '›';

interface SlideToConfirmProps {
  label:      string;
  sublabel?:  string;
  color:      string;
  trackColor: string;
  onConfirm:  () => void;
  testID?:    string;
}

export function SlideToConfirm({
  label,
  sublabel,
  color,
  trackColor,
  onConfirm,
  testID,
}: SlideToConfirmProps) {
  const trackWidth = useRef(0);
  const [thumbIcon, setThumbIcon] = useState(DEFAULT_ICON);
  const slideAnim  = useRef(new Animated.Value(THUMB_LEFT)).current;
  const [progress, setProgress]   = useState(0);

  const threshold = () => trackWidth.current * 0.72;

  const triggerHaptic = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Vibration.vibrate(80);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        setThumbIcon(DEFAULT_ICON);
        setProgress(0);
      },
      onPanResponderMove: (_evt, gesture) => {
        const rawX = THUMB_LEFT + gesture.dx;
        const maxX = trackWidth.current - THUMB_SIZE - THUMB_LEFT;
        const clamped = Math.max(THUMB_LEFT, Math.min(rawX, maxX));
        slideAnim.setValue(clamped);
        const p = (clamped - THUMB_LEFT) / (maxX - THUMB_LEFT);
        setProgress(p);
        if (p >= 0.72 && thumbIcon !== CONFIRM_ICON) {
          setThumbIcon(CONFIRM_ICON);
          triggerHaptic();
        } else if (p < 0.72 && thumbIcon !== DEFAULT_ICON) {
          setThumbIcon(DEFAULT_ICON);
        }
      },
      onPanResponderRelease: (_evt, gesture) => {
        const rawX  = THUMB_LEFT + gesture.dx;
        const maxX  = trackWidth.current - THUMB_SIZE - THUMB_LEFT;
        const pos    = Math.max(THUMB_LEFT, Math.min(rawX, maxX));
        const p      = (pos - THUMB_LEFT) / (maxX - THUMB_LEFT);

        if (p >= 0.72) {
          // Confirmed — snap back and trigger
          Animated.spring(slideAnim, {
            toValue:  THUMB_LEFT,
            useNativeDriver: false,
          }).start(() => {
            setThumbIcon(DEFAULT_ICON);
            setProgress(0);
            onConfirm();
          });
        } else {
          // Not past threshold — snap back
          Animated.spring(slideAnim, {
            toValue:  THUMB_LEFT,
            useNativeDriver: false,
          }).start(() => {
            setThumbIcon(DEFAULT_ICON);
            setProgress(0);
          });
        }
      },
    }),
  ).current;

  return (
    <View
      style={[styles.track, { backgroundColor: trackColor }]}
      onLayout={e => { trackWidth.current = e.nativeEvent.layout.width; }}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Slide to ${label}`}
      accessibilityHint="Slide right to confirm"
    >
      <View style={styles.labelContainer}>
        <Text style={[styles.label, { opacity: Math.max(0, 1 - progress * 1.4) }]}>
          {label}
        </Text>
        {sublabel && (
          <Text style={[styles.sublabel, { opacity: Math.max(0, 1 - progress * 1.4) }]}>
            {sublabel}
          </Text>
        )}
      </View>

      <Animated.View
        style={[
          styles.thumb,
          {
            backgroundColor: color,
            left: slideAnim,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Text style={styles.thumbIcon}>{thumbIcon}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex:          2,
    minHeight:     TRACK_HEIGHT,
    borderRadius:  16,
    justifyContent: 'center',
    overflow:      'hidden',
    marginLeft:    8,
  },
  labelContainer: {
    position:       'absolute',
    left:           THUMB_SIZE + 12,
    right:          THUMB_SIZE + 12,
    alignItems:    'center',
  },
  label:   { color: '#fff', fontSize: 17, fontWeight: '800' },
  sublabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2 },
  thumb: {
    position:       'absolute',
    top:            (TRACK_HEIGHT - THUMB_SIZE) / 2,
    width:          THUMB_SIZE,
    height:         THUMB_SIZE,
    borderRadius:   THUMB_SIZE / 2,
    justifyContent: 'center',
    alignItems:     'center',
    elevation:      4,
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 2 },
    shadowOpacity:  0.3,
    shadowRadius:   4,
  },
  thumbIcon: { color: '#fff', fontSize: 26, fontWeight: '900' },
});