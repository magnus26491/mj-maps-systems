/**
 * ARRIVING screen — auto-triggered when within 200m of stop
 *
 * Layout:
 *  1. Map (180dp, non-interactive) with approach bearing arrow
 *  2. Access notes card (yellow-tinted)
 *  3. Plus code chip (tappable)
 *  4. Parking note card (if present)
 *  5. Audio brief (speaks access notes on arrival)
 *  6. Bottom button: "✅ I'M HERE"
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Linking from 'expo-linking';
import { useDeliveryStore, StopPoint } from '../../store/deliveryStore';
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
  const insets = useSafeAreaInsets();
  const currentStop = useDeliveryStore(s => s.currentStop);
  const hasSpokenRef = useRef(false);

  useEffect(() => {
    // Audio brief — fires once on transition to ARRIVING
    if (currentStop && !hasSpokenRef.current) {
      hasSpokenRef.current = true;
      const textToSpeak = currentStop.access_notes ||
        currentStop.pinMeta?.accessNotes ||
        currentStop.address;

      // Truncate to 30 words
      const words = textToSpeak.split(/\s+/);
      const truncated = words.slice(0, 30).join(' ') + (words.length > 30 ? '...' : '');

      // Check system mode and speak
      Speech.speak(truncated, {
        language: 'en-GB',
        pitch: 1.0,
        rate: 0.9,
      });
    }

    return () => {
      // Stop speech if component unmounts
      Speech.stop();
    };
  }, [currentStop?.id]);

  if (!currentStop?.pin) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TextStyles.body>Loading location...</TextStyles.body>
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Map */}
        <TouchableMap
          lat={lat}
          lng={lng}
          approachBearing={approachBearing}
          onPress={openInMaps}
        />

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
        <BottomButton
          title="✅ I'M HERE"
          onPress={handleImHere}
          variant="primary"
        />
      </View>
    </View>
  );
}

// ─── Touchable Map Component ──────────────────────────────────────────────────

interface TouchableMapProps {
  lat: number;
  lng: number;
  approachBearing: number;
  onPress: () => void;
}

function TouchableMap({ lat, lng, approachBearing, onPress }: TouchableMapProps) {
  const { View, TouchableOpacity, Text } = require('react-native');

  return (
    <TouchableOpacity
      style={mapStyles.container}
      onPress={onPress}
      activeOpacity={0.9}
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
  );
}

const mapStyles = StyleSheet.create({
  container: {
    height: 180,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.surfaceAlt,
  },
  map: {
    flex: 1,
  },
  arrowOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(34,197,94,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    fontSize: 20,
    color: COLORS.white,
  },
  tapHint: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tapHintText: {
    fontSize: 12,
    color: COLORS.gray,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
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
  },
  plusCodeWrapper: {
    marginTop: 16,
  },
  buttonWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
});