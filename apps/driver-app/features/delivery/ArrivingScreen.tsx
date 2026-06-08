/**
 * ARRIVING screen — auto-triggered when within 200m of stop
 *
 * Layout:
 *  1. Driving speed banner (when vehicle is moving)
 *  2. Map (180dp, non-interactive) with approach bearing arrow
 *  3. Access notes card (yellow-tinted)
 *  4. Plus code chip (tappable)
 *  5. Parking note card (if present)
 *  6. Audio brief (speaks access notes on arrival)
 *  7. Progress bar (stop X of N)
 *  8. Bottom button: "✅ I'M HERE"
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Linking from 'expo-linking';
import { useDeliveryStore, StopPoint } from '../../store/deliveryStore';
import { useDrivingMode } from '../../hooks/useDrivingMode';
import {
  COLORS,
  TextStyles,
  BottomButton,
  AccessNotesCard,
  PlusCodeChip,
  ParkingNoteCard,
} from './components';

interface ArrivingScreenProps {
  onImHere: () => void;
}

export function ArrivingScreen({ onImHere }: ArrivingScreenProps) {
  const insets      = useSafeAreaInsets();
  const currentStop = useDeliveryStore(s => s.currentStop);
  const totalStops  = useDeliveryStore(s => s.totalStops);
  const stopIndex   = useDeliveryStore(s => s.currentStopIndex);
  const isDriving   = useDrivingMode();
  const hasSpokenRef = useRef(false);

  useEffect(() => {
    if (!currentStop || hasSpokenRef.current) return;
    hasSpokenRef.current = true;

    const textToSpeak =
      currentStop.access_notes ||
      currentStop.pinMeta?.accessNotes ||
      currentStop.address;

    const words     = textToSpeak.split(/\s+/);
    const truncated = words.slice(0, 30).join(' ') + (words.length > 30 ? '...' : '');

    let cancelled = false;
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS:    true,
          staysActiveInBackground:  false,
          allowsRecordingIOS:      false,
          shouldDuckAndroid:       true,
        });
        if (!cancelled) {
          Speech.speak(truncated, { language: 'en-GB', pitch: 1.0, rate: 0.9 });
        }
      } catch { /* non-fatal */ }
    })();

    return () => {
      cancelled = true;
      Speech.stop();
      Audio.setAudioModeAsync({ playsInSilentModeIOS: false }).catch(() => {});
    };
  }, [currentStop?.id]);

  if (!currentStop?.pin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={TextStyles.body}>Loading location...</Text>
      </View>
    );
  }

  const { lat, lng } = currentStop.pin;
  const approachBearing = currentStop.turn?.approachBearing ?? 0;
  const accessNotes = currentStop.pinMeta?.accessNotes ?? currentStop.access_notes;

  const openInMaps = () => {
    const url = `comgooglemaps://?q=${lat},${lng}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`),
    );
  };

  const handleImHere = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onImHere();
  };

  return (
    <View style={[styles.container, { backgroundColor: COLORS.background }]}>
      {/* Driving speed banner — alert if still moving */}
      {isDriving.isDriving && (
        <View style={styles.drivingBanner}>
          <Text style={styles.drivingBannerText}>🚗  Slow down — approaching stop</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Map */}
        <TouchableOpacity
          style={mapStyles.container}
          onPress={openInMaps}
          activeOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel="Open delivery address in Maps"
          accessibilityHint="Opens the delivery location in Google Maps or Apple Maps"
        >
          <MapView
            style={mapStyles.map}
            provider={PROVIDER_DEFAULT}
            initialRegion={{
              latitude: lat,
              longitude: lng,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            <Marker coordinate={{ latitude: lat, longitude: lng }} />
          </MapView>

          {/* Approach bearing arrow overlay */}
          {approachBearing !== 0 && (
            <View style={[mapStyles.arrowOverlay, { transform: [{ rotate: `${approachBearing}deg` }] }]}>
              <Text style={mapStyles.arrow}>↑</Text>
            </View>
          )}

          {/* Tap hint */}
          <View style={mapStyles.tapHint}>
            <Text style={mapStyles.tapHintText}>Tap to open in Maps</Text>
          </View>
        </TouchableOpacity>

        {/* Access notes */}
        {accessNotes && <AccessNotesCard notes={accessNotes} />}

        {/* Plus code */}
        {currentStop.plusCode && (
          <View style={styles.plusCodeWrapper}>
            <PlusCodeChip plusCode={currentStop.plusCode} />
          </View>
        )}

        {/* Parking note */}
        <ParkingNoteCard accessNotes={accessNotes} />
      </ScrollView>

      {/* Bottom button */}
      <View style={[styles.buttonWrapper, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {/* Progress bar */}
        {totalStops > 0 && (
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${((stopIndex + 1) / totalStops) * 100}%` },
              ]}
            />
          </View>
        )}

        <BottomButton
          title="✅ I'M HERE"
          onPress={handleImHere}
          variant="primary"
          accessibilityRole="button"
          accessibilityLabel="I have arrived at the stop"
          accessibilityHint="Confirms you are at the delivery address and advances to the stop screen"
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mapStyles = StyleSheet.create({
  container: {
    height: 180,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceAlt,
  },
  map: { flex: 1 },
  arrowOverlay: {
    position: 'absolute',
    top: 8, right: 8,
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(34,197,94,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: { fontSize: 20, color: COLORS.white },
  tapHint: {
    position: 'absolute',
    bottom: 8, left: 0, right: 0,
    alignItems: 'center',
  },
  tapHintText: {
    fontSize: 12, color: COLORS.gray,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 4,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  drivingBanner: {
    backgroundColor: '#b71c1c',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  drivingBannerText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  plusCodeWrapper: { marginTop: 16 },
  buttonWrapper: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#1c2a37',
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: '#4fc3f7',
    borderRadius: 2,
  },
});