# Phase 16C — Current State Audit

**Date**: 2024-06-21  
**Phase**: Postcode-First Delivery Intake Dominance

---

## 1. Existing Intake Files

### 1.1 Driver App Files

| File | Purpose | Status |
|------|---------|--------|
| `apps/driver-app/app/route-builder.tsx` | Main stop entry screen | ✅ Active |
| `apps/driver-app/app/shift-start.tsx` | Pre-shift screen with CSV import | ✅ Active |
| `apps/driver-app/utils/parseStopsCsv.ts` | CSV parsing utility | ✅ Active |
| `apps/driver-app/store/shift.ts` | Zustand store for shift state | ✅ Active |

### 1.2 API Files

| File | Purpose | Status |
|------|---------|--------|
| `services/api/routes/autocomplete.ts` | Address autocomplete (Photon) | ✅ Active |
| `api/routes/pins.ts` | Pin confirmation/lookup | ✅ Active |
| `api/routes/paf.ts` | PAF address lookup | ✅ Active |
| `api/routes/optimise.ts` | Route optimisation | ✅ Active |
| `services/property-engine/src/resolver.ts` | Geoapify geocoding | ✅ Active |

### 1.3 Services

| Service | Purpose | Status |
|---------|---------|--------|
| `services/route-optimizer/` | Route optimisation | ✅ Active |
| `services/property-engine/` | Address resolution | ✅ Active |
| `services/postcode-resolver/` | Postcode validation | ✅ Active |
| `services/stop-precision/` | Pin precision handling | ✅ Active |

---

## 2. Current Workflow

```
SHIFT START
    ↓
ENTER STOPS (route-builder.tsx)
    - Manual address entry
    - PAF postcode lookup
    - CSV paste
    - File upload
    ↓
ROUTE REVIEW (route-review.tsx)
    - View/reorder stops
    - Swipe to remove
    ↓
START SHIFT → HUD
```

---

## 3. Identified Issues

### 3.1 Duplicated Logic

1. **Postcode parsing** - exists in multiple places:
   - `route-builder.tsx`: `isPostcode()`, `formatPC()`, `normalisePC()`
   - `parseStopsCsv.ts`: May have duplicate postcode handling

2. **Address validation** - different services have different approaches:
   - `services/api/routes/autocomplete.ts` uses Photon API
   - `services/property-engine/src/resolver.ts` uses Geoapify
   - `api/routes/paf.ts` uses PAF

3. **Confidence scoring** - inconsistent across services:
   - `resolver.ts`: HIGH/MEDIUM/LOW based on Geoapify result_type
   - `pins.ts`: numeric 0/1/2 scale
   - No unified confidence model

### 3.2 Slow Operations

1. **Single-address geocoding** - each address makes a separate API call
   - No batching support
   - 300 stops = 300 API calls

2. **Sequential validation** - addresses validated one at a time
   - No parallel processing
   - UI can block during large imports

3. **No caching at intake level** - geocode cache only at resolver level
   - Duplicate addresses not caught early
   - Same address re-resolved on every import

### 3.3 Missing Validation

1. **No bulk postcode paste** - route-builder requires one address at a time
2. **No duplicate detection** - same address can be added multiple times
3. **No partial save** - if import fails, all progress lost
4. **No offline recovery** - imports require network connectivity

### 3.4 UX Friction

1. **No postcode-first flow** - must type full address
2. **No risk indicators** - driver doesn't see delivery difficulty until HUD
3. **No preparation screen** - jumps straight from review to HUD
4. **No confidence display** - address quality unknown until route generation

---

## 4. Current Data Models

### 4.1 LocalStop (route-builder.tsx)

```typescript
interface LocalStop {
  id:           string;
  address:      string;
  lat:          number;      // 0 until resolved
  lng:          number;      // 0 until resolved
  parcelCount:  number;
  notes?:       string;
}
```

### 4.2 DeliveryStop (store/shift.ts)

```typescript
interface DeliveryStop {
  id:           string;
  index:        number;
  address:      string;
  notes:        string | null;
  lat?:         number;
  lng?:         number;
  parcelCount:  number;
  etaLabel:     string | null;
  distanceM:    number | null;
  alertLevel:   'GREEN' | 'AMBER' | 'RED' | null;
  turnScore?:   number | null;
  turnReason?:  string | null;
  status:       'pending' | 'completed' | 'failed';
}
```

### 4.3 PropertyPin (resolver.ts)

```typescript
interface PropertyPin {
  uprn:             string | null;
  lat:              number;
  lng:              number;
  confidence:       'HIGH' | 'MEDIUM' | 'LOW';
  source:           'geoapify' | 'postcode_centroid' | 'community_verified';
  formattedAddress: string;
  notes:            string | null;
  photoUrls:        string[];
  resolvedAt:       number;
}
```

---

## 5. API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/address/autocomplete` | GET | Photon-based autocomplete |
| `/api/v1/paf/lookup` | GET | PAF postcode lookup |
| `/api/v1/pins/lookup` | GET | Community pin lookup |
| `/api/v1/pins/confirm` | POST | Confirm driver pin |
| `/api/v1/optimise` | POST | Route optimisation |

---

## 6. Risk Factors (Existing)

| Factor | Source | Available At |
|--------|--------|--------------|
| Turn score | `turn-engine` | HUD only |
| Bridge restrictions | `bridge-engine` | HUD only |
| Parking difficulty | Not implemented | - |
| Historical failures | `stops` table | HUD only |
| Access restrictions | `access-engine` | HUD only |

---

## 7. Gap Analysis

| Requirement | Current State | Needed |
|-------------|---------------|--------|
| Postcode-first flow | Address-first | New screen |
| Bulk paste | Not supported | New parser |
| Duplicate detection | Not implemented | New logic |
| Confidence display | Not shown | New UI |
| Risk indicators | HUD only | Pre-route screen |
| Partial save | Not implemented | New storage |
| 300 stop support | May freeze | Performance work |
| Preparation screen | Not exists | New screen |

---

## 8. Rollback Plan

If issues arise during Phase 16C implementation:

1. **Revert `apps/driver-app/app/route-builder.tsx`** - restore from git
2. **Revert `store/shift.ts`** - restore from git  
3. **Remove `services/delivery-intake/`** - delete directory
4. **Remove new screens** - delete any new route files

No database migrations are required for Phase 16C.
