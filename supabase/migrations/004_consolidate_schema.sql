-- Migration: Consolidate and fix schema inconsistencies
-- Created: 2025-01-22
-- Description: Single migration to consolidate all schema changes and fix inconsistencies

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist to ensure clean state
DROP TABLE IF EXISTS public.badges CASCADE;
DROP TABLE IF EXISTS public.insights CASCADE;
DROP TABLE IF EXISTS public.results CASCADE;
DROP TABLE IF EXISTS public.experiments CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;

-- Drop existing functions and triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.generate_experiment_insight(UUID);
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP FUNCTION IF EXISTS validate_experiment_parameters();
DROP FUNCTION IF EXISTS validate_results_data();

-- Users table
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Experiments table
CREATE TABLE public.experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    experiment_type VARCHAR(100) NOT NULL CHECK (experiment_type IN ('eeg_recording', 'fmri_scan', 'behavioral_test', 'emg_recording', 'heart_rate', 'reaction_time', 'memory', 'eeg')),
    parameters JSONB,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Results table
CREATE TABLE public.results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
    data_points JSONB NOT NULL,
    metrics JSONB,
    analysis_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insights table
CREATE TABLE public.insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Badges table
CREATE TABLE public.badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_experiments_user_id ON public.experiments(user_id);
CREATE INDEX idx_experiments_type ON public.experiments(experiment_type);
CREATE INDEX idx_experiments_status ON public.experiments(status);
CREATE INDEX idx_experiments_created_at ON public.experiments(created_at);
CREATE INDEX idx_experiments_user_created ON public.experiments(user_id, created_at DESC);
CREATE INDEX idx_experiments_user_type_status ON public.experiments(user_id, experiment_type, status);

CREATE INDEX idx_results_experiment_id ON public.results(experiment_id);
CREATE INDEX idx_results_experiment_created ON public.results(experiment_id, created_at DESC);

CREATE INDEX idx_insights_experiment_id ON public.insights(experiment_id);
CREATE INDEX idx_badges_user_id ON public.badges(user_id);

-- Text search index for experiment names
CREATE INDEX idx_experiments_name_gin ON public.experiments USING gin(to_tsvector('english', name));

-- Enable Row Level Security
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users table
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid()::text = id::text);

CREATE POLICY "Users can insert own profile" ON public.users
    FOR INSERT WITH CHECK (auth.uid()::text = id::text);

-- RLS Policies for experiments table
CREATE POLICY "Users can view own experiments" ON public.experiments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own experiments" ON public.experiments
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own experiments" ON public.experiments
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own experiments" ON public.experiments
    FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for results table
CREATE POLICY "Users can view results for own experiments" ON public.results
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.experiments 
            WHERE experiments.id = results.experiment_id 
            AND experiments.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert results for own experiments" ON public.results
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.experiments 
            WHERE experiments.id = results.experiment_id 
            AND experiments.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update results for own experiments" ON public.results
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.experiments 
            WHERE experiments.id = results.experiment_id 
            AND experiments.user_id = auth.uid()
        )
    );

-- RLS Policies for insights table
CREATE POLICY "Users can view insights for own experiments" ON public.insights
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.experiments 
            WHERE experiments.id = insights.experiment_id 
            AND experiments.user_id = auth.uid()
        )
    );

CREATE POLICY "System can insert insights" ON public.insights
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.experiments 
            WHERE experiments.id = insights.experiment_id 
            AND experiments.user_id = auth.uid()
        )
    );

-- RLS Policies for badges table
CREATE POLICY "Users can view own badges" ON public.badges
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can insert badges" ON public.badges
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Utility functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for experiments table updated_at
CREATE TRIGGER update_experiments_updated_at
    BEFORE UPDATE ON public.experiments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Validation functions
CREATE OR REPLACE FUNCTION validate_experiment_parameters()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate that parameters is a valid JSON object when provided
    IF NEW.parameters IS NOT NULL AND jsonb_typeof(NEW.parameters) != 'object' THEN
        RAISE EXCEPTION 'Experiment parameters must be a valid JSON object';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_experiment
    BEFORE INSERT OR UPDATE ON public.experiments
    FOR EACH ROW
    EXECUTE FUNCTION validate_experiment_parameters();

