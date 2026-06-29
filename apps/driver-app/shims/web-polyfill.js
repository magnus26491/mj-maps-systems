/**
 * Web polyfill — injected at the start of the Metro bundle via serializer.getPolyfills.
 *
 * Must run BEFORE any React Native module code. Expo's static renderer strips
 * <script dangerouslySetInnerHTML> from +html.tsx, so we inject here instead.
 *
 * Responsibilities:
 *  1. Ensure global === window
 *  2. Stub TurboModuleRegistry so getEnforcing() never throws
 *  3. Pin browser timer functions so RN runtime cannot overwrite them
 *  4. Provide __fbBatchedBridgeConfig (legacy bridge safety net)
 */
(function () {
  'use strict';

  // 1 — global
  if (typeof global === 'undefined') {
    window.global = window;
  }

  // 2 — TurboModuleRegistry
  if (!global.TurboModuleRegistry) {
    var noop = function () {};
    var fallbacks = {
      ExceptionsManager: {
        handleException: noop,
        reportFatalException: noop,
        updateExceptionMessage: noop,
        dismissRedbox: noop,
      },
      Timing: { createTimer: noop, deleteTimer: noop, setSendIdleEvents: noop },
      UIManager: {
        getViewManagerConfig: function () { return {}; },
        hasViewManagerConfig: function () { return false; },
        getConstants: function () { return {}; },
        dispatchViewManagerCommand: noop,
      },
      PlatformConstants: {
        getConstants: function () {
          return {
            isTesting: false,
            reactNativeVersion: { major: 0, minor: 74, patch: 0 },
          };
        },
        forceTouchAvailable: false,
        interfaceIdiom: 'unknown',
        osVersion: 'web',
        systemName: 'web',
      },
      NativePerformanceCxx: {},
      NativePerformanceObserverCxx: {},
      LogBox: { ignoreAllLogs: noop, ignoreLogs: noop },
      SourceCode: { getConstants: function () { return { scriptURL: '' }; } },
      DevSettings: { reload: noop, setHotspotEnabled: noop },
    };

    global.TurboModuleRegistry = {
      _m: {},
      get: function (n) {
        return this._m[n] || fallbacks[n] || null;
      },
      getEnforcing: function (n) {
        var m = this._m[n] || fallbacks[n];
        if (!m) {
          console.debug('[TurboModuleRegistry] stub:', n);
          m = {};
        }
        return m;
      },
      register: function (n, m) {
        this._m[n] = m;
      },
    };
  }

  // 3 — Pin browser timers so RN runtime cannot overwrite them.
  // configurable:false + no-op setter: assignment in strict mode won't throw,
  // and Object.defineProperty attempts to redefine will fail silently (caught below).
  if (typeof window !== 'undefined' && window.setTimeout) {
    var _setTimeout   = window.setTimeout.bind(window);
    var _clearTimeout  = window.clearTimeout.bind(window);
    var _setInterval   = window.setInterval.bind(window);
    var _clearInterval = window.clearInterval.bind(window);
    var _nop = function () {};
    [
      ['setTimeout',   _setTimeout],
      ['clearTimeout',  _clearTimeout],
      ['setInterval',   _setInterval],
      ['clearInterval', _clearInterval],
    ].forEach(function (pair) {
      try {
        Object.defineProperty(global, pair[0], {
          get: function () { return pair[1]; },
          set: _nop,
          configurable: false,
          enumerable: true,
        });
      } catch (_) {}
    });
  }

  // 4 — Legacy bridge safety net
  if (!global.__fbBatchedBridgeConfig) {
    Object.defineProperty(global, '__fbBatchedBridgeConfig', {
      value: { remoteModuleConfig: [] },
      writable: true,
      configurable: true,
    });
  }
})();
