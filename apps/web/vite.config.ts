import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Sources live outside apps/web (packages/*), so Vite must be allowed to read
// them and the aliases must resolve from the repo root, not this app folder.
const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      // react-native-web packages ship `.web.js` variants of modules that would
      // otherwise reach for native code (react-native-safe-area-context's
      // NativeSafeAreaProvider, for one). These must be tried before the plain
      // extensions so the web build picks them up.
      extensions: [
        '.web.tsx',
        '.web.ts',
        '.web.jsx',
        '.web.js',
        '.tsx',
        '.ts',
        '.jsx',
        '.js',
        '.mjs',
        '.mts',
        '.json',
      ],
      alias: {
        // Workspace packages. Order matters: subpaths must precede their parent.
        //
        // The app imports the two adapters from their own subpaths rather than
        // through the package index, so a VITE_ENGINE_TRANSPORT=http build can
        // drop the unused local adapter instead of shipping both.
        '@re-checkers/engine-client/local': path.resolve(repoRoot, 'packages/engine-client/src/local-client.ts'),
        '@re-checkers/engine-client/http': path.resolve(repoRoot, 'packages/engine-client/src/http-client.ts'),
        '@re-checkers/engine-client': path.resolve(repoRoot, 'packages/engine-client/src/index.ts'),
        '@re-checkers/engine/view': path.resolve(repoRoot, 'packages/engine/src/view.ts'),
        '@re-checkers/engine': path.resolve(repoRoot, 'packages/engine/src/index.ts'),
        '@re-checkers/mobile-ui/engine': path.resolve(repoRoot, 'packages/mobile-ui/src/engine.ts'),
        '@re-checkers/mobile-ui': path.resolve(repoRoot, 'packages/mobile-ui/src/index.ts'),
        '@': path.resolve(__dirname, '.'),
        'react-native': 'react-native-web',
        // The mobile package draws with react-native-svg; on web the shim maps
        // those primitives onto DOM <svg>. apps/mobile uses the real package.
        'react-native-svg': path.resolve(repoRoot, 'packages/mobile-ui/src/shims/svg-shim.tsx'),
      },
    },
    optimizeDeps: {
      // Dev pre-bundling runs through esbuild, which needs the same ordering.
      esbuildOptions: {
        resolveExtensions: [
          '.web.tsx',
          '.web.ts',
          '.web.jsx',
          '.web.js',
          '.tsx',
          '.ts',
          '.jsx',
          '.js',
          '.mjs',
          '.mts',
          '.json',
        ],
      },
    },
    server: {
      fs: {
        // packages/* are symlinked workspace sources above the app root.
        allow: [repoRoot],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
