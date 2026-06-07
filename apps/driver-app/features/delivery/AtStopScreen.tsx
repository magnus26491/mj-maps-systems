/**
 * AT_STOP screen — driver has arrived at the stop
 *
 * Layout:
 *  1. Stop details (top half)
 *  2. DELIVERED (slide), REDELIVER, FAILED buttons
 *  3. PIN confirm card (after DELIVERED, auto-dismisses after 5s)
 */
import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import { useDeliveryStore, StopPoint, FailureReason } from '../../store/deliveryStore';
import { useVehicleStore } from '../../store/vehicleStore';
import { ShiftProgressBar } from '../../components/ShiftProgressBar';
import { isPodAvailable, capturePod } from '../../features/pod';
import { useTheme } from '../../components/ThemeContext';
import {
  TextStyles,
  BottomButton,
  StopDetails,
  PinConfirmCard,
  FailureReasonSheet,
  Badge,
} from './components';

interface PodCaptureState {
  photoUri: string | null;
  signature: string | null;
  parcelId: string | null;
}

interface AtStopScreenProps {
  failureSheetRef: React.RefObject<BottomSheetModal | null>;
}

export function AtStopScreen({ failureSheetRef }: AtStopScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const currentStop    = useDeliveryStore(s => s.currentStop);
  const showPinConfirm = useDeliveryStore(s => s.showPinConfirm);
  const completeDelivery = useDeliveryStore(s => s.completeDelivery);
  const markRedeliver = useDeliveryStore(s => s.markRedeliver);
  const markFailed    = useDeliveryStore(s => s.markFailed);
  const dismissPinConfirm = useDeliveryStore(s => s.dismissPinConfirm);
  const savePinCorrection = useDeliveryStore(s => s.savePinCorrection);
  const totalStops     = useDeliveryStore(s => s.totalStops);
  const currentStopIndex = useDeliveryStore(s => s.currentStopIndex);

  const [podCapture, setPodCapture] = useState<PodCaptureState>({
    photoUri: null, signature: null, parcelId: null,
  });

  const handleDelivered = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    completeDelivery(podCapture);
  }, [completeDelivery, podCapture]);

  const handleRedeliver = useCallback(() => {
    markRedeliver();
  }, [markRedeliver]);

  const handleFailed = useCallback(() => {
    failureSheetRef.current?.present();
  }, [failureSheetRef]);

  const handleFailureSelect = useCallback((reason: string) => {
    failureSheetRef.current?.dismiss();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    markFailed(reason as FailureReason);
  }, [failureSheetRef, markFailed]);

  const handlePinConfirm = useCallback((correct: boolean, correctedLat?: number, correctedLng?: number) => {
    if (correct) {
      confirmPin(currentStop?.id ?? '', true);
    } else {
      savePinCorrection(correctedLat ?? currentStop?.pin?.lat ?? 0, correctedLng ?? currentStop?.pin?.lng ?? 0);
    }
    dismissPinConfirm();
  }, [currentStop, dismissPinConfirm, savePinCorrection]);

  if (!currentStop) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <TextStyles.body>No current stop</TextStyles.body>
      </View>
    );
  }

  const buttonWidth = (width - 48) / 3;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Progress counter */}
      <ShiftProgressBar current={currentStopIndex} total={totalStops} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 200 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Stop details */}
        <View style={styles.detailsWrapper}>
          <StopDetails stop={currentStop} />
        </View>

        {/* POD capture section — only if feature enabled */}
        {isPodAvailable() && (
          <PodCaptureSection stopId={currentStop.id} onCaptureDone={setPodCapture} />
        )}
      </ScrollView>

      {/* Action buttons */}
      <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[styles.button, { width: buttonWidth }]}>
          <BottomButton
            title="✅ DELIVERED"
            onPress={handleDelivered}
            variant="slide"
          />
        </View>
        <View style={[styles.button, { width: buttonWidth }]}>
          <BottomButton
            title="🔁 REDELIVER"
            onPress={handleRedeliver}
            variant="secondary"
          />
        </View>
        <View style={[styles.button, { width: buttonWidth }]}>
          <BottomButton
            title="❌ FAILED"
            onPress={handleFailed}
            variant="danger"
          />
        </View>
      </View>

      {/* PIN confirm card */}
      <PinConfirmCard
        visible={showPinConfirm}
        onConfirm={handlePinConfirm}
      />
    </View>
  );
}

// ─── POD Capture Section ──────────────────────────────────────────────────────

interface PodCaptureSectionProps {
  stopId: string;
  onCaptureDone: (state: PodCaptureState) => void;
}

