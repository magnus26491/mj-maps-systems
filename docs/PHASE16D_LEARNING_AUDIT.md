# Phase 16D — Learning Infrastructure Audit

**Date**: 2024-06-21  
**Phase**: Delivery Intelligence Learning Loop

---

## 1. Existing Learning Infrastructure

### 1.1 Prediction Services Found

| Service | Path | Purpose |
|---------|------|---------|
| Parking Engine | `services/parking-engine/` | Parking spot prediction |
| Access Engine | `services/access-engine/` | Access difficulty scoring |
| Workload Scorer | `services/workload/shift-load-scorer.ts` | Fatigue modelling |
| Stop Precision | `services/stop-precision/` | Pin resolution |
| Route Completion | `services/route-completion/` | Route outcome capture |
| Cluster Engine | `services/cluster-engine/` | Walk vs drive grouping |
| Dynamic Replan | `services/dynamic-replan/` | Mid-route adjustments |

### 1.2 Missing Learning Infrastructure

The following services referenced in the objectives **DO NOT EXIST**:

| Missing Service | Description |
|----------------|-------------|
| `delivery-learning-engine` | ML prediction improvement loop |
| `delivery-events` | Event capture for learning |
| `stop-intelligence` | Stop-level memory |
| `driver-intelligence` | Driver behavior learning |
| `community-intelligence` | Crowd-sourced knowledge |
| `route-confidence` | Route reliability scoring |

---

## 2. Learning Pipeline Architecture

### 2.1 Current State

```
┌─────────────┐
│ Prediction  │ ← Parking, Access, ETA (existing)
└──────┬──────┘
       ↓
┌─────────────┐
│ Delivery    │ ← Outcome capture (missing)
└──────┬──────┘
       ↓
┌─────────────┐
│ Outcome     │ ← Record actuals (missing)
└──────┬─────┘
       ↓
┌─────────────┐
│ Learning    │ ← Improve predictions (missing)
└──────┬──────┘
       ↓
┌─────────────┐
│ Future Route│ ← Better predictions
└─────────────┘
```

### 2.2 Missing Components

1. **Outcome Capture** - Record what happened at each stop
2. **Prediction Storage** - Store predictions for comparison
3. **Accuracy Analytics** - Calculate prediction accuracy
4. **Stop Memory** - Persistent stop characteristics
5. **Driver Profiles** - Driver behavior patterns
6. **Simulation Engine** - Compare routing strategies

---

## 3. Database Schema Requirements

### 3.1 New Tables Needed

