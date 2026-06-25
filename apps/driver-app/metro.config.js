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
  'expo-keep-awake': path.resolve(__dirname, 'shims/expo-keep-awake.web.ts'),
  'expo-notifications': path.resolve(__dirname, 'shims/expo-notifications.web.ts'),
  'expo-speech': path.resolve(__dirname, 'shims/expo-speech.web.ts'),
  'expo-sqlite': path.resolve(__dirname, 'shims/expo-sqlite.web.ts'),
  'react-native-maps': path.resolve(__dirname, 'shims/react-native-maps.web.tsx'),
};

module.exports = config;
