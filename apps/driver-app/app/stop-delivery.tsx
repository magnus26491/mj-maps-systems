/**
 * StopDelivery — delivery confirmation screen.
 *
 * Shown after driver taps a stop in stop-list or arrives at destination.
 * Core actions: Delivered | Failed | Partially Delivered
 *
 * POD features (photo, signature, barcode) are gated behind
 * isPodAvailable() — invisible in individual driver builds,
 * seamlessly enabled for B2B dispatcher-tier builds.
 *
 * Mobile constraints:
 *  · All action buttons in bottom thumb zone, min 64px height
 *  · Failure reason picker uses ActionSheet (native feel, no modals)
 *  · Offline safe — events enqueued via useOfflineQueue if no signal
 */
import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useShiftStore } from '../store/shift';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { isPodAvailable, capturePod } from '../features/pod';

const FAIL_REASONS = [
  'Not in — no safe place',
  'Not in — left with neighbour',
  'Access denied / gate locked',
  'Address not found',
  'Parcel damaged — refused',
  'Customer refused delivery',
  'Incorrect address on label',
  'Other',
] as const;

export default function StopDeliveryScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();

  const shift        = useShiftStore(s => s.shift);
  const completeStop = useShiftStore(s => s.completeStop);
  const failStop     = useShiftStore(s => s.failStop);
  const driverId     = useShiftStore(s => s.driverId);

  const { enqueue } = useOfflineQueue();

  const stop = shift?.stops.find(s => s.id === stopId);

  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [showReasons, setShowReasons] = useState(false);

  const handleDelivered = useCallback(async () => {
    if (!stop || !shift) return;

    // Attempt POD capture if B2B tier — silently skips on individual builds
    let pod = null;
    if (isPodAvailable()) {
      pod = await capturePod(stop.id).catch(() => null);
    }

    enqueue({
      type: 'STOP_COMPLETE',
      stopId: stop.id,
      driverId: driverId ?? 'unknown',
      routeId: shift.routeId ?? 'unknown',
      notes,
      photoUri:  pod?.photoUri,
      signature: pod?.signature,
      parcelId:  pod?.parcelId,
    });

    completeStop();
    router.back();
  }, [stop, shift, notes]);

  const handleFailed = useCallback(() => {
    if (!stop || !shift) return;
    if (!selectedReason) {
      setShowReasons(true);
      return;
    }
    enqueue({
      type: 'STOP_FAIL',
      stopId: stop.id,
      driverId: driverId ?? 'unknown',
      routeId: shift.routeId ?? 'unknown',
      reason: selectedReason,
      notes,
    });
    failStop();
    router.back();
  }, [stop, shift, selectedReason, notes]);

  if (!stop) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Stop not found.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Stop header */}
        <Text style={styles.stopIndex}>Stop {(stop.index ?? 0) + 1}</Text>
        <Text style={styles.address} numberOfLines={3}>{stop.address}</Text>
        {stop.notes ? <Text style={styles.stopNotes}>{stop.notes}</Text> : null}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>📦 {stop.parcelCount ?? 1} parcels</Text>
        </View>

        {/* Failure reason picker */}
        {showReasons && (
          <View style={styles.reasonsCard}>
            <Text style={styles.reasonsLabel}>Select failure reason:</Text>
            {FAIL_REASONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[
                  styles.reasonItem,
                  selectedReason === r && styles.reasonItemSelected,
                ]}
                onPress={() => { setSelectedReason(r); setShowReasons(false); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedReason === r }}
              >
                <Text style={styles.reasonText}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {selectedReason && (
          <View style={styles.selectedReasonBadge}>
            <Text style={styles.selectedReasonText}>✗ {selectedReason}</Text>
          </View>
        )}

        {/* Notes */}
        <TextInput
          style={styles.notesInput}
          placeholder="Notes (optional)"
          placeholderTextColor="#4a5568"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />

        {/* B2B POD indicator — only visible if feature enabled */}
        {isPodAvailable() && (
          <View style={styles.podBadge}>
            <Text style={styles.podBadgeText}>📷 POD capture enabled</Text>
          </View>
        )}

      </ScrollView>

      {/* Bottom actions — thumb zone */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.failBtn]}
          onPress={handleFailed}
          accessibilityRole="button"
          accessibilityLabel="Mark as failed"
        >
          <Text style={styles.actionIcon}>✗</Text>
          <Text style={styles.actionLabel}>
            {selectedReason ? 'Confirm Failed' : 'Failed'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, styles.doneBtn]}
          onPress={handleDelivered}
          accessibilityRole="button"
          accessibilityLabel="Mark as delivered"
        >
          <Text style={styles.actionIcon}>✓</Text>
          <Text style={styles.actionLabel}>Delivered</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: '#0f1923' },
  scroll:     { padding: 16, gap: 12, paddingBottom: 8 },
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText:  { color: '#8fa0b0', fontSize: 17, marginBottom: 16 },
  backBtn:    { backgroundColor: '#1c2a37', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  backBtnText:{ color: '#e0eaf4', fontSize: 15, fontWeight: '600' },
  stopIndex:  { fontSize: 13, color: '#607080', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  address:    { fontSize: 22, color: '#e0eaf4', fontWeight: '700', lineHeight: 30, marginTop: 4 },
  stopNotes:  { fontSize: 14, color: '#f0c040', lineHeight: 20 },
  metaRow:    { flexDirection: 'row', gap: 12 },
  meta:       { fontSize: 14, color: '#8fa0b0' },
  reasonsCard:{ backgroundColor: '#1c2a37', borderRadius: 14, padding: 14, gap: 8 },
  reasonsLabel:{ fontSize: 13, color: '#607080', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  reasonItem: {
    paddingVertical: 13, paddingHorizontal: 14,
    backgroundColor: '#253545', borderRadius: 10, minHeight: 48,
    justifyContent: 'center',
  },
  reasonItemSelected: { backgroundColor: '#3b1a1a', borderWidth: 1, borderColor: '#c62828' },
  reasonText: { color: '#e0eaf4', fontSize: 15 },
  selectedReasonBadge: {
    backgroundColor: '#3b1a1a', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  selectedReasonText: { color: '#ef9a9a', fontSize: 14, fontWeight: '600' },
  notesInput: {
    backgroundColor: '#1c2a37', borderRadius: 12, padding: 14,
    color: '#e0eaf4', fontSize: 15, minHeight: 80,
    textAlignVertical: 'top', borderWidth: 1, borderColor: '#253545',
  },
  podBadge: {
    backgroundColor: '#1a3b2a', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center',
  },
  podBadgeText: { color: '#66bb6a', fontSize: 13, fontWeight: '600' },
  actions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 12, paddingBottom: 16, paddingTop: 12,
  },
  actionBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, minHeight: 64, gap: 4,
  },
  failBtn:     { backgroundColor: '#3b1a1a' },
  doneBtn:     { backgroundColor: '#0d3b1a' },
  actionIcon:  { fontSize: 24, color: '#e0eaf4' },
  actionLabel: { fontSize: 13, color: '#8fa0b0', fontWeight: '700' },
});
