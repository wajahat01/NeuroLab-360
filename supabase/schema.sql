-- NeuroLab-360 Database Schema
-- PostgreSQL schema for neurological experiment tracking and analysis

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
-- Note: Supabase Auth automatically manages the auth.users table
-- We'll create a public.users table for additional user data
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Experiments table
-- Stores neurological experiment metadata and configuration
CREATE TABLE IF NOT EXISTS public.experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    experiment_type VARCHAR(100) NOT NULL,
    parameters JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Results table
-- Stores experiment results and analysis data
CREATE TABLE IF NOT EXISTS public.results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID REFERENCES public.experiments(id) ON DELETE CASCADE,
    data_points JSONB NOT NULL,
    metrics JSONB,
    analysis_summary TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insights table
-- Stores AI-generated or system insights for experiments
CREATE TABLE IF NOT EXISTS public.insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES public.experiments(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Badges table (gamification feature)
-- Tracks user achievements and milestones
CREATE TABLE IF NOT EXISTS public.badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_experiments_user_id ON public.experiments(user_id);
CREATE INDEX IF NOT EXISTS idx_experiments_type ON public.experiments(experiment_type);
CREATE INDEX IF NOT EXISTS idx_experiments_created_at ON public.experiments(created_at);
CREATE INDEX IF NOT EXISTS idx_results_experiment_id ON public.results(experiment_id);
CREATE INDEX IF NOT EXISTS idx_insights_experiment_id ON public.insights(experiment_id);
CREATE INDEX IF NOT EXISTS idx_badges_user_id ON public.badges(user_id);

-- Enable Row Level Security (RLS) for data protection
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

-- Sample data for testing (optional - remove in production)
-- INSERT INTO public.users (id, username, email) VALUES 
--     ('550e8400-e29b-41d4-a716-446655440000', 'test_user', 'test@example.com');

-- INSERT INTO public.experiments (user_id, type, value) VALUES 
--     ('550e8400-e29b-41d4-a716-446655440000', 'heart_rate', '{"bpm": 85, "duration_minutes": 5}'),
--     ('550e8400-e29b-41d4-a716-446655440000', 'reaction_time', '{"reaction_ms": 320, "attempts": 10}'),
--     ('550e8400-e29b-41d4-a716-446655440000', 'memory', '{"score": 8, "total": 10, "category": "visual"}'),
--     ('550e8400-e29b-41d4-a716-446655440000', 'eeg', '{"alpha_waves": 12.5, "beta_waves": 18.3, "theta_waves": 6.2}');

-- Function to automatically create user profile when auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, username, email)
    VALUES (NEW.id, NEW.email, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user profile
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to generate insights based on experiment data
CREATE OR REPLACE FUNCTION public.generate_experiment_insight(experiment_id UUID)
RETURNS TEXT AS $$
DECLARE
    exp_record RECORD;
    insight_message TEXT;
BEGIN
    SELECT * INTO exp_record FROM public.experiments WHERE id = experiment_id;
    
    CASE exp_record.type
        WHEN 'heart_rate' THEN
            IF (exp_record.value->>'bpm')::INTEGER > 100 THEN
                insight_message := 'Your heart rate is elevated. Consider relaxation techniques.';
            ELSIF (exp_record.value->>'bpm')::INTEGER < 60 THEN
                insight_message := 'Your heart rate is quite low. Great cardiovascular fitness!';
            ELSE
                insight_message := 'Your heart rate is within normal range.';
            END IF;
            
        WHEN 'reaction_time' THEN
            IF (exp_record.value->>'reaction_ms')::INTEGER < 250 THEN
                insight_message := 'Excellent reaction time! Your reflexes are sharp.';
            ELSIF (exp_record.value->>'reaction_ms')::INTEGER > 400 THEN
                insight_message := 'Consider practicing reaction time exercises to improve speed.';
            ELSE
                insight_message := 'Your reaction time is within normal range.';
            END IF;
            
        WHEN 'memory' THEN
            IF (exp_record.value->>'score')::INTEGER >= 8 THEN
                insight_message := 'Excellent memory performance! Keep up the good work.';
            ELSIF (exp_record.value->>'score')::INTEGER >= 6 THEN
                insight_message := 'Good memory performance with room for improvement.';
            ELSE
                insight_message := 'Consider memory training exercises to enhance recall.';
            END IF;
            
        WHEN 'eeg' THEN
            insight_message := 'EEG data recorded successfully. Consult with a specialist for detailed analysis.';
            
        ELSE
            insight_message := 'Experiment completed successfully.';
    END CASE;
    
    INSERT INTO public.insights (experiment_id, message)
    VALUES (experiment_id, insight_message);
    
    RETURN insight_message;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments for documentation
COMMENT ON TABLE public.users IS 'User profiles with additional data beyond Supabase Auth';
COMMENT ON TABLE public.experiments IS 'Neurological experiment metadata and configuration';
COMMENT ON TABLE public.results IS 'Experiment results and analysis data';
COMMENT ON TABLE public.insights IS 'AI-generated insights and recommendations for experiments';
COMMENT ON TABLE public.badges IS 'Gamification badges and achievements for users';

COMMENT ON COLUMN public.experiments.experiment_type IS 'Type of neurological test: heart_rate, reaction_time, memory, or eeg';
COMMENT ON COLUMN public.experiments.parameters IS 'Flexible JSONB field storing experiment configuration';
COMMENT ON COLUMN public.results.data_points IS 'Array of experiment data points with timestamps and values';
COMMENT ON COLUMN public.results.metrics IS 'Calculated metrics like mean, std_dev, min, max';
COMMENT ON COLUMN public.insights.message IS 'Human-readable insight or recommendation text';