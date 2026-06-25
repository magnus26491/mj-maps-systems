-- Migration: 018_driver_experience_feedback
-- Adds driver experience feedback collection for route learning

-- Driver experience feedback table
CREATE TABLE IF NOT EXISTS driver_experience_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    route_id UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    
    -- Overall experience
    experience_level VARCHAR(10) NOT NULL CHECK (experience_level IN ('easy', 'ok', 'difficult')),
    
    -- Issue categories (JSONB for flexibility)
    issues JSONB DEFAULT '[]' CHECK (jsonb_typeof(issues) = 'array'),
    -- Possible values: 'parking', 'access', 'traffic', 'customer_unavailable', 'navigation', 'other'
    
    -- Optional notes
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_feedback_per_route UNIQUE (driver_id, route_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_driver_experience_driver_id ON driver_experience_feedback(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_experience_route_id ON driver_experience_feedback(route_id);
CREATE INDEX IF NOT EXISTS idx_driver_experience_created_at ON driver_experience_feedback(created_at DESC);

-- Comments
COMMENT ON TABLE driver_experience_feedback IS 'Stores driver feedback about route experience for continuous learning';
COMMENT ON COLUMN driver_experience_feedback.experience_level IS 'Driver assessment: easy, ok, or difficult';
COMMENT ON COLUMN driver_experience_feedback.issues IS 'JSON array of issue categories: parking, access, traffic, customer_unavailable, navigation, other';
