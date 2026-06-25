-- Migration: 020_realtime_navigation_intelligence
-- Phase 22: Real-Time Road Intelligence Database Schema

-- ─────────────────────────────────────────────────────────────
-- Table: traffic_events
-- Stores live traffic conditions from multiple providers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS traffic_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Road identification
    road_id VARCHAR(255) NOT NULL,
    road_name VARCHAR(255),
    
    -- Location
    lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    
    -- Traffic data
    free_flow_speed_kmh INTEGER,
    current_speed_kmh INTEGER,
    congestion_level VARCHAR(20) NOT NULL CHECK (congestion_level IN (
        'none', 'light', 'moderate', 'heavy', 'blocked'
    )),
    delay_seconds INTEGER,
    
    -- Data quality
    confidence DOUBLE PRECISION CHECK (confidence BETWEEN 0 AND 1),
    source VARCHAR(50) NOT NULL CHECK (source IN ('here', 'tomtom', 'google', 'internal')),
    
    -- Timestamps
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
    
    -- Spatial index hint
    CONSTRAINT valid_traffic_lat_lng CHECK (
        lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_traffic_location ON traffic_events(lat, lng);
CREATE INDEX IF NOT EXISTS idx_traffic_road ON traffic_events(road_id);
CREATE INDEX IF NOT EXISTS idx_traffic_source ON traffic_events(source);
CREATE INDEX IF NOT EXISTS idx_traffic_recorded ON traffic_events(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_expires ON traffic_events(expires_at);

-- ─────────────────────────────────────────────────────────────
-- Table: live_events
-- Stores real-world events affecting deliveries
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS live_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event identification
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'festival', 'market', 'concert', 'sport', 'school', 'road_closure', 'other'
    )),
    name VARCHAR(255),  -- Not shown to drivers
    
    -- Location
    lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    radius_metres INTEGER,
    
    -- Timing
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    
    -- Impact assessment
    expected_impact VARCHAR(20) NOT NULL CHECK (expected_impact IN ('low', 'medium', 'high')),
    delivery_impact VARCHAR(255) NOT NULL,
    recommendation VARCHAR(255) NOT NULL,
    
    -- Data quality
    confidence DOUBLE PRECISION CHECK (confidence BETWEEN 0 AND 1),
    source VARCHAR(50) NOT NULL CHECK (source IN ('council', 'internal', 'traffic_api', 'weather_api')),
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Active flag
    active BOOLEAN NOT NULL DEFAULT TRUE,
    
    CONSTRAINT valid_event_time CHECK (end_time > start_time)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_live_events_location ON live_events(lat, lng);
