-- Database functions for NeuroLab-360
-- Utility functions for data processing and automation

-- Function to automatically create user profile when auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, username, email)
    VALUES (NEW.id, NEW.email, NEW.email);
    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        -- User already exists, skip insertion
        RETURN NEW;
    WHEN OTHERS THEN
        -- Log error and continue
        RAISE WARNING 'Error creating user profile: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create user profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to generate insights based on experiment data
CREATE OR REPLACE FUNCTION public.generate_experiment_insight(experiment_id UUID)
RETURNS TEXT AS $$
DECLARE
    exp_record RECORD;
    insight_message TEXT;
    bpm_value INTEGER;
    reaction_ms INTEGER;
    memory_score INTEGER;
BEGIN
    SELECT * INTO exp_record FROM public.experiments WHERE id = experiment_id;
    
    IF exp_record IS NULL THEN
        RETURN 'Experiment not found';
    END IF;
    
    CASE exp_record.type
        WHEN 'heart_rate' THEN
            bpm_value := (exp_record.value->>'bpm')::INTEGER;
            IF bpm_value > 100 THEN
                insight_message := 'Your heart rate is elevated (' || bpm_value || ' bpm). Consider relaxation techniques or consult a healthcare provider.';
            ELSIF bpm_value < 60 THEN
                insight_message := 'Your heart rate is quite low (' || bpm_value || ' bpm). This often indicates excellent cardiovascular fitness!';
            ELSE
                insight_message := 'Your heart rate (' || bpm_value || ' bpm) is within the normal range of 60-100 bpm.';
            END IF;
            
        WHEN 'reaction_time' THEN
            reaction_ms := (exp_record.value->>'reaction_ms')::INTEGER;
            IF reaction_ms < 200 THEN
                insight_message := 'Excellent reaction time (' || reaction_ms || 'ms)! Your reflexes are exceptionally sharp.';
            ELSIF reaction_ms < 250 THEN
                insight_message := 'Great reaction time (' || reaction_ms || 'ms)! Above average reflexes.';
            ELSIF reaction_ms < 350 THEN
                insight_message := 'Your reaction time (' || reaction_ms || 'ms) is within normal range.';
            ELSE
                insight_message := 'Your reaction time (' || reaction_ms || 'ms) could be improved. Consider practicing reaction time exercises.';
            END IF;
            
        WHEN 'memory' THEN
            memory_score := (exp_record.value->>'score')::INTEGER;
            IF memory_score >= 9 THEN
                insight_message := 'Outstanding memory performance! You scored ' || memory_score || ' out of ' || (exp_record.value->>'total') || '.';
            ELSIF memory_score >= 7 THEN
                insight_message := 'Good memory performance! You scored ' || memory_score || ' out of ' || (exp_record.value->>'total') || '.';
            ELSIF memory_score >= 5 THEN
                insight_message := 'Average memory performance. You scored ' || memory_score || ' out of ' || (exp_record.value->>'total') || '. Consider memory training exercises.';
            ELSE
                insight_message := 'Memory performance needs improvement. You scored ' || memory_score || ' out of ' || (exp_record.value->>'total') || '. Regular practice can help enhance recall.';
            END IF;
            
        WHEN 'eeg' THEN
            insight_message := 'EEG data recorded successfully. Brain wave patterns: Alpha (' || 
                             (exp_record.value->>'alpha_waves') || 'Hz), Beta (' || 
                             (exp_record.value->>'beta_waves') || 'Hz), Theta (' || 
                             (exp_record.value->>'theta_waves') || 'Hz). Consult with a specialist for detailed analysis.';
            
        ELSE
            insight_message := 'Experiment of type "' || exp_record.type || '" completed successfully.';
    END CASE;
    
    -- Insert the insight
    INSERT INTO public.insights (experiment_id, message)
    VALUES (experiment_id, insight_message);
    
    RETURN insight_message;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error generating insight: %', SQLERRM;
        RETURN 'Unable to generate insight for this experiment.';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to award badges based on user achievements
CREATE OR REPLACE FUNCTION public.check_and_award_badges(user_id UUID)
RETURNS INTEGER AS $$
DECLARE
    badges_awarded INTEGER := 0;
    experiment_count INTEGER;
    heart_rate_count INTEGER;
    reaction_time_count INTEGER;
    memory_count INTEGER;
    eeg_count INTEGER;
    best_reaction_time INTEGER;
    perfect_memory_count INTEGER;
