import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

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
        '@brax/engine-client/local': path.resolve(
          __dirname,
          'packages/engine-client/src/local-client.ts'
        ),
        '@brax/engine-client/http': path.resolve(
          __dirname,
          'packages/engine-client/src/http-client.ts'
        ),
        '@brax/engine-client': path.resolve(__dirname, 'packages/engine-client/src/index.ts'),
        '@brax/engine/view': path.resolve(__dirname, 'packages/engine/src/view.ts'),
        '@brax/engine': path.resolve(__dirname, 'packages/engine/src/index.ts'),
        '@': path.resolve(__dirname, '.'),
        'react-native': 'react-native-web',
        'react-native-svg': path.resolve(__dirname, 'src/mobile/shims/svg-shim.tsx'),
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
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
