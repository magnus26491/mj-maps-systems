/**
 * ApproachBrief — bottom sheet shown as driver approaches a stop.
 *
 * Shows:
 *  1. Community consensus chips (from difficulty reports by past drivers)
 *  2. access_notes (dispatcher-set or consensus-synthesised text)
 *  3. last_50m instruction
 *
 * Community chips use the same IDs as DifficultyReportSheet — the mapping
 * lives in DIFFICULTY_CATEGORIES. Up to 4 chips shown at a glance.
 */
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import type { ServerMessage } from '../lib/types';
import { DIFFICULTY_CATEGORIES } from './DifficultyReportSheet';

interface Props {
  message:    ServerMessage;
  onDismiss: () => void;
}

const categoryMap = Object.fromEntries(DIFFICULTY_CATEGORIES.map(c => [c.id, c]));

export default function ApproachBrief({ message, onDismiss }: Props) {
  // Community categories can be an array of IDs attached to the server message
  const communityCategories: string[] = (message as any).communityCategories ?? [];
  const topCategories = communityCategories
    .map(id => categoryMap[id])
    .filter(Boolean)
    .slice(0, 4);

  const hasAnything = topCategories.length > 0 || message.accessNotes || message.last50m;

  return (
    <Modal transparent animationType="slide" visible>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>📍 Approaching Stop</Text>

          {/* Community consensus chips */}
          {topCategories.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.label}>Drivers report</Text>
              <View style={styles.chips}>
                {topCategories.map(cat => (
                  <View key={cat.id} style={styles.chip}>
                    <Text style={styles.chipEmoji}>{cat.emoji}</Text>
                    <Text style={styles.chipLabel}>{cat.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Dispatcher / synthesised access notes */}
          {message.accessNotes ? (
            <View style={styles.section}>
              <Text style={styles.label}>Access Notes</Text>
              <Text style={styles.text}>{message.accessNotes as string}</Text>
            </View>
          ) : null}

          {/* Last-50m instruction */}
          {message.last50m ? (
            <View style={styles.section}>
              <Text style={styles.label}>Last 50m</Text>
              <Text style={styles.text}>{message.last50m as string}</Text>
            </View>
          ) : null}

          {!hasAnything && (
            <Text style={styles.empty}>No special notes for this stop.</Text>
          )}

          <TouchableOpacity style={styles.btn} onPress={onDismiss}>
            <Text style={styles.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:  { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' },
  sheet:     { backgroundColor: '#111827', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 4 },
  handle: {
    width: 40, height: 4,
    backgroundColor: '#ffffff30',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  title:     { color: '#f9fafb', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  section:   { gap: 6, marginBottom: 8 },
  label:     { color: '#9ca3af', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  text:      { color: '#f9fafb', fontSize: 15, lineHeight: 22 },
  empty:     { color: '#6b7280', fontSize: 14, fontStyle: 'italic', marginBottom: 8 },
  chips:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#1f2d3d',
    borderRadius: 20, paddingVertical: 7, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#2d4057',
  },
  chipEmoji: { fontSize: 16 },
  chipLabel: { color: '#93c5fd', fontSize: 13, fontWeight: '600' },
  btn:       { backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  btnText:   { color: '#fff', fontWeight: '700', fontSize: 16 },
});
