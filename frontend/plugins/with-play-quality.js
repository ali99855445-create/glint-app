const {
  withAndroidManifest,
  withGradleProperties,
  withAndroidStyles,
  withAppBuildGradle,
} = require('@expo/config-plugins');

// Native Android is regenerated for every release. Keep these settings in a
// config plugin so `expo prebuild --clean` cannot silently undo them.
module.exports = function withPlayQuality(config) {
  config = withGradleProperties(config, (mod) => {
    const required = {
      'android.enableMinifyInReleaseBuilds': 'true',
      'android.enableShrinkResourcesInReleaseBuilds': 'true',
      'edgeToEdgeEnabled': 'true',
    };
    mod.modResults = mod.modResults.filter(
      (entry) => entry.type !== 'property' || !(entry.key in required),
    );
    for (const [key, value] of Object.entries(required)) {
      mod.modResults.push({ type: 'property', key, value });
    }
    return mod;
  });
  config = withAppBuildGradle(config, (mod) => {
    // Expo's default ProGuard file disables optimization even with R8 enabled.
    if (mod.modResults.language !== 'groovy') {
      throw new Error('Unsupported Android Gradle format');
    }
    mod.modResults.contents = mod.modResults.contents.replace(
      'getDefaultProguardFile("proguard-android.txt")',
      'getDefaultProguardFile("proguard-android-optimize.txt")',
    );
    return mod;
  });
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application[0];
    application.$['android:resizeableActivity'] = 'true';
    for (const activity of application.activity || []) {
      if (activity.$['android:name'] !== '.MainActivity') continue;
      delete activity.$['android:screenOrientation'];
      delete activity.$['android:maxAspectRatio'];
      delete activity.$['android:minAspectRatio'];
      activity.$['android:resizeableActivity'] = 'true';
    }
    return mod;
  });
  config = withAndroidStyles(config, (mod) => {
    // Edge-to-edge comes from ReactActivity/WindowInsets. Do not configure the
    // Android 15-deprecated window color attributes in the application theme.
    const obsolete = new Set([
      'android:statusBarColor',
      'android:navigationBarColor',
      'android:windowOptOutEdgeToEdgeEnforcement',
    ]);
    for (const style of mod.modResults.resources.style || []) {
      style.item = (style.item || []).filter((item) => !obsolete.has(item.$.name));
    }
    return mod;
  });
  return config;
};
