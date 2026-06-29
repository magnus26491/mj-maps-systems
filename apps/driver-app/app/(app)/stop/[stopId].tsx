import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import NetInfo from '@react-native-community/netinfo';
import { apiGetApproach, apiUploadPod, apiDriverEvent } from '../../../lib/api';
import { enqueue } from '../../../lib/offline-queue';
import { useAuthStore } from '../../../lib/auth';
import { DriverEventType } from '../../../constants/events';
import PodCapture from '../../../components/PodCapture';
import FailureSheet from '../../../components/FailureSheet';
import { useShiftStore } from '../../../store/shift';

export default function StopDetailScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const router = useRouter();
  const qc     = useQueryClient();
  const user   = useAuthStore(s => s.user);
  const routeId = useShiftStore(s => s.shift?.routeId ?? null);

  const [podUri,       setPodUri]       = useState<string | null>(null);
  const [showFailure,  setShowFailure]  = useState(false);
  const [submitting,   setSubmitting]   = useState(false);

  const { data } = useQuery({
    queryKey: ['approach', stopId],
    queryFn:  () => apiGetApproach(stopId),
  });

  const brief = data?.data;

  async function getCurrentLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { lat: 0, lng: 0 };
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  }

  async function handleDeliver() {
    if (!user || !routeId) return;
    setSubmitting(true);
    try {
      const { lat, lng } = await getCurrentLocation();

      let podPhotoUrl: string | null = null;
      if (podUri) {
        try {
          const uploaded = await apiUploadPod(stopId, podUri);
          podPhotoUrl = uploaded.podPhotoUrl;
        } catch {
          Alert.alert('Photo upload failed', 'Delivery will still be marked as complete.');
        }
      }

      const payload = {
        type:        DriverEventType.STOP_COMPLETED,
        driverId:    user.id,
        routeId,
        stopId,
        lat,
        lng,
        podPhotoUrl,
        epochSec:    Math.floor(Date.now() / 1000),
      };

      const net = await NetInfo.fetch();
      if (net.isConnected) {
        await apiDriverEvent(payload);
      } else {
        await enqueue(DriverEventType.STOP_COMPLETED, payload);
      }

      qc.invalidateQueries({ queryKey: ['route'] });
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFail(failureCode: string, accessNotes: string) {
    if (!user || !routeId) return;
    setSubmitting(true);
    try {
      const payload = {
        type:        DriverEventType.STOP_FAILED,
        driverId:    user.id,
        routeId,
        stopId,
        failureCode,
        accessNotes: accessNotes || null,
        epochSec:    Math.floor(Date.now() / 1000),
      };

      const net = await NetInfo.fetch();
      if (net.isConnected) {
        await apiDriverEvent(payload);
      } else {
        await enqueue(DriverEventType.STOP_FAILED, payload);
      }

      qc.invalidateQueries({ queryKey: ['route'] });
      setShowFailure(false);
      router.back();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {brief?.accessNotes && (
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Access Notes</Text>
          <Text style={styles.infoText}>{brief.accessNotes}</Text>
        </View>
      )}
      {brief?.last50m && (
        <View style={[styles.infoCard, { borderColor: '#1d4ed8' }]}>
          <Text style={styles.infoLabel}>Last 50m</Text>
          <Text style={styles.infoText}>{brief.last50m}</Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>Proof of Delivery Photo</Text>
      <PodCapture onPhotoSelected={setPodUri} photoUri={podUri} />

      {submitting ? (
        <ActivityIndicator color="#00C2A8" style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.deliverBtn} onPress={handleDeliver}>
            <Text style={styles.deliverBtnText}>Mark Delivered</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.failBtn} onPress={() => setShowFailure(true)}>
            <Text style={styles.failBtnText}>Mark Failed</Text>
          </TouchableOpacity>
        </View>
      )}

      <FailureSheet
        visible={showFailure}
        onClose={() => setShowFailure(false)}
        onConfirm={handleFail}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#030712' },
  infoCard:         { backgroundColor: '#111827', borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#1f2937' },
  infoLabel:        { color: '#9ca3af', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  infoText:         { color: '#f9fafb', fontSize: 15 },
  sectionLabel:     { color: '#9ca3af', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8, marginTop: 8 },
  actions:          { gap: 12, marginTop: 24 },
  deliverBtn:       { backgroundColor: '#16a34a', borderRadius: 14, paddingVertical: 18, alignItems: 'center' },
  deliverBtnText:   { color: '#fff', fontWeight: '700', fontSize: 17 },
  failBtn:          { backgroundColor: '#1f2937', borderRadius: 14, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: '#374151' },
  failBtnText:      { color: '#f87171', fontWeight: '700', fontSize: 17 },
});