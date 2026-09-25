/**
 * Test runner for the whole workspace.
 *
 * The suites (engine rules, mobile store, transport parity) run against the
 * TypeScript sources, so the workspace aliases are declared here rather than
 * relying on any one app's bundler config.
 */

import path from 'path';
import {defineConfig} from 'vitest/config';

const r = (p: string) => path.resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: {
      // Subpaths must precede their parent.
      '@re-checkers/engine-client/local': r('packages/engine-client/src/local-client.ts'),
      '@re-checkers/engine-client/http': r('packages/engine-client/src/http-client.ts'),
      '@re-checkers/engine-client': r('packages/engine-client/src/index.ts'),
      '@re-checkers/engine/view': r('packages/engine/src/view.ts'),
      '@re-checkers/engine': r('packages/engine/src/index.ts'),
      '@re-checkers/mobile-ui/engine': r('packages/mobile-ui/src/engine.ts'),
      '@re-checkers/mobile-ui': r('packages/mobile-ui/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'services/**/*.test.ts'],
    environment: 'node',
  },
});
