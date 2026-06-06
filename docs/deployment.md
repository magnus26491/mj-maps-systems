# MJ Maps Systems — Deployment Guide

## Deploy to Railway (Recommended)

### 1. Prerequisites
- Railway account at [railway.app](https://railway.app)
- GitHub repo connected to Railway
- Telegram bot token from [@BotFather](https://t.me/BotFather)

### 2. Create the Railway project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link repo
railway login
railway link
```

### 3. Add Redis plugin

In the Railway dashboard:
1. Click **New** → **Database** → **Redis**
2. Railway auto-injects `REDIS_URL` into your service environment

### 4. Set environment variables

```bash
railway variables set NODE_ENV=production
railway variables set TELEGRAM_BOT_TOKEN=your-token-here
railway variables set TELEGRAM_DISPATCHER_CHAT_ID=-1001234567890
railway variables set LOG_LEVEL=info
```

### 5. Deploy

```bash
railway up
```

Railway will:
- Detect `railway.json` and use the `Dockerfile`
- Run the multi-stage build (builder → runtime)
- Start the server on the auto-assigned `PORT`
- Run health checks at `/api/v1/health` every 30s
- Auto-restart on failure (max 5 retries)

### 6. Verify

```bash
# Check health
curl https://your-app.railway.app/api/v1/health

# Check Overpass mirror status
curl https://your-app.railway.app/api/v1/health/overpass
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/health` | Service health check |
| `GET` | `/api/v1/health/overpass` | Overpass mirror status |
| `POST` | `/api/v1/routes/optimise` | Optimise a new route |
| `GET` | `/api/v1/routes/:id/intel` | Prefetch stop intelligence |
| `POST` | `/api/v1/routes/:id/replan` | Manual replan |
| `POST` | `/api/v1/driver/event` | HTTP fallback for WS events |
| `WS` | `/ws/driver/:driverId/:routeId` | Real-time driver event stream |

---

## WebSocket Protocol

### Connect
```
ws://your-app.railway.app/ws/driver/{driverId}/{routeId}
```

### Send (client → server)
```json
{ "type": "GPS_UPDATE", "lat": 51.5074, "lng": -0.1278, "timestampEpoch": 1717689600 }
{ "type": "STOP_COMPLETED", "stopId": "stop-42", "timestampEpoch": 1717689900 }
{ "type": "STOP_FAILED", "stopId": "stop-43", "failureReason": "Not home", "timestampEpoch": 1717690000 }
{ "type": "VEHICLE_SWAP", "newVehicleId": "luton", "timestampEpoch": 1717690200 }
```

### Receive (server → client)
```json
{ "type": "ETA_UPDATE", "payload": { "nextStopId": "stop-44", "remainingStops": 47, "remainingDistanceKm": 23.4 } }
{ "type": "REPLAN", "payload": { "message": "Route updated — 47 stops remaining.", "newRoute": { ... } } }
{ "type": "ERROR", "error": "No active session for driver" }
```

---

## Local Development

```bash
# Install deps
npm install

# Start Redis locally (Docker)
docker run -d -p 6379:6379 redis:7-alpine

# Copy env
cp .env.example .env
# Edit .env with your Telegram token

# Run dev server with hot reload
npm run dev

# Run tests
npm test

# Type check
npm run typecheck
```

---

## Architecture

```
Driver App (mobile)
    │  WebSocket / REST
    ▼
Express + WebSocket Server  (src/server.ts)
    │
    ├─ Route Engine          (services/route-engine/)
    │    ├─ Sweep-zone anti-backtrack
    │    ├─ Side-of-road clustering
    │    ├─ 2-opt local search
    │    └─ Dynamic replanning
    │
    ├─ Stop Intelligence     (services/property-engine/)
    │    ├─ Apartment engine (floor, lift, entrance GPS)
    │    └─ Turn score merge
    │
    ├─ OSM Data Layer        (services/osm/)
    │    ├─ Building query   (polygon, entrances, lift)
    │    ├─ Road query       (width, dead-end, restrictions)
    │    └─ Overpass client  (3-mirror pool, circuit breaker)
    │
    ├─ Vehicle Profiles      (packages/vehicle-profiles/)
    │    └─ Turn score + alert level
    │
    ├─ Redis Cache           (services/cache/)
    │    └─ TTL: 7d building, 3d road, 1h turn, 24h stop
    │
    └─ Telegram Alerts       (services/notifications/)
         └─ Driver + Dispatcher routing
```
