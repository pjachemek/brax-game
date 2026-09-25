/**
 * ReCheckers - iOS / Android application root.
 *
 * This app ships no rules. It installs the HTTP transport once, then hands the
 * screen to @re-checkers/mobile-ui — the same view layer the web workbench renders in
 * its simulator tab. Legality, ReCheckers rights, capture and victory all come back
 * from the engine service over the wire.
 *
 * MobileGameScreen opens its own session and renders its own connecting and
 * retry states, so there is nothing to await here.
 */

import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MobileGameScreen, configureEngineClient } from '@re-checkers/mobile-ui';

import { createAppEngineClient } from './src/engine.ts';

configureEngineClient(createAppEngineClient());

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <MobileGameScreen />
    </SafeAreaProvider>
  );
}
