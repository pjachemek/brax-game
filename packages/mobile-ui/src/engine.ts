/**
 * Brax Mobile UI - Engine client seam.
 *
 * This package renders a board and holds interaction state; it never decides
 * where the rules run. Each host app configures a transport once at startup:
 *
 *   apps/mobile  HttpEngineClient against the hosted engine service
 *   apps/web     whatever VITE_ENGINE_TRANSPORT selects, so the simulator tab
 *                behaves exactly like the shipped app
 *
 * Keeping the choice out of here is what lets the same components run under
 * Metro (no `import.meta.env`) and under Vite without a bundler-specific
 * branch, and it is the seam tests use to inject a local client.
 */

import type { BraxEngineClient } from '@brax/engine-client';

let client: BraxEngineClient | null = null;

/** Install the transport. Call once, before the first store action runs. */
export function configureEngineClient(next: BraxEngineClient | null): void {
  client = next;
}

/**
 * The configured transport. Resolved per call rather than at module load, so
 * importing the store does not pin a client and a host can swap one in later.
 */
export function getEngineClient(): BraxEngineClient {
  if (!client) {
    throw new Error(
      '@brax/mobile-ui: no engine client configured. Call configureEngineClient() during app startup.'
    );
  }
  return client;
}
