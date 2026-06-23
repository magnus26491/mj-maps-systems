-- Migration: Telemetry and Operational Intelligence
-- Phase 16E: Driver/Route/Product metrics and technical monitoring

-- =====================================================
-- Telemetry Events: Driver actions and app events
-- =====================================================
CREATE TABLE IF NOT EXISTS telemetry_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    driver_id UUID NOT NULL,
    route_id UUID,
    stop_id UUID,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telemetry_events_driver ON telemetry_events(driver_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_route ON telemetry_events(route_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_type ON telemetry_events(event_type);
CREATE INDEX IF NOT EXISTS idx_telemetry_events_time ON telemetry_events(timestamp DESC);

-- =====================================================
-- Route Metrics: Route performance tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS route_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL,
    driver_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prediction metrics
    predicted_eta TIMESTAMPTZ,
    actual_eta TIMESTAMPTZ,
    eta_error_minutes INTEGER,
    
    -- Confidence metrics
    initial_confidence VARCHAR(10),
    final_confidence VARCHAR(10),
    
    -- Parking prediction
    predicted_parking_difficulty VARCHAR(10),
    actual_parking_time_minutes INTEGER,
    
    -- Route optimization
    reorder_count INTEGER DEFAULT 0,
    reorder_success_rate DECIMAL(3,2),
    
    -- Navigation
    navigation_override_count INTEGER DEFAULT 0,
    navigation_total_distance DECIMAL(10,2),
    
    -- Completion
    total_stops INTEGER,
    completed_stops INTEGER,
    failed_stops INTEGER,
    completion_rate DECIMAL(3,2),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_route_metrics_route ON route_metrics(route_id);
CREATE INDEX IF NOT EXISTS idx_route_metrics_driver ON route_metrics(driver_id);
CREATE INDEX IF NOT EXISTS idx_route_metrics_time ON route_metrics(timestamp DESC);

-- =====================================================
-- Product Metrics: Usage and conversion tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS product_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    user_id UUID,
    driver_id UUID,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Plan changes
    from_plan VARCHAR(20),
    to_plan VARCHAR(20),
    plan VARCHAR(20),
    
    -- Feature usage
    features JSONB DEFAULT '[]',
    
    -- Route context
    route_id UUID,
    stops_count INTEGER,
    
    -- Attribution
    source VARCHAR(100),
    utm_campaign VARCHAR(100),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_metrics_user ON product_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_product_metrics_driver ON product_metrics(driver_id);
CREATE INDEX IF NOT EXISTS idx_product_metrics_type ON product_metrics(event_type);
CREATE INDEX IF NOT EXISTS idx_product_metrics_time ON product_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_product_metrics_plan ON product_metrics(plan);

-- =====================================================
-- API Latency: Technical monitoring
-- =====================================================
CREATE TABLE IF NOT EXISTS api_latency (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    driver_id UUID,
    error TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_latency_endpoint ON api_latency(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_latency_time ON api_latency(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_latency_status ON api_latency(status_code);

-- =====================================================
-- GPS Metrics: Location update tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS gps_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL,
    route_id UUID,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    success BOOLEAN NOT NULL DEFAULT TRUE,
    latency_ms INTEGER,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_gps_metrics_driver ON gps_metrics(driver_id);
CREATE INDEX IF NOT EXISTS idx_gps_metrics_route ON gps_metrics(route_id);
CREATE INDEX IF NOT EXISTS idx_gps_metrics_time ON gps_metrics(timestamp DESC);

-- =====================================================
-- Service Health: System health tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS service_health (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    latency_ms INTEGER,
    error_rate DECIMAL(3,2),
    error_message TEXT,
    details JSONB DEFAULT '{}',
    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_health_service ON service_health(service);
CREATE INDEX IF NOT EXISTS idx_service_health_time ON service_health(checked_at DESC);

-- =====================================================
-- Data Retention Policies
-- =====================================================
-- Telemetry events: 30 days
-- Route metrics: 90 days
-- Product metrics: 1 year
-- API latency: 7 days
-- GPS metrics: 7 days
-- Service health: 30 days

-- Note: Implement cleanup via scheduled job
-- Example cron: DELETE FROM telemetry_events WHERE timestamp < NOW() - INTERVAL '30 days'
