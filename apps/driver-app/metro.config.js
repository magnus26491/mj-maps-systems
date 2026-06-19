const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Prevent metro from crawling up into the monorepo root node_modules
config.watchFolders = [__dirname];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

// Resolve custom native modules for web platform
config.resolver.extraNodeModules = {
  'expo-camera': path.resolve(__dirname, 'modules/expo-camera'),
  'expo-image-picker': path.resolve(__dirname, 'modules/expo-image-picker'),
  'expo-location': path.resolve(__dirname, 'modules/expo-location'),
  'expo-secure-store': path.resolve(__dirname, 'modules/expo-secure-store'),
  'react-native-maps': path.resolve(__dirname, 'modules/react-native-maps'),
  'react-native': path.resolve(__dirname, 'modules/react-native'),
  'expo-keep-awake': path.resolve(__dirname, 'shims/expo-keep-awake.web.ts'),
  'expo-notifications': path.resolve(__dirname, 'shims/expo-notifications.web.ts'),
  'expo-speech': path.resolve(__dirname, 'shims/expo-speech.web.ts'),
  'expo-sqlite': path.resolve(__dirname, 'shims/expo-sqlite.web.ts'),
  'react-native-reanimated': path.resolve(__dirname, 'modules/react-native-reanimated'),
  'react-native-gesture-handler': path.resolve(__dirname, 'modules/react-native-gesture-handler'),
};

// Force all modules to be inlined (no async loading)
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
