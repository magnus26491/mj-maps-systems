-- Migration: Delivery Learning Infrastructure
-- Phase 16D: Outcome capture, stop memory, driver profiles

-- =====================================================
-- Stop Predictions: Store predictions for comparison
-- =====================================================
CREATE TABLE IF NOT EXISTS stop_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id UUID NOT NULL,
    route_id UUID NOT NULL,
    driver_id UUID,
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Geocoding predictions
    predicted_confidence VARCHAR(10),
    predicted_lat DOUBLE PRECISION,
    predicted_lng DOUBLE PRECISION,
    
    -- Time predictions
    predicted_eta_minutes INTEGER,
    predicted_completion_time_minutes INTEGER,
    
    -- Risk predictions
    predicted_parking_difficulty VARCHAR(10),
    predicted_access_difficulty VARCHAR(10),
    predicted_completion_probability DECIMAL(3,2),
    
    -- Actual outcomes (filled after delivery)
    actual_completion_time_minutes INTEGER,
    actual_parking_time_minutes INTEGER,
    actual_walking_distance_m INTEGER,
    actual_success BOOLEAN,
    failure_reason VARCHAR(50),
    driver_override BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stop_predictions_stop_id ON stop_predictions(stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_predictions_route_id ON stop_predictions(route_id);
CREATE INDEX IF NOT EXISTS idx_stop_predictions_driver_id ON stop_predictions(driver_id);

-- =====================================================
-- Stop Memory: Learned stop characteristics
-- =====================================================
CREATE TABLE IF NOT EXISTS stop_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_normalised VARCHAR(500) NOT NULL UNIQUE,
    
    -- Physical characteristics (learned)
    parking_difficulty VARCHAR(10),
    parking_notes TEXT,
    access_difficulty VARCHAR(10),
    access_notes TEXT,
    requires_walking BOOLEAN DEFAULT FALSE,
    walk_distance_metres INTEGER,
    
    -- Temporal patterns
    best_time_of_day VARCHAR(20),
    difficulty_after_pm BOOLEAN,
    
    -- Access details (non-personal)
    has_flat_entrance BOOLEAN,
    entrance_location VARCHAR(50),
    gate_code_known BOOLEAN DEFAULT FALSE,
    
    -- Delivery patterns
    avg_completion_time_minutes INTEGER,
    failure_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    last_visited_at TIMESTAMPTZ,
    
    -- Metadata
    confidence_score DECIMAL(3,2),
    data_sources VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stop_memory_address ON stop_memory(address_normalised);
CREATE INDEX IF NOT EXISTS idx_stop_memory_updated ON stop_memory(updated_at DESC);

-- =====================================================
-- Driver Profiles: Learned driver behavior
-- =====================================================
CREATE TABLE IF NOT EXISTS driver_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL UNIQUE,
    
    -- Routing preferences
    preferred_approach_side VARCHAR(10),
    walking_tolerance_metres INTEGER DEFAULT 200,
    
    -- Performance patterns
    avg_completion_time_per_stop DECIMAL(5,2),
    parking_speed_score DECIMAL(3,2),
    
    -- Route characteristics
    prefers_early_stops BOOLEAN,
    handles_high_risk BOOLEAN,
    
    -- Learning data
    routes_completed INTEGER DEFAULT 0,
    stops_completed INTEGER DEFAULT 0,
    
    -- Accuracy metrics
    eta_accuracy_score DECIMAL(3,2) DEFAULT 0.5,
    parking_accuracy_score DECIMAL(3,2) DEFAULT 0.5,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_profiles_driver ON driver_profiles(driver_id);

-- =====================================================
-- Route Confidence: Route reliability scoring
-- =====================================================
CREATE TABLE IF NOT EXISTS route_confidence (
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
    low_confidence_stops INTEGER DEFAULT 0,
    
    -- Calculated at route generation
    calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_confidence_route ON route_confidence(route_id);

-- =====================================================
-- Delivery Events: Event log for learning
-- =====================================================
CREATE TABLE IF NOT EXISTS delivery_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL,
    stop_id UUID,
    driver_id UUID NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB DEFAULT '{}',
    occurred_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_route ON delivery_events(route_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_driver ON delivery_events(driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_type ON delivery_events(event_type);
CREATE INDEX IF NOT EXISTS idx_delivery_events_time ON delivery_events(occurred_at DESC);

-- =====================================================
-- Update timestamp trigger
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_stop_predictions_updated
    BEFORE UPDATE ON stop_predictions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stop_memory_updated
    BEFORE UPDATE ON stop_memory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_driver_profiles_updated
    BEFORE UPDATE ON driver_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
