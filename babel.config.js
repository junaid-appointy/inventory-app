module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated v4 ships its worklet runtime as react-native-worklets;
    // the babel plugin MUST be the last entry. Without it, worklets don't
    // initialize and vision-camera's session setup fails on Android with
    // "session/invalid-output-configuration".
    plugins: ['react-native-worklets/plugin'],
  };
};
