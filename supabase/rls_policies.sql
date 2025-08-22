-- Row Level Security (RLS) Policies for NeuroLab-360
-- These policies ensure users can only access their own data

-- Users table policies
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth.uid()::text = id::text);

CREATE POLICY "Users can insert own profile" ON public.users
    FOR INSERT WITH CHECK (auth.uid()::text = id::text);

-- Experiments table policies
CREATE POLICY "Users can view own experiments" ON public.experiments
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own experiments" ON public.experiments
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own experiments" ON public.experiments
    FOR UPDATE USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete own experiments" ON public.experiments
    FOR DELETE USING (auth.uid()::text = user_id::text);

-- Insights table policies
CREATE POLICY "Users can view insights for own experiments" ON public.insights
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.experiments 
            WHERE experiments.id = insights.experiment_id 
            AND experiments.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "System can insert insights" ON public.insights
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.experiments 
            WHERE experiments.id = insights.experiment_id 
            AND experiments.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can update insights for own experiments" ON public.insights
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.experiments 
            WHERE experiments.id = insights.experiment_id 
            AND experiments.user_id::text = auth.uid()::text
        )
    );

CREATE POLICY "Users can delete insights for own experiments" ON public.insights
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.experiments 
            WHERE experiments.id = insights.experiment_id 
            AND experiments.user_id::text = auth.uid()::text
        )
    );

-- Badges table policies
CREATE POLICY "Users can view own badges" ON public.badges
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "System can insert badges" ON public.badges
    FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can view own badges only" ON public.badges
    FOR UPDATE USING (auth.uid()::text = user_id::text);

-- Additional security: Prevent users from viewing other users' data
CREATE POLICY "Prevent cross-user data access" ON public.users
    FOR ALL USING (auth.uid()::text = id::text);

-- Function to check if user owns experiment (utility for complex policies)
CREATE OR REPLACE FUNCTION public.user_owns_experiment(experiment_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.experiments 
        WHERE id = experiment_id 
        AND user_id::text = auth.uid()::text
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;