-- Results validation function
CREATE OR REPLACE FUNCTION validate_results_data()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate that data_points is an array
    IF NEW.data_points IS NOT NULL AND jsonb_typeof(NEW.data_points) != 'array' THEN
        RAISE EXCEPTION 'data_points must be a JSON array';
    END IF;
    
    -- Validate that metrics is an object when provided
    IF NEW.metrics IS NOT NULL AND jsonb_typeof(NEW.metrics) != 'object' THEN
        RAISE EXCEPTION 'metrics must be a JSON object';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_results
    BEFORE INSERT OR UPDATE ON public.results
    FOR EACH ROW
    EXECUTE FUNCTION validate_results_data();

-- Auto-create user profile function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, username, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', NEW.email), NEW.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user profile
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Insight generation function
CREATE OR REPLACE FUNCTION public.generate_experiment_insight(experiment_id UUID)
RETURNS TEXT AS $$
DECLARE
    exp_record RECORD;
    insight_message TEXT;
BEGIN
    SELECT * INTO exp_record FROM public.experiments WHERE id = experiment_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Experiment not found: %', experiment_id;
    END IF;
    
    CASE exp_record.experiment_type
        WHEN 'heart_rate' THEN
            IF (exp_record.parameters->>'bpm')::INTEGER > 100 THEN
                insight_message := 'Your heart rate is elevated. Consider relaxation techniques.';
            ELSIF (exp_record.parameters->>'bpm')::INTEGER < 60 THEN
                insight_message := 'Your heart rate is quite low. Great cardiovascular fitness!';
            ELSE
                insight_message := 'Your heart rate is within normal range.';
            END IF;
            
        WHEN 'reaction_time' THEN
            IF (exp_record.parameters->>'reaction_ms')::INTEGER < 250 THEN
                insight_message := 'Excellent reaction time! Your reflexes are sharp.';
            ELSIF (exp_record.parameters->>'reaction_ms')::INTEGER > 400 THEN
                insight_message := 'Consider practicing reaction time exercises to improve speed.';
            ELSE
                insight_message := 'Your reaction time is within normal range.';
            END IF;
            
        WHEN 'memory' THEN
            IF (exp_record.parameters->>'score')::INTEGER >= 8 THEN
                insight_message := 'Excellent memory performance! Keep up the good work.';
            ELSIF (exp_record.parameters->>'score')::INTEGER >= 6 THEN
                insight_message := 'Good memory performance with room for improvement.';
            ELSE
                insight_message := 'Consider memory training exercises to enhance recall.';
            END IF;
            
        WHEN 'eeg', 'eeg_recording' THEN
            insight_message := 'EEG data recorded successfully. Consult with a specialist for detailed analysis.';
            
        WHEN 'fmri_scan' THEN
            insight_message := 'fMRI scan completed. Data is ready for neurological analysis.';
            
        WHEN 'behavioral_test' THEN
            insight_message := 'Behavioral test completed successfully. Results show cognitive patterns.';
            
        WHEN 'emg_recording' THEN
            insight_message := 'EMG recording completed. Muscle activity data captured successfully.';
            
        ELSE
            insight_message := 'Experiment completed successfully.';
    END CASE;
    
    INSERT INTO public.insights (experiment_id, message)
    VALUES (experiment_id, insight_message);
    
    RETURN insight_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Table comments for documentation
COMMENT ON TABLE public.users IS 'User profiles with additional data beyond Supabase Auth';
COMMENT ON TABLE public.experiments IS 'Neurological experiment metadata and configuration';
COMMENT ON TABLE public.results IS 'Experiment results and analysis data';
COMMENT ON TABLE public.insights IS 'AI-generated insights and recommendations for experiments';
COMMENT ON TABLE public.badges IS 'Gamification badges and achievements for users';

COMMENT ON COLUMN public.experiments.experiment_type IS 'Type of neurological test: heart_rate, reaction_time, memory, eeg, eeg_recording, fmri_scan, behavioral_test, or emg_recording';
COMMENT ON COLUMN public.experiments.parameters IS 'Flexible JSONB field storing experiment configuration';
COMMENT ON COLUMN public.results.data_points IS 'Array of experiment data points with timestamps and values';
COMMENT ON COLUMN public.results.metrics IS 'Calculated metrics like mean, std_dev, min, max';
COMMENT ON COLUMN public.insights.message IS 'Human-readable insight or recommendation text';

-- Update table statistics for query planner
ANALYZE public.users;
ANALYZE public.experiments;
ANALYZE public.results;
ANALYZE public.insights;
ANALYZE public.badges;