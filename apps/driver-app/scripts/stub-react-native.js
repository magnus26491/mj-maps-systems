const fs = require('fs');
const path = require('path');

const rnPath = path.resolve(__dirname, '../node_modules/react-native');
const stub = '// @flow\nmodule.exports = function() {};';

// Files that need stubs (these are native-only and don't exist on web)
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

filesToStub.forEach(file => {
  const filePath = path.join(rnPath, file);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, stub);
  console.log('Stubbed:', file);
});

console.log('Done stubbing react-native for web build');
