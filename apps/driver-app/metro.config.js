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
  'react-native':                   reactNativeWebPath,
  'expo-keep-awake':                path.resolve(__dirname, 'shims/expo-keep-awake.web.ts'),
  'expo-notifications':             path.resolve(__dirname, 'shims/expo-notifications.web.ts'),
  'expo-speech':                    path.resolve(__dirname, 'shims/expo-speech.web.ts'),
  'expo-sqlite':                    path.resolve(__dirname, 'shims/expo-sqlite.web.ts'),
  'expo-location':                  path.resolve(__dirname, 'shims/expo-location.web.ts'),
  'expo-camera':                    path.resolve(__dirname, 'shims/expo-camera.web.ts'),
  'expo-av':                        path.resolve(__dirname, 'shims/expo-av.web.ts'),
  'expo-haptics':                   path.resolve(__dirname, 'shims/expo-haptics.web.ts'),
  'expo-image-picker':              path.resolve(__dirname, 'shims/expo-image-picker.web.ts'),
  'expo-task-manager':              path.resolve(__dirname, 'shims/expo-task-manager.web.ts'),
  'expo-document-picker':           path.resolve(__dirname, 'shims/expo-document-picker.web.ts'),
  'react-native-widget-extension':  path.resolve(__dirname, 'shims/react-native-widget-extension.web.ts'),
  'react-native-maps':              path.resolve(__dirname, 'shims/react-native-maps.web.tsx'),
  '@maplibre/maplibre-react-native': path.resolve(__dirname, 'shims/maplibre-react-native.web.tsx'),
};

// ── Resolver: intercept native RN subpath imports on web ─────────────────────
//
// extraNodeModules aliases the ROOT `react-native` import to react-native-web,
// but subpath imports like `react-native/Libraries/TurboModule/TurboModuleRegistry`
// bypass that alias and pull in native-only code. We redirect the problematic
// ones to web stubs via resolveRequest.
const WEB_SUBPATH_SHIMS = {
  'react-native/Libraries/TurboModule/TurboModuleRegistry':
    path.resolve(__dirname, 'shims/turbo-module-registry.web.js'),
  'react-native/Libraries/Core/setUpTimers':
    path.resolve(__dirname, 'shims/setup-timers.web.js'),
  'react-native/Libraries/Core/ExceptionsManager':
    path.resolve(__dirname, 'shims/exceptions-manager.web.js'),
};

// Absolute file paths for native modules we want to intercept regardless of
// how they are imported (bare package path OR relative path from inside RN).
const NATIVE_TMR_PATH = path.resolve(
  __dirname,
  'node_modules/react-native/Libraries/TurboModule/TurboModuleRegistry.js',
);

const _resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = function (context, moduleName, platform) {
  if (platform === 'web') {
    // Intercept absolute package-path shims
    if (WEB_SUBPATH_SHIMS[moduleName]) {
      return { filePath: WEB_SUBPATH_SHIMS[moduleName], type: 'sourceFile' };
    }
    // Intercept relative-path imports of native TurboModuleRegistry so files
    // inside react-native (e.g. NativeExceptionsManager) also get the web stub.
    if (
      moduleName.includes('TurboModuleRegistry') &&
      !moduleName.includes('shims')
    ) {
      return {
        filePath: WEB_SUBPATH_SHIMS['react-native/Libraries/TurboModule/TurboModuleRegistry'],
        type: 'sourceFile',
      };
    }
  }
  if (_resolveRequest) return _resolveRequest(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

// ── Serializer: inject polyfill as the first code in the Metro web bundle ───
//
// This runs before any RN module initialisation (including the resolver shims
// above), giving us a global safety net for TurboModuleRegistry and timers.
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
