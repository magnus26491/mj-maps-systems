// Web stub for expo-camera — not supported on web; scan.tsx gates on Platform.OS.

import { View } from 'react-native';

export type BarcodeScanningResult = {
  type: string;
  data: string;
  cornerPoints?: Array<{ x: number; y: number }>;
  bounds?: { origin: { x: number; y: number }; size: { width: number; height: number } };
};

export type CameraPermissionResponse = {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
};

const denied: CameraPermissionResponse = { status: 'denied', granted: false, canAskAgain: false };

// useCameraPermissions is a React hook; return [permission, requestFn]
export function useCameraPermissions(): [CameraPermissionResponse, () => Promise<CameraPermissionResponse>] {
  return [denied, async () => denied];
}

// CameraView renders nothing on web
export const CameraView = View;

export const Camera = {
  requestCameraPermissionsAsync: async (): Promise<CameraPermissionResponse> => denied,
};

export default Camera;
