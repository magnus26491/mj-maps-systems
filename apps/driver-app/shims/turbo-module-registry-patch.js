/**
 * TurboModuleRegistry Patch for Web Platform
 * 
 * This patch must run BEFORE any other JavaScript to ensure
 * TurboModuleRegistry calls don't crash in the browser.
 * 
 * Browser environments don't have native TurboModules, so we
 * provide safe stubs that won't crash the app.
 */

(function() {
  'use strict';

  // Track if we've already patched
  if (typeof window !== 'undefined' && window.__turboModulePatched) return;
  if (typeof window !== 'undefined') window.__turboModulePatched = true;

  // Ensure global exists
  if (typeof global === 'undefined' && typeof window !== 'undefined') {
    window.global = window;
  }

  // Create safe TurboModuleRegistry mock
  var TurboModuleRegistryMock = {
    _modules: {},
    _fallbacks: {},

    get: function(name) {
      return this._modules[name] || this._fallbacks[name] || null;
    },

    getEnforcing: function(name) {
      var mod = this._modules[name] || this._fallbacks[name];
      if (!mod) {
        console.debug('[TurboModuleRegistry] Module "' + name + '" not found, using stub');
        // Return a safe empty stub
        return {
          __esModule: true,
          default: {}
        };
      }
      return mod;
    },

    register: function(name, module) {
      this._modules[name] = module;
    }
  };

  // Register common React Native modules with safe stubs
  TurboModuleRegistryMock._fallbacks = {
    'ExceptionsManager': { handleException: function() {}, reportFatalException: function() {} },
    'Timing': { createTimer: function() {}, deleteTimer: function() {} },
    'UIManager': { getViewManagerConfig: function() { return {}; } },
    'Networking': { sendRequest: function() {} },
    'PlatformConstants': { getConstants: function() { return {}; } },
    'LogBox': { ignoreAllLogs: function() {}, ignoreLogs: function() {} },
    'DevMenu': {},
    'DevSettings': { reload: function() {}, setHotspotEnabled: function() {} },
    'SourceCode': { getConstants: function() { return { scriptURL: '' }; } },
    'DeviceInfo': { getConstants: function() { return { Platform: 'web' }; } },
  };

  // Install TurboModuleRegistry globally
  if (typeof global !== 'undefined') {
    global.TurboModuleRegistry = global.TurboModuleRegistry || TurboModuleRegistryMock;
  }
  if (typeof window !== 'undefined') {
    window.TurboModuleRegistry = window.TurboModuleRegistry || TurboModuleRegistryMock;
  }

  // Also patch __turboModuleRegistry
  if (typeof global !== 'undefined') {
    global.__turboModuleRegistry = global.__turboModuleRegistry || {};
  }

  console.debug('[TurboModuleRegistry] Web patch installed');
})();
