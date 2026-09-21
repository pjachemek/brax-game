/**
 * Brax App - Engine client wiring.
 *
 * The only place in the app that knows where the rules engine runs. Everything
 * else depends on the BraxEngineClient interface, so switching between the
 * bundled engine and the hosted service is a build-time environment change:
 *
 *   VITE_ENGINE_TRANSPORT=local            # rules run in-process (default)
 *   VITE_ENGINE_TRANSPORT=http
 *   VITE_ENGINE_URL=https://engine.example # rules run in the service
 *
 * The two adapters are imported from their own subpaths, and the transport is
 * read straight off `import.meta.env` rather than through a helper, so the
 * bundler can fold the constant and drop the unused branch. (In this repo the
 * web workbench tabs still import @brax/engine directly for the in-browser test
 * runner and scenario presets, so the rulebook stays in that bundle regardless;
 * a client that ships only the gameplay path does not carry it.)
 */

import { HttpEngineClient } from '@brax/engine-client/http';
import { LocalEngineClient } from '@brax/engine-client/local';
import type { BraxEngineClient } from '@brax/engine-client';

function buildClient(): BraxEngineClient {
  if (import.meta.env.VITE_ENGINE_TRANSPORT === 'http') {
    const baseUrl = import.meta.env.VITE_ENGINE_URL;
    if (!baseUrl) {
      // Failing loudly beats silently playing against a different rulebook than
      // the rest of the players in a hosted deployment.
      throw new Error(
        'VITE_ENGINE_TRANSPORT=http requires VITE_ENGINE_URL to point at the Brax engine service.'
      );
    }
    return new HttpEngineClient({
      baseUrl,
      timeoutMs: import.meta.env.VITE_ENGINE_TIMEOUT_MS
        ? Number(import.meta.env.VITE_ENGINE_TIMEOUT_MS)
        : undefined,
    });
  }

  return new LocalEngineClient();
}

let client: BraxEngineClient | null = null;

export function getEngineClient(): BraxEngineClient {
  if (!client) client = buildClient();
  return client;
}

/** Test seam: point the app at a stub or a different transport. */
export function setEngineClient(next: BraxEngineClient | null): void {
  client = next;
}
