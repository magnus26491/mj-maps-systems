# ── Stage 1: Build API ─────────────────────────────────────────
FROM node:20-alpine AS api-builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build
RUN ls -la dist/services/api/server.js && echo "[build] dist/services/api/server.js OK"
RUN npm prune --omit=dev --legacy-peer-deps

# ── Stage 2: Build Driver App Web (fully isolated) ────────────
FROM node:20-alpine AS driver-builder
WORKDIR /driver
COPY apps/driver-app/package.json apps/driver-app/package-lock.json* ./
COPY apps/driver-app/scripts/ ./scripts/
RUN npm install --legacy-peer-deps
# --no-save via -- separator: Expo CLI requires the npm flag to be passed through
RUN npx expo install -- --no-save react-native-web@0.19.10 react-dom@18.2.0
COPY apps/driver-app/ .
ENV EXPO_PUBLIC_API_URL=https://api.mjmapsystems.com
RUN npx expo export --platform web --clear

# ── Stage 3: Runtime ──────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -S mjmaps && adduser -S mjmaps -G mjmaps
COPY --from=api-builder /app/package.json ./
COPY --from=api-builder /app/node_modules ./node_modules
COPY --from=api-builder /app/dist ./dist
COPY --from=driver-builder /driver/dist ./apps/driver-app/dist
COPY start.sh ./start.sh
RUN chown -R mjmaps:mjmaps /app
USER mjmaps
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/v1/health || exit 1
CMD ["sh", "start.sh"]
