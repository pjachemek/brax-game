/**
 * Brax Mobile UI Package Entry Point
 *
 * Folder layout:
 *   engine.ts   - the transport seam each host app configures at startup
 *   types.ts    - UI-level types shared across the mobile package
 *   store/      - Zustand state container (useGameStore) + its tests
 *   hooks/      - reusable React hooks (animation primitives)
 *   components/ - React Native view layer
 *   shims/      - web substitutes for React Native modules (see vite.config.ts)
 */

export * from './engine.ts';
export * from './types.ts';
export * from './store/index.ts';
export * from './hooks/index.ts';
export * from './components/index.ts';
