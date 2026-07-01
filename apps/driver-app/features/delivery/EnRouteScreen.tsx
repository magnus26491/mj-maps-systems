/**
 * EN_ROUTE screen — driving to the next stop
 *
 * Layout:
 *  1. Shift progress bar
 *  2. Road alert banner (conditional)
 *  3. Next stop card
 *  4. Bottom button → opens details sheet
 */
import React, { useCallback, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Text, TouchableOpacity, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useDeliveryStore, StopPoint } from '../../store/deliveryStore';
import { useVehicleStore } from '../../store/vehicleStore';
import { useDeliveryLocation } from '../../hooks/useDeliveryLocation';
import { useDrivingMode } from '../../hooks/useDrivingMode';
import { useTurnScore } from '../../hooks/useTurnScore';
import { ShiftProgressBar } from '../../components/ShiftProgressBar';
import { useTheme } from '../../components/ThemeContext';
import {
  TextStyles,
  RoadAlertBanner,
  StopCard,
  BottomButton,
  MiniMap,
  PlusCodeChip,
  AccessNotesCard,
  COLORS,
} from './components';

interface EnRouteScreenProps {
  onOpenDetails: () => void;
  onOpenSettings: () => void;
}

export function EnRouteScreen({ onOpenDetails, onOpenSettings }: EnRouteScreenProps) {
  const insets    = useSafeAreaInsets();
  const { colors } = useTheme();
  const currentStop = useDeliveryStore(s => s.currentStop);
  const currentStopIndex = useDeliveryStore(s => s.currentStopIndex);
  const totalStops = useDeliveryStore(s => s.totalStops);
  const getRemainingTimeEstimate = useDeliveryStore(s => s.getRemainingTimeEstimate);
  const { isDriving } = useDrivingMode();
  const vehicleProfile = useVehicleStore(s => s.vehicleProfile);

  // Get turn score from the fixed useTurnScore hook
  const vehicleId = vehicleProfile ?? null;
  const { alert, score, reason } = useTurnScore(currentStop as any, vehicleId);

  useDeliveryLocation();

  // Merge live turn score with stored turn data
  const liveAlertLevel = alert === 'RED' ? 'red' : alert === 'AMBER' ? 'amber' : 'none';
  const alertLevel = liveAlertLevel !== 'none' ? liveAlertLevel : currentStop?.turn?.alertLevel ?? 'none';

  // Haptic on alert level change
  useEffect(() => {
    if (!currentStop) return;
    if (alertLevel === 'red') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else if (alertLevel === 'amber') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [alertLevel, currentStop?.id]);

  if (!currentStop) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={TextStyles.address}>No stops remaining</Text>
      </View>
    );
  }

  // Use live score message if available, otherwise fall back to stored
  const turnMessage = reason ?? currentStop.turn?.message ?? '';
  const remainingTime = getRemainingTimeEstimate();

  // Open external maps with directions to the stop
  const openNavigation = useCallback(() => {
    const lat = currentStop?.pin?.lat ?? currentStop?.lat;
    const lng = currentStop?.pin?.lng ?? currentStop?.lng;
    if (!lat || !lng) return;
    const googleMapsUrl = `comgooglemaps://?daddr=${lat},${lng}&directionsmode=driving`;
    const appleMapsUrl = `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
    const fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    Linking.openURL(googleMapsUrl).catch(() =>
      Linking.openURL(appleMapsUrl).catch(() =>
        Linking.openURL(fallbackUrl)
      )
    );
  }, [currentStop]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Progress bar */}
      <ShiftProgressBar
        current={currentStopIndex}
        total={totalStops}
        remainingLabel={remainingTime}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Road alert banner */}
        {alertLevel !== 'none' && (
          <RoadAlertBanner
            alertLevel={alertLevel}
            message={turnMessage}
            onPress={onOpenDetails}
          />
        )}

        {/* Next stop card */}
        <View style={styles.cardWrapper}>
          <StopCard
            stop={currentStop}
            showClusterBadge={true}
            onPress={onOpenDetails}
          />
        </View>
      </ScrollView>

      {/* Bottom buttons */}
      <View style={[styles.buttonWrapper, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* Navigate button */}
        <TouchableOpacity
          style={styles.navigateBtn}
          onPress={openNavigation}
          accessibilityRole="button"
          accessibilityLabel="Navigate to stop using Google Maps or Apple Maps"
        >
          <Text style={styles.navigateBtnText}>🗺️ Navigate</Text>
        </TouchableOpacity>
        {/* Stop details button */}
        {isDriving ? (
          <BottomButton
            title="ARRIVING SOON"
            onPress={() => {}}
            variant="secondary"
            disabled={true}
          />
        ) : (
          <BottomButton
            title="SEE STOP DETAILS →"
            onPress={onOpenDetails}
            variant="secondary"
          />
        )}
      </View>
    </View>
  );
}

// ─── Stop Details Sheet ───────────────────────────────────────────────────────

interface StopDetailsSheetProps {
  stop: StopPoint;
  bottomSheetRef: React.RefObject<BottomSheetModal>;
}

export function StopDetailsSheet({ stop, bottomSheetRef }: StopDetailsSheetProps) {
  const { colors } = useTheme();
  const accessNotes = stop.pinMeta?.accessNotes ?? stop.access_notes;

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={['60%', '90%']}
      backgroundStyle={{ backgroundColor: colors.background }}
      handleIndicatorStyle={{ backgroundColor: colors.gray }}
    >
      <View style={detailsStyles.container}>
        {/* Full address */}
        <Text style={[TextStyles.address, detailsStyles.address]}>{stop.address}</Text>

        {/* Plus code */}
        {stop.plusCode && (
          <View style={detailsStyles.plusCode}>
            <PlusCodeChip plusCode={stop.plusCode} />
          </View>
        )}

        {/* Map preview */}
        {stop.pin && (
          <MiniMap
            lat={stop.pin.lat}
            lng={stop.pin.lng}
            approachBearing={stop.turn?.approachBearing ?? 0}
          />
        )}

        {/* Access notes */}
        {accessNotes && (
          <View style={detailsStyles.accessNotes}>
            <Text style={[TextStyles.label, detailsStyles.label]}>ACCESS NOTES</Text>
            <Text style={TextStyles.body}>{accessNotes}</Text>
          </View>
        )}
      </View>
    </BottomSheetModal>
  );
}

const detailsStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  address: {
    marginBottom: 12,
  },
  plusCode: {
    marginBottom: 16,
  },
  accessNotes: {
    marginTop: 16,
    backgroundColor: COLORS.surface,
    padding: 16,
    borderRadius: 12,
  },
  label: {
    marginBottom: 8,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 160,
  },
  cardWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 20,
  },
  buttonWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
  },
  navigateBtn: {
    backgroundColor: '#4fc3f7',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    flex: 1,
  },
  navigateBtnText: {
    color: '#0f1923',
    fontSize: 16,
    fontWeight: '800',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});