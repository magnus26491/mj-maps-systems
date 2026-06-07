import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
} from 'react-native';

interface Props {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function BackgroundLocationDisclosure({ visible, onAccept, onDecline }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Location Access Required</Text>
          <Text style={styles.body}>
            MJ Maps collects your location data to enable:
            {'\n\n'}• Real-time delivery route tracking
            {'\n'}• Turn-by-turn navigation to each stop
            {'\n'}• Accurate ETA updates sent to customers
            {'\n'}• Turn difficulty analysis for route optimisation
            {'\n\n'}
            <Text style={styles.bold}>
              This data is collected even when the app is closed or not in use,
              for the duration of your active delivery shift.
            </Text>
            {'\n\n'}
            Location data is stored securely on EU servers and deleted 30 days
            after each delivery. It is never sold to third parties.
            {'\n\n'}
            You can withdraw consent at any time by ending your shift or
            disabling location in your device settings.
          </Text>
          <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
            <Text style={styles.acceptText}>I Understand — Allow Location</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineBtn} onPress={onDecline}>
            <Text style={styles.declineText}>Decline (location features unavailable)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: '#374151',
    maxWidth: 400,
    width: '100%',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f9fafb',
    marginBottom: 16,
  },
  body: {
    fontSize: 14,
    color: '#d1d5db',
    lineHeight: 22,
    marginBottom: 24,
  },
  bold: {
    fontWeight: '700',
    color: '#f9fafb',
  },
  acceptBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  acceptText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  declineBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  declineText: {
    color: '#6b7280',
    fontSize: 13,
  },
});