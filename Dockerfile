# ────────────────────────────────────────────────────────────────
# Stage 1: Build
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./

# --legacy-peer-deps resolves any remaining peer conflicts during build
RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

# ────────────────────────────────────────────────────────────────
# Stage 2: Production image
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

RUN addgroup -S mjmaps && adduser -S mjmaps -G mjmaps

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /app/dist ./dist

USER mjmaps

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

# tsc rootDir=. outDir=dist => services/api/server.ts -> dist/services/api/server.js
CMD ["node", "dist/services/api/server.js"]
