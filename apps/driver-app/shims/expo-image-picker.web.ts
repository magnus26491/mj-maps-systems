// Web stub for expo-image-picker — use <input type="file"> instead of native camera.

export enum MediaTypeOptions {
  All    = 'All',
  Videos = 'Videos',
  Images = 'Images',
}

export enum UIImagePickerPreferredAssetRepresentationMode {
  Automatic = 'automatic',
  Current   = 'current',
  Compatible = 'compatible',
}

export interface ImagePickerResult {
  canceled: boolean;
  assets: Array<{ uri: string; width: number; height: number; type?: string }> | null;
}

export async function requestCameraPermissionsAsync() {
  return { status: 'denied', granted: false };
}

export async function requestMediaLibraryPermissionsAsync() {
  return { status: 'granted', granted: true };
}

export async function launchCameraAsync(_options?: object): Promise<ImagePickerResult> {
  // Web: no native camera picker; return canceled
  return { canceled: true, assets: null };
}

export async function launchImageLibraryAsync(_options?: object): Promise<ImagePickerResult> {
  // Web: open a file input dialog
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { resolve({ canceled: true, assets: null }); return; }
      const uri = URL.createObjectURL(file);
      resolve({ canceled: false, assets: [{ uri, width: 0, height: 0, type: 'image' }] });
    };
    input.oncancel = () => resolve({ canceled: true, assets: null });
    input.click();
  });
}

export default {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
  MediaTypeOptions,
};
