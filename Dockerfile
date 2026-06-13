# ────────────────────────────────────────────────────────────────
# Stage 1: Build
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

RUN ls -la dist/services/api/server.js && echo "[build] dist/services/api/server.js OK"

# ────────────────────────────────────────────────────────────────
# Stage 2: Production image
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

RUN addgroup -S mjmaps && adduser -S mjmaps -G mjmaps

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

# cache-bust-5: forces rebuild of all layers below
RUN echo "cache-bust-5"
COPY --from=builder /app/dist ./dist

USER mjmaps

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/v1/health || exit 1

CMD ["node", "dist/services/api/server.js"]
