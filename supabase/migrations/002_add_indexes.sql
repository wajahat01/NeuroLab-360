-- Migration: Add performance indexes
-- Created: 2024-01-15
-- Description: Adds database indexes for improved query performance

-- Index for experiments by user and creation date (most common query)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_experiments_user_created 
ON experiments(user_id, created_at DESC);

-- Index for experiments by type and status (for filtering)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_experiments_type_status 
ON experiments(experiment_type, status);

-- Index for experiments by status only (for dashboard queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_experiments_status 
ON experiments(status);

-- Index for results by experiment and creation date
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_results_experiment_created 
ON results(experiment_id, created_at DESC);

-- Composite index for dashboard summary queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_experiments_user_type_status 
ON experiments(user_id, experiment_type, status);

-- Index for text search on experiment names (if needed for search functionality)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_experiments_name_gin 
ON experiments USING gin(to_tsvector('english', name));

-- Update table statistics for query planner
ANALYZE experiments;
ANALYZE results;