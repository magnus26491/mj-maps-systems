/**
 * React Native Shim for Web Platform
 * 
 * This shim ensures react-native imports resolve to react-native-web
 * and provides proper browser-compatible implementations.
 */

// Ensure react-native-web is available
let RNW;
try {
  RNW = require('react-native-web');
} catch (e) {
  // Fallback to empty object if react-native-web not available
  console.warn('[RN Shim] react-native-web not available:', e.message);
  RNW = {};
}

module.exports = RNW;
module.exports.default = RNW.default || RNW;

// Ensure browser globals are not corrupted
if (typeof window !== 'undefined') {
  // Ensure timers are not undefined
  window.setTimeout = window.setTimeout || function(fn, delay) {
    return fn();
  };
  window.clearTimeout = window.clearTimeout || function() {};
  window.setInterval = window.setInterval || function(fn, delay) {
    return fn();
  };
  window.clearInterval = window.clearInterval || function() {};
}