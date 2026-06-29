'use strict';
/**
 * Web stub for react-native/Libraries/Core/ExceptionsManager.
 * The native ExceptionsManager uses TurboModuleRegistry.getEnforcing() which
 * throws on web. This stub provides the same surface but delegates to console.
 */
var noop = function () {};

module.exports = {
  handleException: function (e) {
    console.error('[ExceptionsManager.web]', e && e.message ? e.message : e);
  },
  reportFatalException: function (message) {
    console.error('[ExceptionsManager.web] fatal:', message);
  },
  updateExceptionMessage: noop,
  dismissRedbox: noop,
  reportException: function (e) {
    console.error('[ExceptionsManager.web]', e);
  },
  installConsoleErrorReporter: noop,
};
