// Polyfill for __fbBatchedBridgeConfig on web
// This is required by React Native's native module bridge on web

(function() {
  // Define global if not present (browsers don't have global by default)
  if (typeof global === 'undefined') {
    window.global = window;
  }
  console.log('[POLYFILL] global defined:', typeof global);
  
  // __fbBatchedBridgeConfig polyfill
  if (!('__fbBatchedBridgeConfig' in global)) {
    Object.defineProperty(global, '__fbBatchedBridgeConfig', {
      value: { remoteModuleConfig: [] },
      writable: true,
      configurable: true,
    });
  }
  console.log('[POLYFILL] __fbBatchedBridgeConfig:', typeof global.__fbBatchedBridgeConfig);

  if (typeof window !== 'undefined' && !('__fbBatchedBridgeConfig' in window)) {
    Object.defineProperty(window, '__fbBatchedBridgeConfig', {
      value: { remoteModuleConfig: [] },
      writable: true,
      configurable: true,
    });
  }
  
  console.log('[POLYFILL] Setup complete');
})();