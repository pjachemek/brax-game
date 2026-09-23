# Deploying Brax

Three units, shipped independently.

| Unit | Artifact | Where it runs |
| ---- | -------- | ------------- |
| `services/engine-api` | container image | k3s |
| `apps/mobile` | `.ipa` / `.aab` | App Store, Play Store |
| `apps/web` | static files | any static host |

The engine is the only one that holds state, and the only one the other two
depend on at runtime. Deploy it first.

---

## 1. Engine → k3s

### Build the image

The build context is the **repo root**, because the service imports
`packages/engine` as a sibling:

```bash
docker build -f services/engine-api/Dockerfile -t brax-engine:dev .
docker run --rm -p 4000:4000 brax-engine:dev
curl localhost:4000/health          # {"status":"ok","service":"brax-engine","modes":2}
```

The builder bundles the service and the slice of `packages/engine` it imports
into a single ~45 kB ESM file with esbuild. The runtime stage installs Express
and nothing else, copies that one file, and runs as the unprivileged `node`
user. There is no TypeScript, no `tsx` and no workspace layout in the image.

It also never installs the workspace: the builder pulls esbuild directly, so the
engine image has no knowledge of the Vite or Expo dependency graphs and a mobile
change can neither break it nor invalidate its cache.

### Deploy

```bash
kubectl apply -f services/engine-api/deploy/
kubectl -n brax rollout status deploy/brax-engine
kubectl -n brax port-forward svc/brax-engine 4000:80   # smoke test
```

Set before the first apply:

| File | Change |
| ---- | ------ |
| `deployment.yaml` | `image:` → your registry path and tag (`ghcr.io/OWNER/brax-engine:...`) |
| `configmap.yaml` | `ALLOWED_ORIGINS` → the web origins that may call it |
| `ingress.yaml` | `engine.brax.example` → your host, in both the `tls` and `rules` blocks |

If the image is private, add a pull secret:

```bash
kubectl -n brax create secret docker-registry ghcr \
  --docker-server=ghcr.io --docker-username=USER --docker-password=TOKEN
kubectl -n brax patch serviceaccount default \
  -p '{"imagePullSecrets":[{"name":"ghcr"}]}'
```

### How traffic reaches the process

Port 4000 appears in only one of the four manifests, which makes the path hard
to follow. Each hop resolves a *name* declared by the next file down:

```
https://engine.brax.example
  ingress.yaml    backend.service.name: brax-engine
                  backend.service.port.name: http   -> the Service port called "http"
  service.yaml    - name: http                      <- that one
                    port: 80                            Traefik connects here
                    targetPort: http                 -> the CONTAINER port called "http"
  deployment.yaml   - name: http                    <- that one
                      containerPort: 4000
                    env PORT=4000                       what the process binds
```

The two `http` names are unrelated. In `service.yaml`, `name:` is the Service
port's own name, which the Ingress resolves; `targetPort:` resolves against the
port names on the pod. Traefik never talks to 4000 — it talks to the Service on
80 — which is why 4000 does not appear in `ingress.yaml` at all.

The upside of naming rather than numbering: moving the service off 4000 is a
change to `containerPort` and the `PORT` env var only. The Service, the Ingress
and both probes follow automatically.

If a request 404s or 502s, work down that list:

```bash
kubectl -n brax get ingress brax-engine          # is there an address?
kubectl -n brax describe ingress brax-engine     # does the backend resolve?
kubectl -n brax get endpoints brax-engine        # empty = selector matches no ready pod
kubectl -n brax port-forward svc/brax-engine 4000:80 && curl localhost:4000/health
```

Empty `endpoints` is the usual one, and it means either the label selector
missed or the readiness probe never passed — not an ingress problem.

### The replica count is 1, on purpose

Sessions live in the process (`InMemoryGameSessionRepository`). A second replica
would serve games the first has never heard of, and Traefik would route a
player's moves to whichever one answered. The `Recreate` strategy is there for
the same reason: rolling would split live games across two states.

