# Brax Engine Service

The Brax rules engine, hosted independently of any client. It owns the
canonical state of every game in progress; clients hold a `gameId` and a
revision number, never a `GameState` they could rewrite.

## Running it

```bash
npm run engine:dev      # watch mode, port 4000
npm run engine:start    # one-shot
PORT=4123 npm run engine:start
```

## Configuration

| Variable          | Default | Meaning                                     |
| ----------------- | ------- | ------------------------------------------- |
| `PORT`            | `4000`  | Listening port                              |
| `ALLOWED_ORIGINS` | `*`     | Comma-separated browser origins, or `*`     |
| `SESSION_TTL_MS`  | `86400000` | Idle session lifetime (24h)              |
| `MAX_SESSIONS`    | `5000`  | Retained session cap, least-recent evicted  |

Pin `ALLOWED_ORIGINS` before exposing this publicly.

## API

All responses are JSON. Failures use `{ "error": { "code", "message", "details" } }`;
`code` is the `EngineErrorCode` the client rethrows as an `EngineError`, so a
caller handles a local and a remote failure the same way.

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `GET`    | `/health` | Liveness |
| `GET`    | `/v1/modes` | Registered game modes |
| `POST`   | `/v1/games` | Create a session (`{ modeId?, state? }`) → 201 |
| `GET`    | `/v1/games/:id` | Current snapshot |
| `DELETE` | `/v1/games/:id` | End a session → 204 |
| `POST`   | `/v1/games/:id/reset` | Restart in place, keeping the id |
| `PUT`    | `/v1/games/:id/state` | Load a position (scenarios, fixtures) |
| `GET`    | `/v1/games/:id/moves[?pieceId=]` | Legal moves, for one piece or all |
| `POST`   | `/v1/games/:id/move-options` | `{ moves, canCallBrax }` for a destination |
| `GET`    | `/v1/games/:id/threats[?color=]` | Threatened pieces |
| `GET`    | `/v1/games/:id/turn-context` | Turn order, Brax rights, endgame, both sides' threats |
| `POST`   | `/v1/games/:id/moves/validate` | Dry-run a move |
| `POST`   | `/v1/games/:id/moves` | Apply a move |
| `POST`   | `/v1/games/:id/undo` | Roll back one move |
| `POST`   | `/v1/games/:id/bot-move` | Let the engine play for `{ botColor }` |

### Error codes

| Code | HTTP | Meaning |
| ---- | ---- | ------- |
| `GAME_NOT_FOUND` | 404 | No such session (or it expired) |
| `MODE_NOT_FOUND` | 404 | Unknown game mode |
| `INVALID_MOVE` | 422 | The rules refused the move |
| `REVISION_CONFLICT` | 409 | The game advanced since the client last read it |
| `NOTHING_TO_UNDO` | 409 | Empty history |
| `GAME_ALREADY_OVER` | 409 | The game has a result |
| `INVALID_STATE` | 400 | Malformed body |
| `TRANSPORT_ERROR` | 503 | Engine unreachable (raised client-side) |

### Optimistic concurrency

`POST /v1/games/:id/moves` accepts `expectedRevision`. When it does not match
the session's current revision the move is refused with `REVISION_CONFLICT` and
the current revision is returned in `details`. This is what stops a double-tap,
a stale tab or a second player from replaying a move against an old position.

## Persistence

Sessions are in memory by default. `GameSessionRepository` is the port to
implement for Redis or Postgres; `GameSessionManager` needs no changes:

```ts
const manager = new GameSessionManager({ repository: new RedisSessionRepository(redis) });
createApp({ manager });
```

Until then, run a single instance (or pin sessions to an instance) — two
replicas with in-memory state will not see each other's games.

## Deploying

The service is plain Node with no build step, run through `tsx`:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY packages/engine ./packages/engine
COPY services/engine-api ./services/engine-api
RUN npm ci --omit=dev
EXPOSE 4000
CMD ["npx", "tsx", "services/engine-api/src/server.ts"]
```
