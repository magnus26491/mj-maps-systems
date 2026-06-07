/**
 * Shared UI components for the delivery screen
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Linking from 'expo-linking';
import { StopPoint } from '../store/deliveryStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Colours ──────────────────────────────────────────────────────────────────

export const COLORS = {
  background:   '#0f1923',
  surface:     '#1a2633',
  surfaceAlt:   '#243447',
  amber:       '#f59e0b',
  red:         '#ef4444',
  green:       '#22c55e',
  blue:        '#3b82f6',
  yellow:      '#fef3c7',
  yellowText:  '#92400e',
  white:       '#ffffff',
  gray:        '#94a3b8',
  grayDark:    '#475569',
};

// ─── Shared text styles ────────────────────────────────────────────────────────

export const TextStyles = StyleSheet.create({
  address: { fontSize: 28, fontWeight: '600', color: COLORS.white, lineHeight: 34 },
  body:     { fontSize: 18, fontWeight: '400', color: COLORS.white, lineHeight: 24 },
  label:    { fontSize: 13, fontWeight: '500', color: COLORS.gray, letterSpacing: 1.5 },
  badge:    { fontSize: 13, fontWeight: '600', color: COLORS.white },
});

// ─── Badge component ───────────────────────────────────────────────────────────

interface BadgeProps {
  text: string;
  color?: string;
  textColor?: string;
}

export function Badge({ text, color = COLORS.surfaceAlt, textColor = COLORS.white }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={[TextStyles.badge, { color: textColor }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
});

// ─── Road Alert Banner ─────────────────────────────────────────────────────────

interface RoadAlertBannerProps {
  alertLevel: 'none' | 'amber' | 'red';
  message: string;
  onPress?: () => void;
}

export function RoadAlertBanner({ alertLevel, message, onPress }: RoadAlertBannerProps) {
  if (alertLevel === 'none') return null;

  const isAmber = alertLevel === 'amber';
  const bgColor = isAmber ? COLORS.amber : COLORS.red;
  const icon    = isAmber ? '⚠️' : '🔴';

  const Content = (
    <View style={[alertStyles.container, { backgroundColor: bgColor }]}>
      <Text style={alertStyles.icon}>{icon}</Text>
      <Text style={alertStyles.message} numberOfLines={2}>{message}</Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {Content}
      </TouchableOpacity>
    );
  }

  return Content;
}

const alertStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    minHeight: 72,
  },
  icon: {
    fontSize: 24,
    marginRight: 12,
  },
  message: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.white,
    lineHeight: 22,
  },
});

// ─── Stop Card ────────────────────────────────────────────────────────────────

interface StopCardProps {
  stop: StopPoint;
  showClusterBadge?: boolean;
  onPress?: () => void;
}

export function StopCard({ stop, showClusterBadge = true, onPress }: StopCardProps) {
  const isWalkCluster = showClusterBadge &&
    stop.clusterResult?.decision?.startsWith('WALK');
  const timeSaved = stop.clusterResult?.timeSavedMin ?? 0;

  const Content = (
    <View style={cardStyles.container}>
      <Text style={TextStyles.address} numberOfLines={2}>{stop.address}</Text>

      <View style={cardStyles.metaRow}>
        <Text style={cardStyles.metaText}>
          {stop.parcelCount} parcel{stop.parcelCount !== 1 ? 's' : ''} · {stop.totalWeightKg.toFixed(1)} kg
        </Text>
      </View>

      <View style={cardStyles.badgeRow}>
        {stop.requiresSignature && (
          <Badge text="📝 Signature required" color={COLORS.blue} />
        )}
        {stop.isOversize && (
          <Badge text="📦 Oversize" color={COLORS.amber} textColor={COLORS.background} />
        )}
        {isWalkCluster && (
          <Badge
            text={`🚶 Park here — walk ${timeSaved} stops`}
            color={COLORS.green}
          />
        )}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {Content}
      </TouchableOpacity>
    );
  }

  return Content;
}

const cardStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
  },
  metaRow: {
    marginTop: 12,
  },
  metaText: {
    fontSize: 16,
    color: COLORS.gray,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
});

// ─── Bottom Button ─────────────────────────────────────────────────────────────

interface BottomButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export function BottomButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
}: BottomButtonProps) {
  const bgColors = {
    primary:   COLORS.green,
    secondary: COLORS.surfaceAlt,
    danger:    COLORS.red,
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        buttonStyles.container,
        { backgroundColor: bgColors[variant] },
        disabled && buttonStyles.disabled,
      ]}
    >
      <Text style={buttonStyles.text}>{title}</Text>
    </TouchableOpacity>
  );
}

const buttonStyles = StyleSheet.create({
  container: {
    height: 72,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  text: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
  },
  disabled: {
    opacity: 0.5,
  },
});

// ─── Mini Map ─────────────────────────────────────────────────────────────────

interface MiniMapProps {
  lat: number;
  lng: number;
  approachBearing?: number;
  onPress?: () => void;
}

export function MiniMap({ lat, lng, approachBearing = 0, onPress }: MiniMapProps) {
  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    const url = `comgooglemaps://?q=${lat},${lng}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${lat},${lng}`),
    );
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      style={mapStyles.container}
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
    </TouchableOpacity>
  );
}

const mapStyles = StyleSheet.create({
  container: {
    height: 180,
    marginHorizontal: 16,
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrow: {
    fontSize: 18,
    color: COLORS.white,
  },
});

// ─── Progress Bar ─────────────────────────────────────────────────────────────

interface ProgressBarProps {
  current: number;
  total: number;
  remainingTime: string;
}

export function ProgressBar({ current, total, remainingTime }: ProgressBarProps) {
  const progress = total > 0 ? current / total : 0;

  return (
    <View style={progressStyles.container}>
      <View style={progressStyles.barBg}>
        <View style={[progressStyles.barFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={progressStyles.text}>
        Stop {current + 1} of {total}  ·  {remainingTime} remaining
      </Text>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  barBg: {
    height: 4,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: COLORS.green,
    borderRadius: 2,
  },
  text: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '500',
    color: COLORS.white,
  },
});

// ─── PlusCodeChip ─────────────────────────────────────────────────────────────

interface PlusCodeChipProps {
  plusCode: string;
  onPress?: () => void;
}

export function PlusCodeChip({ plusCode, onPress }: PlusCodeChipProps) {
  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    const url = `comgooglemaps://?q=${encodeURIComponent(plusCode)}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(plusCode)}`),
    );
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View style={chipStyles.container}>
        <Text style={chipStyles.icon}>📍</Text>
        <Text style={chipStyles.text}>{plusCode}</Text>
      </View>
    </TouchableOpacity>
  );
}

const chipStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginHorizontal: 16,
  },
  icon: {
    fontSize: 14,
    marginRight: 6,
  },
  text: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.white,
  },
});

// ─── Access Notes Card ─────────────────────────────────────────────────────────

interface AccessNotesCardProps {
  notes: string | undefined;
}

export function AccessNotesCard({ notes }: AccessNotesCardProps) {
  if (!notes) return null;

  return (
    <View style={notesStyles.container}>
      <Text style={notesStyles.label}>ACCESS NOTES</Text>
      <Text style={notesStyles.content} numberOfLines={6}>{notes}</Text>
    </View>
  );
}

const notesStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.yellow,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.yellowText,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  content: {
    fontSize: 18,
    color: COLORS.yellowText,
    lineHeight: 26,
  },
});

// ─── Parking Note Card ─────────────────────────────────────────────────────────

interface ParkingNoteCardProps {
  accessNotes: string | undefined;
}

export function ParkingNoteCard({ accessNotes }: ParkingNoteCardProps) {
  if (!accessNotes) return null;

  // Scan for parking-related content
  const hasParking = /park/i.test(accessNotes);
  if (!hasParking) return null;

  return (
    <View style={parkStyles.container}>
      <Text style={parkStyles.label}>🅿️ PARKING NOTE</Text>
      <Text style={parkStyles.content}>{accessNotes}</Text>
    </View>
  );
}

const parkStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.blue,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  content: {
    fontSize: 18,
    color: COLORS.white,
    lineHeight: 26,
  },
});

// ─── Stop Details ─────────────────────────────────────────────────────────────

interface StopDetailsProps {
  stop: StopPoint;
}

export function StopDetails({ stop }: StopDetailsProps) {
  return (
    <View style={detailsStyles.container}>
      <Text style={TextStyles.address}>{stop.address}</Text>

      <View style={detailsStyles.metaRow}>
        <Text style={detailsStyles.meta}>
          {stop.parcelCount} parcel{stop.parcelCount !== 1 ? 's' : ''} · {stop.totalWeightKg.toFixed(1)} kg
        </Text>
      </View>

      <View style={cardStyles.badgeRow}>
        {stop.requiresSignature && (
          <Badge text="📝 Signature required" color={COLORS.blue} />
        )}
        {stop.isOversize && (
          <Badge text="📦 Oversize" color={COLORS.amber} textColor={COLORS.background} />
        )}
      </View>

      {stop.plusCode && (
        <View style={{ marginTop: 12 }}>
          <PlusCodeChip plusCode={stop.plusCode} />
        </View>
      )}
    </View>
  );
}

const detailsStyles = StyleSheet.create({
  container: {
    padding: 16,
  },
  metaRow: {
    marginTop: 8,
  },
  meta: {
    fontSize: 16,
    color: COLORS.gray,
  },
});

// ─── Pin Confirm Card ─────────────────────────────────────────────────────────

interface PinConfirmCardProps {
  visible: boolean;
  onConfirm: (correct: boolean, correctedLat?: number, correctedLng?: number) => void;
}

export function PinConfirmCard({ visible, onConfirm }: PinConfirmCardProps) {
  if (!visible) return null;

  return (
    <View style={pinStyles.container}>
      <Text style={pinStyles.title}>📍 Was the pin in the right place?</Text>
      <View style={pinStyles.buttons}>
        <TouchableOpacity
          style={[pinStyles.button, { backgroundColor: COLORS.green }]}
          onPress={() => onConfirm(true)}
        >
          <Text style={pinStyles.buttonText}>YES ✓</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[pinStyles.button, { backgroundColor: COLORS.red }]}
          onPress={() => onConfirm(false)}
        >
          <Text style={pinStyles.buttonText}>NO — fix it</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const pinStyles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 16,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
});

// ─── Failure Reason Sheet ──────────────────────────────────────────────────────

interface FailureReasonSheetProps {
  onSelect: (reason: string) => void;
  onClose: () => void;
}

const FAILURE_REASONS = [
  { key: 'no_answer',      label: 'No answer' },
  { key: 'access_blocked', label: 'Access blocked' },
  { key: 'wrong_address',  label: 'Wrong address' },
  { key: 'refused',         label: 'Refused' },
  { key: 'safe_place_left', label: 'Safe place left' },
  { key: 'other',           label: 'Other' },
];

export function FailureReasonSheet({ onSelect, onClose }: FailureReasonSheetProps) {
  return (
    <View style={reasonStyles.container}>
      <Text style={reasonStyles.title}>Why couldn't you deliver?</Text>
      <View style={reasonStyles.grid}>
        {FAILURE_REASONS.map((reason) => (
          <TouchableOpacity
            key={reason.key}
            style={reasonStyles.chip}
            onPress={() => onSelect(reason.key)}
          >
            <Text style={reasonStyles.chipText}>{reason.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={reasonStyles.cancelBtn} onPress={onClose}>
        <Text style={reasonStyles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const reasonStyles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
    marginBottom: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  chip: {
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 140,
    alignItems: 'center',
  },
  chipText: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.white,
  },
  cancelBtn: {
    marginTop: 20,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    color: COLORS.gray,
  },
});