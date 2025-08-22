-- Seed data for NeuroLab-360 development and testing
-- This file contains sample data for development purposes

-- Sample experiment types and their typical value structures:

-- Heart Rate experiments: { "bpm": number, "duration_minutes": number, "resting": boolean }
-- Reaction Time experiments: { "reaction_ms": number, "attempts": number, "average_ms": number }
-- Memory experiments: { "score": number, "total": number, "category": string, "time_taken_seconds": number }
-- EEG experiments: { "alpha_waves": number, "beta_waves": number, "theta_waves": number, "delta_waves": number }

-- Sample badges that can be awarded:
INSERT INTO public.badges (user_id, name, description) VALUES 
-- These will be inserted when users earn them, examples:
-- ('user-uuid', 'First Experiment', 'Completed your first neurological experiment'),
-- ('user-uuid', 'Heart Health', 'Completed 10 heart rate experiments'),
-- ('user-uuid', 'Quick Reflexes', 'Achieved reaction time under 200ms'),
-- ('user-uuid', 'Memory Master', 'Scored perfect on 5 memory tests'),
-- ('user-uuid', 'Consistent Tracker', 'Completed experiments for 7 consecutive days');

-- Example experiment value structures for reference:

-- Heart Rate Example:
-- {
--   "bpm": 72,
--   "duration_minutes": 5,
--   "resting": true,
--   "measurement_time": "morning",
--   "notes": "After 10 minutes of rest"
-- }

-- Reaction Time Example:
-- {
--   "reaction_ms": 285,
--   "attempts": 10,
--   "average_ms": 290,
--   "best_ms": 245,
--   "worst_ms": 350,
--   "stimulus_type": "visual"
-- }

-- Memory Test Example:
-- {
--   "score": 8,
--   "total": 10,
--   "category": "visual",
--   "time_taken_seconds": 120,
--   "difficulty": "medium",
--   "items_remembered": ["apple", "car", "house", "tree", "book", "phone", "chair", "lamp"]
-- }

-- EEG Example:
-- {
--   "alpha_waves": 12.5,
--   "beta_waves": 18.3,
--   "theta_waves": 6.2,
--   "delta_waves": 2.1,
--   "duration_minutes": 10,
--   "electrode_positions": ["Fp1", "Fp2", "C3", "C4", "O1", "O2"],
--   "sampling_rate_hz": 256
-- }