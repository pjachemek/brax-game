# Brax — iOS / Android

An Expo app around `@brax/mobile-ui`, which is the same React Native view layer
the web workbench renders in its simulator tab. This app contributes a native
shell and one decision: where the rules engine is.

That decision is HTTP-only. `src/engine.ts` builds an `HttpEngineClient` from
`EXPO_PUBLIC_ENGINE_URL` and nothing else, so the rulebook is never bundled into
the binary — a rules fix ships by redeploying the engine instead of waiting on
an App Store review, and the app cannot open a game without a reachable engine.

```bash
cp .env.example .env     # point EXPO_PUBLIC_ENGINE_URL at an engine
npm run engine:dev       # from the repo root
npm run mobile           # from the repo root, or `npx expo start` here
```

Builds, signing, store submission and the things to change before the first
release are in [DEPLOYMENT.md](../../DEPLOYMENT.md).

## Layout

| Path | What it is |
| ---- | ---------- |
| `App.tsx` | installs the transport, renders `MobileGameScreen` |
| `src/engine.ts` | the only place that knows where the engine runs |
| `app.config.ts` | bundle identifiers, icons, everything `ios/` and `android/` are generated from |
| `eas.json` | build profiles; `EXPO_PUBLIC_*` here is baked into the binary |
| `metro.config.js` | monorepo resolution — the app's sources are partly in `packages/*` |

There are no `ios/` or `android/` folders: `expo prebuild` generates them from
`app.config.ts`, which means a native setting is edited there, in the repo,
rather than in generated output.
