/**
 * EN_ROUTE screen — driving to the next stop
 *
 * Layout:
 *  1. Shift progress bar
 *  2. Road alert banner (conditional)
 *  3. Next stop card
 *  4. Bottom button → opens details sheet
 */
import React, { useCallback } from 'react';
import { View, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useDeliveryStore, StopPoint } from '../../store/deliveryStore';
import { useDeliveryLocation } from '../../hooks/useDeliveryLocation';
import {
  COLORS,
  TextStyles,
  ProgressBar,
  RoadAlertBanner,
  StopCard,
  BottomButton,
  MiniMap,
  PlusCodeChip,
  AccessNotesCard,
} from './components';

interface EnRouteScreenProps {
  onOpenDetails: () => void;
  onOpenSettings: () => void;
}

export function EnRouteScreen({ onOpenDetails, onOpenSettings }: EnRouteScreenProps) {
  const insets = useSafeAreaInsets();
  const currentStop = useDeliveryStore(s => s.currentStop);
  const currentStopIndex = useDeliveryStore(s => s.currentStopIndex);
  const totalStops = useDeliveryStore(s => s.totalStops);
  const getRemainingTimeEstimate = useDeliveryStore(s => s.getRemainingTimeEstimate);

  useDeliveryLocation();

  if (!currentStop) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.emptyState}>
          <TextStyles.address>No stops remaining</TextStyles.address>
        </View>
      </View>
    );
  }

  const alertLevel = currentStop.turn?.alertLevel ?? 'none';
  const turnMessage = currentStop.turn?.message ?? '';
  const remainingTime = getRemainingTimeEstimate();

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      {/* Progress bar */}
      <ProgressBar
        current={currentStopIndex}
        total={totalStops}
        remainingTime={remainingTime}
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

      {/* Bottom button */}
      <View style={[styles.buttonWrapper, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <BottomButton
          title="SEE STOP DETAILS →"
          onPress={onOpenDetails}
          variant="secondary"
        />
      </View>
    </View>
  );
}

// ─── Stop Details Sheet ───────────────────────────────────────────────────────

interface StopDetailsSheetProps {
  stop: StopPoint;
  bottomSheetRef: React.RefObject<BottomSheetModal | null>;
}

export function StopDetailsSheet({ stop, bottomSheetRef }: StopDetailsSheetProps) {
  const accessNotes = stop.pinMeta?.accessNotes ?? stop.access_notes;

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={['60%', '90%']}
      backgroundStyle={{ backgroundColor: COLORS.background }}
      handleIndicatorStyle={{ backgroundColor: COLORS.grayDark }}
    >
      <View style={detailsStyles.container}>
        {/* Full address */}
        <TextStyles.address style={detailsStyles.address}>{stop.address}</TextStyles.address>

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
            <TextStyles.label style={detailsStyles.label}>ACCESS NOTES</TextStyles.label>
            <TextStyles.body>{accessNotes}</TextStyles.body>
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
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});