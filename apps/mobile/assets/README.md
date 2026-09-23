# App artwork

Expo's placeholder icon and splash are used until these files exist. Add them,
then uncomment the matching keys in `app.config.ts`. Both stores reject a
submission that ships the default Expo artwork.

| File                 | Size        | Used for                                    |
| -------------------- | ----------- | ------------------------------------------- |
| `icon.png`           | 1024 × 1024 | iOS app icon and the Expo default elsewhere |
| `adaptive-icon.png`  | 1024 × 1024 | Android adaptive icon foreground; keep the mark inside the centre 66% safe zone |
| `splash.png`         | 1284 × 2778 | Launch screen, centred on `#0f172a`         |

No transparency in `icon.png` — iOS renders it opaque and a transparent
background comes out black.
