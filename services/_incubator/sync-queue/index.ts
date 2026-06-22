/**
 * Background sync service — runs in a React Native AppState listener
 *
 * When the app comes to foreground AND has network:
 *   → flush the SQLite sync_queue to the server
 *   → upload any queued POD photos (base64 → presigned S3)
 *
 * This means a driver can complete an entire shift underground / in a farm
 * with zero signal, and all completions, failures, and POD photos will
 * upload automatically the moment signal returns — even if the app was
 * killed in between.
 */

import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { flushSyncQueue } from '../../packages/offline-cache/index.js';

interface SyncConfig {
  apiBase: string;
  getAuthToken: () => string;
}

let _config: SyncConfig | null = null;
let _listener: ReturnType<typeof AppState.addEventListener> | null = null;

export function startSyncService(config: SyncConfig) {
  _config = config;

  // Flush on foreground
  _listener = AppState.addEventListener('change', async (state: AppStateStatus) => {
    if (state === 'active') {
      await attemptFlush();
    }
  });

  // Also flush on reconnect
  NetInfo.addEventListener(state => {
    if (state.isConnected && state.isInternetReachable) {
      attemptFlush();
    }
  });

  // Initial flush on service start
  attemptFlush();
}

export function stopSyncService() {
  _listener?.remove();
  _listener = null;
}

async function attemptFlush() {
  if (!_config) return;

  const net = await NetInfo.fetch();
  if (!net.isConnected || !net.isInternetReachable) return;

  try {
    await flushSyncQueue(_config.apiBase, _config.getAuthToken());
  } catch (e) {
    // Silent fail — will retry next time
    console.warn('[SyncService] flush error:', e);
  }
}