```sql
-- Stop predictions at route generation time
CREATE TABLE stop_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id UUID NOT NULL,
  route_id UUID NOT NULL,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Geocoding predictions
  predicted_confidence VARCHAR(10),  -- HIGH, MEDIUM, LOW
  predicted_lat DOUBLE PRECISION,
  predicted_lng DOUBLE PRECISION,
  
  -- Time predictions
  predicted_eta_minutes INTEGER,
  predicted_completion_time_minutes INTEGER,
  
  -- Risk predictions
  predicted_parking_difficulty VARCHAR(10),  -- EASY, MODERATE, HARD
  predicted_access_difficulty VARCHAR(10),    -- EASY, MODERATE, HARD
  predicted_completion_probability DECIMAL(3,2),
  
  -- Actual outcomes (filled after delivery)
  actual_completion_time_minutes INTEGER,
  actual_parking_time_minutes INTEGER,
  actual_walking_distance_m INTEGER,
  actual_success BOOLEAN,
  failure_reason VARCHAR(50),
  driver_override BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stop memory (learned characteristics)
CREATE TABLE stop_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address_normalised VARCHAR(500) NOT NULL,
  
  -- Physical characteristics (learned)
  parking_difficulty VARCHAR(10),           -- EASY, MODERATE, HARD
  parking_notes TEXT,
  access_difficulty VARCHAR(10),          -- EASY, MODERATE, HARD
  access_notes TEXT,
  requires_walking BOOLEAN DEFAULT FALSE,
  walk_distance_metres INTEGER,
  
  -- Temporal patterns
  best_time_of_day VARCHAR(20),           -- MORNING, MIDDAY, AFTERNOON
  difficulty_after_pm BOOLEAN,             -- Harder after 4pm
  
  -- Access details (non-personal)
  has_flat_entrance BOOLEAN,
  entrance_location VARCHAR(50),           -- FRONT, REAR, SIDE
  gate_code_known BOOLEAN DEFAULT FALSE,
  
  -- Delivery patterns
  avg_completion_time_minutes INTEGER,
  failure_count INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  last_visited_at TIMESTAMPTZ,
  
  -- Metadata
  confidence_score DECIMAL(3,2),          -- How confident we are
  data_sources VARCHAR(50),               -- COMBINED, DRIVER, COMMUNITY
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(address_normalised)
);

-- Driver profiles (learned behavior)
CREATE TABLE driver_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL UNIQUE,
  
  -- Routing preferences
  preferred_approach_side VARCHAR(10),   -- LEFT, RIGHT, ANY
  walking_tolerance_metres INTEGER DEFAULT 200,
  
  -- Performance patterns
  avg_completion_time_per_stop DECIMAL(5,2),
  parking_speed_score DECIMAL(3,2),       -- 0.0 - 1.0
  
  -- Route characteristics
  prefers_early_stops BOOLEAN,           -- Better in morning
  handles_high_risk BOOLEAN,
  
  -- Learning data
  routes_completed INTEGER DEFAULT 0,
  stops_completed INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Route confidence scoring
CREATE TABLE route_confidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL UNIQUE,
  
  -- Confidence scores (0.0 - 1.0)
  overall_confidence DECIMAL(3,2),
  parking_confidence DECIMAL(3,2),
  access_confidence DECIMAL(3,2),
  eta_confidence DECIMAL(3,2),
  completion_confidence DECIMAL(3,2),
  
  -- Risk factors
  high_risk_stops INTEGER DEFAULT 0,
  unknown_pins INTEGER DEFAULT 0,
  
  -- Calculated at route generation
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery events for learning
CREATE TABLE delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id UUID NOT NULL,
  stop_id UUID,
  driver_id UUID NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Index for time-series analysis
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Gap Analysis

### 4.1 What Exists vs What's Needed

| Capability | Existing | Needed |
|-----------|----------|--------|
| Parking prediction | ✅ `parking-engine` | Outcome capture |
| Access scoring | ✅ `access-engine` | Historical memory |
| ETA prediction | ❌ None | Full implementation |
| Completion probability | ❌ None | ML model |
| Stop memory | ❌ None | New service |
| Driver profiles | ❌ None | New service |
| Outcome analytics | ❌ None | New service |
| Simulation | ❌ None | New service |

### 4.2 Data Sources Available

1. **Stops table** - Address, lat/lng, status, timestamps
2. **Routes table** - Route metadata, start/end times
3. **Driver locations** - GPS tracking data
4. **Geocode pins** - Community pin corrections
5. **POD photos** - Proof of delivery

---

## 5. Learning Loop Design

### 5.1 Prediction → Delivery → Outcome → Learning

```
1. ROUTE GENERATION
   ├─ Generate predictions for each stop
   │  ├─ Parking difficulty
   │  ├─ Access difficulty  
   │  ├─ ETA
   │  └─ Completion probability
   └─ Store predictions in stop_predictions
   
2. DELIVERY
   ├─ Driver completes stop
   │  ├─ Record completion time
   │  ├─ Record parking time
   │  └─ Record walking distance
   └─ Update predictions with actuals

3. OUTCOME CAPTURE
   ├─ On route completion
   │  ├─ Compare predictions vs actuals
   │  ├─ Calculate accuracy metrics
   │  └─ Identify improvement opportunities
   └─ Update stop_memory

4. LEARNING
   ├─ Stop characteristics
   │  ├─ Parking patterns
   │  └─ Access requirements
   ├─ Driver profiles
   │  ├─ Performance patterns
   │  └─ Preferences
   └─ Route confidence
      └─ Reliability scoring
```

### 5.2 What NOT to Do

- ❌ Don't create ML models from scratch (too complex, no data)
- ❌ Don't store personal customer information
- ❌ Don't make predictions that override driver judgment
- ❌ Don't create complex recommendation systems

### 5.3 What TO Do

- ✅ Simple statistical averaging (most recent outcomes)
- ✅ Pattern detection (time-of-day, day-of-week)
- ✅ Confidence scoring based on data volume
- ✅ Driver preference learning from behavior

---

## 6. Implementation Plan

### Phase D1: Outcome Capture (This Phase)
- Database migrations
- Outcome capture service
- Prediction storage

### Phase D2: Analytics
- Accuracy metrics
- Stop memory
- Driver profiles

### Phase D3: Simulation
- Route comparison
- Performance benchmarking
