import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ServerMessage } from '../lib/types';

interface Props {
  message:    ServerMessage;
  onDismiss: () => void;
}

export default function WorkloadBanner({ message, onDismiss }: Props) {
  const isOverload = message.type === 'WORKLOAD_OVERLOAD';
  return (
    <View style={[styles.banner, isOverload ? styles.overload : styles.warning]}>
      <Text style={styles.text}>
        {isOverload ? '🚨 Route overloaded — ' : '⚠️ High workload — '}
        {message.totalStops as number} stops · safe limit {message.safeStopCount as number}
      </Text>
      <TouchableOpacity onPress={onDismiss} style={styles.dismissBtn}>
        <Text style={styles.dismiss}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, padding: 10, marginTop: 8 },
  warning:  { backgroundColor: '#78350f' },
  overload: { backgroundColor: '#7f1d1d' },
  text:     { color: '#fef3c7', fontSize: 13, flex: 1 },
  dismissBtn: { padding: 12, marginLeft: 2 },
  dismiss:  { color: '#fef3c7', fontWeight: '700' },
});