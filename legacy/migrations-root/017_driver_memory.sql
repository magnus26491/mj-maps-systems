-- Migration: Phase 20A - Driver Memory Intelligence
-- Personal intelligence layer combining global, driver, vehicle, and fleet data

-- =====================================================
-- Driver Stop Memory
-- =====================================================
CREATE TABLE IF NOT EXISTS driver_stop_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    driver_id UUID NOT NULL,
    address_normalized VARCHAR(255) NOT NULL,
    
    -- Delivery history
    successful_deliveries INTEGER NOT NULL DEFAULT 0,
    failed_deliveries INTEGER NOT NULL DEFAULT 0,
    last_delivery_date TIMESTAMPTZ,
    avg_completion_seconds INTEGER NOT NULL DEFAULT 0,
    
    -- Preferences learned
    preferred_parking VARCHAR(100),
    preferred_approach VARCHAR(100),
    preferred_entrance VARCHAR(50),
    walking_tolerance_metres INTEGER DEFAULT 50,
    
    -- Problems encountered
    problems_encountered TEXT[] DEFAULT '{}',
    last_problem_date TIMESTAMPTZ,
    
    -- Vehicle specific history (JSONB for flexibility)
    vehicle_history JSONB DEFAULT '[]',
    
    -- Fleet context
    fleet_success_rate DECIMAL(5,4) DEFAULT 0.9,
    similar_driver_count INTEGER DEFAULT 0,
    
    -- Confidence
    memory_confidence VARCHAR(20) NOT NULL DEFAULT 'LOW',
    sample_size INTEGER NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(driver_id, address_normalized)
);

CREATE INDEX IF NOT EXISTS idx_driver_stop_memory_driver ON driver_stop_memory(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_stop_memory_address ON driver_stop_memory(address_normalized);
CREATE INDEX IF NOT EXISTS idx_driver_stop_memory_confidence ON driver_stop_memory(memory_confidence);

-- =====================================================
-- Fleet Similarity Tracking
-- =====================================================
CREATE TABLE IF NOT EXISTS fleet_similarity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference
    address_normalized VARCHAR(255) NOT NULL,
    
    -- Similar drivers
    driver_id UUID NOT NULL,
    vehicle_type VARCHAR(50),
    success_rate DECIMAL(5,4) NOT NULL DEFAULT 0.9,
    deliveries INTEGER NOT NULL DEFAULT 1,
    
    -- Computed similarity
    similarity_score DECIMAL(5,4) DEFAULT 0.5,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(address_normalized, driver_id)
);

CREATE INDEX IF NOT EXISTS idx_fleet_similarity_address ON fleet_similarity(address_normalized);
CREATE INDEX IF NOT EXISTS idx_fleet_similarity_driver ON fleet_similarity(driver_id);
