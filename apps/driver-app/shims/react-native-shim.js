// Shim that re-exports react-native-web for the web platform
// This allows Metro to resolve 'react-native' imports to react-native-web

const RNW = require('react-native-web');

module.exports = RNW;
module.exports.default = RNW.default;