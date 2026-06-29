const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Include monorepo root so packages/* and services/* can be imported via relative paths
const monorepoRoot = path.resolve(__dirname, '../..');
config.watchFolders = [__dirname, monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

// Alias react-native → react-native-web for web platform
const reactNativeWebPath = path.resolve(__dirname, 'node_modules/react-native-web');

config.resolver.extraNodeModules = {
  'react-native': reactNativeWebPath,
  'expo-keep-awake':      path.resolve(__dirname, 'shims/expo-keep-awake.web.ts'),
  'expo-notifications':   path.resolve(__dirname, 'shims/expo-notifications.web.ts'),
  'expo-speech':          path.resolve(__dirname, 'shims/expo-speech.web.ts'),
  'expo-sqlite':          path.resolve(__dirname, 'shims/expo-sqlite.web.ts'),
  'expo-location':        path.resolve(__dirname, 'shims/expo-location.web.ts'),
  'expo-camera':          path.resolve(__dirname, 'shims/expo-camera.web.ts'),
  'react-native-maps':    path.resolve(__dirname, 'shims/react-native-maps.web.tsx'),
  '@maplibre/maplibre-react-native': path.resolve(__dirname, 'shims/maplibre-react-native.web.tsx'),
};

// Inject polyfill as the very first code in the Metro bundle (web only).
// This runs before any RN module initialisation, ensuring TurboModuleRegistry
// stubs and timer pinning are in place before setUpTimers.js executes.
const polyfillPath = path.resolve(__dirname, 'shims/web-polyfill.js');
config.serializer = config.serializer || {};
const _getPolyfills = config.serializer.getPolyfills;
config.serializer.getPolyfills = function (ctx) {
  const base = _getPolyfills ? _getPolyfills(ctx) : [];
  if (ctx && ctx.platform === 'web') {
    return [polyfillPath, ...base];
  }
  return base;
};

module.exports = config;
