/**
 * features/pod/usePodCapture.ts
 *
 * State hook for managing POD capture state per stop.
 * B2B-only — this module is only active when EXPO_PUBLIC_ENABLE_POD=true.
 */
import { useState, useCallback } from 'react';

export interface PodCapture {
  photoUri:     string | null;   // local file URI from expo-image-picker
  signatureSvg:  string | null;   // SVG string from @amwebexpert/react-native-sign-here
  barcodeValue:  string | null;   // scanned barcode string
  capturedAt:    number | null;   // Date.now() timestamp
}

interface UsePodCaptureReturn {
  pod:        PodCapture;
  setPhoto:    (uri: string) => void;
  setSignature: (svg: string) => void;
  setBarcode:  (value: string) => void;
  clearPod:    () => void;
  isComplete:  boolean;
}

const INITIAL: PodCapture = {
  photoUri:    null,
  signatureSvg: null,
  barcodeValue: null,
  capturedAt:  null,
};

export function usePodCapture(): UsePodCaptureReturn {
  const [pod, setPod] = useState<PodCapture>(INITIAL);

  const setPhoto = useCallback((uri: string) => {
    setPod(prev => ({ ...prev, photoUri: uri, capturedAt: Date.now() }));
  }, []);

  const setSignature = useCallback((svg: string) => {
    setPod(prev => ({ ...prev, signatureSvg: svg, capturedAt: Date.now() }));
  }, []);

  const setBarcode = useCallback((value: string) => {
    setPod(prev => ({ ...prev, barcodeValue: value, capturedAt: Date.now() }));
  }, []);

  const clearPod = useCallback(() => {
    setPod(INITIAL);
  }, []);

  const isComplete = pod.photoUri !== null || pod.signatureSvg !== null;

  return { pod, setPhoto, setSignature, setBarcode, clearPod, isComplete };
}