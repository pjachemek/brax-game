/**
 * Expo app configuration.
 *
 * The bundle identifiers below are what the App Store and Play Console key on;
 * change them before the first submission, not after. `owner`/`projectId` are
 * filled in by `eas init` and tie local builds to the EAS project.
 */

import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Brax',
  slug: 'brax',
  version: '1.0.0',
  orientation: 'portrait',
  scheme: 'brax',
  userInterfaceStyle: 'dark',
  newArchEnabled: true,
  // Store artwork is not in the repo yet; Expo's defaults are used until it is.
  // See apps/mobile/assets/README.md for the files to add and the keys to
  // uncomment — a submission will be rejected without them.
  //
  // icon: './assets/icon.png',
  // splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#0f172a' },
  assetBundlePatterns: ['**/*'],
  ios: {
    bundleIdentifier: 'com.sciamus.brax',
    supportsTablet: true,
    // The engine is reached over TLS in every environment that ships; plain
    // http is only for a LAN dev server, which the dev client allows anyway.
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.sciamus.brax',
    // adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0f172a' },
    edgeToEdgeEnabled: true,
  },
  extra: {
    eas: {
      // Replace with the id `eas init` writes, or keep it in eas.json.
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
};

export default config;
