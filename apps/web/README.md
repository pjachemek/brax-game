# Re-Checkers — web workbench

A Vite app that is both the browser board and the engine's development bench:
scenario presets, the in-browser rules suite, the architecture notes, and a
simulator tab that runs the real React Native UI through `react-native-web`.

```bash
cp .env.example .env
npm run dev            # from the repo root, or `npx vite` here
npm run build          # -> apps/web/dist
```

Unlike the mobile app, this one can run the engine in-process. `.env` decides,
at build time:

```
VITE_ENGINE_TRANSPORT=local              # bundled engine, offline (default)
VITE_ENGINE_TRANSPORT=http
VITE_ENGINE_URL=https://engine.example   # hosted engine
```

The workbench tabs import `@re-checkers/engine` directly whichever transport is set —
they exist to exercise the rulebook in-process — so this bundle always contains
it. That is a property of the dev tools, not of the gameplay path; the mobile
app ships neither.

Deployment is in [DEPLOYMENT.md](../../DEPLOYMENT.md).
