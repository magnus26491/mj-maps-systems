/**
 * features/pod/PodCaptureSection.tsx
 *
 * Assembles the three POD capture buttons into one section.
 * Only rendered when isPodAvailable() === true (B2B tier only).
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { usePodCapture } from './usePodCapture';
import { PhotoCapture } from './PhotoCapture';
import { SignatureCapture } from './SignatureCapture';
import { BarcodeCapture } from './BarcodeCapture';
import type { PodCapture } from './usePodCapture';
import { useTheme } from '../../components/ThemeContext';

interface PodCaptureSectionProps {
  onPodReady: (pod: PodCapture) => void;
}

export function PodCaptureSection({ onPodReady }: PodCaptureSectionProps) {
  const { colors } = useTheme();
  const { pod, setPhoto, setSignature, setBarcode, isComplete } = usePodCapture();

  useEffect(() => {
    if (isComplete) onPodReady(pod);
  }, [isComplete, pod]);

  return (
    <View style={[styles.container, { backgroundColor: colors.surface }]}>
      <Text style={[styles.label, { color: colors.subtext }]}>PROOF OF DELIVERY</Text>

      <View style={styles.actions}>
        <PhotoCapture    onCapture={setPhoto}    captured={!!pod.photoUri} />
        <SignatureCapture onCapture={setSignature} captured={!!pod.signatureSvg} />
        <BarcodeCapture  onCapture={setBarcode}  captured={!!pod.barcodeValue} />
      </View>

      {isComplete && (
        <View style={styles.doneRow}>
          <Text style={[styles.doneText, { color: colors.green }]}>
            ✓ POD captured
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  doneText: {
    fontSize: 15,
    fontWeight: '600',
  },
});