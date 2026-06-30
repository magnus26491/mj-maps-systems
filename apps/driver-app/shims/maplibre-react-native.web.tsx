/**
 * shims/maplibre-react-native.web.tsx
 *
 * MapLibre React Native is a native-only library.
 * On web, render a themed placeholder so the bundle doesn't crash
 * and the UI layout remains intact.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const Noop: React.FC<any> = () => null;

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

// Named exports used by navigation.tsx
export const UserLocation    = Noop;
export const ShapeSource     = Noop;
export const LineLayer       = Noop;
export const FillLayer       = Noop;
export const FillExtrusionLayer = Noop;
export const SymbolLayer     = Noop;
export const BackgroundLayer = Noop;
export const CircleLayer     = Noop;
export const RasterLayer     = Noop;
export const VectorSource    = Noop;
export const RasterSource    = Noop;
export const ImageSource     = Noop;
export const Images          = Noop;
export const MarkerView      = Noop;
export const Light           = Noop;
export const PointAnnotation = Noop;
export const Callout         = Noop;
export const Annotation      = Noop;
export const Camera          = Noop;
export const UserTrackingMode = { Follow: 'follow' };
export const Animated        = { View: require('react-native').Animated.View };

export const offlineManager = {
  createPack:  () => Promise.resolve(),
  deletePack:  () => Promise.resolve(),
  getPacks:    () => Promise.resolve([]),
};

export default MapView;