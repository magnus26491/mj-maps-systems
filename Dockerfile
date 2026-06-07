# ────────────────────────────────────────────────────────────────
# Stage 1: Build
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for layer caching
COPY package.json ./

# Use npm install (not npm ci) — no lockfile committed yet.
# Once you run `npm install` locally and commit package-lock.json,
# change this back to: RUN npm ci --omit=dev
RUN npm install

# Copy source
COPY . .

# Compile TypeScript
RUN npm run build

# ────────────────────────────────────────────────────────────────
# Stage 2: Production image
# ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Non-root user for security
RUN addgroup -S mjmaps && adduser -S mjmaps -G mjmaps

# Only production deps
COPY package.json ./
RUN npm install --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

USER mjmaps

EXPOSE 3100

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3100/health || exit 1

CMD ["node", "dist/api/index.js"]
