const fs = require('fs');
const path = require('path');

const rnPath = path.resolve(__dirname, '../node_modules/react-native');
const genericStub = '// @flow\nmodule.exports = function() {};';

// Files that need a generic no-op stub (native-only, don't exist on web)
const filesToStub = [
  'Libraries/Utilities/Platform.js',
  'Libraries/EventEmitter/RCTEventEmitter.js',
  'Libraries/ReactPrivate/ReactNativePrivateInterface.js',
  'Libraries/Alert/RCTAlertManager.js',
  // NativeModules.js intentionally omitted — RN 0.74 new arch uses TurboModuleRegistry
  // (polyfilled in app/+html.tsx); stubbing it broke @expo/metro-runtime timer setup
  'Libraries/Components/AccessibilityInfo/legacySendAccessibilityEvent.js',
  'Libraries/Core/RawEventEmitter.js',
  'Libraries/Network/RCTNetworking.js',
  'Libraries/Vendor/RTCEventEmitter.js',
  'Libraries/ReactNative/renderApplication.js',
  'Libraries/Utilities/BackHandler.js',
  'Libraries/ReactNative/AppRegistry.js',
  'Libraries/Utilities/DevSettings.js',
  'Libraries/Utilities/HMRClient.js',
  'Libraries/Utilities/HMRClientProdShim.js',
];

// Custom stubs for files that need specific implementations on web
const customStubs = {
  // TurboModuleRegistry: getEnforcing() must return a no-op object instead of
  // throwing. The native file uses ES module relative imports that bypass Metro's
  // resolveRequest shim, so we patch the file directly here.
  'Libraries/TurboModule/TurboModuleRegistry.js': `'use strict';
var _noop = function() {};
var _registry = {
  ExceptionsManager: {
    handleException: _noop, reportFatalException: _noop, reportSoftException: _noop,
    updateExceptionMessage: _noop, dismissRedbox: _noop, reportException: _noop,
  },
  Timing: { createTimer: _noop, deleteTimer: _noop, setSendIdleEvents: _noop },
  UIManager: {
    getViewManagerConfig: function() { return {}; },
    hasViewManagerConfig: function() { return false; },
    getConstants: function() { return {}; },
    dispatchViewManagerCommand: _noop,
    configureNextLayoutAnimation: _noop,
  },
  PlatformConstants: {
    getConstants: function() {
      return { isTesting: false, reactNativeVersion: { major: 0, minor: 74, patch: 0 } };
    },
    forceTouchAvailable: false, interfaceIdiom: 'unknown', osVersion: 'web', systemName: 'web',
  },
  SourceCode: { getConstants: function() { return { scriptURL: '' }; } },
  DevSettings: { reload: _noop, setHotspotEnabled: _noop, setIsShakeToShowDevMenuEnabled: _noop },
  BlobModule: { enableBlobSupport: _noop, disableBlobSupport: _noop, createBlob: _noop, releaseBlob: _noop },
  NativePerformanceCxx: {}, NativePerformanceObserverCxx: {},
  LogBox: { ignoreAllLogs: _noop, ignoreLogs: _noop },
  AppState: { getCurrentAppState: _noop, addListener: _noop, removeListeners: _noop },
  Networking: {
    sendRequest: _noop, abortRequest: _noop, clearCookies: _noop,
    addListener: _noop, removeListeners: _noop,
  },
};
module.exports = {
  get: function(name) { return _registry[name] || null; },
  getEnforcing: function(name) { return _registry[name] || {}; },
  register: function(name, m) { _registry[name] = m; },
};
`,
};

filesToStub.forEach(file => {
  const filePath = path.join(rnPath, file);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, genericStub);
  console.log('Stubbed:', file);
});

Object.entries(customStubs).forEach(([file, content]) => {
  const filePath = path.join(rnPath, file);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
  console.log('Custom stub:', file);
});

console.log('Done stubbing react-native for web build');
