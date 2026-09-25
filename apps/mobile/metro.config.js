/**
 * Metro configuration for the ReCheckers monorepo.
 *
 * The app's sources are not all under apps/mobile: @re-checkers/mobile-ui,
 * @re-checkers/engine and @re-checkers/engine-client are workspace packages whose TypeScript
 * source is consumed directly. Metro must therefore watch the repo root, and
 * must be told that a module may resolve from either node_modules folder.
 */

const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the workspace so edits in packages/* trigger a rebuild.
config.watchFolders = [workspaceRoot];

// 2. Resolve from the app first, then the hoisted root store.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Workspace packages expose their entry points through "exports" maps that
//    point at .ts source (e.g. @re-checkers/engine/view). Metro compiles TypeScript,
//    so this is resolved and transpiled like any other module.
config.resolver.unstable_enablePackageExports = true;

// 4. One copy of React and React Native. Two would break hooks the moment a
//    component from packages/mobile-ui rendered inside the app tree. These are
//    pinned in the root package.json, so npm hoists a single copy; resolve it
//    rather than assuming which node_modules folder it landed in.
const singleton = (name) =>
  path.dirname(require.resolve(name + '/package.json', { paths: [projectRoot] }));

config.resolver.extraNodeModules = {
  react: singleton('react'),
  'react-native': singleton('react-native'),
};

// 5. Do not let Metro walk up out of the workspace looking for modules.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
