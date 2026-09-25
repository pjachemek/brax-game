/**
 * ReCheckers Mobile - transport wiring.
 *
 * The only place in the app that knows where the rules engine runs. This build
 * is HTTP-only: the rulebook is never bundled into the device binary, so a
 * tampered or out-of-date app cannot play a different game than the service
 * allows, and rule fixes ship by redeploying the engine rather than by waiting
 * on an App Store review.
 *
 * Configuration comes from EXPO_PUBLIC_* variables, which EAS inlines at build
 * time (see eas.json) and `expo start` reads from apps/mobile/.env:
 *
 *   EXPO_PUBLIC_ENGINE_URL         base URL of services/engine-api
 *   EXPO_PUBLIC_ENGINE_TIMEOUT_MS  per-request timeout, ms (default 10000)
 */

import { HttpEngineClient } from '@re-checkers/engine-client/http';
import type { ReCheckersEngineClient } from '@re-checkers/engine-client';

export const ENGINE_URL = process.env.EXPO_PUBLIC_ENGINE_URL ?? '';

const TIMEOUT_MS = process.env.EXPO_PUBLIC_ENGINE_TIMEOUT_MS
  ? Number(process.env.EXPO_PUBLIC_ENGINE_TIMEOUT_MS)
  : undefined;

export function createAppEngineClient(): ReCheckersEngineClient {
  if (!ENGINE_URL) {
    // Failing loudly at startup beats a binary that looks fine in the store and
    // cannot open a single game.
    throw new Error(
      'EXPO_PUBLIC_ENGINE_URL is not set. Point it at the ReCheckers engine service before building.'
    );
  }

  return new HttpEngineClient({ baseUrl: ENGINE_URL, timeoutMs: TIMEOUT_MS });
}
