/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'local' (bundled engine, default) or 'http' (hosted engine service). */
  readonly VITE_ENGINE_TRANSPORT?: 'local' | 'http';
  /** Base URL of the engine service; required when the transport is 'http'. */
  readonly VITE_ENGINE_URL?: string;
  /** Per-request timeout for the http transport, in ms. */
  readonly VITE_ENGINE_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
