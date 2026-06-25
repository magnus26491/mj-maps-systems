/**
 * POIMarkers — custom map markers for fuel stations and EV charging points.
 *
 * Designed for maximum legibility across:
 *   · Dark map (default driver mode)
 *   · Light map (daytime / satellite)
 *   · Low-light / night conditions
 *   · Small screen sizes
 *
 * Fuel    → deep orange  (#FF6D00) — universally recognisable, high contrast
 * EV      → electric teal (#00E5FF) — distinctive, signals "electric/clean"
 * Both use a thick white outer ring that lifts them off any background.
 *
 * Callout shows key details when tapped.
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import type { FuelStation, EVCharger } from '../lib/api';

// ── Fuel Station Marker ──────────────────────────────────────────────────────

interface FuelMarkerProps {
  station:  FuelStation;
  onPress?: () => void;
}

export function FuelMarker({ station, onPress }: FuelMarkerProps) {
  const label = (station.brand ?? station.name ?? 'Fuel').slice(0, 7);

  return (
    <Marker
      coordinate={{ latitude: station.lat, longitude: station.lng }}
      tracksViewChanges={false}
      onPress={onPress}
      zIndex={10}
    >
      {/* Custom marker view */}
      <View style={styles.fuelPin}>
        <Text style={styles.pinEmoji}>⛽</Text>
        <Text style={styles.fuelLabel} numberOfLines={1}>{label}</Text>
      </View>

      {/* Callout shown on tap */}
      <Callout tooltip>
        <View style={styles.callout}>
          <Text style={styles.calloutTitle}>⛽ {station.brand ?? station.name ?? 'Fuel Station'}</Text>
          {station.name && station.brand && station.name !== station.brand && (
            <Text style={styles.calloutSub}>{station.name}</Text>
          )}
          {station.openingHours && (
            <Text style={styles.calloutDetail}>🕐 {station.openingHours}</Text>
          )}
        </View>
      </Callout>
    </Marker>
  );
}

// ── EV Charging Marker ───────────────────────────────────────────────────────

interface EVMarkerProps {
  charger:  EVCharger;
  onPress?: () => void;
}

export function EVMarker({ charger, onPress }: EVMarkerProps) {
  const label = charger.maxKw
    ? `${charger.maxKw}kW`
    : (charger.network ?? 'EV').slice(0, 6);

  return (
    <Marker
      coordinate={{ latitude: charger.lat, longitude: charger.lng }}
      tracksViewChanges={false}
      zIndex={10}
    >
      <View style={styles.evPin}>
        <Text style={styles.pinEmoji}>⚡</Text>
        <Text style={styles.evLabel} numberOfLines={1}>{label}</Text>
      </View>

      <Callout tooltip>
        <View style={styles.callout}>
          <Text style={styles.calloutTitle}>⚡ {charger.network ?? charger.name ?? 'EV Charger'}</Text>
          {charger.name && charger.network && charger.name !== charger.network && (
            <Text style={styles.calloutSub}>{charger.name}</Text>
          )}
          {charger.maxKw && (
            <Text style={styles.calloutDetail}>⚡ {charger.maxKw} kW</Text>
          )}
          {charger.capacity && (
            <Text style={styles.calloutDetail}>🔌 {charger.capacity} point{charger.capacity !== 1 ? 's' : ''}</Text>
          )}
          {charger.sockets.length > 0 && (
            <Text style={styles.calloutDetail}>{charger.sockets.join(' · ')}</Text>
          )}
          {charger.freeToUse === true && (
            <Text style={styles.calloutFree}>FREE</Text>
          )}
        </View>
      </Callout>
    </Marker>
  );
}

// ── Toggle Button ────────────────────────────────────────────────────────────

interface POIToggleProps {
  showFuel:      boolean;
  showEV:        boolean;
  onToggleFuel:  () => void;
  onToggleEV:    () => void;
}

export function POIToggle({ showFuel, showEV, onToggleFuel, onToggleEV }: POIToggleProps) {
  return (
    <View style={styles.toggleRow}>
      <TouchableOpacity
        style={[styles.toggleBtn, showFuel && styles.toggleBtnFuelOn]}
        onPress={onToggleFuel}
        activeOpacity={0.75}
        accessibilityLabel="Toggle fuel stations"
      >
        <Text style={styles.toggleEmoji}>⛽</Text>
        <Text style={[styles.toggleLabel, showFuel && styles.toggleLabelFuelOn]}>Fuel</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleBtn, showEV && styles.toggleBtnEVOn]}
        onPress={onToggleEV}
        activeOpacity={0.75}
        accessibilityLabel="Toggle EV charging points"
      >
        <Text style={styles.toggleEmoji}>⚡</Text>
        <Text style={[styles.toggleLabel, showEV && styles.toggleLabelEVOn]}>EV</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Fuel pin ──
  fuelPin: {
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#FF6D00',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    // Android shadow
    elevation: 5,
    minWidth: 46,
  },
  pinEmoji: {
    fontSize: 18,
    lineHeight: 22,
    textAlign: 'center',
  },
  fuelLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginTop: 1,
  },

  // ── EV pin ──
  evPin: {
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#006B6B',   // deep teal background
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderWidth: 2.5,
    borderColor: '#00E5FF',       // bright cyan border — glows against dark maps
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 5,
    minWidth: 46,
  },
  evLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#00E5FF',
    textAlign: 'center',
    letterSpacing: 0.3,
    marginTop: 1,
  },

  // ── Callout ──
  callout: {
    backgroundColor: '#1c2a37',
    borderRadius: 10,
    padding: 12,
    minWidth: 160,
    maxWidth: 240,
    borderWidth: 1,
    borderColor: '#2e3f50',
    // Drop shadow for callout
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },
  calloutTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f0f4f8',
    marginBottom: 4,
  },
  calloutSub: {
    fontSize: 12,
    color: '#8fa0b0',
    marginBottom: 2,
  },
  calloutDetail: {
    fontSize: 12,
    color: '#c8d8e8',
    marginTop: 3,
  },
  calloutFree: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
    color: '#00E5FF',
    backgroundColor: '#003344',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },

  // ── Toggle buttons ──
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,25,35,0.85)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#2e3f50',
  },
  toggleBtnFuelOn: {
    backgroundColor: 'rgba(255, 109, 0, 0.15)',
    borderColor: '#FF6D00',
  },
  toggleBtnEVOn: {
    backgroundColor: 'rgba(0, 229, 255, 0.10)',
    borderColor: '#00E5FF',
  },
  toggleEmoji: {
    fontSize: 15,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8fa0b0',
  },
  toggleLabelFuelOn: {
    color: '#FF6D00',
  },
  toggleLabelEVOn: {
    color: '#00E5FF',
  },
});
