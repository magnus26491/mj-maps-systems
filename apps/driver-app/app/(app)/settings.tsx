import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { apiGetVehicles, apiSetVehicle, apiRegisterFcmToken } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import type { Vehicle } from '../../lib/types';

export default function SettingsScreen() {
  const user   = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);

  const { data } = useQuery({
    queryKey: ['vehicles'],
    queryFn:  apiGetVehicles,
  });

  const vehicles = data?.data ?? [];

  async function selectVehicle(v: Vehicle) {
    try {
      await apiSetVehicle(v.id);
      Alert.alert('Vehicle updated', `${v.make} ${v.model} set as your vehicle.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function handleLogout() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <Text style={styles.infoRow}>
          Name: <Text style={styles.value}>{user?.name ?? '—'}</Text>
        </Text>
        <Text style={styles.infoRow}>
          Email: <Text style={styles.value}>{user?.email ?? '—'}</Text>
        </Text>
        <Text style={styles.infoRow}>
          Plan: <Text style={styles.value}>{user?.planId?.toUpperCase() ?? '—'}</Text>
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Select Vehicle</Text>
      <FlatList
        data={vehicles}
        keyExtractor={v => v.id}
        renderItem={({ item: v }) => (
          <TouchableOpacity style={styles.vehicleRow} onPress={() => selectVehicle(v)}>
            <View style={styles.vehicleInfo}>
              <Text style={styles.vehicleName}>{v.make} {v.model} ({v.year})</Text>
              <Text style={styles.vehicleSpec}>
                H: {v.heightM}m · GVW: {(v.gvwKg / 1000).toFixed(1)}t · Payload: {(v.payloadKg / 1000).toFixed(1)}t
              </Text>
            </View>
            <Text style={styles.vehicleId}>{v.id}</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#030712', padding: 16 },
  section:      { backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#1f2937' },
  sectionTitle: { color: '#9ca3af', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 10 },
  infoRow:      { color: '#9ca3af', fontSize: 14, marginBottom: 4 },
  value:        { color: '#f9fafb', fontWeight: '500' },
  vehicleRow:   { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111827', borderBottomWidth: 1, borderColor: '#1f2937', padding: 14, justifyContent: 'space-between' },
  vehicleInfo:  { flex: 1 },
  vehicleName:  { color: '#f9fafb', fontWeight: '600', fontSize: 14 },
  vehicleSpec:  { color: '#9ca3af', fontSize: 12, marginTop: 2 },
  vehicleId:    { color: '#374151', fontSize: 11 },
  logoutBtn:    { backgroundColor: '#1f2937', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24, borderWidth: 1, borderColor: '#374151' },
  logoutText:   { color: '#ef4444', fontWeight: '700', fontSize: 15 },
});