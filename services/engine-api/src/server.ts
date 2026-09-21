/**
 * Brax Engine Service - Process entrypoint.
 *
 * Configuration is environment-only so the same image runs anywhere:
 *   PORT              listening port (default 4000)
 *   ALLOWED_ORIGINS   comma-separated origins, or "*" (default "*")
 *   SESSION_TTL_MS    idle session lifetime (default 24h)
 *   MAX_SESSIONS      retained session cap (default 5000)
 */

import { GameSessionManager, InMemoryGameSessionRepository } from '@brax/engine';
import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 4000);
const originsEnv = process.env.ALLOWED_ORIGINS ?? '*';
const allowedOrigins =
  originsEnv === '*' ? '*' : originsEnv.split(',').map((o) => o.trim()).filter(Boolean);

const manager = new GameSessionManager({
  repository: new InMemoryGameSessionRepository({
    ttlMs: process.env.SESSION_TTL_MS ? Number(process.env.SESSION_TTL_MS) : undefined,
    maxSessions: process.env.MAX_SESSIONS ? Number(process.env.MAX_SESSIONS) : undefined,
  }),
});

const app = createApp({ manager, allowedOrigins });

const server = app.listen(port, () => {
  console.log(`[brax-engine] listening on http://localhost:${port}`);
  console.log(`[brax-engine] modes: ${manager.listModes().map((m) => m.id).join(', ')}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`[brax-engine] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
