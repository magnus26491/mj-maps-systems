/**
 * react-native-maps web shim.
 * react-native-maps is native-only (Google Maps / Apple Maps SDK).
 * On web, render an unstyled placeholder so the bundle doesn't crash.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const Noop: React.FC<any> = () => null;

// MapView renders a dark placeholder so the UI doesn't look broken
function MapView({ style, children }: { style?: any; children?: React.ReactNode }) {
  return (
    <View style={[styles.map, style]}>
      <Text style={styles.label}>Map view not available in browser</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: '#0f1923',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  label: { color: '#4b5563', fontSize: 13 },
});

// Named exports used in navigation.tsx
export const Marker   = Noop;
export const Polyline = Noop;
export const Callout  = Noop;
export const Circle   = Noop;
export const Polygon  = Noop;
export const Overlay  = Noop;

export const PROVIDER_DEFAULT = null;
export const PROVIDER_GOOGLE  = null;

export default MapView;
