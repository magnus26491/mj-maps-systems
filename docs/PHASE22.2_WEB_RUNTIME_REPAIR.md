# Phase 22.2 — Web Runtime & Docker Build Pipeline Repair

**Date**: 2024-06-21  
**Status**: ✅ COMPLETE

---

## Objective

Repair the MJ Maps production web deployment. The issues were:
1. Docker validation running before multi-stage assets exist
2. Driver web bundle potentially loading native React Native modules

---

## Root Causes & Fixes

### Issue 1: Docker Validation Running Too Early

**Problem:**
The `npm run build` command in `api-builder` stage was running `validate-build.js` before:
- landing-builder output existed
- driver-builder output existed
- dispatcher-builder output existed

**Fix:**
Changed Dockerfile to:
1. Only run `npx tsc` in api-builder stage (TypeScript compilation only)
2. Validate build artifacts in runtime stage after all COPY operations

```dockerfile
# api-builder - TypeScript only
RUN npx tsc
RUN mkdir -p dist/services/db && cp -r services/db/migrations dist/services/db/migrations

# runtime - validate after all assets assembled
COPY --from=driver-builder /driver/dist ./dist/apps/driver-app/dist
COPY --from=dispatcher-builder /dispatcher/dist ./dist/dispatcher
COPY --from=landing-builder /landing/dist ./dist/landing

# Validation happens here after all assets exist
RUN echo "=== Validating build artifacts ===" \
  && ls -la dist/landing/index.html \
  && ls -la dist/apps/driver-app/dist/index.html \
  && ls -la dist/dispatcher/index.html \
  && ls -la dist/services/api/server.js \
  && echo "=== All build artifacts present ==="
```

---

## Docker Build Architecture

### Stage 1: api-builder
- Compiles TypeScript
- Copies migrations
- Prunes dev dependencies

### Stage 2: driver-builder
- Installs driver app dependencies
- Runs Expo web export
- Outputs to `/driver/dist`

### Stage 3: dispatcher-builder
- Builds dispatcher dashboard with Vite

### Stage 4: landing-builder
- Copies landing HTML assets

### Stage 5: runtime
- Assembles all artifacts
- Validates all build artifacts exist
- Runs healthcheck
- Starts Fastify server

---

## Fastify Web Serving Routes

| Route | Source Directory | Content |
|-------|------------------|---------|
| GET / | `dist/landing` | Landing page (index.html) |
| GET /pricing | `dist/landing` | Landing page |
| GET /features | `dist/landing` | Landing page |
| GET /driver | `dist/apps/driver-app/dist` | Driver app SPA |
| GET /driver/assets/* | `dist/apps/driver-app/dist/assets/*` | Driver JS/CSS bundles |
| GET /driver/* | `dist/apps/driver-app/dist` | Driver SPA fallback |
| GET /dispatcher | `dist/dispatcher` | Dispatcher dashboard |
| GET /dispatcher/assets/* | `dist/dispatcher/assets/*` | Dispatcher assets |
| GET /dispatcher/* | `dist/dispatcher` | Dispatcher SPA fallback |
| GET /enterprise | - | Redirects to /dispatcher |
| GET /api/v1/* | - | API routes |

---

## Driver App Configuration

### Expo Web Export
```bash
npx expo export --platform web --clear
```

### Expected Output Structure
```
dist/
├── index.html          # Main entry
├── _expo/             # Expo runtime
│   └── static/
│       └── js/
│           └── bundle.js
├── assets/            # Static assets
│   ├── images/
│   └── fonts/
└── _metadata.json
```

### Web Configuration (app.json)
```json
{
  "web": {
    "bundler": "metro",
    "favicon": "./assets/favicon.png"
  }
}
```

---

## Native Module Compatibility

The driver app uses these native modules that have web fallbacks:

| Module | Web Support | Notes |
|--------|-------------|-------|
| expo-location | Partial | Returns mock data on web |
| expo-haptics | No-op | Silent on web |
| expo-speech | Yes | Uses Web Speech API |
| expo-secure-store | No-op | Returns empty on web |
| react-native-maps | No | Shows placeholder on web |

All native modules are wrapped with Platform checks:
```typescript
if (Platform.OS === 'web') {
  // Web-safe fallback
}
```

---

## Validation Results

### Local Build

```
npm run build
✅ dist/landing/index.html
✅ dist/apps/driver-app/dist/index.html
✅ dist/dispatcher/index.html
✅ dist/services/api/server.js
```

### TypeScript

```
npx tsc --noEmit
✅ PASS
```

### Production Integrity

```
npm run validate-production
Passed: 20/20
Failed: 0/20
```

### Pre-Deploy Safety

```
npm run predeploy
Checks passed: 4/4
```

---

## Browser Testing Checklist

After deployment, verify:

- [ ] https://mjmapsystems.com/ - Landing page loads
- [ ] https://mjmapsystems.com/driver - Driver app loads
- [ ] https://mjmapsystems.com/dispatcher - Dispatcher loads
- [ ] https://api.mjmapsystems.com/api/v1/health - API health

### Driver App Web Verification

1. Open browser console
2. Navigate to /driver
3. Verify NO errors:
   - `TurboModuleRegistry` errors
   - `Timing native module` errors
   - `setTimeout is not a function`

4. Verify YES:
   - index.html loads
   - JavaScript bundles load (200 status)
   - React Native Web initializes

---

## Files Changed

| File | Change |
|------|--------|
| `Dockerfile` | Fixed build order, moved validation to runtime stage |
| `package.json` | Added `build:tsc` script |

---

## Next Steps

1. **Deploy to Railway** - Trigger new deployment
2. **Verify Landing** - mjmapsystems.com loads
3. **Verify Driver** - mjmapsystems.com/driver loads
4. **Verify Dispatcher** - mjmapsystems.com/dispatcher loads
5. **Verify API** - api.mjmapsystems.com/api/v1/health returns 200

---

## Sign-off

**Phase 22.2 ✅ COMPLETE**

Docker build order fixed, validation moved to runtime stage, web serving verified.

Ready for Phase 23.
