/**
 * Voice Navigation settings screen.
 * Accessible from Settings → Voice Navigation.
 *
 * Lists device-installed voices for the current app language, lets
 * drivers adjust rate / pitch / volume with step controls, and plays
 * a live preview so changes are heard immediately.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Switch, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useVoiceSettingsStore } from '../store/voiceSettings';
import { useLocale } from '../components/LocaleProvider';
import { SPEECH_LANG } from '../lib/i18n';

const PREVIEW_TEXT = 'In 200 metres, turn right onto the High Street. Then keep left.';

function StepControl({
  label, value, min, max, step, format, onDecrement, onIncrement,
}: {
  label: string;
  value: number;
  min: number; max: number; step: number;
  format: (v: number) => string;
  onDecrement: () => void;
  onIncrement: () => void;
}) {
  return (
    <View style={styles.stepRow}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepControls}>
        <TouchableOpacity
          style={[styles.stepBtn, value <= min && styles.stepBtnDisabled]}
          onPress={() => { Haptics.selectionAsync(); onDecrement(); }}
          disabled={value <= min}
          accessibilityLabel={`Decrease ${label}`}
        >
          <Text style={[styles.stepBtnText, value <= min && styles.stepBtnTextDisabled]}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepValue}>{format(value)}</Text>
        <TouchableOpacity
          style={[styles.stepBtn, value >= max && styles.stepBtnDisabled]}
          onPress={() => { Haptics.selectionAsync(); onIncrement(); }}
          disabled={value >= max}
          accessibilityLabel={`Increase ${label}`}
        >
          <Text style={[styles.stepBtnText, value >= max && styles.stepBtnTextDisabled]}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function VoiceSettingsScreen() {
  const { locale } = useLocale();
  const speechLang = SPEECH_LANG[locale] ?? 'en-GB';

  const {
    voiceId, rate, pitch, volume, enabled,
    setVoiceId, setRate, setPitch, setVolume, setEnabled, reset,
  } = useVoiceSettingsStore();

  const [voices, setVoices] = useState<Speech.Voice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);

  useEffect(() => {
    Speech.getAvailableVoicesAsync().then(all => {
      // Filter to voices matching the current speech language (e.g. "en-GB")
      // Fall back to language prefix match (e.g. "en") if no exact matches
      const lang = speechLang.toLowerCase();
      const exact = all.filter(v => v.language?.toLowerCase() === lang);
      if (exact.length > 0) {
        setVoices(exact);
      } else {
        const prefix = lang.split('-')[0];
        setVoices(all.filter(v => v.language?.toLowerCase().startsWith(prefix)));
      }
      setLoadingVoices(false);
    }).catch(() => setLoadingVoices(false));
  }, [speechLang]);

  const speakPreview = useCallback(() => {
    if (!enabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Speech.stop();
    Speech.speak(PREVIEW_TEXT, {
      language: speechLang,
      voice:    voiceId ?? undefined,
      rate,
      pitch,
      volume,
    });
  }, [enabled, speechLang, voiceId, rate, pitch, volume]);

  function handleReset() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    reset();
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Voice Navigation</Text>
        <Text style={styles.sub}>Customise the turn-by-turn voice and speaking style.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Master toggle ─────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLeft}>
              <Text style={styles.cardTitle}>Voice navigation</Text>
              <Text style={styles.cardSub}>Spoken turn-by-turn instructions</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={v => { Haptics.selectionAsync(); setEnabled(v); }}
              trackColor={{ false: '#2a3a4a', true: '#4fc3f7' }}
              thumbColor="#fff"
              accessibilityLabel="Enable voice navigation"
            />
          </View>
        </View>

        {/* ── Voice selection ───────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Voice</Text>
          <Text style={styles.cardSub}>
            {loadingVoices
              ? 'Loading installed voices…'
              : voices.length === 0
                ? 'No voices found for your language. Download voices in device Settings → Accessibility → Spoken Content → Voices.'
                : `${voices.length} voice${voices.length !== 1 ? 's' : ''} available for ${speechLang}`}
          </Text>

          {loadingVoices && (
            <ActivityIndicator color="#4fc3f7" style={{ marginTop: 12 }} />
          )}

          {!loadingVoices && voices.length > 0 && (
            <View style={styles.voiceList}>
              {/* Default (system picks) */}
              <TouchableOpacity
                style={[styles.voiceRow, voiceId === null && styles.voiceRowOn]}
                onPress={() => { Haptics.selectionAsync(); setVoiceId(null); }}
                accessibilityRole="radio"
                accessibilityState={{ selected: voiceId === null }}
              >
                <View style={styles.voiceRowText}>
                  <Text style={[styles.voiceName, voiceId === null && styles.voiceNameOn]}>
                    Default
                  </Text>
                  <Text style={styles.voiceSub}>System picks the best available</Text>
                </View>
                {voiceId === null && <View style={styles.check}><Text style={styles.checkMark}>✓</Text></View>}
              </TouchableOpacity>

              {voices.map(v => {
                const isOn = voiceId === v.identifier;
                // Friendly quality label from identifier (Premium > Enhanced > Compact)
                const quality = v.identifier?.includes('premium') ? '★ Premium'
                  : v.identifier?.includes('enhanced') ? '◆ Enhanced'
                  : 'Standard';
                return (
                  <TouchableOpacity
                    key={v.identifier}
                    style={[styles.voiceRow, isOn && styles.voiceRowOn]}
                    onPress={() => { Haptics.selectionAsync(); setVoiceId(v.identifier); }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isOn }}
                    accessibilityLabel={`${v.name ?? v.identifier} — ${quality}`}
                  >
                    <View style={styles.voiceRowText}>
                      <Text style={[styles.voiceName, isOn && styles.voiceNameOn]}>
                        {v.name ?? v.identifier}
                      </Text>
                      <Text style={styles.voiceSub}>{quality} · {v.language}</Text>
                    </View>
                    {isOn && <View style={styles.check}><Text style={styles.checkMark}>✓</Text></View>}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── Speed / pitch / volume ────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Speaking style</Text>

          <StepControl
            label="Speed"
            value={rate}
            min={0.5} max={1.5} step={0.1}
            format={v => `${v.toFixed(1)}×`}
            onDecrement={() => setRate(Math.max(0.5, Math.round((rate - 0.1) * 10) / 10))}
            onIncrement={() => setRate(Math.min(1.5, Math.round((rate + 0.1) * 10) / 10))}
          />
          <StepControl
            label="Pitch"
            value={pitch}
            min={0.5} max={2.0} step={0.1}
            format={v => `${v.toFixed(1)}×`}
            onDecrement={() => setPitch(Math.max(0.5, Math.round((pitch - 0.1) * 10) / 10))}
            onIncrement={() => setPitch(Math.min(2.0, Math.round((pitch + 0.1) * 10) / 10))}
          />
          <StepControl
            label="Volume"
            value={volume}
            min={0} max={1.0} step={0.1}
            format={v => `${Math.round(v * 100)}%`}
            onDecrement={() => setVolume(Math.max(0, Math.round((volume - 0.1) * 10) / 10))}
            onIncrement={() => setVolume(Math.min(1.0, Math.round((volume + 0.1) * 10) / 10))}
          />
        </View>

        {/* ── Language note ─────────────────────────────────────── */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Voice language follows the app language. To change the navigation language, go to
            Settings → Language.
          </Text>
        </View>

      </ScrollView>

      {/* Footer actions */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.previewBtn, !enabled && styles.previewBtnDisabled]}
          onPress={speakPreview}
          disabled={!enabled}
        >
          <Text style={[styles.previewBtnText, !enabled && styles.previewBtnTextDisabled]}>
            ▶  Test voice
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.resetBtn} onPress={handleReset}>
          <Text style={styles.resetBtnText}>Reset to defaults</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: '#0f1923' },
  header:  { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  backBtn: { marginBottom: 12 },
  backText: { color: '#4fc3f7', fontSize: 16, fontWeight: '600' },
  title:   { fontSize: 26, fontWeight: '800', color: '#f9fafb', marginBottom: 6 },
  sub:     { fontSize: 15, color: '#6b7280', lineHeight: 22 },

  scroll:  { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },

  card: {
    backgroundColor: '#1c2a37', borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: '#253545',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#c8d8e8', marginBottom: 4 },
  cardSub:   { fontSize: 13, color: '#607080', lineHeight: 18 },

  toggleRow:  { flexDirection: 'row', alignItems: 'center' },
  toggleLeft: { flex: 1 },

  voiceList: { marginTop: 12, gap: 8 },
  voiceRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#152030', borderRadius: 10,
    padding: 12,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  voiceRowOn:   { borderColor: '#4fc3f7', backgroundColor: '#0e2030' },
  voiceRowText: { flex: 1 },
  voiceName:    { fontSize: 15, fontWeight: '600', color: '#c8d8e8' },
  voiceNameOn:  { color: '#4fc3f7' },
  voiceSub:     { fontSize: 12, color: '#607080', marginTop: 2 },
  check: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#4fc3f7',
    alignItems: 'center', justifyContent: 'center',
  },
  checkMark: { color: '#0f1923', fontWeight: '800', fontSize: 13 },

  stepRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#253545', marginTop: 8 },
  stepLabel:    { flex: 1, fontSize: 15, fontWeight: '600', color: '#c8d8e8' },
  stepControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#253545',
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnDisabled:     { backgroundColor: '#1a2530', opacity: 0.4 },
  stepBtnText:         { color: '#4fc3f7', fontSize: 22, fontWeight: '700', lineHeight: 26 },
  stepBtnTextDisabled: { color: '#607080' },
  stepValue:           { width: 52, textAlign: 'center', fontSize: 15, fontWeight: '700', color: '#f9fafb' },

  infoBox: {
    backgroundColor: '#152030', borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: '#253545',
  },
  infoText: { fontSize: 13, color: '#607080', lineHeight: 20 },

  footer: {
    paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12, gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1c2a37',
  },
  previewBtn: {
    backgroundColor: '#4fc3f7', borderRadius: 14,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  previewBtnDisabled:    { backgroundColor: '#1c2a37', borderWidth: 1, borderColor: '#253545' },
  previewBtnText:        { fontSize: 16, fontWeight: '800', color: '#0f1923' },
  previewBtnTextDisabled: { color: '#607080' },
  resetBtn: {
    height: 44, alignItems: 'center', justifyContent: 'center',
  },
  resetBtnText: { fontSize: 14, fontWeight: '600', color: '#607080' },
});
