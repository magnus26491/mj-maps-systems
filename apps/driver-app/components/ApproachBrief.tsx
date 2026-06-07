import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import type { ServerMessage } from '../lib/types';

interface Props {
  message:    ServerMessage;
  onDismiss: () => void;
}

export default function ApproachBrief({ message, onDismiss }: Props) {
  return (
    <Modal transparent animationType="slide" visible>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>📍 Approaching Stop</Text>
          {message.accessNotes ? (
            <>
              <Text style={styles.label}>Access Notes</Text>
              <Text style={styles.text}>{message.accessNotes as string}</Text>
            </>
          ) : null}
          {message.last50m ? (
            <>
              <Text style={styles.label}>Last 50m</Text>
              <Text style={styles.text}>{message.last50m as string}</Text>
            </>
          ) : null}
          <TouchableOpacity style={styles.btn} onPress={onDismiss}>
            <Text style={styles.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' },
  sheet:    { backgroundColor: '#111827', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 10 },
  title:    { color: '#f9fafb', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  label:    { color: '#9ca3af', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  text:     { color: '#f9fafb', fontSize: 15 },
  btn:      { backgroundColor: '#3b82f6', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  btnText:  { color: '#fff', fontWeight: '700', fontSize: 16 },
});