/**
 * DifficultyReportSheet
 *
 * Post-delivery bottom sheet. Appears automatically after a driver confirms
 * a delivery. Driver taps one or more category chips (multi-select) and
 * optionally types a short note. Submits via offline queue so it works
 * without signal.
 *
 * Design constraints:
 *  · Bottom thumb zone, large touch targets (min 56px)
 *  · 3-column chip grid — scannable in one glance
 *  · Skip is always visible — never blocks the delivery flow
 *  · Offline-safe — enqueued if no connectivity
 */
import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput,
  StyleSheet, Modal, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from './ThemeContext';

// ── Category definitions ─────────────────────────────────────────────────────
// These mirror the server-side DIFFICULTY_CATEGORIES in delivery-difficulty.ts.
// IDs must match exactly — they're sent to the API.
export const DIFFICULTY_CATEGORIES = [
  { id: 'NO_PARKING',    emoji: '🅿️',  label: 'No parking' },
  { id: 'LONG_WALK',     emoji: '🚶',  label: 'Long walk' },
  { id: 'STAIRS_ONLY',   emoji: '🏗️',  label: 'Stairs only' },
  { id: 'HARD_TO_FIND',  emoji: '🔍',  label: 'Hard to find' },
  { id: 'GATE_CODE',     emoji: '🔑',  label: 'Gate / code' },
  { id: 'DOG',           emoji: '🐕',  label: 'Dog present' },
  { id: 'INTERCOM',      emoji: '🔔',  label: 'Intercom needed' },
  { id: 'BACK_ENTRANCE', emoji: '🚪',  label: 'Side / back door' },
  { id: 'NARROW_ROAD',   emoji: '⬜',  label: 'Narrow road' },
  { id: 'SLOW_RESPONSE', emoji: '⏱️',  label: 'Slow to answer' },
] as const;

type CategoryId = (typeof DIFFICULTY_CATEGORIES)[number]['id'];

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  stopId:  string;
  address: string;
  visible: boolean;
  onDismiss: () => void;
  onSubmit: (categories: CategoryId[], note: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DifficultyReportSheet({
  stopId, address, visible, onDismiss, onSubmit,
}: Props) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<Set<CategoryId>>(new Set());
  const [note, setNote] = useState('');

  const toggle = useCallback((id: CategoryId) => {
    Haptics.selectionAsync();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (selected.size === 0) { onDismiss(); return; }
    onSubmit([...selected] as CategoryId[], note.trim());
    setSelected(new Set());
    setNote('');
  }, [selected, note, onSubmit, onDismiss]);

  const handleSkip = useCallback(() => {
    setSelected(new Set());
    setNote('');
    onDismiss();
  }, [onDismiss]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleSkip}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleSkip} />

        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.handle} />
            <Text style={[styles.title, { color: colors.text }]}>
              Anything tricky here?
            </Text>
            <Text style={[styles.subtitle, { color: colors.subtext }]}>
              Tap all that apply — future drivers will see this
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Category chip grid */}
            <View style={styles.chipGrid}>
              {DIFFICULTY_CATEGORIES.map(cat => {
                const isOn = selected.has(cat.id);
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.chip,
                      { borderColor: isOn ? colors.blue : colors.surfaceAlt },
                      isOn && { backgroundColor: `${colors.blue}22` },
                    ]}
                    onPress={() => toggle(cat.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isOn }}
                    accessibilityLabel={cat.label}
                  >
                    <Text style={styles.chipEmoji}>{cat.emoji}</Text>
                    <Text
                      style={[
                        styles.chipLabel,
                        { color: isOn ? colors.blue : colors.subtext },
                      ]}
                      numberOfLines={2}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Optional note */}
            <TextInput
              style={[
                styles.noteInput,
                { backgroundColor: colors.background, color: colors.text, borderColor: colors.surfaceAlt },
              ]}
              placeholder="Add a note (optional)"
              placeholderTextColor={colors.subtext}
              value={note}
              onChangeText={t => setNote(t.slice(0, 120))}
              maxLength={120}
              returnKeyType="done"
              accessibilityLabel="Additional note"
            />
            {note.length > 100 && (
              <Text style={[styles.charCount, { color: colors.subtext }]}>
                {120 - note.length} characters left
              </Text>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={[styles.actions, { backgroundColor: colors.surface }]}>
            <TouchableOpacity
              style={[styles.skipBtn, { borderColor: colors.surfaceAlt }]}
              onPress={handleSkip}
              accessibilityRole="button"
              accessibilityLabel="Skip report"
            >
              <Text style={[styles.skipLabel, { color: colors.subtext }]}>Skip</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: selected.size > 0 ? colors.blue : colors.surfaceAlt,
                  opacity: selected.size > 0 ? 1 : 0.5,
                },
              ]}
              onPress={handleSubmit}
              accessibilityRole="button"
              accessibilityLabel="Submit difficulty report"
            >
              <Text style={styles.submitLabel}>
                {selected.size > 0 ? `Report (${selected.size})` : 'Select one to report'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex:        { flex: 1, justifyContent: 'flex-end' },
  backdrop:    { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4,
    backgroundColor: '#ffffff30',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  header:     { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  title:      { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  subtitle:   { fontSize: 14, lineHeight: 20 },
  scroll:     { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  chip: {
    width: '30%',
    minWidth: 100,
    flexGrow: 1,
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
    minHeight: 72,
    justifyContent: 'center',
  },
  chipEmoji:  { fontSize: 24 },
  chipLabel:  { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  noteInput: {
    borderRadius: 12, padding: 14,
    fontSize: 15, borderWidth: 1,
    marginBottom: 4,
  },
  charCount:  { fontSize: 12, textAlign: 'right', marginBottom: 8 },
  actions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 16,
    paddingBottom: 32,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ffffff15',
  },
  skipBtn: {
    flex: 0, paddingHorizontal: 20, height: 56,
    borderRadius: 14, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  skipLabel:  { fontSize: 16, fontWeight: '600' },
  submitBtn: {
    flex: 1, height: 56,
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  submitLabel: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
