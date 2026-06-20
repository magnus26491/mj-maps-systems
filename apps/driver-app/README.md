# MJ Maps — Driver App

React Native (Expo) mobile app. 99% of users are mobile — this is the product.

## Screens

| Route | Screen | Purpose |
|---|---|---|
| `/` | Index | Redirects to `/vehicle-select` or `/hud` |
| `/vehicle-select` | Vehicle Selector | Pick vehicle profile at shift start |
| `/hud` | HUD | Active delivery — turn alerts, current stop, actions |
| `/stop-list` | Stop List | Full route view with alert pills |

## Mobile Design Constraints

- **One-handed operation** — all primary actions in bottom thumb zone (bottom 40%)
- **Touch targets ≥ 56px** — no accidental taps with gloves or in motion
- **Sunlight-readable** — high contrast dark theme, bright accent text
- **No hover states** — mobile only
- **Screen stays awake** during active shift (`expo-keep-awake`)
- **Works offline** — route + turn scores cached at shift start, events buffered
- **Battery efficient** — background location at 10s intervals, not 1s
- **Works on 3G** — payloads < 50KB compressed

## Turn Warning System

| Score | Colour | Haptic | Voice |
|---|---|---|---|
| ≥ 0.75 | 🟢 GREEN | None | None |
| 0.40–0.74 | 🟡 AMBER | Warning | "Caution. Tight ahead." |
| < 0.40 | 🔴 RED | Error + vibrate | "Warning. Do not enter." |

HUD polls `/api/v1/turn-score` every 5s (>500m) or 2s (<500m approaching).

## Running locally

```bash
npm install
npm start
# Press 'a' for Android, 'i' for iOS simulator
```

Create `apps/driver-app/.env`:
```
EXPO_PUBLIC_API_URL=http://localhost:3000
```

## Package management

**Always use `npx expo install <package>` when adding or upgrading Expo-ecosystem packages** (expo-*, react-native-*, @react-native-community/*, etc.). Never use `npm install <package>` directly — npm can silently resolve to a version built for a newer Expo SDK than this project uses, causing peer-dependency conflicts and Docker build failures. Run `npx expo install --check` (or `npx expo-doctor`) before committing any package.json changes.
