/**
 * First-run onboarding modal — 4 slides shown once per install.
 * Persisted via AsyncStorage so it only appears once.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet,
  Dimensions, ScrollView, Animated,
} from 'react-native';
import { hasSeenOnboarding, markOnboardingSeen } from '../lib/onboarding';
import { useTheme } from '../lib/theme';

const SLIDES = [
  {
    icon:  '🚚',
    title: 'Set your vehicle',
    body:  'MJ Maps routes around height and weight restrictions specific to your van. Pick your vehicle once — we protect you on every run.',
  },
  {
    icon:  '📍',
    title: 'Add stops your way',
    body:  'Type a postcode, paste a whole list, or search an address. The fastest order for your shift is calculated automatically.',
  },
  {
    icon:  '🗺️',
    title: 'Your HUD guides you',
    body:  'Turn warnings fire before you reach a tight road. Community notes from other drivers are read aloud as you approach each stop.',
  },
  {
    icon:  '✅',
    title: 'Swipe to deliver',
    body:  "Slide the Deliver button when you've dropped the parcel. If a delivery fails, pick the reason and we log it for you.",
  },
  {
    icon:  '⚠️',
    title: 'Flag a difficult stop',
    body:  "Tap DD on the HUD if a stop was tricky — no parking, a gate code, stairs, a dog. One tap. Future drivers will see your warning before they arrive.",
  },
];

export function OnboardingModal() {
  const { colors, isDark } = useTheme();
  const [visible, setVisible] = useState(false);
  const [slide,   setSlide]   = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    hasSeenOnboarding().then(seen => {
      if (!seen) setVisible(true);
    });
  }, []);

  const goTo = (next: number) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setSlide(next), 120);
  };

  const handleNext = () => {
    if (slide < SLIDES.length - 1) {
      goTo(slide + 1);
    } else {
      markOnboardingSeen();
      setVisible(false);
    }
  };

  const handleSkip = () => {
    markOnboardingSeen();
    setVisible(false);
  };

  const current = SLIDES[slide];
  const isLast  = slide === SLIDES.length - 1;

  const bg      = isDark ? '#0f1923' : '#ffffff';
  const overlay = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={[styles.backdrop, { backgroundColor: overlay }]}>
        <View style={[styles.card, { backgroundColor: bg }]}>

          {/* Slide dots */}
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === slide ? colors.app.primary : colors.app.border },
                ]}
              />
            ))}
          </View>

          {/* Content */}
          <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
            <Text style={styles.icon}>{current.icon}</Text>
            <Text style={[styles.title, { color: colors.app.text }]}>{current.title}</Text>
            <Text style={[styles.body, { color: colors.app.textFaint }]}>{current.body}</Text>
          </Animated.View>

          {/* Actions */}
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: colors.app.primary }]}
            onPress={handleNext}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Get started' : 'Next'}
          >
            <Text style={[styles.nextBtnText, { color: '#0A0C10' }]}>
              {isLast ? "Let's go" : 'Next'}
            </Text>
          </TouchableOpacity>

          {!isLast && (
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
            >
              <Text style={[styles.skipText, { color: colors.app.textFaint }]}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    width: Math.min(width - 48, 380),
    borderRadius: 20, padding: 28,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, elevation: 12,
  },
  dots: {
    flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 28,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4,
  },
  content: {
    alignItems: 'center', marginBottom: 28,
  },
  icon:  { fontSize: 52, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  body:  { fontSize: 16, lineHeight: 24, textAlign: 'center' },
  nextBtn: {
    borderRadius: 14, height: 56, alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  nextBtnText: { fontSize: 16, fontWeight: '800' },
  skipBtn:  { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14 },
});