function PodCaptureSection({ stopId, onCaptureDone }: PodCaptureSectionProps) {
  const [state, setState] = useState<PodCaptureState>({
    photoUri: null, signature: null, parcelId: null,
  });

  const capture = useCallback(async (type: 'photo' | 'signature' | 'barcode') => {
    try {
      const result = await capturePod(stopId, type);
      const next = { ...state };
      if (type === 'photo')    next.photoUri   = result.photoUri ?? null;
      if (type === 'signature') next.signature = result.signature ?? null;
      if (type === 'barcode')  next.parcelId   = result.parcelId ?? null;
      setState(next);
      onCaptureDone(next);
    } catch { /* non-fatal */ }
  }, [state, stopId, onCaptureDone]);

  const doneCount = [state.photoUri, state.signature, state.parcelId].filter(Boolean).length;

  return (
    <View style={podStyles.container}>
      <Text style={podStyles.title}>📷 Proof of Delivery</Text>
      {doneCount > 0 && (
        <Text style={podStyles.doneCount}>✓ {doneCount}/3 captured</Text>
      )}
      <View style={podStyles.actions}>
        <TouchableOpacity
          style={[podStyles.btn, state.photoUri && podStyles.btnDone]}
          onPress={() => capture('photo')}
          accessibilityRole="button"
          accessibilityLabel="Capture photo"
        >
          <Text style={podStyles.btnText}>📷 Photo</Text>
          {state.photoUri && <Text style={podStyles.tick}>✓</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[podStyles.btn, state.signature && podStyles.btnDone]}
          onPress={() => capture('signature')}
          accessibilityRole="button"
          accessibilityLabel="Capture signature"
        >
          <Text style={podStyles.btnText}>✍️ Signature</Text>
          {state.signature && <Text style={podStyles.tick}>✓</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[podStyles.btn, state.parcelId && podStyles.btnDone]}
          onPress={() => capture('barcode')}
          accessibilityRole="button"
          accessibilityLabel="Scan barcode"
        >
          <Text style={podStyles.btnText}>📦 Scan Barcode</Text>
          {state.parcelId && <Text style={podStyles.tick}>✓</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const podStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: '#1a3b2a', borderRadius: 12, padding: 16,
  },
  title:    { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  doneCount:{ fontSize: 13, color: '#66bb6a', marginBottom: 12 },
  actions:  { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1, height: 64, backgroundColor: '#0d3b1a',
    borderRadius: 10, justifyContent: 'center', alignItems: 'center',
  },
  btnDone:  { backgroundColor: '#1b5e20' },
  btnText:  { fontSize: 13, fontWeight: '600', color: '#fff', textAlign: 'center' },
  tick:     { fontSize: 12, color: '#66bb6a', marginTop: 2 },
});

// ─── Failure Reason Bottom Sheet ───────────────────────────────────────────────

interface FailureSheetProps {
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
  onSelect: (reason: string) => void;
}

export function FailureSheet({ bottomSheetRef, onSelect }: FailureSheetProps) {
  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={['50%']}
      backgroundStyle={{ backgroundColor: COLORS.background }}
      handleIndicatorStyle={{ backgroundColor: COLORS.grayDark }}
    >
      <FailureReasonSheet
        onSelect={onSelect}
        onClose={() => bottomSheetRef.current?.dismiss()}
      />
    </BottomSheetModal>
  );
}

// ─── Pin Correction Screen ───────────────────────────────────────────────────

interface PinCorrectionProps {
  stop: StopPoint;
  onSave: (lat: number, lng: number) => void;
  onCancel: () => void;
}

export function PinCorrectionScreen({ stop, onSave, onCancel }: PinCorrectionProps) {
  const insets = useSafeAreaInsets();
  const [region, setRegion] = useState<Region>({
    latitude: stop.pin?.lat ?? stop.lat,
    longitude: stop.pin?.lng ?? stop.lng,
    latitudeDelta: 0.002,
    longitudeDelta: 0.002,
  });
  const [markerPos, setMarkerPos] = useState({
    lat: stop.pin?.lat ?? stop.lat,
    lng: stop.pin?.lng ?? stop.lng,
  });

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      <TextStyles.address style={styles.pinTitle}>Drag the pin to correct position</TextStyles.address>

      <MapView
        style={styles.pinMap}
        provider={PROVIDER_DEFAULT}
        region={region}
        onRegionChangeComplete={setRegion}
        onPress={(e) => setMarkerPos({
          lat: e.nativeEvent.coordinate.latitude,
          lng: e.nativeEvent.coordinate.longitude,
        })}
      >
        <Marker
          coordinate={{ latitude: markerPos.lat, longitude: markerPos.lng }}
          draggable
          onDragEnd={(e) => setMarkerPos({
            lat: e.nativeEvent.coordinate.latitude,
            lng: e.nativeEvent.coordinate.longitude,
          })}
        />
      </MapView>

      <View style={[styles.pinButtons, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.pinButtonWrapper}>
          <BottomButton title="CANCEL" onPress={onCancel} variant="secondary" />
        </View>
        <View style={styles.pinButtonWrapper}>
          <BottomButton
            title="SAVE CORRECTION"
            onPress={() => onSave(markerPos.lat, markerPos.lng)}
            variant="primary"
          />
        </View>
      </View>
    </View>
  );
}

// ─── Helper: Call confirm-pin API ──────────────────────────────────────────────

async function confirmPin(stopId: string, confirmed: boolean) {
  if (!stopId) return;

  try {
    const response = await fetch(`/api/v1/stops/${stopId}/confirm-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ confirmed }),
    });

    if (!response.ok) {
      console.warn('[confirm-pin] API error:', response.status);
    }
  } catch (err) {
    console.warn('[confirm-pin] Failed:', err);
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  detailsWrapper: {
    flex: 1,
  },
  buttonRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  button: {
    // Width set dynamically
  },
  pinTitle: {
    textAlign: 'center',
    marginVertical: 16,
  },
  pinMap: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  pinButtons: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  pinButtonWrapper: {
    flex: 1,
  },
});