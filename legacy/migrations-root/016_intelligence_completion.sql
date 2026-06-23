-- Migration: Phase 18C Intelligence Completion Layer
-- Completes the learning loop before autonomous copilot

-- =====================================================
-- Navigation Outcomes: Track what happened after advice
-- =====================================================
CREATE TABLE IF NOT EXISTS navigation_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id UUID NOT NULL,
    route_id UUID NOT NULL,
    driver_id UUID NOT NULL,
    
    -- Timing
    predicted_arrival_time TIMESTAMPTZ,
    actual_arrival_time TIMESTAMPTZ,
    arrival_accuracy_seconds INTEGER,
    
    -- Parking
    predicted_parking_difficulty VARCHAR(20),
    actual_parking_time_seconds INTEGER,
    actual_parking_difficulty VARCHAR(20),
    
    -- Access
    recommended_entrance VARCHAR(20),
    actual_entrance_used VARCHAR(20),
    entrance_match BOOLEAN,
    access_outcome VARCHAR(20),
    
    -- Route
    original_route_distance INTEGER,
    actual_route_distance INTEGER,
    route_deviation BOOLEAN,
    
    -- Driver
    driver_used_gps BOOLEAN DEFAULT FALSE,
    driver_override BOOLEAN DEFAULT FALSE,
    override_reason TEXT,
    
    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nav_outcomes_stop ON navigation_outcomes(stop_id);
CREATE INDEX IF NOT EXISTS idx_nav_outcomes_driver ON navigation_outcomes(driver_id);
CREATE INDEX IF NOT EXISTS idx_nav_outcomes_time ON navigation_outcomes(completed_at DESC);

-- =====================================================
-- Parking Outcomes
-- =====================================================
CREATE TABLE IF NOT EXISTS parking_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id UUID NOT NULL,
    address_normalized VARCHAR(255) NOT NULL,
    
    predicted_difficulty VARCHAR(20),
    predicted_parking_seconds INTEGER,
    actual_parking_seconds INTEGER NOT NULL,
    actual_parking_distance INTEGER,
    actual_difficulty VARCHAR(20),
    
    had_to_repark BOOLEAN DEFAULT FALSE,
    parking_penalty_issued BOOLEAN DEFAULT FALSE,
    
    success BOOLEAN NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parking_outcomes_address ON parking_outcomes(address_normalized);
CREATE INDEX IF NOT EXISTS idx_parking_outcomes_time ON parking_outcomes(recorded_at DESC);

-- =====================================================
-- Access Outcomes
-- =====================================================
CREATE TABLE IF NOT EXISTS access_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id UUID NOT NULL,
    address_normalized VARCHAR(255) NOT NULL,
    
    recommended_entrance VARCHAR(20),
    attempted_entrance VARCHAR(20),
    succeeded_entrance VARCHAR(20),
    
    access_time_seconds INTEGER,
    access_outcome VARCHAR(20),
    
    customer_present BOOLEAN DEFAULT FALSE,
    intercom_required BOOLEAN DEFAULT FALSE,
    
    success BOOLEAN NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_outcomes_address ON access_outcomes(address_normalized);
CREATE INDEX IF NOT EXISTS idx_access_outcomes_time ON access_outcomes(recorded_at DESC);

-- =====================================================
-- Recommendation Predictions
-- =====================================================
CREATE TABLE IF NOT EXISTS recommendation_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id UUID NOT NULL UNIQUE,
    type VARCHAR(50) NOT NULL,
    address_normalized VARCHAR(255) NOT NULL,
    predicted_outcome TEXT NOT NULL,
    actual_outcome TEXT,
    correct BOOLEAN,
    predicted_at TIMESTAMPTZ NOT NULL,
    actual_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rec_predictions_address ON recommendation_predictions(address_normalized);
CREATE INDEX IF NOT EXISTS idx_rec_predictions_type ON recommendation_predictions(type);
CREATE INDEX IF NOT EXISTS idx_rec_predictions_time ON recommendation_predictions(predicted_at DESC);

-- =====================================================
-- Recommendation Accuracy: Aggregated metrics
-- =====================================================
CREATE TABLE IF NOT EXISTS recommendation_accuracy (
    type VARCHAR(50) PRIMARY KEY,
    total_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    accuracy_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
    sample_size INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Driver Behavior Tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS driver_behavior (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL,
    
    -- Parking
    parking_time_seconds INTEGER,
    parking_distance_meters INTEGER,
    
    -- Access
    access_time_seconds INTEGER,
    entrance_used VARCHAR(20),
    total_delivery_time INTEGER,
    
    -- Override
    recommendation_override BOOLEAN DEFAULT FALSE,
    override_reason TEXT,
    
    -- Context
    vehicle_id VARCHAR(50),
    
    -- Outcome
    success BOOLEAN NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_behavior_driver ON driver_behavior(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_behavior_time ON driver_behavior(recorded_at DESC);

-- =====================================================
-- Driver Preferences: Learned preferences
-- =====================================================
CREATE TABLE IF NOT EXISTS driver_preferences (
    driver_id UUID PRIMARY KEY,
    
    -- Parking
    parking_style VARCHAR(20) NOT NULL DEFAULT 'CONVENIENT',
    max_parking_walk_meters INTEGER NOT NULL DEFAULT 50,
    prefers_loading_bay BOOLEAN DEFAULT FALSE,
    
    -- Access
    prefers_front_entrance BOOLEAN DEFAULT TRUE,
    max_access_walk_meters INTEGER NOT NULL DEFAULT 100,
    uses_intercom BOOLEAN DEFAULT FALSE,
    
    -- Delivery
    delivery_speed VARCHAR(20) NOT NULL DEFAULT 'STANDARD',
    risk_tolerance VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
    
    -- Time
    prefers_morning_stops BOOLEAN DEFAULT FALSE,
    prefers_afternoon_stops BOOLEAN DEFAULT FALSE,
    peak_hour_avoidance BOOLEAN DEFAULT TRUE,
    
    -- Vehicle
    preferred_vehicle_size VARCHAR(20) DEFAULT 'MEDIUM',
    vehicle_familiarity JSONB DEFAULT '{}',
    
    -- Patterns
    success_patterns TEXT[] DEFAULT '{}',
    improvement_areas TEXT[] DEFAULT '{}',
    
    -- Confidence
    profile_confidence VARCHAR(20) NOT NULL DEFAULT 'LOW',
    sample_size INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Arrival Time Predictions
-- =====================================================
CREATE TABLE IF NOT EXISTS arrival_time_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_normalized VARCHAR(255) NOT NULL,
    hour INTEGER NOT NULL CHECK (hour >= 0 AND hour <= 23),
    accuracy_seconds INTEGER NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(address_normalized, hour)
);

CREATE INDEX IF NOT EXISTS idx_arrival_time_address ON arrival_time_predictions(address_normalized);

-- =====================================================
-- Entrance Outcomes
-- =====================================================
CREATE TABLE IF NOT EXISTS entrance_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_normalized VARCHAR(255) NOT NULL,
    entrance VARCHAR(20) NOT NULL,
    success BOOLEAN NOT NULL,
    success_rate DECIMAL(5,4) NOT NULL DEFAULT 0,
    count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(address_normalized, entrance)
);

CREATE INDEX IF NOT EXISTS idx_entrance_outcomes_address ON entrance_outcomes(address_normalized);
