/**
 * PinConfirmMap — draggable pin confirm UI for low-confidence geocodes
 *
 * Rendered when a stop has requiresPinConfirm === true.
 * Driver drags the marker to the correct entrance, taps "Confirm pin",
 * which POSTs to /api/v1/pins/confirm, then shows a brief success toast.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ToastAndroid,
  Platform,
  Alert,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface PinConfirmMapProps {
  stop: { address: string; lat: number; lng: number };
  onConfirm: (lat: number, lng: number) => void;
  onSkip: () => void;
}

export function PinConfirmMap({ stop, onConfirm, onSkip }: PinConfirmMapProps) {
  const insets = useSafeAreaInsets();

  const [region, setRegion] = useState<Region>({
    latitude:  stop.lat,
    longitude: stop.lng,
    latitudeDelta:  0.002,
    longitudeDelta: 0.002,
  });

  const [markerPos, setMarkerPos] = useState({
    lat: stop.lat,
    lng: stop.lng,
  });

  const [confirming, setConfirming] = useState(false);

  const showToast = useCallback((message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.showWithGravity(message, ToastAndroid.SHORT, ToastAndroid.CENTER);
    } else {
      Alert.alert('', message, [{ text: 'OK' }]);
    }
  }, []);

  const handleConfirm = useCallback(async () => {
    setConfirming(true);
    try {
      const res = await fetch('/api/v1/pins/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: stop.address,
          lat: markerPos.lat,
          lng: markerPos.lng,
        }),
      });

      if (res.ok) {
        showToast('\u{1F4CD} Pin saved \u2014 thanks!');
        onConfirm(markerPos.lat, markerPos.lng);
      } else {
        const body = await res.json().catch(() => ({}));
        showToast(`Save failed: ${(body as any).error ?? 'unknown error'}`);
      }
    } catch (err) {
      showToast('Network error \u2014 pin not saved');
    } finally {
      setConfirming(false);
    }
  }, [markerPos, onConfirm, showToast, stop.address]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title}>Confirm delivery location</Text>
        <Text style={styles.subtitle}>
          We couldn't precisely locate this address.{'\n'}
          Drag the pin to the correct entrance.
        </Text>
      </View>

      {/* Map with draggable marker */}
      <View style={styles.mapWrapper}>
        <MapView
          style={styles.map}
          provider={PROVIDER_DEFAULT}
          region={region}
          onRegionChangeComplete={setRegion}
          onPress={(e) =>
            setMarkerPos({
              lat: e.nativeEvent.coordinate.latitude,
              lng: e.nativeEvent.coordinate.longitude,
            })
          }
        >
          <Marker
            coordinate={{ latitude: markerPos.lat, longitude: markerPos.lng }}
            draggable
            onDragEnd={(e) =>
              setMarkerPos({
                lat: e.nativeEvent.coordinate.latitude,
                lng: e.nativeEvent.coordinate.longitude,
              })
            }
            title="Delivery entrance"
            description={stop.address}
          />
        </MapView>
      </View>

      {/* Address label on map */}
      <View style={styles.addressRow}>
        <Text style={styles.addressLabel} numberOfLines={1}>
          {stop.address}
        </Text>
      </View>

      {/* Buttons */}
      <View style={[styles.buttonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip pin confirmation"
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.confirmButton, confirming && styles.confirmButtonDisabled]}
          onPress={handleConfirm}
          disabled={confirming}
          accessibilityRole="button"
          accessibilityLabel="Confirm pin at current location"
        >
          <Text style={styles.confirmText}>
            {confirming ? 'Saving...' : 'Confirm pin'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f5f5f0',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#9a9a94',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 20,
  },
  mapWrapper: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  addressRow: {
    backgroundColor: '#1c1b19',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  addressLabel: {
    fontSize: 14,
    color: '#cdccca',
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  skipButton: {
    flex: 1,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#393836',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9a9a94',
  },
  confirmButton: {
    flex: 2,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#01696f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f5f5f0',
  },
});
