import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Modal } from 'react-native';
import { FailureCode, type FailureCode as FC } from '../constants/events';

const CODES: { code: FC; label: string; desc: string }[] = [
  { code: FailureCode.NO_ANSWER,     label: 'No Answer',             desc: 'Nobody home, card left' },
  { code: FailureCode.ACCESS_DENIED, label: 'Access Denied',         desc: 'Gate locked, intercom failed' },
  { code: FailureCode.SAFE_PLACE,    label: 'Left in Safe Place',    desc: 'Left in a secure location' },
  { code: FailureCode.NEIGHBOUR,     label: 'Left with Neighbour',   desc: 'Neighbour accepted delivery' },
];

interface Props {
  visible:   boolean;
  onClose:   () => void;
  onConfirm: (failureCode: string, accessNotes: string) => void;
}

export default function FailureSheet({ visible, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<FC | null>(null);
  const [notes,     setNotes]   = useState('');

  function handleConfirm() {
    if (!selected) return;
    onConfirm(selected, notes);
    setSelected(null);
    setNotes('');
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Why couldn't you deliver?</Text>
          {CODES.map(c => (
            <TouchableOpacity
              key={c.code}
              style={[styles.option, selected === c.code && styles.optionSelected]}
              onPress={() => setSelected(c.code)}
            >
              <Text style={styles.optionLabel}>{c.label}</Text>
              <Text style={styles.optionDesc}>{c.desc}</Text>
            </TouchableOpacity>
          ))}
          <TextInput
            style={styles.input}
            placeholder="Access notes (optional)"
            placeholderTextColor="#6b7280"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <View style={styles.row}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, !selected && styles.confirmDisabled]}
              onPress={handleConfirm}
              disabled={!selected}
            >
              <Text style={styles.confirmText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop:        { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' },
  sheet:           { backgroundColor: '#111827', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10 },
  title:           { color: '#f9fafb', fontSize: 17, fontWeight: '700', marginBottom: 4 },
  option:          { backgroundColor: '#1f2937', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#374151' },
  optionSelected:  { borderColor: '#3b82f6', backgroundColor: '#1e3a5f' },
  optionLabel:     { color: '#f9fafb', fontWeight: '600', fontSize: 14 },
  optionDesc:      { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  input:           { backgroundColor: '#1f2937', borderRadius: 10, borderWidth: 1, borderColor: '#374151', color: '#f9fafb', padding: 12, fontSize: 14, minHeight: 60, textAlignVertical: 'top' },
  row:             { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn:       { flex: 1, backgroundColor: '#1f2937', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  cancelText:      { color: '#9ca3af', fontWeight: '600' },
  confirmBtn:      { flex: 2, backgroundColor: '#ef4444', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  confirmDisabled: { opacity: 0.4 },
  confirmText:     { color: '#fff', fontWeight: '700', fontSize: 15 },
});