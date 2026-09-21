# Brax — Architecture

The rules engine is a separate package and a separately deployable service. The
apps do not contain the rulebook; they talk to it through one interface.

```
packages/engine/          @brax/engine         rules + session lifecycle, no IO, no UI
  src/core/                                    the pure rulebook (modes, movement, threats, AI)
  src/session/                                 server-authoritative sessions on top of it
  src/view.ts             @brax/engine/view    board topology + read-only state lookups, for renderers

packages/engine-client/   @brax/engine-client  the BraxEngineClient interface
  src/local-client.ts                          runs the engine in-process
  src/http-client.ts                           calls the hosted service

services/engine-api/      @brax/engine-api     Express service wrapping GameSessionManager

src/                                           the app (web workbench + React Native mobile UI)
  services/engineClient.ts                     the only place that picks a transport
  hooks/useBraxSession.ts                      web board session
  mobile/store/useGameStore.ts                 mobile session (Zustand)
```

## The rule that holds this together

**The app never holds authority over a position.** A client has a `gameId` and a
`revision`, and asks the engine questions:

- *What can this piece do?* → `getValidMoves`
- *May this move declare Brax?* → `getMoveOptions`
- *Whose turn, what's threatened, have Brax rights lapsed?* → `getTurnContext`
- *Play this move.* → `applyMove(gameId, move, { expectedRevision })`

It never sends a `GameState` back and asks for it to be applied. That is what
makes an untrusted or merely out-of-date client harmless, and it is why
`GameSessionManager` — not the store, not the hook — owns undo history, result
detection and the bot.

## Swapping transports

```ts
createEngineClient({ transport: 'local' })
createEngineClient({ transport: 'http', baseUrl: 'https://engine.example' })
```

In the app this is environment configuration, not a code change:

```
VITE_ENGINE_TRANSPORT=local              # bundled engine, offline play (default)
VITE_ENGINE_TRANSPORT=http
VITE_ENGINE_URL=https://engine.example   # hosted engine
```

Both adapters drive the same `GameSessionManager`, so they cannot drift in
behaviour. `packages/engine-client/src/__tests__/transport-parity.test.ts` runs
one suite against both — in-process, and over a real socket against the real
Express app — and is the guard that keeps "move the engine off-device" from
becoming a behaviour change.

## Why the UI still imports `@brax/engine/view`

Drawing a board needs coordinates, the board graph, the ability to read a piece
out of a `GameState`, and `EngineError` to tell a rules refusal from a dead
connection. None of that decides what is legal. Keeping it in a separate entry
point means the gameplay path — store, hook, components — never reaches the
package index, so a client that ships only that path leaves modes, validation,
threat calculation and the AI behind when the transport is `http`.

Measured caveat for *this* repo: the web workbench tabs (`TestRunnerView`,
`ScenariosPanel`) import `@brax/engine` on purpose, so the rulebook is present in
the web bundle whichever transport is configured. The saving is real for a build
that excludes those dev tools, such as the React Native app.

## What is still coupled, deliberately

- `ScenariosPanel` and `TestRunnerView` import `@brax/engine` directly. They are
  engine development tools — preset positions and the in-browser rules suite —
  not gameplay, and they are meant to exercise the engine in-process.
- The in-memory session repository means one service instance. Implement
  `GameSessionRepository` against Redis or Postgres before scaling out; see
  [services/engine-api/README.md](services/engine-api/README.md).
- There is no authentication on the service. Sessions are guessable only by
  UUID; add auth before exposing it beyond a trusted network.

## Running it

```bash
npm run dev            # app (local engine by default)
npm run engine:dev     # engine service on :4000
npm test               # engine rules, mobile store, transport parity
npm run lint           # tsc --noEmit across all workspaces
```
