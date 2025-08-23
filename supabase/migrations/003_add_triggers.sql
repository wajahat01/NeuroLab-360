-- Migration: Add database triggers
-- Created: 2024-01-15
-- Description: Adds triggers for automatic timestamp updates and data validation

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for experiments table
DROP TRIGGER IF EXISTS update_experiments_updated_at ON experiments;
CREATE TRIGGER update_experiments_updated_at
    BEFORE UPDATE ON experiments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to validate experiment parameters
CREATE OR REPLACE FUNCTION validate_experiment_parameters()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate that parameters is a valid JSON object
    IF NEW.parameters IS NOT NULL AND NOT (NEW.parameters ? 'duration' OR NEW.parameters ? 'sampling_rate') THEN
        RAISE EXCEPTION 'Experiment parameters must contain at least duration or sampling_rate';
    END IF;
    
    -- Validate experiment_type
    IF NEW.experiment_type NOT IN ('eeg_recording', 'fmri_scan', 'behavioral_test', 'emg_recording') THEN
        RAISE EXCEPTION 'Invalid experiment type: %', NEW.experiment_type;
    END IF;
    
    -- Validate status
    IF NEW.status NOT IN ('pending', 'running', 'completed', 'failed') THEN
        RAISE EXCEPTION 'Invalid experiment status: %', NEW.status;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for experiment validation
DROP TRIGGER IF EXISTS validate_experiment ON experiments;
CREATE TRIGGER validate_experiment
    BEFORE INSERT OR UPDATE ON experiments
    FOR EACH ROW
    EXECUTE FUNCTION validate_experiment_parameters();

-- Function to validate results data
CREATE OR REPLACE FUNCTION validate_results_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate that data_points is an array
    IF NEW.data_points IS NOT NULL AND jsonb_typeof(NEW.data_points) != 'array' THEN
        RAISE EXCEPTION 'data_points must be a JSON array';
    END IF;
    
    -- Validate that metrics is an object
    IF NEW.metrics IS NOT NULL AND jsonb_typeof(NEW.metrics) != 'object' THEN
        RAISE EXCEPTION 'metrics must be a JSON object';
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for results validation
DROP TRIGGER IF EXISTS validate_results ON results;
CREATE TRIGGER validate_results
    BEFORE INSERT OR UPDATE ON results
    FOR EACH ROW
    EXECUTE FUNCTION validate_results_data();