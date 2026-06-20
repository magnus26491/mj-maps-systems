# ────────────────────────────────────────────────────────────────
# Stage 1: Build
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

RUN cd apps/driver-app && \
    npm install --legacy-peer-deps && \
    npm install --legacy-peer-deps --no-save react-native-web@0.19.10 react-dom@18.2.0 && \
    EXPO_PUBLIC_API_URL=https://api.mjmapsystems.com \
    npx expo export --platform web --clear

RUN ls -la dist/services/api/server.js && echo "[build] dist/services/api/server.js OK"

# Prune devDependencies so we can copy a clean node_modules to runtime
RUN npm prune --omit=dev --legacy-peer-deps

# ────────────────────────────────────────────────────────────────
# Stage 2: Production image
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

RUN addgroup -S mjmaps && adduser -S mjmaps -G mjmaps

# Copy pruned node_modules and dist from builder
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/apps/driver-app/dist ./apps/driver-app/dist

# Copy startup script
COPY start.sh ./start.sh

# Fix ownership so mjmaps user can read everything
RUN chown -R mjmaps:mjmaps /app

USER mjmaps

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/v1/health || exit 1

CMD ["sh", "start.sh"]
