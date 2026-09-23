# Brax engine service image.
#
# Two stages. The builder bundles services/engine-api together with the slice of
# packages/engine it imports into one ESM file, so the runtime image carries no
# TypeScript, no tsx and no workspace layout — just Node, Express and one JS
# file. Express stays external because it resolves middleware dynamically and
# does not survive bundling.
#
# The builder installs esbuild directly instead of running `npm ci` over the
# workspace: the engine and the service have no dependencies of their own
# beyond Express, so this image never has to see the web or Expo dependency
# graphs, and a mobile-only change cannot invalidate its cache or break it.
#
# Build from the repo root:
#   docker build -f services/engine-api/Dockerfile -t brax-engine:dev .

# ---- build ----------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /build

RUN npm install --no-save --no-audit --no-fund esbuild@0.25.12

COPY packages/engine/ packages/engine/
COPY services/engine-api/ services/engine-api/

# tsconfig paths are not consulted by esbuild, so @brax/engine is mapped here.
RUN npx esbuild services/engine-api/src/server.ts \
      --bundle \
      --platform=node \
      --target=node22 \
      --format=esm \
      --external:express \
      --alias:@brax/engine=./packages/engine/src/index.ts \
      --legal-comments=none \
      --outfile=dist/server.js

# ---- runtime --------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Express alone, installed against a manifest with nothing else in it.
COPY services/engine-api/runtime-package.json package.json
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY --from=builder /build/dist/server.js ./server.js

# node:alpine ships an unprivileged `node` user; the service writes nothing.
USER node

ENV PORT=4000
EXPOSE 4000

CMD ["node", "server.js"]
