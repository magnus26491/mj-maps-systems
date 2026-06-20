const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.watchFolders = [__dirname];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
];

// Only shim modules that actually exist as files/dirs
config.resolver.extraNodeModules = {
  'expo-keep-awake': path.resolve(__dirname, 'shims/expo-keep-awake.web.ts'),
  'expo-notifications': path.resolve(__dirname, 'shims/expo-notifications.web.ts'),
  'expo-speech': path.resolve(__dirname, 'shims/expo-speech.web.ts'),
  'expo-sqlite': path.resolve(__dirname, 'shims/expo-sqlite.web.ts'),
};

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