CREATE INDEX IF NOT EXISTS idx_live_events_type ON live_events(event_type);
CREATE INDEX IF NOT EXISTS idx_live_events_time ON live_events(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_live_events_active ON live_events(active) WHERE active = TRUE;

-- ─────────────────────────────────────────────────────────────
-- Table: weather_conditions
-- Stores weather data affecting deliveries
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weather_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Location
    lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    
    -- Weather data
    condition VARCHAR(50) NOT NULL CHECK (condition IN (
        'clear', 'cloudy', 'rain', 'heavy_rain', 'thunderstorm', 
        'snow', 'sleet', 'fog', 'wind', 'ice', 'flooding'
    )),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('none', 'light', 'moderate', 'heavy', 'severe')),
    
    -- Measurements
    temperature_celsius NUMERIC(5,2),
    visibility_metres INTEGER,
    wind_speed_kmh NUMERIC(6,2),
    precipitation_mm_h NUMERIC(6,2),
    
    -- Data quality
    source VARCHAR(50) NOT NULL CHECK (source IN ('met_office', 'openweather', 'internal')),
    
    -- Timestamps
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',
    
    -- Active flag
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_weather_location ON weather_conditions(lat, lng);
CREATE INDEX IF NOT EXISTS idx_weather_condition ON weather_conditions(condition);
CREATE INDEX IF NOT EXISTS idx_weather_recorded ON weather_conditions(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_weather_active ON weather_conditions(active) WHERE active = TRUE;

-- ─────────────────────────────────────────────────────────────
-- Table: route_decision_accuracy
-- Tracks accuracy of MJ navigation decisions for ML training
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS route_decision_accuracy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Decision reference
    decision_id UUID REFERENCES navigation_route_decisions(id) ON DELETE SET NULL,
    
    -- Outcome tracking
    predicted_outcome VARCHAR(50),
    actual_outcome VARCHAR(50),
    prediction_correct BOOLEAN,
    
    -- Timing
    predicted_duration_seconds INTEGER,
    actual_duration_seconds INTEGER,
    
    -- Route quality
    route_had_issues BOOLEAN,
    issues_description TEXT[],
    
    -- Feedback
    driver_reported_issue BOOLEAN,
    driver_feedback TEXT,
    
    -- Timestamps
    predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    
    CONSTRAINT unique_decision_outcome UNIQUE (decision_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accuracy_decision ON route_decision_accuracy(decision_id);
CREATE INDEX IF NOT EXISTS idx_accuracy_prediction ON route_decision_accuracy(prediction_correct) WHERE prediction_correct = FALSE;
CREATE INDEX IF NOT EXISTS idx_accuracy_time ON route_decision_accuracy(predicted_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Table: provider_performance
-- Tracks external data provider reliability
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Provider identification
    provider_id VARCHAR(50) NOT NULL CHECK (provider_id IN ('here', 'tomtom', 'google', 'internal')),
    
    -- Availability
    available BOOLEAN NOT NULL,
    latency_ms INTEGER,
    error_message TEXT,
    
    -- Data quality
    data_accuracy DOUBLE PRECISION CHECK (data_accuracy BETWEEN 0 AND 1),
    
    -- Timestamps
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_provider_check UNIQUE (provider_id, checked_at)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_provider_id ON provider_performance(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_available ON provider_performance(available) WHERE available = FALSE;
CREATE INDEX IF NOT EXISTS idx_provider_time ON provider_performance(checked_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Table: restriction_discoveries
-- Tracks newly discovered restrictions from route analysis
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS restriction_discoveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Location
    lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    road_name VARCHAR(255),
    
    -- Restriction details
    restriction_type VARCHAR(50) NOT NULL CHECK (restriction_type IN (
        'weight_limit', 'height_limit', 'width_limit', 'length_limit',
        'prohibited_turn', 'access_restriction', 'low_emission_zone',
        'congestion_charge', 'toll', 'pedestrian_zone'
    )),
    restriction_value VARCHAR(100),
    description TEXT,
    
    -- Discovery context
    discovered_by VARCHAR(50) CHECK (discovered_by IN ('driver_report', 'system_analysis', 'external_data')),
    vehicle_profile VARCHAR(100),
    
    -- Verification
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by UUID REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMPTZ,
    
    -- Timestamps
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_discovery_location ON restriction_discoveries(lat, lng);
CREATE INDEX IF NOT EXISTS idx_discovery_type ON restriction_discoveries(restriction_type);
CREATE INDEX IF NOT EXISTS idx_discovery_verified ON restriction_discoveries(verified) WHERE verified = FALSE;
CREATE INDEX IF NOT EXISTS idx_discovery_road ON restriction_discoveries USING GIST (ST_SetSRID(ST_MakePoint(lng, lat), 4326));

-- ─────────────────────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────────────────────
COMMENT ON TABLE traffic_events IS 'Live traffic conditions from HERE, TomTom, Google';
COMMENT ON TABLE live_events IS 'Real-world events affecting deliveries (festivals, markets, school)';
COMMENT ON TABLE weather_conditions IS 'Weather data affecting delivery confidence';
COMMENT ON TABLE route_decision_accuracy IS 'Tracks MJ navigation decision accuracy for ML training';
COMMENT ON TABLE provider_performance IS 'External data provider reliability tracking';
COMMENT ON TABLE restriction_discoveries IS 'Newly discovered road restrictions';

COMMENT ON COLUMN traffic_events.expires_at IS 'Traffic data automatically expires to prevent stale data';
COMMENT ON COLUMN live_events.active IS 'Events are marked inactive after end_time';
COMMENT ON COLUMN route_decision_accuracy.prediction_correct IS 'Used for ML training data';
COMMENT ON COLUMN restriction_discoveries.discovered_by IS 'Source of the discovery';
