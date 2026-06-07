import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { Stop } from '../lib/types';

const STATUS_COLOR: Record<string, string> = {
  pending:   '#3b82f6',
  completed: '#22c55e',
  failed:    '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  pending:   '⏳ Pending',
  completed: '✅ Done',
  failed:    '❌ Failed',
};

interface Props {
  stop:    Stop;
  onPress: () => void;
}

export default function StopCard({ stop, onPress }: Props) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.seq, { backgroundColor: STATUS_COLOR[stop.status] + '33' }]}>
        <Text style={[styles.seqNum, { color: STATUS_COLOR[stop.status] }]}>
          {stop.sequence}
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.address} numberOfLines={2}>{stop.address}</Text>
        {stop.accessNotes && (
          <Text style={styles.notes} numberOfLines={1}>📌 {stop.accessNotes}</Text>
        )}
        {stop.failureCode && (
          <Text style={styles.failure}>{stop.failureCode}</Text>
        )}
      </View>
      <Text style={[styles.status, { color: STATUS_COLOR[stop.status] }]}>
        {STATUS_LABEL[stop.status]}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card:     { flexDirection: 'row', backgroundColor: '#111827', borderBottomWidth: 1, borderColor: '#1f2937', padding: 14, alignItems: 'center', gap: 12 },
  seq:      { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  seqNum:   { fontWeight: '700', fontSize: 15 },
  body:     { flex: 1 },
  address:  { color: '#f9fafb', fontSize: 14, fontWeight: '500' },
  notes:    { color: '#9ca3af', fontSize: 12, marginTop: 3 },
  failure:  { color: '#f87171', fontSize: 12, marginTop: 2 },
  status:   { fontSize: 12, fontWeight: '600' },
});