module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // worklets de VisionCamera v5 (frame processors)
      'react-native-worklets/plugin',
    ],
  };
};
