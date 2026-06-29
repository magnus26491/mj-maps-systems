/**
 * StopDelivery — delivery confirmation screen.
 *
 * Shown after driver taps a stop in stop-list or arrives at destination.
 * Core actions: Delivered | Failed
 *
 * POD features (photo, signature, barcode) are gated behind
 * isPodAvailable() — invisible in individual driver builds,
 * seamlessly enabled for B2B dispatcher-tier builds.
 *
 * Mobile constraints:
 *  · All action buttons in bottom thumb zone, min 72px height
 *  · Failure reason uses FailureReasonSheet (ENT tier component)
 *  · Offline safe — events enqueued via useOfflineQueue if no signal
 */
import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, TextInput, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useShiftStore, DeliveryStop } from '../store/shift';
import { useOfflineQueue } from '../hooks/useOfflineQueue';
import { isPodAvailable, capturePod } from '../features/pod';
import { SlideToConfirm } from '../components/SlideToConfirm';
import { ShiftProgressBar } from '../components/ShiftProgressBar';
import { ThemeProvider, useTheme } from '../components/ThemeContext';
import { FailureReasonSheet } from '../features/delivery/components';
import DifficultyReportSheet from '../components/DifficultyReportSheet';

function StopDeliveryInner() {
  const { colors } = useTheme();
  const { stopId } = useLocalSearchParams<{ stopId: string }>();

  const shift        = useShiftStore(s => s.shift);
  const completeStop = useShiftStore(s => s.completeStop);
  const failStop     = useShiftStore(s => s.failStop);
  const driverId     = useShiftStore(s => s.driverId);
  const stops        = useShiftStore(s => s.stops);

  const { enqueue } = useOfflineQueue();

  const stop = stops.find((s: DeliveryStop) => s.id === stopId);

  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [showReasons, setShowReasons] = useState(false);
  const [showDifficulty, setShowDifficulty] = useState(false);

  const handleDelivered = useCallback(async () => {
    if (!stop || !shift) return;

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Attempt POD capture if B2B tier — silently skips on individual builds
    let pod: { photoUri?: string; signature?: string; parcelId?: string } | null = null;
    if (isPodAvailable()) {
      try {
        pod = await capturePod(stop.id);
      } catch (e) {
        const proceed = await new Promise<boolean>(resolve => {
          Alert.alert(
            'Photo Failed',
            'Could not capture delivery photo. Continue without photo?',
            [
              { text: 'Try Again', onPress: () => resolve(false) },
              { text: 'Continue', style: 'destructive', onPress: () => resolve(true) },
            ],
          );
        });
        if (!proceed) return; // abort delivery — driver will retry
        pod = null;
      }
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
    // Show the difficulty report sheet before navigating away.
    // Pressing Skip or Submit both call router.back() after.
    setShowDifficulty(true);
  }, [stop, shift, notes]);

  const handleDifficultySubmit = useCallback((categories: string[], note: string) => {
    if (!stop || !shift) { router.back(); return; }
    // Fire-and-forget — queued offline if no signal
    enqueue({
      type: 'DIFFICULTY_REPORT',
      stopId:     stop.id,
      address:    stop.address,
      driverId:   driverId ?? 'unknown',
      routeId:    shift.routeId ?? 'unknown',
      categories,
      notes:      note,
    } as any);
    setShowDifficulty(false);
    router.back();
  }, [stop, shift, driverId, enqueue]);

  const handleDifficultyDismiss = useCallback(() => {
    setShowDifficulty(false);
    router.back();
  }, []);

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
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    failStop();
    router.back();
  }, [stop, shift, selectedReason, notes]);

  const handleReasonSelect = useCallback((reason: string) => {
    setSelectedReason(reason);
    setShowReasons(false);
  }, []);

  if (!stop) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: colors.subtext }]}>Stop not found.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={[styles.backBtnText, { color: colors.blue }]}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={[styles.scroll, { backgroundColor: colors.background }]} keyboardShouldPersistTaps="handled">

        {/* ── Shift Progress ────────────────────────────────────── */}
        <ShiftProgressBar
          current={stop.index ?? 0}
          total={stops.length || 1}
        />

        {/* Stop header */}
        <Text style={[styles.stopIndex, { color: colors.subtext }]}>
          Stop {(stop.index ?? 0) + 1}
        </Text>
        <Text
          style={[styles.address, { color: colors.text }]}
          numberOfLines={3}
        >
          {stop.address}
        </Text>
        {stop.notes ? (
          <Text style={[styles.stopNotes, { color: colors.amber }]}>{stop.notes}</Text>
        ) : null}
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: colors.subtext }]}>
            📦 {stop.parcelCount ?? 1} parcel{(stop.parcelCount ?? 1) !== 1 ? 's' : ''}
          </Text>
        </View>

        {/* Notes */}
        <TextInput
          style={[styles.notesInput, { backgroundColor: colors.surface, color: colors.text, borderColor: colors.surfaceAlt }]}
          placeholder="Notes (optional)"
          placeholderTextColor={colors.subtext}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          accessibilityLabel="Delivery notes"
        />

        {/* B2B POD indicator — only visible if feature enabled */}
        {isPodAvailable() && (
          <View style={[styles.podBadge, { backgroundColor: colors.greenBg }]}>
            <Text style={[styles.podBadgeText, { color: colors.green }]}>📷 POD capture enabled</Text>
          </View>
        )}
      </ScrollView>

      {/* Failure reason modal */}
      <Modal
        visible={showReasons}
        transparent
        animationType="slide"
        onRequestClose={() => setShowReasons(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <FailureReasonSheet
              onSelect={handleReasonSelect}
              onClose={() => setShowReasons(false)}
            />
          </View>
        </View>
      </Modal>

      {/* Difficulty report — appears after delivery confirmed */}
      <DifficultyReportSheet
        stopId={stop.id}
        address={stop.address}
        visible={showDifficulty}
        onDismiss={handleDifficultyDismiss}
        onSubmit={handleDifficultySubmit}
      />

      {/* Bottom actions — thumb zone */}
      <View style={[styles.actions, { paddingBottom: 16, paddingTop: 12 }]}>
        {/* Failed */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.redBg, minHeight: 72 }]}
          onPress={handleFailed}
          accessibilityRole="button"
          accessibilityLabel="Mark as failed"
        >
          <Text style={styles.actionIcon}>✗</Text>
          <Text style={styles.actionLabel}>
            {selectedReason ? 'Confirm Failed' : 'Failed'}
          </Text>
        </TouchableOpacity>

        {/* Delivered */}
        <SlideToConfirm
          label="Confirm Delivered"
          sublabel={`${stop.parcelCount ?? 1} parcel${(stop.parcelCount ?? 1) !== 1 ? 's' : ''}`}
          color={colors.green}
          trackColor={colors.greenBg}
          onConfirm={handleDelivered}
        />
      </View>
    </SafeAreaView>
  );
}

export default function StopDeliveryScreen() {
  return (
    <ThemeProvider>
      <StopDeliveryInner />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  scroll:     { padding: 16, gap: 12, paddingBottom: 8 },
  empty:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText:  { fontSize: 17, marginBottom: 16 },
  backBtn:    { backgroundColor: '#1c2a37', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24 },
  backBtnText:{ fontSize: 15, fontWeight: '600' },
  stopIndex:  { fontSize: 15, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  address:    { fontSize: 22, fontWeight: '700', lineHeight: 30, marginTop: 4 },
  stopNotes:  { fontSize: 14, lineHeight: 20 },
  metaRow:    { flexDirection: 'row', gap: 12 },
  meta:       { fontSize: 14 },
  notesInput: {
    borderRadius: 12, padding: 14,
    fontSize: 15, minHeight: 80,
    textAlignVertical: 'top', borderWidth: 1,
  },
  podBadge: {
    borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center',
  },
  podBadgeText: { fontSize: 13, fontWeight: '600' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  actions: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 12,
  },
  actionBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, gap: 4,
  },
  actionIcon:  { fontSize: 24, color: '#e0eaf4' },
  actionLabel: { fontSize: 16, color: '#8fa0b0', fontWeight: '700' },
});