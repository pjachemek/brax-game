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
      '@brax/engine-client/local': r('packages/engine-client/src/local-client.ts'),
      '@brax/engine-client/http': r('packages/engine-client/src/http-client.ts'),
      '@brax/engine-client': r('packages/engine-client/src/index.ts'),
      '@brax/engine/view': r('packages/engine/src/view.ts'),
      '@brax/engine': r('packages/engine/src/index.ts'),
      '@brax/mobile-ui/engine': r('packages/mobile-ui/src/engine.ts'),
      '@brax/mobile-ui': r('packages/mobile-ui/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'services/**/*.test.ts'],
    environment: 'node',
  },
});
