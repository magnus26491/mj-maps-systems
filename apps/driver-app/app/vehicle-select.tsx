/**
 * Vehicle Selector Screen
 *
 * Shows all vehicle profiles grouped by class.
 * For HGV and articulated vehicles the driver can override the default
 * height — articulated trailers vary (double-deck, box, curtainsider, no
 * trailer). Stored as customHeightM in the shift store and used by
 * bridge + navigation guard checks.
 *
 * Profile keys match VEHICLE_PROFILES IDs exactly (e.g. 'lwb_van').
 */
import { useState, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  TextInput, Platform, KeyboardAvoidingView, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { VEHICLE_PROFILES } from '../../../packages/vehicle-profiles/index';
import type { VehicleId, VehicleClass } from '../../../packages/vehicle-profiles/index';
import { useShiftStore } from '../store/shift';
import { ThemeProvider, useTheme } from '../components/ThemeContext';
import { VehicleIcon } from '../components/VehicleIcon';

// ── Static display data ───────────────────────────────────────────────────────

const CLASS_META: Record<VehicleClass, { label: string; tagline: string }> = {
  light: { label: 'Light Vehicles',  tagline: 'Cars, bikes & towed units' },
  van:   { label: 'Vans',            tagline: 'Panel vans, tippers & minibuses' },
  hgv:   { label: 'HGV / Rigid',    tagline: 'Heavy goods vehicles, 7.5t – 26t' },
  artic: { label: 'Articulated',     tagline: 'Artic trucks — set your trailer height below' },
};

const CLASS_ORDER: VehicleClass[] = ['light', 'van', 'hgv', 'artic'];

const GROUPS = CLASS_ORDER.map(cls => ({
  cls,
  meta: CLASS_META[cls],
  profiles: Object.values(VEHICLE_PROFILES).filter(p => p.vehicleClass === cls),
}));

const needsHeightOverride = (cls: VehicleClass) => cls === 'hgv' || cls === 'artic';

// ── Inner component ──────────────────────────────────────────────────────────

function VehicleSelectInner() {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<VehicleId | null>(null);
  const [heightUnit, setHeightUnit] = useState<'m' | 'ft'>('m');
  const [heightInput, setHeightInput] = useState('');
  const [heightError, setHeightError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const selectedProfile = selected ? VEHICLE_PROFILES[selected] : null;
  const showHeightInput = !!selectedProfile && needsHeightOverride(selectedProfile.vehicleClass);

  const handleSelect = useCallback((id: VehicleId) => {
    Haptics.selectionAsync();
    setSelected(id);
    setHeightError(null);
    const profile = VEHICLE_PROFILES[id];
    if (needsHeightOverride(profile.vehicleClass)) {
      const defaultH = profile.heightM;
      setHeightInput(heightUnit === 'm'
        ? defaultH.toFixed(1)
        : (defaultH / 0.3048).toFixed(1),
      );
    }
  }, [heightUnit]);

  const toggleUnit = useCallback((unit: 'm' | 'ft') => {
    if (unit === heightUnit) return;
    setHeightUnit(unit);
    const val = parseFloat(heightInput);
    if (!isNaN(val)) {
      setHeightInput(unit === 'ft'
        ? (val / 0.3048).toFixed(1)
        : (val * 0.3048).toFixed(2),
      );
    }
  }, [heightUnit, heightInput]);

  const resolveHeightM = (): number | null => {
    if (!showHeightInput) return null;
    const val = parseFloat(heightInput);
    if (isNaN(val)) return null;
    return heightUnit === 'm' ? val : val * 0.3048;
  };

  const handleConfirm = useCallback(() => {
    Keyboard.dismiss();

    if (!selected) {
      // No vehicle selected — use sensible SWB van default
      Haptics.selectionAsync();
      const store = useShiftStore.getState();
      store.setVehicleId('swb_van');
      store.setCustomHeight(null);
      router.back();
      return;
    }

    if (showHeightInput && heightInput.trim()) {
      const hm = resolveHeightM();
      if (hm === null || hm < 2.0 || hm > 5.5) {
        setHeightError('Height must be between 2.0 m and 5.5 m (6.6 – 18 ft)');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const store = useShiftStore.getState();
    store.setVehicleId(selected);
    store.setCustomHeight(resolveHeightM());
    router.back();
  }, [selected, showHeightInput, heightInput, heightUnit]);

  const heightM = resolveHeightM();
  const heightHint = heightM !== null && !heightError
    ? (heightUnit === 'm'
        ? `≈ ${(heightM / 0.3048).toFixed(1)} ft`
        : `= ${heightM.toFixed(2)} m`)
    : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>What's your vehicle?</Text>
          <Text style={[styles.sub, { color: colors.subtext }]}>
            Adding your vehicle lets MJ Maps warn you about tight turns, low bridges and
            weight restrictions before you're committed. This is optional — we use a
            sensible default if you skip.
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {GROUPS.map(({ cls, meta, profiles }) => (
            <View key={cls} style={styles.section}>
              {/* Section header */}
              <View style={[styles.sectionHead, { borderLeftColor: colors.blue }]}>
                <View style={styles.sectionText}>
                  <Text style={[styles.sectionLabel, { color: colors.text }]}>{meta.label}</Text>
                  <Text style={[styles.sectionTagline, { color: colors.subtext }]}>{meta.tagline}</Text>
                </View>
              </View>

              {/* 2-column card grid */}
              <View style={styles.grid}>
                {profiles.map(profile => {
                  const isOn = selected === profile.id;
                  return (
                    <TouchableOpacity
                      key={profile.id}
                      style={[
                        styles.card,
                        { backgroundColor: colors.surface, borderColor: colors.surfaceAlt },
                        isOn && { borderColor: colors.blue, backgroundColor: `${colors.blue}18` },
                      ]}
                      onPress={() => handleSelect(profile.id as VehicleId)}
                      activeOpacity={0.75}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isOn }}
                      accessibilityLabel={profile.label}
                    >
                      {/* Selected checkmark */}
                      {isOn && (
                        <View style={[styles.check, { backgroundColor: colors.blue }]}>
                          <Text style={styles.checkMark}>✓</Text>
                        </View>
                      )}

                      <View style={styles.cardIcon}>
                        <VehicleIcon
                          id={profile.id as VehicleId}
                          size={48}
                          color={isOn ? colors.blue : colors.subtext}
                        />
                      </View>
                      <Text
                        style={[styles.cardLabel, { color: isOn ? colors.blue : colors.text }]}
                        numberOfLines={2}
                      >
                        {profile.label}
                      </Text>

                      {/* Spec pills */}
                      <View style={styles.pills}>
                        <View style={[styles.pill, { backgroundColor: colors.background }]}>
                          <Text style={[styles.pillText, { color: colors.subtext }]}>{profile.heightM}m</Text>
                        </View>
                        <View style={[styles.pill, { backgroundColor: colors.background }]}>
                          <Text style={[styles.pillText, { color: colors.subtext }]}>{profile.gvwT}t</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {/* ── Custom height input (HGV / artic) ─────────────────────────── */}
          {showHeightInput && (
            <View style={[styles.heightSection, { backgroundColor: colors.surface, borderColor: colors.surfaceAlt }]}>
              <Text style={[styles.heightTitle, { color: colors.text }]}>📐 Set Your Vehicle Height</Text>
              <Text style={[styles.heightSub, { color: colors.subtext }]}>
                {selectedProfile?.vehicleClass === 'artic'
                  ? 'Artic trailer heights vary — double-deck (4.9m), standard box (4.2m), curtainsider (4.2m), no trailer (3.4m). Set your actual loaded height.'
                  : 'Your actual loaded height determines which bridges and height restrictions are safe for you.'}
              </Text>

              {/* m / ft toggle */}
              <View style={[styles.unitRow, { backgroundColor: colors.background }]}>
                <TouchableOpacity
                  style={[styles.unitBtn, heightUnit === 'm' && { backgroundColor: colors.blue }]}
                  onPress={() => toggleUnit('m')}
                >
                  <Text style={[styles.unitText, { color: heightUnit === 'm' ? '#fff' : colors.subtext }]}>
                    Metres (m)
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.unitBtn, heightUnit === 'ft' && { backgroundColor: colors.blue }]}
                  onPress={() => toggleUnit('ft')}
                >
                  <Text style={[styles.unitText, { color: heightUnit === 'ft' ? '#fff' : colors.subtext }]}>
                    Feet (ft)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Numeric input */}
              <View style={styles.heightInputRow}>
                <TextInput
                  style={[
                    styles.heightInput,
                    { backgroundColor: colors.background, color: colors.text, borderColor: colors.surfaceAlt },
                    !!heightError && { borderColor: colors.red ?? '#ef4444' },
                  ]}
                  value={heightInput}
                  onChangeText={t => { setHeightInput(t); setHeightError(null); }}
                  keyboardType="decimal-pad"
                  placeholder={heightUnit === 'm' ? '4.20' : '13.8'}
                  placeholderTextColor={colors.subtext}
                  accessibilityLabel="Vehicle height"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                />
                <View style={[styles.unitSuffix, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={[styles.unitSuffixText, { color: colors.text }]}>{heightUnit}</Text>
                </View>
              </View>

              {heightError && (
                <Text style={[styles.heightError, { color: colors.red ?? '#ef4444' }]}>{heightError}</Text>
              )}
              {heightHint && !heightError && (
                <Text style={[styles.heightHint, { color: colors.subtext }]}>{heightHint}</Text>
              )}
            </View>
          )}

          <View style={{ height: 8 }} />
        </ScrollView>

        {/* ── Confirm footer ───────────────────────────────────────────────── */}
        <View style={[styles.footer, { borderTopColor: colors.surfaceAlt }]}>
          {selectedProfile && (
            <Text style={[styles.footerMeta, { color: colors.subtext }]} numberOfLines={1}>
              {selectedProfile.label}
              {'  ·  '}
              {selectedProfile.lengthM}m long
              {'  ·  '}
              {showHeightInput && heightM
                ? `${heightM.toFixed(2)}m high (custom)`
                : `${selectedProfile.heightM}m high`}
            </Text>
          )}
          <TouchableOpacity
            style={[
              styles.cta,
              { backgroundColor: selected ? colors.blue : colors.surfaceAlt },
            ]}
            onPress={handleConfirm}
            disabled={!selected}
            accessibilityRole="button"
            accessibilityLabel="Confirm vehicle selection"
          >
            <Text style={[styles.ctaText, { color: selected ? '#fff' : colors.subtext }]}>
              {selected ? 'Confirm Vehicle →' : 'Select a vehicle above'}
            </Text>
          </TouchableOpacity>

          {selected && (
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleConfirm}
              accessibilityRole="button"
            >
              <Text style={[styles.skipBtnText, { color: colors.subtext }]}>
                Or{' '}
                <Text style={{ color: colors.teal ?? '#00C2A8' }}>skip and use default →</Text>
              </Text>
            </TouchableOpacity>
          )}

          {!selected && (
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={handleConfirm}
              accessibilityRole="button"
            >
              <Text style={[styles.skipBtnText, { color: colors.subtext }]}>
                Not sure?{' '}
                <Text style={{ color: colors.teal ?? '#00C2A8' }}>continue with default profile →</Text>
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export default function VehicleSelectScreen() {
  return (
    <ThemeProvider>
      <VehicleSelectInner />
    </ThemeProvider>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:         { flex: 1 },
  flex:         { flex: 1 },
  header: {
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16,
  },
  title:        { fontSize: 26, fontWeight: '800', marginBottom: 6 },
  sub:          { fontSize: 15, lineHeight: 22 },

  scroll:       { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },

  section:      { marginBottom: 24 },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center',
    borderLeftWidth: 3, paddingLeft: 10,
    marginBottom: 12,
  },
  sectionText:  { flex: 1 },
  sectionLabel: { fontSize: 16, fontWeight: '700' },
  sectionTagline: { fontSize: 13, marginTop: 2 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    width: '47.5%',
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    minHeight: 110,
    justifyContent: 'flex-end',
    position: 'relative',
  },
  check: {
    position: 'absolute', top: 8, right: 8,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  checkMark:    { color: '#fff', fontSize: 12, fontWeight: '800' },
  cardIcon:     { marginBottom: 6 },
  cardLabel:    { fontSize: 14, fontWeight: '700', lineHeight: 18, marginBottom: 8 },
  pills:        { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pill:         { borderRadius: 6, paddingVertical: 3, paddingHorizontal: 7 },
  pillText:     { fontSize: 12, fontWeight: '600' },

  heightSection: {
    borderRadius: 16, borderWidth: 1,
    padding: 18, marginBottom: 8, gap: 12,
  },
  heightTitle:  { fontSize: 16, fontWeight: '800' },
  heightSub:    { fontSize: 13, lineHeight: 20 },

  unitRow: {
    flexDirection: 'row', borderRadius: 10, overflow: 'hidden',
  },
  unitBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10,
  },
  unitText:     { fontSize: 14, fontWeight: '700' },

  heightInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 0,
  },
  heightInput: {
    flex: 1, height: 56, fontSize: 28, fontWeight: '700',
    paddingHorizontal: 16,
    borderWidth: 1.5, borderRightWidth: 0,
    borderTopLeftRadius: 12, borderBottomLeftRadius: 12,
  },
  unitSuffix: {
    width: 56, height: 56, alignItems: 'center', justifyContent: 'center',
    borderTopRightRadius: 12, borderBottomRightRadius: 12,
  },
  unitSuffixText: { fontSize: 18, fontWeight: '700' },

  heightError: { fontSize: 13, fontWeight: '600' },
  heightHint:  { fontSize: 13 },

  footer: {
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  footerMeta: { fontSize: 13, textAlign: 'center' },
  cta: {
    height: 58, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText:    { fontSize: 17, fontWeight: '800' },
  skipBtn:    { paddingVertical: 10, alignItems: 'center' },
  skipBtnText: { fontSize: 14 },
});
