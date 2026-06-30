import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { apiGetVehicles, apiSetVehicle, apiRegisterFcmToken } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { DeleteAccountModal } from '../../components/DeleteAccountModal';
import { useLocale } from '../../components/LocaleProvider';
import { SUPPORTED_LOCALES } from '../../lib/i18n';
import { useTheme, type ThemeMode } from '../../lib/theme';
import type { Vehicle } from '../../lib/types';

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light',  label: 'Light' },
  { value: 'dark',   label: 'Dark'  },
];

export default function SettingsScreen() {
  const user    = useAuthStore(s => s.user);
  const logout  = useAuthStore(s => s.logout);
  const router  = useRouter();
  const { locale } = useLocale();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const currentLang = SUPPORTED_LOCALES.find(l => l.code === locale);

  // Theme controls
  const { mode, setMode, isDark, colors } = useTheme();

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
    <View style={[styles.container, { backgroundColor: colors.app.background }]}>
      <DeleteAccountModal
        visible={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
      />

      {/* ── Theme control ─────────────────────────────────────── */}
      <View style={[styles.section, { backgroundColor: colors.app.surface, borderColor: colors.app.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.app.textFaint }]}>Appearance</Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.themeBtn,
                mode === opt.value
                  ? { backgroundColor: colors.app.primary }
                  : { backgroundColor: colors.app.surfaceAlt, borderColor: colors.app.border, borderWidth: 1 },
              ]}
              onPress={() => setMode(opt.value)}
            >
              <Text
                style={[
                  styles.themeBtnText,
                  { color: mode === opt.value ? colors.app.white : colors.app.textFaint },
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.app.surface, borderColor: colors.app.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.app.textFaint }]}>Account</Text>
        <Text style={[styles.infoRow, { color: colors.app.textFaint }]}>
          Name: <Text style={[styles.value, { color: colors.app.text }]}>{user?.name ?? '—'}</Text>
        </Text>
        <Text style={[styles.infoRow, { color: colors.app.textFaint }]}>
          Email: <Text style={[styles.value, { color: colors.app.text }]}>{user?.email ?? '—'}</Text>
        </Text>
        <Text style={[styles.infoRow, { color: colors.app.textFaint }]}>
          Plan: <Text style={[styles.value, { color: colors.app.text }]}>{user?.planId?.toUpperCase() ?? '—'}</Text>
        </Text>

        <TouchableOpacity
          style={[styles.linkRow, { borderTopColor: colors.app.border }]}
          onPress={() => router.push('/language-select' as any)}
        >
          <View style={styles.linkRowLeft}>
            <Text style={[styles.linkText, { color: colors.app.primary }]}>Language</Text>
            <Text style={[styles.linkSub, { color: colors.app.gray }]}>
              {currentLang ? `${currentLang.flag} ${currentLang.nativeLabel}` : 'English'}
            </Text>
          </View>
          <Text style={[styles.linkArrow, { color: colors.app.primary }]}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.linkRow, { borderTopColor: colors.app.border }]}
          onPress={() => router.push('/voice-settings' as any)}
        >
          <View style={styles.linkRowLeft}>
            <Text style={[styles.linkText, { color: colors.app.primary }]}>Voice Navigation</Text>
            <Text style={[styles.linkSub, { color: colors.app.gray }]}>
              Voice, speed, pitch &amp; volume
            </Text>
          </View>
          <Text style={[styles.linkArrow, { color: colors.app.primary }]}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.linkRow, { borderTopColor: colors.app.border }]}
          onPress={() => router.push('/(app)/privacy')}
        >
          <Text style={[styles.linkText, { color: colors.app.primary }]}>Privacy Policy</Text>
          <Text style={[styles.linkArrow, { color: colors.app.primary }]}>›</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.app.textFaint }]}>Select Vehicle</Text>
      <FlatList
        data={vehicles}
        keyExtractor={v => v.id}
        style={{ flex: 0 }}
        renderItem={({ item: v }) => (
          <TouchableOpacity
            style={[styles.vehicleRow, { backgroundColor: colors.app.surface, borderBottomColor: colors.app.border }]}
            onPress={() => selectVehicle(v)}
          >
            <View style={styles.vehicleInfo}>
              <Text style={[styles.vehicleName, { color: colors.app.text }]}>{v.make} {v.model} ({v.year})</Text>
              <Text style={[styles.vehicleSpec, { color: colors.app.textFaint }]}>
                H: {v.heightM}m · GVW: {(v.gvwKg / 1000).toFixed(1)}t · Payload: {(v.payloadKg / 1000).toFixed(1)}t
              </Text>
            </View>
            <Text style={[styles.vehicleId, { color: colors.app.grayDark }]}>{v.id}</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={[styles.deleteBtn, { backgroundColor: colors.app.surface, borderColor: colors.app.danger, borderWidth: 1 }]}
        onPress={() => setShowDeleteModal(true)}
      >
        <Text style={[styles.deleteText, { color: colors.app.danger }]}>Delete Account</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.logoutBtn, { backgroundColor: colors.app.surface, borderColor: colors.app.border, borderWidth: 1 }]}
        onPress={handleLogout}
      >
        <Text style={[styles.logoutText, { color: colors.app.textFaint }]}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, padding: 16 },
  section:      { borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  sectionTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 10 },
  infoRow:      { fontSize: 14, marginBottom: 4 },
  value:        { fontWeight: '500' },
  linkRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderTopWidth: 1, marginTop: 8 },
  linkRowLeft:  { flex: 1 },
  linkText:     { fontSize: 14, fontWeight: '500' },
  linkSub:      { fontSize: 12, marginTop: 2 },
  linkArrow:    { fontSize: 18 },
  vehicleRow:   { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, padding: 14, justifyContent: 'space-between' },
  vehicleInfo:  { flex: 1 },
  vehicleName:  { fontWeight: '600', fontSize: 14 },
  vehicleSpec:  { fontSize: 12, marginTop: 2 },
  vehicleId:    { fontSize: 11 },
  deleteBtn:    { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 24 },
  deleteText:   { fontWeight: '700', fontSize: 15 },
  logoutBtn:    { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12 },
  logoutText:   { fontWeight: '700', fontSize: 15 },
  // Theme segmented control
  themeRow:     { flexDirection: 'row', gap: 8, marginTop: 4 },
  themeBtn:     { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  themeBtnText: { fontSize: 14, fontWeight: '600' },
});