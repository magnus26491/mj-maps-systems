/**
 * DeliveryScreen — orchestrates EN_ROUTE, ARRIVING, AT_STOP phases
 *
 * Uses a single Zustand deliveryStore with phase field:
 *   'EN_ROUTE' | 'ARRIVING' | 'AT_STOP'
 */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import * as KeepAwake from 'expo-keep-awake';
import { useDeliveryStore } from '../../store/deliveryStore';
import { useVehicleStore } from '../../store/vehicleStore';
import { EnRouteScreen, StopDetailsSheet } from './EnRouteScreen';
import { ArrivingScreen } from './ArrivingScreen';
import { AtStopScreen, FailureSheet, PinCorrectionScreen } from './AtStopScreen';
import { VehiclePicker, SettingsSheet } from './VehiclePicker';
import { TextStyles } from './components';
import { useTheme } from '../../components/ThemeContext';
import { PinConfirmMap } from '../../src/components/PinConfirmMap';
import { ThemeProvider } from '../../components/ThemeContext';
import { startStopGeofences, stopStopGeofences } from '../../hooks/useDrivingMode';

interface DeliveryScreenProps {
  // Route data will be loaded from the store
}

export function DeliveryScreen({}: DeliveryScreenProps) {
  const insets = useSafeAreaInsets();
  const phase = useDeliveryStore(s => s.phase);
  const currentStop = useDeliveryStore(s => s.currentStop);
  const markAtStop = useDeliveryStore(s => s.markAtStop);
  const loadRoute = useDeliveryStore(s => s.loadRoute);
  const endShift = useDeliveryStore(s => s.endShift);

  const vehicleProfile = useVehicleStore(s => s.vehicleProfile);
  const loadVehicleProfile = useVehicleStore(s => s.loadVehicleProfile);
  const setVehicleProfile = useVehicleStore(s => s.setVehicleProfile);

  // Refs for bottom sheets
  const detailsSheetRef = useRef<BottomSheetModal>(null);
  const vehiclePickerRef = useRef<BottomSheetModal>(null);
  const settingsSheetRef = useRef<BottomSheetModal>(null);
  const failureSheetRef = useRef<BottomSheetModal>(null);
  const pinConfirmSheetRef = useRef<BottomSheetModal>(null);

  // UI state
  const [showPinCorrection, setShowPinCorrection] = useState(false);
  const { colors } = useTheme();

  // Load vehicle profile on mount
  useEffect(() => {
    loadVehicleProfile();
  }, []);

  // Auto-present pin confirm sheet when currentStop requires it
  useEffect(() => {
    if (currentStop?.requiresPinConfirm && phase === 'EN_ROUTE') {
      // Brief delay so the map view is fully rendered
      const timer = setTimeout(() => {
        pinConfirmSheetRef.current?.present();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentStop?.requiresPinConfirm, currentStop?.id, phase]);

  // Keep screen awake during active shift
  useEffect(() => {
    KeepAwake.activateKeepAwakeAsync();
    return () => {
      KeepAwake.deactivateKeepAwake();
    };
  }, [phase]);

  // Start geofencing when shift begins (phase becomes EN_ROUTE with stops)
  useEffect(() => {
    if (phase === 'EN_ROUTE' && stops.length > 0) {
      startStopGeofences(stops).catch(console.warn);
    }
  }, [phase, stops.length]);

  // If no vehicle selected, show vehicle picker
  if (!vehicleProfile) {
    return (
      <ThemeProvider>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <StatusBar style="light" />
        <View style={styles.pickerWrapper}>
          <TextStyles.address style={styles.pickerTitle}>Select your vehicle to start</TextStyles.address>
          <VehiclePicker
            bottomSheetRef={vehiclePickerRef}
            onSelect={async (profile) => {
              await setVehicleProfile(profile);
            }}
          />
        </View>
      </View>
      </ThemeProvider>
    );
  }

  const openDetails = useCallback(() => {
    detailsSheetRef.current?.present();
  }, []);

  const openSettings = useCallback(() => {
    settingsSheetRef.current?.present();
  }, []);

  const openVehiclePicker = useCallback(() => {
    settingsSheetRef.current?.dismiss();
    vehiclePickerRef.current?.present();
  }, []);

  const handleImHere = useCallback(() => {
    markAtStop();
  }, [markAtStop]);

  const handleEndShift = useCallback(async () => {
    await stopStopGeofences();
    Alert.alert(
      'End Shift',
      'Are you sure you want to end the shift? Any undelivered stops will be marked incomplete.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Shift',
          style: 'destructive',
          onPress: () => {
            settingsSheetRef.current?.dismiss();
            endShift();
          },
        },
      ],
    );
  }, [endShift]);

  const handlePinConfirm = useCallback((correct: boolean, correctedLat?: number, correctedLng?: number) => {
    if (!correct && correctedLat !== undefined && correctedLng !== undefined) {
      setShowPinCorrection(true);
    } else {
      // Advance to next stop
      useDeliveryStore.getState().dismissPinConfirm();
    }
  }, []);

  const handlePinCorrectionSave = useCallback((lat: number, lng: number) => {
    useDeliveryStore.getState().savePinCorrection(lat, lng);
    setShowPinCorrection(false);
  }, []);

  const handlePinCorrectionCancel = useCallback(() => {
    setShowPinCorrection(false);
  }, []);

  // ── Pin confirm handlers ───────────────────────────────────────────────────

  const handlePinConfirm = useCallback((lat: number, lng: number) => {
    useDeliveryStore.getState().savePinCorrection(lat, lng);
  }, []);

  const handlePinSkip = useCallback(() => {
    useDeliveryStore.getState().dismissPinConfirm();
  }, []);

  // Pin correction screen
  if (showPinCorrection && currentStop) {
    return (
      <PinCorrectionScreen
        stop={currentStop}
        onSave={handlePinCorrectionSave}
        onCancel={handlePinCorrectionCancel}
      />
    );
  }

  // Render current phase
  const renderPhase = () => {
    switch (phase) {
      case 'EN_ROUTE':
        return (
          <EnRouteScreen
            onOpenDetails={openDetails}
            onOpenSettings={openSettings}
          />
        );
      case 'ARRIVING':
        return (
          <ArrivingScreen
            onImHere={handleImHere}
          />
        );
      case 'AT_STOP':
        return (
          <AtStopScreen
            failureSheetRef={failureSheetRef}
          />
        );
      default:
        return null;
    }
  };

  return (
    <ThemeProvider>
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style="light" />

      {/* Top bar with settings */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={openSettings}
          style={styles.settingsBtn}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Phase content with fade transition */}
      <Animated.View
        key={phase}
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.phaseContent}
      >
        {renderPhase()}
      </Animated.View>

      {/* Stop details bottom sheet */}
      {currentStop && (
        <StopDetailsSheet stop={currentStop} bottomSheetRef={detailsSheetRef} />
      )}

      {/* Vehicle picker */}
      <VehiclePicker
        bottomSheetRef={vehiclePickerRef}
        onSelect={async (profile) => {
          await setVehicleProfile(profile);
        }}
      />

      {/* Settings sheet */}
      <SettingsSheet
        bottomSheetRef={settingsSheetRef}
        onChangeVehicle={openVehiclePicker}
        onEndShift={handleEndShift}
      />

      {/* Failure reason sheet */}
      <FailureSheet
        bottomSheetRef={failureSheetRef}
        onSelect={(reason) => {
          useDeliveryStore.getState().markFailed(reason as any);
          failureSheetRef.current?.dismiss();
        }}
      />

      {/* Pin confirm bottom sheet — auto-presented for low-confidence stops */}
      {currentStop && (
        <BottomSheetModal
          ref={pinConfirmSheetRef}
          snapPoints={['95%']}
          backgroundStyle={{ backgroundColor: '#121212' }}
          handleIndicatorStyle={{ backgroundColor: '#393836' }}
          enablePanDownToClose={false}
        >
          <PinConfirmMap
            stop={{
              address: currentStop.address,
              lat:     currentStop.pin?.lat ?? currentStop.lat,
              lng:     currentStop.pin?.lng ?? currentStop.lng,
            }}
            onConfirm={handlePinConfirm}
            onSkip={handlePinSkip}
          />
        </BottomSheetModal>
      )}
    </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
    zIndex: 10,
  },
  settingsBtn: {
    width: 56,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsIcon: {
    fontSize: 24,
  },
  phaseContent: {
    flex: 1,
  },
  pickerWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerTitle: {
    textAlign: 'center',
    marginBottom: 24,
  },
});