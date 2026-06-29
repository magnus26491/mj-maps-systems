// Web stub for expo-document-picker — uses a file input element.

export interface DocumentPickerResult {
  canceled: boolean;
  assets: Array<{ uri: string; name: string; mimeType?: string; size?: number }> | null;
}

export async function getDocumentAsync(options?: {
  type?: string | string[];
  multiple?: boolean;
}): Promise<DocumentPickerResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options?.type) {
      input.accept = Array.isArray(options.type) ? options.type.join(',') : options.type;
    }
    if (options?.multiple) input.multiple = true;

    input.onchange = () => {
      const files = input.files;
      if (!files || files.length === 0) {
        resolve({ canceled: true, assets: null });
        return;
      }
      const assets = Array.from(files).map(f => ({
        uri:      URL.createObjectURL(f),
        name:     f.name,
        mimeType: f.type,
        size:     f.size,
      }));
      resolve({ canceled: false, assets });
    };
    input.oncancel = () => resolve({ canceled: true, assets: null });
    input.click();
  });
}

export default { getDocumentAsync };
