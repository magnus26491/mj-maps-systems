-- Migration: 019_navigation_intelligence
-- Phase 21: Navigation Control Layer Database Schema

-- ─────────────────────────────────────────────────────────────
-- Table: navigation_events
-- Stores live road events, restrictions, and traffic data
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS navigation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Event identification
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
        'traffic', 'roadwork', 'accident', 'event', 
        'weather', 'flooding', 'restriction', 'closure'
    )),
    source VARCHAR(50) NOT NULL CHECK (source IN (
        'here', 'tomtom', 'google', 'council', 'weather_api', 'internal'
    )),
    
    -- Location
    lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    radius_metres INTEGER,
    
    -- Timing
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    
    -- Severity and impact
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
    impact_score INTEGER NOT NULL CHECK (impact_score BETWEEN 0 AND 100),
    
    -- Description
    description TEXT NOT NULL,
    
    -- Vehicle applicability
    affected_vehicle_types TEXT[],
    
    -- Metadata
    metadata JSONB DEFAULT '{}',
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Active flag
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nav_events_location 
    ON navigation_events USING GIST (ST_SetSRID(ST_MakePoint(lng, lat), 4326));
CREATE INDEX IF NOT EXISTS idx_nav_events_type ON navigation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_nav_events_severity ON navigation_events(severity);
CREATE INDEX IF NOT EXISTS idx_nav_events_active ON navigation_events(active) WHERE active = TRUE;
CREATE INDEX IF NOT EXISTS idx_nav_events_time ON navigation_events(start_time, end_time);

-- ─────────────────────────────────────────────────────────────
-- Table: navigation_route_decisions
-- Stores original route, MJ recommendation, and outcomes
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS navigation_route_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Route context
    route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    
    -- Decision metadata
    decision_type VARCHAR(20) NOT NULL CHECK (decision_type IN (
        'ALLOW_ROUTE', 'MODIFY_ROUTE', 'BLOCK_ROUTE', 'SUGGEST_ALTERNATIVE'
    )),
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    confidence DOUBLE PRECISION NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    reason TEXT NOT NULL,
    
    -- Original route (polyline as JSON)
    original_route JSONB,
    original_distance_metres INTEGER,
    original_duration_seconds INTEGER,
    
    -- Modified route (if different)
    modified_route JSONB,
    modified_distance_metres INTEGER,
    modified_duration_seconds INTEGER,
    
    -- Alternative route (if suggested)
    alternative_route JSONB,
    alternative_distance_metres INTEGER,
    alternative_duration_seconds INTEGER,
    
    -- Outcome tracking
    alternative_accepted BOOLEAN,
    actual_outcome VARCHAR(50),
    delay_seconds INTEGER,
    
    -- Timestamps
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    route_started_at TIMESTAMPTZ,
    route_completed_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nav_decisions_route ON navigation_route_decisions(route_id);
CREATE INDEX IF NOT EXISTS idx_nav_decisions_driver ON navigation_route_decisions(driver_id);
CREATE INDEX IF NOT EXISTS idx_nav_decisions_type ON navigation_route_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_nav_decisions_time ON navigation_route_decisions(decided_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Table: vehicle_route_constraints
-- Stores vehicle-specific successful and failed roads
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_route_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Vehicle profile
    vehicle_profile_key VARCHAR(100) NOT NULL,
    
    -- Location (road segment)
    road_name VARCHAR(255),
    road_type VARCHAR(50),
    lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    
    -- Constraint details
    constraint_type VARCHAR(50) NOT NULL CHECK (constraint_type IN (
        'weight', 'height', 'width', 'length', 'axle',
        'prohibited_turn', 'access', 'narrow', 'other'
    )),
    constraint_value VARCHAR(100),
    description TEXT,
    
    -- Success tracking
    attempts INTEGER NOT NULL DEFAULT 0,
    successful_attempts INTEGER NOT NULL DEFAULT 0,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    
    -- Common issues reported
    common_issues TEXT[],
    
    -- Timestamps
    first_attempted TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempted TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint
    CONSTRAINT unique_vehicle_road_constraint 
        UNIQUE (vehicle_profile_key, road_name, constraint_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_vrc_vehicle ON vehicle_route_constraints(vehicle_profile_key);
CREATE INDEX IF NOT EXISTS idx_vrc_location ON vehicle_route_constraints(lat, lng);
CREATE INDEX IF NOT EXISTS idx_vrc_type ON vehicle_route_constraints(constraint_type);
CREATE INDEX IF NOT EXISTS idx_vrc_success_rate 
    ON vehicle_route_constraints(vehicle_profile_key, (successful_attempts::float / NULLIF(attempts, 0)));

-- ─────────────────────────────────────────────────────────────
-- Table: turn_analysis
-- Stores turn difficulty analysis per vehicle type
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS turn_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Vehicle profile
    vehicle_profile_key VARCHAR(100) NOT NULL,
    
    -- Turn location
    lat DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng BETWEEN -180 AND 180),
    turn_direction VARCHAR(10) NOT NULL CHECK (turn_direction IN ('left', 'right', 'u_turn')),
    
    -- Road geometry
    road_width_metres DOUBLE PRECISION,
    turning_radius_metres DOUBLE PRECISION,
    
    -- Analysis results
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy', 'moderate', 'difficult', 'impossible')),
    warnings TEXT[],
    
    -- History
    total_attempts INTEGER NOT NULL DEFAULT 0,
    successful_attempts INTEGER NOT NULL DEFAULT 0,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    avg_completion_seconds INTEGER,
    
    -- Alternative location
    alternative_lat DOUBLE PRECISION,
    alternative_lng DOUBLE PRECISION,
    alternative_reason TEXT,
    
    -- Timestamps
    first_analyzed TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint
    CONSTRAINT unique_vehicle_turn 
        UNIQUE (vehicle_profile_key, lat, lng, turn_direction)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_turn_vehicle ON turn_analysis(vehicle_profile_key);
CREATE INDEX IF NOT EXISTS idx_turn_location ON turn_analysis(lat, lng);
CREATE INDEX IF NOT EXISTS idx_turn_difficulty ON turn_analysis(difficulty) WHERE difficulty IN ('difficult', 'impossible');

-- ─────────────────────────────────────────────────────────────
-- Comments
-- ─────────────────────────────────────────────────────────────
COMMENT ON TABLE navigation_events IS 'Stores live traffic, roadwork, accident, and restriction events';
COMMENT ON TABLE navigation_route_decisions IS 'Stores MJ Navigation Control decisions for routes';
COMMENT ON TABLE vehicle_route_constraints IS 'Vehicle-specific road constraints learned from delivery history';
COMMENT ON TABLE turn_analysis IS 'Turn difficulty analysis per vehicle type';

COMMENT ON COLUMN navigation_events.impact_score IS '0-100 impact score, higher = more delay';
COMMENT ON COLUMN navigation_route_decisions.confidence IS 'ML confidence in the decision (0-1)';
COMMENT ON COLUMN vehicle_route_constraints.successful_attempts IS 'Number of times this constraint was successfully navigated';
