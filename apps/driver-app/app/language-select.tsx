/**
 * Language selection screen.
 * Accessible from Settings → Language.
 * Changes take effect immediately and persist across app restarts.
 */
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { SUPPORTED_LOCALES } from '../lib/i18n';
import type { Locale } from '../lib/i18n';
import { useLocale } from '../components/LocaleProvider';

export default function LanguageSelectScreen() {
  const { locale, setLocale, t } = useLocale();

  function handleSelect(code: Locale) {
    Haptics.selectionAsync();
    setLocale(code);
  }

  function handleDone() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ {t('go_back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('lang_title')}</Text>
        <Text style={styles.sub}>{t('lang_subtitle')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {SUPPORTED_LOCALES.map(({ code, label, nativeLabel, flag }) => {
          const isOn = locale === code;
          return (
            <TouchableOpacity
              key={code}
              style={[styles.row, isOn && styles.rowOn]}
              onPress={() => handleSelect(code)}
              activeOpacity={0.75}
              accessibilityRole="radio"
              accessibilityState={{ selected: isOn }}
              accessibilityLabel={`${label} — ${nativeLabel}`}
            >
              <Text style={styles.flag}>{flag}</Text>
              <View style={styles.rowText}>
                <Text style={[styles.label, isOn && styles.labelOn]}>{nativeLabel}</Text>
                <Text style={styles.labelEn}>{label}</Text>
              </View>
              {isOn && (
                <View style={styles.check}>
                  <Text style={styles.checkMark}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
          <Text style={styles.doneBtnText}>{t('done')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: '#0f1923' },
  header:     { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  backBtn:    { marginBottom: 12 },
  backText:   { color: '#4fc3f7', fontSize: 16, fontWeight: '600' },
  title:      { fontSize: 26, fontWeight: '800', color: '#f9fafb', marginBottom: 6 },
  sub:        { fontSize: 15, color: '#6b7280', lineHeight: 22 },
  list:       { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1c2a37', borderRadius: 14,
    padding: 16, minHeight: 70,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  rowOn:      { borderColor: '#4fc3f7', backgroundColor: '#0e2030' },
  flag:       { fontSize: 28, marginRight: 14 },
  rowText:    { flex: 1 },
  label:      { fontSize: 17, fontWeight: '700', color: '#c8d8e8' },
  labelOn:    { color: '#4fc3f7' },
  labelEn:    { fontSize: 13, color: '#607080', marginTop: 2 },
  check: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#4fc3f7',
    alignItems: 'center', justifyContent: 'center',
  },
  checkMark:  { color: '#0f1923', fontWeight: '800', fontSize: 14 },
  footer: {
    paddingHorizontal: 16, paddingBottom: 16, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#1c2a37',
  },
  doneBtn: {
    backgroundColor: '#4fc3f7', borderRadius: 14,
    height: 56, alignItems: 'center', justifyContent: 'center',
  },
  doneBtnText: { fontSize: 17, fontWeight: '800', color: '#0f1923' },
});
