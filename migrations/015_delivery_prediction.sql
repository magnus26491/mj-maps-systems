-- Migration: Delivery Prediction Engine
-- Phase 18A: Predictive delivery intelligence

-- =====================================================
-- Delivery Prediction Results: Track prediction accuracy
-- =====================================================
CREATE TABLE IF NOT EXISTS delivery_prediction_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID NOT NULL,
    stop_id UUID NOT NULL,
    route_id UUID NOT NULL,
    driver_id UUID NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Predicted values
    predicted_completion_probability DECIMAL(3,2),
    predicted_duration_seconds INTEGER,
    predicted_parking_difficulty VARCHAR(20),
    predicted_access_difficulty VARCHAR(20),
    predicted_failure_reasons JSONB DEFAULT '[]',
    
    -- Actual values
    actual_completed BOOLEAN,
    actual_completion_time_seconds INTEGER,
    actual_parking_time_seconds INTEGER,
    actual_walking_distance_metres INTEGER,
    actual_entrance_used VARCHAR(20),
    actual_failure_reason TEXT,
    driver_feedback TEXT,
    
    -- Accuracy metrics
    completion_correct BOOLEAN,
    duration_error_seconds INTEGER,
    parking_difficulty_correct BOOLEAN,
    accuracy_score INTEGER,
    
    -- Timestamps
    predicted_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prediction_results_stop ON delivery_prediction_results(stop_id);
CREATE INDEX IF NOT EXISTS idx_prediction_results_route ON delivery_prediction_results(route_id);
CREATE INDEX IF NOT EXISTS idx_prediction_results_driver ON delivery_prediction_results(driver_id);
CREATE INDEX IF NOT EXISTS idx_prediction_results_time ON delivery_prediction_results(predicted_at DESC);

-- =====================================================
-- Stop Delivery History: Historical delivery data
-- =====================================================
CREATE TABLE IF NOT EXISTS stop_delivery_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_normalised VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    stop_id UUID,
    arrived_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL,
    completion_seconds INTEGER,
    failure_reason TEXT,
    driver_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stop_history_address ON stop_delivery_history(address_normalised);
CREATE INDEX IF NOT EXISTS idx_stop_history_time ON stop_delivery_history(arrived_at DESC);

-- =====================================================
-- Parking History: Parking outcome tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS parking_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_normalised VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    parking_time_seconds INTEGER,
    parking_distance_metres INTEGER,
    parking_type VARCHAR(30),
    penalty_issued BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parking_history_address ON parking_history(address_normalised);
CREATE INDEX IF NOT EXISTS idx_parking_history_time ON parking_history(recorded_at DESC);

-- =====================================================
-- Delivery Entrance History: Which entrance used
-- =====================================================
CREATE TABLE IF NOT EXISTS delivery_entrance_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_normalised VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    entrance_location VARCHAR(20) NOT NULL,
    success BOOLEAN NOT NULL,
    time_taken_seconds INTEGER,
    driver_id UUID,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entrance_history_address ON delivery_entrance_history(address_normalised);
CREATE INDEX IF NOT EXISTS idx_entrance_history_location ON delivery_entrance_history(entrance_location);

-- =====================================================
-- Time Window Success Rates: Best/worst delivery times
-- =====================================================
CREATE TABLE IF NOT EXISTS time_window_success (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    address_normalised VARCHAR(255) NOT NULL,
    time_window_start INTEGER NOT NULL, -- Hour (0-23)
    time_window_end INTEGER NOT NULL,
    total_attempts INTEGER NOT NULL DEFAULT 0,
    successful_attempts INTEGER NOT NULL DEFAULT 0,
    success_rate DECIMAL(3,2),
    avg_completion_seconds INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(address_normalised, time_window_start)
);

CREATE INDEX IF NOT EXISTS idx_time_window_address ON time_window_success(address_normalised);

-- =====================================================
-- Prediction Accuracy Summary: Aggregated metrics
-- =====================================================
CREATE TABLE IF NOT EXISTS prediction_accuracy_summary (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    total_predictions INTEGER NOT NULL,
    overall_accuracy DECIMAL(3,2),
    completion_accuracy DECIMAL(3,2),
    duration_accuracy_seconds INTEGER,
    parking_accuracy DECIMAL(3,2),
    calibration_buckets JSONB,
    bias VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accuracy_summary_time ON prediction_accuracy_summary(period_start DESC);

-- =====================================================
-- Data Retention
-- =====================================================
-- Prediction results: 90 days
-- Stop delivery history: 1 year
-- Parking history: 1 year
-- Entrance history: 1 year
-- Time window success: Indefinite (valuable historical data)
