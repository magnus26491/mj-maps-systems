/**
 * features/pod/BarcodeCapture.tsx
 *
 * Barcode scanner modal using expo-camera CameraView.
 * Camera is ONLY active while modal is visible.
 * MLKit/AVFoundation handles barcode detection natively.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../components/ThemeContext';

interface BarcodeCaptureProps {
  onCapture: (value: string) => void;
  captured:  boolean;
}

const BARCODE_TYPES = [
  'qr', 'code128', 'code39', 'ean13', 'ean8',
  'upc_a', 'upc_e', 'pdf417', 'data_matrix',
] as const;

export function BarcodeCapture({ onCapture, captured }: BarcodeCaptureProps) {
  const { colors } = useTheme();
  const [modalVisible, setModalVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const handleOpen = useCallback(async () => {
    if (permission?.granted) {
      setModalVisible(true);
    } else {
      const result = await requestPermission();
      if (result.granted) setModalVisible(true);
    }
  }, [permission, requestPermission]);

  const handleScan = useCallback(async (data: { data?: string }) => {
    if (!data.data) return;
    setModalVisible(false);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onCapture(data.data);
  }, [onCapture]);

  return (
    <>
      {/* Trigger button */}
      <View style={styles.wrapper}>
        <TouchableOpacity
          style={[
            styles.btn,
            { backgroundColor: captured ? colors.green : colors.surfaceAlt },
          ]}
          onPress={handleOpen}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Scan parcel barcode"
          accessibilityHint="Opens camera to scan the parcel barcode or QR code"
        >
          <Text style={styles.icon}>📦</Text>
          <Text style={styles.label}>Scan</Text>
          {captured && (
            <View style={styles.tickBadge}>
              <Text style={styles.tick}>✓</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Camera modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modal}>
          {permission?.granted ? (
            <>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: BARCODE_TYPES as any,
                }}
                onBarcodeScanned={handleScan}
              />

              {/* Scan frame overlay */}
              <View style={styles.overlay}>
                <View style={styles.scanFrame} />
              </View>

              {/* Instructions */}
              <Text style={styles.hint}>Point at parcel barcode</Text>

              {/* Cancel */}
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Cancel barcode scan"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.noPermission}>
              <Text style={styles.noPermText}>Camera permission required</Text>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelText}>Close</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </>
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
  modal:  { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 260,
    height: 260,
    borderWidth: 3,
    borderColor: '#4fc3f7',
    borderRadius: 16,
  },
  hint: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
  },
  cancelBtn: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    height: 64,
    marginHorizontal: 40,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  noPermission: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  noPermText: { color: '#fff', fontSize: 17 },
});