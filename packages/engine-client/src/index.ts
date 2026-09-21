/**
 * @brax/engine-client - Transport selection.
 *
 * The app imports `createEngineClient` and nothing else about how the rules are
 * executed. Flipping VITE_ENGINE_TRANSPORT from "local" to "http" moves the
 * entire rulebook off-device with no change to the UI or the store.
 */

import { HttpEngineClient, type HttpEngineClientOptions } from './http-client.ts';
import { LocalEngineClient } from './local-client.ts';
import type { BraxEngineClient } from './types.ts';

export type EngineClientConfig =
  | ({ transport: 'http' } & HttpEngineClientOptions)
  | { transport: 'local' };

export function createEngineClient(config: EngineClientConfig): BraxEngineClient {
  if (config.transport === 'http') {
    const { transport: _transport, ...options } = config;
    return new HttpEngineClient(options);
  }
  return new LocalEngineClient();
}

export { HttpEngineClient, LocalEngineClient };
export type { BraxEngineClient, HttpEngineClientOptions };
export type { ApplyMoveRequestOptions } from './types.ts';
export type { FetchLike } from './http-client.ts';