BEGIN
    -- Count total experiments
    SELECT COUNT(*) INTO experiment_count 
    FROM public.experiments 
    WHERE experiments.user_id = check_and_award_badges.user_id;
    
    -- Award "First Experiment" badge
    IF experiment_count = 1 AND NOT EXISTS (
        SELECT 1 FROM public.badges 
        WHERE badges.user_id = check_and_award_badges.user_id 
        AND name = 'First Experiment'
    ) THEN
        INSERT INTO public.badges (user_id, name, description)
        VALUES (check_and_award_badges.user_id, 'First Experiment', 'Completed your first neurological experiment');
        badges_awarded := badges_awarded + 1;
    END IF;
    
    -- Award "Experiment Explorer" badge (10 experiments)
    IF experiment_count >= 10 AND NOT EXISTS (
        SELECT 1 FROM public.badges 
        WHERE badges.user_id = check_and_award_badges.user_id 
        AND name = 'Experiment Explorer'
    ) THEN
        INSERT INTO public.badges (user_id, name, description)
        VALUES (check_and_award_badges.user_id, 'Experiment Explorer', 'Completed 10 neurological experiments');
        badges_awarded := badges_awarded + 1;
    END IF;
    
    -- Count heart rate experiments
    SELECT COUNT(*) INTO heart_rate_count 
    FROM public.experiments 
    WHERE experiments.user_id = check_and_award_badges.user_id 
    AND type = 'heart_rate';
    
    -- Award "Heart Health Tracker" badge
    IF heart_rate_count >= 5 AND NOT EXISTS (
        SELECT 1 FROM public.badges 
        WHERE badges.user_id = check_and_award_badges.user_id 
        AND name = 'Heart Health Tracker'
    ) THEN
        INSERT INTO public.badges (user_id, name, description)
        VALUES (check_and_award_badges.user_id, 'Heart Health Tracker', 'Completed 5 heart rate experiments');
        badges_awarded := badges_awarded + 1;
    END IF;
    
    -- Check for best reaction time
    SELECT MIN((value->>'reaction_ms')::INTEGER) INTO best_reaction_time
    FROM public.experiments 
    WHERE experiments.user_id = check_and_award_badges.user_id 
    AND type = 'reaction_time';
    
    -- Award "Lightning Reflexes" badge
    IF best_reaction_time IS NOT NULL AND best_reaction_time < 200 AND NOT EXISTS (
        SELECT 1 FROM public.badges 
        WHERE badges.user_id = check_and_award_badges.user_id 
        AND name = 'Lightning Reflexes'
    ) THEN
        INSERT INTO public.badges (user_id, name, description)
        VALUES (check_and_award_badges.user_id, 'Lightning Reflexes', 'Achieved reaction time under 200ms');
        badges_awarded := badges_awarded + 1;
    END IF;
    
    -- Count perfect memory scores
    SELECT COUNT(*) INTO perfect_memory_count
    FROM public.experiments 
    WHERE experiments.user_id = check_and_award_badges.user_id 
    AND type = 'memory'
    AND (value->>'score')::INTEGER = (value->>'total')::INTEGER;
    
    -- Award "Memory Master" badge
    IF perfect_memory_count >= 3 AND NOT EXISTS (
        SELECT 1 FROM public.badges 
        WHERE badges.user_id = check_and_award_badges.user_id 
        AND name = 'Memory Master'
    ) THEN
        INSERT INTO public.badges (user_id, name, description)
        VALUES (check_and_award_badges.user_id, 'Memory Master', 'Achieved perfect scores on 3 memory tests');
        badges_awarded := badges_awarded + 1;
    END IF;
    
    RETURN badges_awarded;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Error awarding badges: %', SQLERRM;
        RETURN 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user statistics
CREATE OR REPLACE FUNCTION public.get_user_stats(user_id UUID)
RETURNS JSON AS $$
DECLARE
    stats JSON;
BEGIN
    SELECT json_build_object(
        'total_experiments', COUNT(*),
        'heart_rate_experiments', COUNT(*) FILTER (WHERE type = 'heart_rate'),
        'reaction_time_experiments', COUNT(*) FILTER (WHERE type = 'reaction_time'),
        'memory_experiments', COUNT(*) FILTER (WHERE type = 'memory'),
        'eeg_experiments', COUNT(*) FILTER (WHERE type = 'eeg'),
        'total_badges', (SELECT COUNT(*) FROM public.badges WHERE badges.user_id = get_user_stats.user_id),
        'latest_experiment', MAX(created_at),
        'best_reaction_time', MIN((value->>'reaction_ms')::INTEGER) FILTER (WHERE type = 'reaction_time'),
        'average_heart_rate', AVG((value->>'bpm')::INTEGER) FILTER (WHERE type = 'heart_rate'),
        'best_memory_score', MAX((value->>'score')::INTEGER) FILTER (WHERE type = 'memory')
    ) INTO stats
    FROM public.experiments 
    WHERE experiments.user_id = get_user_stats.user_id;
    
    RETURN stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;