/**
 * jest.setup.js
 *
 * Mocks all native modules that crash Jest (no JS implementation).
 * Referenced by package.json: "setupFiles": ["./jest.setup.js"]
 */

// AsyncStorage
jest.mock('@react-native-async-storage/async-storage',
  () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener:  jest.fn(() => jest.fn()),
  fetch:             jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
}));

// expo-haptics
jest.mock('expo-haptics', () => ({
  notificationAsync:        jest.fn(),
  impactAsync:              jest.fn(),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  ImpactFeedbackStyle:      { Heavy: 'heavy', Medium: 'medium', Light: 'light' },
}));

// expo-speech
jest.mock('expo-speech', () => ({
  speak:           jest.fn(),
  stop:            jest.fn(),
  isSpeakingAsync:  jest.fn().mockResolvedValue(false),
}));

// expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  watchPositionAsync:                  jest.fn().mockResolvedValue({ remove: jest.fn() }),
  startGeofencingAsync:               jest.fn().mockResolvedValue(undefined),
  stopGeofencingAsync:                jest.fn().mockResolvedValue(undefined),
  hasStartedGeofencingAsync:          jest.fn().mockResolvedValue(false),
  GeofencingEventType:                { Enter: 1, Exit: 2 },
  Accuracy:                           { Balanced: 3, BestForNavigation: 4 },
}));

// expo-task-manager
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));

// expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockResolvedValue({
    execAsync:    jest.fn().mockResolvedValue(undefined),
    runAsync:      jest.fn().mockResolvedValue(undefined),
    getAllAsync:   jest.fn().mockResolvedValue([]),
    getFirstAsync: jest.fn().mockResolvedValue({ count: 0 }),
  }),
}));

// react-native-widget-extension
jest.mock('react-native-widget-extension', () => ({
  areActivitiesEnabled: jest.fn().mockReturnValue(false),
  startActivity:         jest.fn().mockResolvedValue(undefined),
  updateActivity:        jest.fn().mockResolvedValue(undefined),
  endActivity:          jest.fn().mockResolvedValue(undefined),
}));

// expo-notifications
jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync:    jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync:       jest.fn().mockResolvedValue(undefined),
  dismissNotificationAsync:        jest.fn().mockResolvedValue(undefined),
  AndroidImportance:                { LOW: 2 },
  AndroidNotificationVisibility:   { PUBLIC: 1 },
  AndroidNotificationPriority:     { LOW: -1 },
}));

// expo-file-system
jest.mock('expo-file-system', () => ({
  File: jest.fn(),
  documentDirectory: 'file:///tmp/',
}));

// expo-keep-awake
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync:  jest.fn(),
  deactivateKeepAwake:    jest.fn(),
}));

// expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchCameraAsync:          jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  CameraType: { back: 'back' },
}));

// expo-camera
jest.mock('expo-camera', () => ({
  CameraView:        'CameraView',
  useCameraPermissions: () => [{ granted: true }, jest.fn()],
}));

// @gorhom/bottom-sheet
jest.mock('@gorhom/bottom-sheet', () => ({
  BottomSheetModal: 'BottomSheetModal',
}));

// react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

// react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native/Libraries/Components/View/View');
  return {
    GestureHandlerRootView: View,
    Swipeable:             View,
    DrawerLayout:           View,
    State:                  {},
    PanGestureHandler:     View,
    TapGestureHandler:     View,
    FlingGestureHandler:   View,
    LongPressGestureHandler: View,
    NativeGestureHandler:  View,
  };
});

// react-native-screens
jest.mock('react-native-screens', () => ({
  enableScreens: jest.fn(),
}));

// @amwebexpert/react-native-sign-here
jest.mock('@amwebexpert/react-native-sign-here', () => ({
  default: jest.fn(),
}));

// react-native-maps
jest.mock('react-native-maps', () => {
  const React = require('react');
  const View = require('react-native/Libraries/Components/View/View');
  const MockMapView = (props) => React.createElement(View, props);
  MockMapView.Animated = (props) => React.createElement(View, props);
  const Polyline  = (props) => React.createElement(View, props);
  const Marker    = (props) => React.createElement(View, props);
  const Callout   = (props) => React.createElement(View, props);
  return {
    __esModule: true,
    default: MockMapView,
    Polyline, Marker, Callout,
    PROVIDER_DEFAULT: null,
    PROVIDER_GOOGLE: 'google',
  };
});


// expo-clipboard
jest.mock('expo-clipboard', () => ({
  getStringAsync:    jest.fn().mockResolvedValue(''),
  setStringAsync:    jest.fn().mockResolvedValue(undefined),
  hasStringAsync:    jest.fn().mockResolvedValue(false),
}));


// expo-document-picker
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
}));


// expo-secure-store
jest.mock('expo-secure-store', () => {
  const store = {};
  return {
    setItemAsync:    jest.fn(async (key, val) => { store[key] = val; }),
    getItemAsync:    jest.fn(async (key) => store[key] ?? null),
    deleteItemAsync: jest.fn(async (key) => { delete store[key]; }),
  };
});