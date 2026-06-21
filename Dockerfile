# ── Stage 1: Build API ─────────────────────────────────────────
FROM node:20-alpine AS api-builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY . .
# Only run tsc - validation happens in runtime stage after all assets assembled
RUN npx tsc
RUN mkdir -p dist/services/db && cp -r services/db/migrations dist/services/db/migrations
# Copy landing assets during API build for development
RUN cp apps/landing/robots.txt apps/landing/sitemap.xml apps/landing/favicon.svg dist/landing/ 2>/dev/null || true
RUN npm prune --omit=dev --legacy-peer-deps

# ── Stage 2: Build Driver App Web (fully isolated) ────────────
FROM node:20-alpine AS driver-builder
WORKDIR /driver
COPY apps/driver-app/package.json apps/driver-app/package-lock.json* ./
COPY apps/driver-app/scripts/ ./scripts/
RUN npm install --legacy-peer-deps
RUN npx expo install react-native-web@0.19.10 react-dom@18.2.0 -- --no-save
COPY apps/driver-app/ .
ENV EXPO_PUBLIC_API_URL=https://api.mjmapsystems.com
RUN npx expo export --platform web --clear
RUN ls -la dist/ 2>/dev/null || echo "Driver dist empty"

# ── Stage 3: Build Dispatcher Dashboard ─────────────────────
FROM node:20-alpine AS dispatcher-builder
WORKDIR /dispatcher
COPY apps/dispatcher-dashboard/package.json apps/dispatcher-dashboard/package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY apps/dispatcher-dashboard/ .
RUN npm run build

# ── Stage 4: Build Landing Page ───────────────────────────────
FROM node:20-alpine AS landing-builder
WORKDIR /landing
# Landing page is just static HTML, copy as-is
COPY apps/landing/ ./dist/

# ── Stage 5: Runtime ──────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -S mjmaps && adduser -S mjmaps -G mjmaps

# Copy from API builder (TypeScript compiled)
COPY --from=api-builder /app/package.json ./
COPY --from=api-builder /app/node_modules ./node_modules
COPY --from=api-builder /app/dist ./dist

# Copy from Driver builder
COPY --from=driver-builder /driver/dist ./dist/apps/driver-app/dist

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
