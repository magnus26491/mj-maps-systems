import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { api } from '../lib/api';
import { useAuthStore } from '../lib/auth';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function DeleteAccountModal({ visible, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const { token, logout } = useAuthStore();

  const handleDelete = async () => {
    Alert.alert(
      'Permanently Delete Account',
      'This will permanently delete your account and all associated delivery data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const res = await api.delete('/api/v1/auth/account', token);
              if (res.ok) {
                logout();
              } else {
                const body = await res.json();
                Alert.alert('Error', body.message ?? 'Failed to delete account. Please contact support@mjmaps.co.uk');
              }
            } catch {
              Alert.alert('Error', 'Network error. Please try again or contact support@mjmaps.co.uk');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Delete Account</Text>
          <Text style={styles.body}>
            Deleting your account will permanently remove:{'\n\n'}
            • Your login credentials{'\n'}
            • Your vehicle profile{'\n'}
            • Your delivery history{'\n\n'}
            Completed route records are retained for 7 years for legal compliance,
            but will be anonymised and no longer linked to your account.{'\n\n'}
            This action cannot be undone.
          </Text>
          {loading ? (
            <ActivityIndicator color="#ef4444" />
          ) : (
            <>
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={styles.deleteText}>Delete My Account</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 28,
    borderWidth: 1,
    borderColor: '#374151',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ef4444',
    marginBottom: 16,
  },
  body: {
    fontSize: 14,
    color: '#d1d5db',
    lineHeight: 22,
    marginBottom: 28,
  },
  deleteBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  deleteText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  cancelBtn: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelText: {
    color: '#6b7280',
    fontSize: 14,
  },
});