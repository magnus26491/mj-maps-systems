'use strict';
/**
 * Web replacement for react-native/Libraries/TurboModule/TurboModuleRegistry.
 *
 * The `react-native` → `react-native-web` alias in extraNodeModules only
 * intercepts bare `react-native` imports. Packages that import the subpath
 * `react-native/Libraries/TurboModule/TurboModuleRegistry` directly bypass
 * the alias and get the native implementation, which throws on the web.
 *
 * This module is wired up via resolver.resolveRequest in metro.config.js.
 */

var noop = function () {};

var _modules = {
  ExceptionsManager: {
    handleException: noop,
    reportFatalException: noop,
    updateExceptionMessage: noop,
    dismissRedbox: noop,
    reportException: noop,
    installConsoleErrorReporter: noop,
  },
  Timing: {
    createTimer: noop,
    deleteTimer: noop,
    setSendIdleEvents: noop,
  },
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
  },
  NativePerformanceCxx: {},
  NativePerformanceObserverCxx: {},
  BlobModule: {
    enableBlobSupport: noop,
    disableBlobSupport: noop,
    createFromParts: noop,
    release: noop,
  },
  LogBox: { ignoreAllLogs: noop, ignoreLogs: noop },
  SourceCode: { getConstants: function () { return { scriptURL: '' }; } },
  DevSettings: { reload: noop, setHotspotEnabled: noop },
};

module.exports = {
  get: function (name) {
    return _modules[name] || null;
  },
  getEnforcing: function (name) {
    var m = _modules[name];
    if (!m) {
      console.debug('[TurboModuleRegistry.web] stub for:', name);
      m = {};
      _modules[name] = m;
    }
    return m;
  },
  register: function (name, m) {
    _modules[name] = m;
  },
};
