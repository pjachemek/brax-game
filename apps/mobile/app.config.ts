/**
 * Expo app configuration.
 *
 * The bundle identifiers below are what the App Store and Play Console key on;
 * change them before the first submission, not after. `owner`/`projectId` are
 * filled in by `eas init` and tie local builds to the EAS project.
 */

import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Re-Checkers',
  slug: 're-checkers',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 're-checkers',
  userInterfaceStyle: 'dark',
  // No `newArchEnabled`: the New Architecture is the only one RN 0.86 ships,
  // so the key was dropped from the config schema.
  // Store artwork is not in the repo yet; Expo's defaults are used until it is.
  // See apps/mobile/assets/README.md for the files to add and the keys to
  // uncomment — a submission will be rejected without them.
  //
  // icon: './assets/icon.png',
  // splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#0f172a' },
  assetBundlePatterns: ['**/*'],
  ios: {
    bundleIdentifier: 'com.pjit.recheckers',
    supportsTablet: true,
    // The engine is reached over TLS in every environment that ships; plain
    // http is only for a LAN dev server, which the dev client allows anyway.
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.pjit.recheckers',
    // adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0f172a' },
    // No `edgeToEdgeEnabled`: since SDK 55 Android is always edge-to-edge and
    // the opt-out key was removed from the config schema.
  },
  extra: {
    eas: {
      // Replace with the id `eas init` writes, or keep it in eas.json.
      projectId: "5072c2ba-29eb-4544-8795-55eaf13ec9e3",
    },
  },
};

export default config;
