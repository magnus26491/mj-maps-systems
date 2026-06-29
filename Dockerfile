# ── Stage 1: Build API ─────────────────────────────────────────
FROM node:20-alpine AS api-builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY . .
# Only run tsc - validation happens in runtime stage after all assets assembled
RUN npx tsc
RUN mkdir -p dist/services/db && cp -r services/db/migrations dist/services/db/migrations
RUN npm prune --omit=dev --legacy-peer-deps

# ── Stage 2: Build Driver App Web (fully isolated) ────────────
FROM node:20-alpine AS driver-builder
# Mirror the real monorepo layout: /app/apps/driver-app + /app/packages/*
# This ensures metro.config.js path.resolve(__dirname,'../..') → /app (not /)
# and Metro only watches /app instead of the entire container filesystem.
WORKDIR /app/apps/driver-app
COPY apps/driver-app/package.json apps/driver-app/package-lock.json* ./
COPY apps/driver-app/scripts/ ./scripts/
# --ignore-scripts skips native postinstall scripts (pod-install, gyp) that
# crash on Alpine; we run stub-react-native.js explicitly below
RUN npm install --legacy-peer-deps --ignore-scripts
RUN npx expo install react-native-web@0.19.10 react-dom@18.2.0 -- --no-save --ignore-scripts
COPY apps/driver-app/ .
# Only copy the packages the driver app actually imports via relative paths
COPY packages/vehicle-profiles/ /app/packages/vehicle-profiles/
ENV EXPO_PUBLIC_API_URL=https://mjmapsystems.com
# stub-react-native.js patches react-native internals for web; run it explicitly
# after --ignore-scripts so native-only postinstall scripts (pod-install, etc.)
# don't crash on Alpine Linux
RUN node scripts/stub-react-native.js
# --public-url /driver rewrites all asset paths in the generated HTML/JS to
# use /driver/_expo/... instead of /_expo/..., so assets load correctly when
# the app is served at mjmapsystems.com/driver (not at root /).
RUN npx expo export --platform web --public-url /driver --clear
# Expo's static renderer strips ALL <script> tags from +html.tsx.
# public/polyfill.js is copied to dist/ by expo export.
# Inject the <script src> into the generated index.html so it loads
# synchronously (no defer) before the deferred Expo bundle.
RUN sed -i 's|<link rel="shortcut icon"|<script src="/driver/polyfill.js"></script><link rel="shortcut icon"|' dist/index.html
RUN ls -la dist/ 2>/dev/null || echo "Driver dist empty"

# ── Stage 3: Build Dispatcher Console ───────────────────────
FROM node:20-alpine AS dispatcher-builder
WORKDIR /dispatcher
COPY apps/dispatcher-console/package.json apps/dispatcher-console/package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY apps/dispatcher-console/ .
ENV NEXT_EXPORT=1
RUN npm run build

# ── Stage 4: Build Landing Page (Astro static site) ───────────
FROM node:20-alpine AS landing-builder
WORKDIR /landing
# MAPTILER_KEY: BUILD-TIME ONLY — fetches static map PNGs for the landing page.
# The key NEVER ships to the client bundle. Set Allowed Origins = https://mjmapsystems.com
# in the MapTiler dashboard.
ARG MAPTILER_KEY
ENV MAPTILER_KEY=$MAPTILER_KEY
# Copy the plans package (imported via Vite alias in astro.config.mjs)
COPY packages/plans/ /packages/plans/
# Install and build
COPY apps/landing/package.json apps/landing/package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY apps/landing/ .
# Make packages available at the resolved path
COPY packages/ /packages/
# Copy the map-baking script
COPY scripts/fetch-maps.mjs ./scripts/fetch-maps.mjs
# Fetch real static map PNGs when key is present; SVG fallbacks used otherwise
RUN if [ -n "$MAPTILER_KEY" ]; then \
      node scripts/fetch-maps.mjs || echo "[docker] fetch-maps failed, using SVG fallbacks"; \
    else \
      echo "[docker] No MAPTILER_KEY — using committed SVG fallbacks"; \
    fi
RUN npm run build

# ── Stage 5: Runtime ──────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -S mjmaps && adduser -S mjmaps -G mjmaps

# Copy from API builder (TypeScript compiled)
COPY --from=api-builder /app/package.json ./
COPY --from=api-builder /app/node_modules ./node_modules
COPY --from=api-builder /app/dist ./dist

# Copy from Driver builder
COPY --from=driver-builder /app/apps/driver-app/dist ./dist/apps/driver-app/dist

# Copy from Dispatcher builder
COPY --from=dispatcher-builder /dispatcher/dist ./dist/dispatcher

# Copy from Landing builder
COPY --from=landing-builder /landing/dist ./dist/landing

# Copy startup script
COPY start.sh ./start.sh

# Validate build artifacts exist (ONLY validation in Docker)
RUN echo "=== Validating build artifacts ===" \
  && ls -la dist/landing/index.html \
  && ls -la dist/apps/driver-app/dist/index.html \
  && ls -la dist/dispatcher/index.html \
  && ls -la dist/services/api/server.js \
  && echo "=== All build artifacts present ==="

RUN chown -R mjmaps:mjmaps /app
USER mjmaps
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/v1/health || exit 1
CMD ["sh", "start.sh"]
