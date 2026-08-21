module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Must be listed last — compiles the `useSharedValue`/`useAnimatedStyle`/
    // `runOnJS`/Gesture callback code used throughout the app (IndexTable's
    // swipe pagination, AppModal's drag-to-dismiss, etc.) into worklets that
    // can actually run on the UI thread. Without this plugin those APIs
    // silently fail to work correctly instead of erroring, which is why the
    // swipe animation was getting stuck mid-transition.
    plugins: ['react-native-worklets/plugin'],
  };
};
