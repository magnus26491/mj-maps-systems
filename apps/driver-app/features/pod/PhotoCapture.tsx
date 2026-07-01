/**
 * features/pod/PhotoCapture.tsx
 *
 * Photo capture using expo-image-picker.launchCameraAsync (NOT expo-camera).
 * Quality: 0.75 JPEG — good for POD, keeps file size small for offline queue.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../components/ThemeContext';

interface PhotoCaptureProps {
  onCapture: (uri: string) => void;
  captured:  boolean;
}

export function PhotoCapture({ onCapture, captured }: PhotoCaptureProps) {
  const { colors } = useTheme();

  const handlePress = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      allowsEditing: false,
      cameraType: ImagePicker.CameraType.back,
    });

    if (!result.canceled && result.assets[0]) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCapture(result.assets[0].uri);
    }
  };

  return (
    <View style={styles.wrapper}>
      <TouchableOpacity
        style={[
          styles.btn,
          { backgroundColor: captured ? colors.green : colors.surfaceAlt },
        ]}
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Capture proof of delivery photo"
        accessibilityHint="Opens camera to take a photo of the delivered parcel"
      >
        <Text style={styles.icon}>📷</Text>
        <Text style={styles.label}>Photo</Text>
        {captured && (
          <View style={styles.tickBadge}>
            <Text style={styles.tick}>✓</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  btn: {
    flex: 1,
    height: 64,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  icon:   { fontSize: 22 },
  label:  { fontSize: 12, color: '#fff', fontWeight: '600', marginTop: 4 },
  tickBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1b5e20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tick:   { color: '#fff', fontSize: 12, fontWeight: '700' },
});