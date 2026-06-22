-- Migration: Driver Guardian Intelligence Layer
-- Phase 17: Background intelligence for driver protection

-- =====================================================
-- Guardian Assessments: Store risk assessments
-- =====================================================
CREATE TABLE IF NOT EXISTS guardian_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id UUID NOT NULL,
    route_id UUID NOT NULL,
    driver_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Overall risk
    overall_risk_score INTEGER NOT NULL,
    overall_risk_level VARCHAR(20) NOT NULL,
    
    -- Notification decision
    notification_priority VARCHAR(20) NOT NULL,
    should_notify BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Recommendation
    recommendation TEXT,
    confidence DECIMAL(3,2),
    
    -- Validity
    valid_until TIMESTAMPTZ,
    
    -- Raw data snapshot (JSON)
    risks_json JSONB DEFAULT '[]',
    data_sources JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guardian_assessments_stop ON guardian_assessments(stop_id);
CREATE INDEX IF NOT EXISTS idx_guardian_assessments_route ON guardian_assessments(route_id);
CREATE INDEX IF NOT EXISTS idx_guardian_assessments_driver ON guardian_assessments(driver_id);
CREATE INDEX IF NOT EXISTS idx_guardian_assessments_time ON guardian_assessments(timestamp DESC);

-- =====================================================
-- Parking Risk History: Track parking outcomes
-- =====================================================
CREATE TABLE IF NOT EXISTS parking_risk_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id UUID NOT NULL,
    driver_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Parking assessment
    restriction_type VARCHAR(30),
    max_stay_minutes INTEGER,
    enforcement_likelihood VARCHAR(20),
    overstay_risk_score INTEGER,
    will_exceed_limit BOOLEAN,
    
    -- Action taken
    alternative_used BOOLEAN DEFAULT FALSE,
    alternative_type VARCHAR(30),
    penalty_issued BOOLEAN DEFAULT FALSE,
    
    -- Outcome
    actual_duration_minutes INTEGER,
    success BOOLEAN NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parking_risk_stop ON parking_risk_history(stop_id);
CREATE INDEX IF NOT EXISTS idx_parking_risk_driver ON parking_risk_history(driver_id);
CREATE INDEX IF NOT EXISTS idx_parking_risk_time ON parking_risk_history(timestamp DESC);

-- =====================================================
-- Notification History: Track driver notifications
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id UUID,
    route_id UUID,
    driver_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Notification details
    priority VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    category VARCHAR(30),
    severity VARCHAR(20),
    
    -- Driver response
    driver_action VARCHAR(50),
    action_taken_at TIMESTAMPTZ,
    dismissed BOOLEAN DEFAULT FALSE,
    
    -- Impact
    interruption_occurred BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_driver ON notification_history(driver_id);
CREATE INDEX IF NOT EXISTS idx_notification_priority ON notification_history(priority);
CREATE INDEX IF NOT EXISTS idx_notification_time ON notification_history(timestamp DESC);

-- =====================================================
-- Environmental Alerts: Environmental risk tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS environmental_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stop_id UUID,
    driver_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Alert type
    alert_type VARCHAR(30) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    
    -- Details
    tidal_risk BOOLEAN DEFAULT FALSE,
    high_tide_time VARCHAR(10),
    weather_condition VARCHAR(30),
    flooding_risk BOOLEAN DEFAULT FALSE,
    
    -- Action
    driver_advised VARCHAR(255),
    deadline VARCHAR(10),
    action_required BOOLEAN DEFAULT FALSE,
    
    -- Outcome
    route_modified BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_env_alerts_driver ON environmental_alerts(driver_id);
CREATE INDEX IF NOT EXISTS idx_env_alerts_type ON environmental_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_env_alerts_time ON environmental_alerts(timestamp DESC);

-- =====================================================
-- Data Retention
-- =====================================================
-- Guardian assessments: 90 days
-- Parking risk history: 1 year
-- Notification history: 90 days
-- Environmental alerts: 30 days
