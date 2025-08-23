#!/bin/bash

# Database Seeding Script for NeuroLab 360
# Populates database with sample data for development and testing

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[SEED]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Check environment
if [ "${FLASK_ENV:-development}" = "production" ]; then
    print_warning "This appears to be a production environment!"
    read -p "Are you sure you want to seed production data? (y/N): " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        print_info "Seeding cancelled"
        exit 0
    fi
fi

print_status "Starting database seeding..."

# Create seed data SQL
cat > /tmp/seed_data.sql << 'EOF'
-- NeuroLab 360 Sample Data
-- This script populates the database with sample experiments and results

-- Note: This assumes you have at least one user created through Supabase Auth
-- Replace 'your-user-id' with an actual user ID from auth.users

-- Sample experiments
INSERT INTO experiments (id, user_id, name, experiment_type, parameters, status, created_at, updated_at) VALUES
(
    gen_random_uuid(),
    (SELECT id FROM auth.users LIMIT 1),
    'Alpha Wave Baseline Study',
    'eeg_recording',
    '{
        "duration": 300,
        "sampling_rate": 256,
        "channels": ["Fp1", "Fp2", "C3", "C4", "P3", "P4", "O1", "O2"],
        "stimulus_type": "eyes_closed",
        "session_notes": "Baseline recording for alpha wave analysis"
    }',
    'completed',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days'
),
(
    gen_random_uuid(),
    (SELECT id FROM auth.users LIMIT 1),
    'Visual Attention Task',
    'eeg_recording',
    '{
        "duration": 600,
        "sampling_rate": 512,
        "channels": ["Fz", "Cz", "Pz", "Oz"],
        "stimulus_type": "visual_oddball",
        "trial_count": 200
    }',
    'completed',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '3 days'
),
(
    gen_random_uuid(),
    (SELECT id FROM auth.users LIMIT 1),
    'Motor Cortex Mapping',
    'fmri_scan',
    '{
        "scan_duration": 1200,
        "tr": 2.0,
        "voxel_size": [2, 2, 2],
        "task_paradigm": "finger_tapping",
        "runs": 4
    }',
    'completed',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days'
),
(
    gen_random_uuid(),
    (SELECT id FROM auth.users LIMIT 1),
    'Reaction Time Study',
    'behavioral_test',
    '{
        "test_type": "simple_reaction_time",
        "trial_count": 100,
        "stimulus_set": "visual_circles",
        "isi_range": [1000, 3000]
    }',
    'completed',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day'
),
(
    gen_random_uuid(),
    (SELECT id FROM auth.users LIMIT 1),
    'Muscle Fatigue Analysis',
    'emg_recording',
    '{
        "muscle_groups": ["biceps", "triceps"],
        "contraction_type": "isometric",
        "duration": 180,
        "force_levels": [25, 50, 75, 100]
    }',
    'running',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '2 hours'
);

-- Sample results for completed experiments
WITH experiment_ids AS (
    SELECT id, experiment_type, name FROM experiments WHERE status = 'completed'
)
INSERT INTO results (id, experiment_id, data_points, metrics, analysis_summary, created_at)
SELECT 
    gen_random_uuid(),
    e.id,
    CASE 
        WHEN e.experiment_type = 'eeg_recording' THEN
            '[
                {"timestamp": 0, "channel": "Fp1", "value": 12.5, "frequency_band": "alpha"},
                {"timestamp": 1, "channel": "Fp1", "value": 11.8, "frequency_band": "alpha"},
                {"timestamp": 2, "channel": "Fp1", "value": 13.2, "frequency_band": "alpha"},
                {"timestamp": 0, "channel": "Fp2", "value": 10.9, "frequency_band": "alpha"},
                {"timestamp": 1, "channel": "Fp2", "value": 12.1, "frequency_band": "alpha"}
            ]'::jsonb
        WHEN e.experiment_type = 'fmri_scan' THEN
            '[
                {"voxel": [45, 23, 67], "activation": 2.3, "p_value": 0.001},
                {"voxel": [46, 23, 67], "activation": 1.8, "p_value": 0.005},
                {"voxel": [44, 24, 68], "activation": 2.1, "p_value": 0.002}
            ]'::jsonb
        WHEN e.experiment_type = 'behavioral_test' THEN
            '[
                {"trial": 1, "reaction_time": 245, "accuracy": 1, "stimulus": "circle"},
                {"trial": 2, "reaction_time": 289, "accuracy": 1, "stimulus": "circle"},
                {"trial": 3, "reaction_time": 234, "accuracy": 0, "stimulus": "circle"}
            ]'::jsonb
        ELSE
            '[
                {"timestamp": 0, "muscle": "biceps", "activation": 0.75},
                {"timestamp": 1, "muscle": "biceps", "activation": 0.82},
                {"timestamp": 2, "muscle": "biceps", "activation": 0.69}
            ]'::jsonb
    END,
    CASE 
        WHEN e.experiment_type = 'eeg_recording' THEN
            '{
                "mean_amplitude": 12.1,
                "std_dev": 1.2,
                "peak_frequency": 10.5,
                "signal_quality": 0.92,
                "alpha_power": 15.6,
                "beta_power": 8.3
            }'::jsonb
        WHEN e.experiment_type = 'fmri_scan' THEN
            '{
                "max_activation": 2.3,
                "cluster_size": 156,
                "peak_coordinates": [45, 23, 67],
                "contrast_estimate": 1.85
            }'::jsonb
        WHEN e.experiment_type = 'behavioral_test' THEN
            '{
                "mean_rt": 256.7,
                "std_rt": 23.4,
                "accuracy": 0.94,
                "outliers_removed": 3
            }'::jsonb
        ELSE
            '{
                "max_activation": 0.82,
                "mean_activation": 0.75,
                "fatigue_index": 0.15
            }'::jsonb
    END,
    CASE 
        WHEN e.experiment_type = 'eeg_recording' THEN
            'Strong alpha wave activity detected with good signal quality. Peak frequency at 10.5 Hz indicates healthy neural oscillations.'
        WHEN e.experiment_type = 'fmri_scan' THEN
            'Significant activation in primary motor cortex during finger tapping task. Results consistent with expected motor network activation.'
        WHEN e.experiment_type = 'behavioral_test' THEN
            'Normal reaction times with high accuracy. No significant outliers detected in response patterns.'
        ELSE
            'Moderate muscle activation with minimal fatigue over the recording period. EMG signals show consistent patterns.'
    END,
    NOW() - INTERVAL '1 day'
FROM experiment_ids e;

-- Update statistics
ANALYZE experiments;
ANALYZE results;
EOF

print_status "Applying seed data..."

# Check if we can use Supabase CLI
if command -v supabase &> /dev/null; then
    print_info "Using Supabase CLI to apply seed data"
    supabase db reset --db-url "$SUPABASE_URL" < /tmp/seed_data.sql
else
    print_warning "Supabase CLI not found. Please run the following SQL manually:"
    echo "----------------------------------------"
    cat /tmp/seed_data.sql
    echo "----------------------------------------"
    read -p "Press Enter after running the seed data manually..."
fi

# Clean up
rm -f /tmp/seed_data.sql

print_status "Database seeding completed!"
print_info "Sample data includes:"
print_info "  - 5 sample experiments (4 completed, 1 running)"
print_info "  - Results data for completed experiments"
print_info "  - Various experiment types: EEG, fMRI, Behavioral, EMG"