To scale out, implement `GameSessionRepository` against Redis or Postgres and
pass it to `GameSessionManager` — no other change is needed. Until then, the
practical limits are `MAX_SESSIONS` and the memory limit in `deployment.yaml`.

### There is no authentication

Sessions are only as private as their UUIDs. Put the ingress behind whatever the
cluster already uses, or keep the service cluster-internal, before exposing it
beyond a trusted network.

### CI

`.github/workflows/engine-image.yml` runs the test suite, then builds and pushes
`linux/amd64` and `linux/arm64` images to GHCR. It publishes `latest` from
`main`, a `sha-` tag for every commit, and a version tag from `engine-v*`:

```bash
git tag engine-v1.2.0 && git push origin engine-v1.2.0
kubectl -n brax set image deploy/brax-engine engine=ghcr.io/OWNER/brax-engine:1.2.0
```

Pull requests build the image to prove it still builds, but push nothing.

---

## 2. Mobile → iOS and Android

Expo (SDK 54) with EAS Build. The app is HTTP-only: **it cannot open a game
without a reachable engine**, so deploy the engine before shipping a build.

### Local development

```bash
cp apps/mobile/.env.example apps/mobile/.env   # point EXPO_PUBLIC_ENGINE_URL at your engine
npm run engine:dev                             # engine on :4000
npm run mobile                                 # Expo dev server
```

On a physical device, `localhost` is the phone. Use the machine's LAN address
(`http://192.168.x.x:4000`) and start the engine with `ALLOWED_ORIGINS=*`.

`npm run mobile:ios` / `npm run mobile:android` build and install a native dev
client locally; they need Xcode or Android Studio. The native `ios/` and
`android/` folders are generated by `expo prebuild` and are not in the repo —
`app.config.ts` is the source of truth for anything you would otherwise edit in
them.

### Store builds

One-time setup:

```bash
npm i -g eas-cli
eas login
cd apps/mobile && eas init          # writes the EAS project id
eas credentials                     # signing keys, managed by EAS
```

Then:

```bash
npm run mobile:build                                    # preview, both platforms
npm run build:ios --workspace @brax/mobile              # production ipa
npm run build:android --workspace @brax/mobile          # production aab
npm run submit:ios --workspace @brax/mobile             # -> App Store Connect
npm run submit:android --workspace @brax/mobile         # -> Play internal track
```

Before the first submission, in `apps/mobile`:

| File | Change |
| ---- | ------ |
| `app.config.ts` | `ios.bundleIdentifier` / `android.package` — these cannot be changed after release |
| `app.config.ts` | uncomment the icon and splash keys once `assets/` has real artwork |
| `eas.json` | `EXPO_PUBLIC_ENGINE_URL` per profile — this is baked into the binary |
| `eas.json` | the `submit.production` Apple and Play identifiers |
| `assets/` | icon, adaptive icon, splash — see `assets/README.md` |

`appVersionSource: "remote"` plus `autoIncrement` means EAS owns the build
number; `version` in `app.config.ts` is the user-visible one you bump by hand.

### CI

`.github/workflows/mobile-build.yml` runs on a `mobile-v*` tag or on demand,
with a platform and profile to choose. It needs an `EXPO_TOKEN` secret. Signing
credentials stay in EAS and never enter the repo.

### Changing the engine URL

The URL is compiled into the binary from the build profile's `env` block. A new
engine host means a new build and a new store release, so prefer a stable public
hostname in front of the service over the cluster address.

---

## 3. Web → static host

```bash
npm run build          # -> apps/web/dist
```

`apps/web/.env` decides at **build time** whether the bundle talks to a hosted
engine or runs one in-process:

```
VITE_ENGINE_TRANSPORT=http
VITE_ENGINE_URL=https://engine.brax.example
```

With `http`, add the site's origin to `ALLOWED_ORIGINS` in the engine's
ConfigMap and restart the deployment — the browser will otherwise be blocked by
CORS. The native app is not a browser and is unaffected.

`dist/` is static; serve it from anything. The build includes the workbench tabs
(scenarios, in-browser test runner), which import the engine directly — it is a
development tool, not the product.
