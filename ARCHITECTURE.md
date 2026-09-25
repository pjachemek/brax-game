# Re-Checkers — Architecture

The rules engine is a separate package and a separately deployable service. The
apps do not contain the rulebook; they talk to it through one interface.

```
packages/engine/          @re-checkers/engine         rules + session lifecycle, no IO, no UI
  src/core/                                    the pure rulebook (modes, movement, threats)
  src/core/ai/                                 MCTS bot + the persistent Experience Book
  src/session/                                 server-authoritative sessions on top of it
  src/view.ts             @re-checkers/engine/view    board topology + read-only state lookups, for renderers

packages/engine-client/   @re-checkers/engine-client  the Re-CheckersEngineClient interface
  src/local-client.ts                          runs the engine in-process
  src/http-client.ts                           calls the hosted service

packages/mobile-ui/       @re-checkers/mobile-ui      React Native view layer + Zustand store
  src/engine.ts                                the transport seam each app fills in
  src/store/useGameStore.ts                    mobile session

services/engine-api/      @re-checkers/engine-api     Express service wrapping GameSessionManager
  Dockerfile                                   -> container image
  deploy/                                      -> k3s manifests

apps/web/                 @re-checkers/web            Vite workbench: board, scenarios, tests, simulator
  src/services/engineClient.ts                 picks a transport from VITE_ENGINE_TRANSPORT

apps/mobile/              @re-checkers/mobile         Expo app -> iOS and Android
  src/engine.ts                                http transport only, EXPO_PUBLIC_ENGINE_URL
```

## Three deployable units

Each of these is built, versioned and shipped on its own. Nothing but the
workspace packages is shared, and those are consumed as source.

| Unit | Built by | Ships as |
| ---- | -------- | -------- |
| `services/engine-api` | `docker build -f services/engine-api/Dockerfile .` | a container image, run on k3s |
| `apps/mobile` | `eas build` | an `.ipa` / `.aab` in the App Store and Play Store |
| `apps/web` | `vite build` | static files in `apps/web/dist` |

The engine image is deliberately independent of the other two: its build
installs esbuild and compiles `services/engine-api` plus `packages/engine` into
one file. It never sees the Vite or Expo dependency graphs, so a change under
`apps/**` cannot break or invalidate it. See [DEPLOYMENT.md](DEPLOYMENT.md).

## The rule that holds this together

**The app never holds authority over a position.** A client has a `gameId` and a
`revision`, and asks the engine questions:

- *What can this piece do?* → `getValidMoves`
- *May this move declare Re-Checkers?* → `getMoveOptions`
- *Whose turn, what's threatened, have Re-Checkers rights lapsed?* → `getTurnContext`
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

In `apps/web` this is environment configuration, not a code change:

```
VITE_ENGINE_TRANSPORT=local              # bundled engine, offline play (default)
VITE_ENGINE_TRANSPORT=http
VITE_ENGINE_URL=https://engine.example   # hosted engine
```

`apps/mobile` does not have the choice: it constructs an `HttpEngineClient` and
nothing else. The rulebook is never bundled into the device binary, so a
tampered or out-of-date install cannot play a different game than the service
allows, and a rules fix ships by redeploying the engine rather than by waiting
on an App Store review. The cost is that the app needs a reachable engine to
open a game.

`@re-checkers/mobile-ui` itself picks no transport. It exposes `configureEngineClient`,
and each host installs one at startup — the Expo app an HTTP client, the web
workbench whatever `VITE_ENGINE_TRANSPORT` selected, the store tests a local
one. That is also what lets the same components run under Metro, which has no
`import.meta.env` to branch on.

Both adapters drive the same `GameSessionManager`, so they cannot drift in
behaviour. `packages/engine-client/src/__tests__/transport-parity.test.ts` runs
one suite against both — in-process, and over a real socket against the real
Express app — and is the guard that keeps "move the engine off-device" from
becoming a behaviour change.

## The bot

`packages/engine/src/core/ai/` holds a Monte Carlo Tree Search with learned
priors (PUCT). It lives behind `GameSessionManager.playBotMove`, so every front
end faces the same opponent and a hosted deployment can improve it without an
app release.

Three things are worth knowing about it:

