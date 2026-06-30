const _mem = new Map<string, string>();

function ls(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch { return null; }
}

export async function getItemAsync(key: string): Promise<string | null> {
  return ls()?.getItem(key) ?? _mem.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  const storage = ls();
  if (storage) storage.setItem(key, value);
  else _mem.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  const storage = ls();
  if (storage) storage.removeItem(key);
  else _mem.delete(key);
}

export async function isAvailableAsync(): Promise<boolean> { return true; }

export default { getItemAsync, setItemAsync, deleteItemAsync, isAvailableAsync };