- **It searches on its own fast path.** The rulebook's `getValidMoves` recomputes
  the whole threat map per candidate so it can answer "may I declare Re-Checkers here?",
  and `applyMove` probes every piece for stalemate. Correct, and far too slow for
  thousands of positions per move. `core/ai/simulation.ts` answers only the two
  questions search asks, off the same primitives (`getRawLegalPathsForPiece`,
  `getCapturesAlongPath`). The move it finally returns is handed back to the real
  engine, which validates it again — the fast path can never widen what is legal.
- **Rollouts are capped at 25 plies.** Re-Checkers has no move counter and no repetition
  rule outside the 1v1 endgame, so two pieces can shuffle between the same nodes
  forever. The cap is termination, not tuning.
- **It remembers.** Every finished game — bot or pass-and-play — is replayed and
  each state→action pair credited (+1 winner, −1 loser), filed under a Zobrist
  hash from a *fixed seed* so the book means the same thing across sessions and
  devices. Those totals return as the P(s,a) term. Novice ignores the book,
  Intermediate blends it halfway, Master trusts it. The book persists through
  `ExperienceStorage`: IndexedDB or `localStorage` in a browser, in-memory under
  Node, and a database behind the service if one is wired in.

Difficulty is a profile, not a knob: simulation budget, exploration constant,
root temperature, rollout depth and policy, and the book weight all move
together (`core/ai/types.ts`). Master is additionally bounded by a 400ms wall
clock, which in practice is what stops it — the budget is the ceiling, the clock
is the floor under responsiveness.

## Why the UI still imports `@re-checkers/engine/view`

Drawing a board needs coordinates, the board graph, the ability to read a piece
out of a `GameState`, and `EngineError` to tell a rules refusal from a dead
connection. None of that decides what is legal. Keeping it in a separate entry
point means the gameplay path — store, hook, components — never reaches the
package index, so a client that ships only that path leaves modes, validation,
threat calculation and the AI behind when the transport is `http`.

`view.ts` does carry two AI-adjacent things, and both are deliberate: the
difficulty *vocabulary* (`AIDifficulty`, the profile table, `isAIDifficulty`)
and the bot's pacing constants. A UI has to name a difficulty, label it and
validate one that came back from storage, and "how fast does the bot feel" is a
property of the opponent rather than of a platform. Both modules are leaves with
no engine imports at all, so nothing follows them in — bundling `view.ts` and
grepping for `MCTSSearch`, `ExperienceBook` and `calculateThreats` finds none of
them.

Measured caveat for *this* repo: the web workbench tabs (`TestRunnerView`,
`ScenariosPanel`) import `@re-checkers/engine` on purpose, so the rulebook is present in
the web bundle whichever transport is configured. The saving is real for the
React Native app, which excludes those dev tools — and it is checked: bundling
`apps/mobile` and grepping the output for `calculateThreats` and `fox_and_geese`
finds neither. Only `packages/engine/src/core/{geometry,board,movement}.ts`
reach the device, which is the topology a renderer needs.

This is easy to lose by accident. `http-client.ts` imported `EngineError` from
the package index rather than from `@re-checkers/engine/view`, and because Metro does
not tree-shake, that one value import dragged the modes, the threat calculation
and the AI into the app. Value imports from `@re-checkers/engine` do not belong on any
path the mobile app can reach.

## What is still coupled, deliberately

- `ScenariosPanel` and `TestRunnerView` import `@re-checkers/engine` directly. They are
  engine development tools — preset positions and the in-browser rules suite —
  not gameplay, and they are meant to exercise the engine in-process. They live
  in `apps/web` only, which is why the mobile bundle is unaffected.
- The in-memory session repository means one service instance. Implement
  `GameSessionRepository` against Redis or Postgres before scaling out; see
  [services/engine-api/README.md](services/engine-api/README.md).
- There is no authentication on the service. Sessions are guessable only by
  UUID; add auth before exposing it beyond a trusted network.

## Running it

```bash
npm run dev            # apps/web on :3000 (local engine by default)
npm run mobile         # apps/mobile through Expo (needs an engine to talk to)
npm run engine:dev     # engine service on :4000
npm test               # engine rules, mobile store, transport parity
npm run lint           # tsc --noEmit across the workspace
```

Deployment — the image, the k3s manifests and the store builds — is in
[DEPLOYMENT.md](DEPLOYMENT.md).
