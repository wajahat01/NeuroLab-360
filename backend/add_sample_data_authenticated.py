#!/usr/bin/env python3
"""
Script to add 100 sample records to Supabase for NeuroLab 360.
Uses authenticated user to bypass RLS policies.
"""

import os
import sys
import uuid
import random
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any

# Add the backend directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def authenticate_test_user():
    """Authenticate with the test user and return the authenticated client."""
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_ANON_KEY')
    
    if not url or not key:
        print("❌ Missing Supabase credentials")
        return None, None
    
    # Test credentials
    test_email = "test@neurolab360.com"
    test_password = "testpassword123"
    
    try:
        # Create Supabase client
        supabase = create_client(url, key)
        
        # Sign in with test user
        response = supabase.auth.sign_in_with_password({
            "email": test_email,
            "password": test_password
        })
        
        if response.user:
            print(f"✅ Authenticated as: {response.user.email}")
            print(f"   User ID: {response.user.id}")
            return supabase, response.user.id
        else:
            print("❌ Authentication failed")
            return None, None
            
    except Exception as e:
        print(f"❌ Authentication error: {str(e)}")
        return None, None

def generate_realistic_experiment_data(experiment_type: str, user_id: str, created_date: datetime) -> tuple:
    """Generate realistic experiment and results data."""
    
    experiment_id = str(uuid.uuid4())
    
    if experiment_type == 'heart_rate':
        # Heart rate experiment parameters
        duration = random.choice([2, 3, 5, 10])
        baseline_bpm = random.randint(60, 90)
        
        experiment_data = {
            'id': experiment_id,
            'user_id': user_id,
            'name': f'Heart Rate Monitor - {duration}min',
            'experiment_type': experiment_type,
            'parameters': {
                'duration_minutes': duration,
                'baseline_bpm': baseline_bpm,
                'measurement_type': random.choice(['resting', 'exercise', 'recovery'])
            },
            'status': 'completed',
            'created_at': created_date.isoformat(),
            'updated_at': created_date.isoformat()
        }
        
        # Generate heart rate data points
        data_points = []
        for i in range(min(duration * 60, 300)):  # Limit to 300 points for storage
            variation = random.uniform(-15, 20)
            bpm = max(50, min(200, baseline_bpm + variation))
            data_points.append({
                'timestamp': i,
                'value': round(bpm, 1),
                'metadata': {'unit': 'bpm'}
            })
        
        values = [dp['value'] for dp in data_points]
        metrics = {
            'mean': round(sum(values) / len(values), 2),
            'std_dev': round((sum((x - sum(values)/len(values))**2 for x in values) / len(values))**0.5, 2),
            'min': min(values),
            'max': max(values),
            'duration_minutes': duration
        }
        
        results_data = {
            'experiment_id': experiment_id,
            'data_points': data_points,
            'metrics': metrics,
            'analysis_summary': f"Heart rate monitoring over {duration} minutes. Average: {metrics['mean']} BPM",
            'created_at': created_date.isoformat()
        }
        
    elif experiment_type == 'reaction_time':
        # Reaction time experiment parameters
        trials = random.choice([10, 15, 20, 25])
        stimulus_type = random.choice(['visual', 'audio', 'tactile'])
        
        experiment_data = {
            'id': experiment_id,
            'user_id': user_id,
            'name': f'Reaction Time Test - {stimulus_type.title()}',
            'experiment_type': experiment_type,
            'parameters': {
                'trials': trials,
                'stimulus_type': stimulus_type,
                'difficulty': random.choice(['easy', 'medium', 'hard'])
            },
            'status': 'completed',
            'created_at': created_date.isoformat(),
            'updated_at': created_date.isoformat()
        }
        
        # Generate reaction time data
        base_time = 250 if stimulus_type == 'visual' else 180 if stimulus_type == 'audio' else 200
        data_points = []
        
        for i in range(trials):
            reaction_time = max(120, base_time + random.normalvariate(0, 60))
            data_points.append({
                'timestamp': i,
                'value': round(reaction_time, 1),
                'metadata': {
                    'unit': 'ms',
                    'stimulus': stimulus_type,
                    'trial': i + 1,
                    'success': reaction_time < 500
                }
            })
        
        values = [dp['value'] for dp in data_points]
        metrics = {
            'mean': round(sum(values) / len(values), 2),
            'std_dev': round((sum((x - sum(values)/len(values))**2 for x in values) / len(values))**0.5, 2),
            'min': min(values),
            'max': max(values),
            'success_rate': round(sum(1 for dp in data_points if dp['metadata']['success']) / len(data_points) * 100, 1)
        }
        
        results_data = {
            'experiment_id': experiment_id,
            'data_points': data_points,
            'metrics': metrics,
            'analysis_summary': f"Reaction time test with {trials} trials. Average: {metrics['mean']}ms",
            'created_at': created_date.isoformat()
        }
        
    elif experiment_type == 'memory':
        # Memory test parameters
        items_count = random.choice([8, 10, 12, 15])
        test_type = random.choice(['visual', 'verbal', 'spatial'])
        
        experiment_data = {
            'id': experiment_id,
            'user_id': user_id,
            'name': f'Memory Test - {test_type.title()}',
            'experiment_type': experiment_type,
            'parameters': {
                'items_count': items_count,
                'test_type': test_type,
                'difficulty': random.choice(['easy', 'medium', 'hard'])
            },
            'status': 'completed',
            'created_at': created_date.isoformat(),
            'updated_at': created_date.isoformat()
        }
        
        # Generate memory test results
        correct_answers = random.randint(max(1, items_count - 5), items_count)
        data_points = []
        
        for i in range(items_count):
            is_correct = i < correct_answers
            response_time = random.uniform(0.8, 4.5)
            
            data_points.append({
                'timestamp': i,
                'value': 1 if is_correct else 0,
                'metadata': {
                    'item_number': i + 1,
                    'response_time': round(response_time, 2),
                    'test_type': test_type,
                    'correct': is_correct
                }
            })
        
        accuracy = correct_answers / items_count
        avg_response_time = sum(dp['metadata']['response_time'] for dp in data_points) / len(data_points)
        
        metrics = {
            'accuracy': round(accuracy * 100, 1),
            'correct_answers': correct_answers,
            'total_items': items_count,
            'avg_response_time': round(avg_response_time, 2),
            'score': round(accuracy * 100, 1)
        }
        
        results_data = {
            'experiment_id': experiment_id,
            'data_points': data_points,
            'metrics': metrics,
            'analysis_summary': f"Memory test completed. Score: {metrics['accuracy']}% ({correct_answers}/{items_count})",
            'created_at': created_date.isoformat()
        }
        
    elif experiment_type == 'eeg':
        # EEG experiment parameters
        duration = random.choice([1, 2, 5, 10])
        sampling_rate = random.choice([128, 256, 512])
        
        experiment_data = {
            'id': experiment_id,
            'user_id': user_id,
            'name': f'EEG Recording - {duration}min',
            'experiment_type': experiment_type,
            'parameters': {
                'duration_minutes': duration,
                'sampling_rate': sampling_rate,
                'electrode_count': random.choice([8, 16, 32]),
                'session_type': random.choice(['resting', 'meditation', 'cognitive_task'])
            },
            'status': 'completed',
            'created_at': created_date.isoformat(),
            'updated_at': created_date.isoformat()
        }
        
        # Generate EEG data points (simplified)
        data_points = []
        total_samples = duration * 60 * sampling_rate
        
        for i in range(0, min(total_samples, 600), sampling_rate):  # Limit data points for storage
            # Simulate brainwave frequencies
            alpha = random.uniform(8, 13) + random.normalvariate(0, 2)
            beta = random.uniform(13, 30) + random.normalvariate(0, 3)
            theta = random.uniform(4, 8) + random.normalvariate(0, 1)
            delta = random.uniform(0.5, 4) + random.normalvariate(0, 0.5)
            
            data_points.append({
                'timestamp': i // sampling_rate,
                'value': round(alpha + beta + theta + delta, 2),
                'metadata': {
                    'alpha': round(alpha, 2),
                    'beta': round(beta, 2),
                    'theta': round(theta, 2),
                    'delta': round(delta, 2),
                    'unit': 'μV'
                }
            })
        
        # Calculate band averages
        alpha_avg = sum(dp['metadata']['alpha'] for dp in data_points) / len(data_points)
        beta_avg = sum(dp['metadata']['beta'] for dp in data_points) / len(data_points)
        theta_avg = sum(dp['metadata']['theta'] for dp in data_points) / len(data_points)
        delta_avg = sum(dp['metadata']['delta'] for dp in data_points) / len(data_points)
        
        metrics = {
            'alpha_avg': round(alpha_avg, 2),
            'beta_avg': round(beta_avg, 2),
            'theta_avg': round(theta_avg, 2),
            'delta_avg': round(delta_avg, 2),
            'dominant_frequency': 'alpha' if alpha_avg > max(beta_avg, theta_avg, delta_avg) else 'beta',
            'duration_minutes': duration
        }
        
        results_data = {
            'experiment_id': experiment_id,
            'data_points': data_points,
            'metrics': metrics,
            'analysis_summary': f"EEG recording over {duration} minutes. Dominant: {metrics['dominant_frequency']} waves",
            'created_at': created_date.isoformat()
        }
    
    return experiment_data, results_data

def add_sample_records(num_records: int = 100):
    """Add sample experiment records to the database."""
    print(f"🚀 Adding {num_records} sample records to Supabase...")
    print()
    
    # Authenticate with test user
    supabase, user_id = authenticate_test_user()
    if not supabase or not user_id:
        print("❌ Failed to authenticate. Please ensure:")
        print("   1. Test user exists (run: python3 create_test_user_simple.py)")
        print("   2. Email confirmation is disabled in Supabase Dashboard")
        print("   3. Or manually confirm the test user")
        return
    
    experiment_types = ['heart_rate', 'reaction_time', 'memory', 'eeg']
    
    # Generate records over the past 90 days
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=90)
    
    successful_inserts = 0
    failed_inserts = 0
    
    print(f"📊 Generating {num_records} experiments across {len(experiment_types)} types...")
    print(f"📅 Date range: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    print()
    
    for i in range(num_records):
        try:
            # Random date within the range
            random_date = start_date + timedelta(
                seconds=random.randint(0, int((end_date - start_date).total_seconds()))
            )
            
            # Random experiment type
            experiment_type = random.choice(experiment_types)
            
            # Generate experiment and results data
            experiment_data, results_data = generate_realistic_experiment_data(
                experiment_type, user_id, random_date
            )
            
            # Insert experiment
            exp_response = supabase.table('experiments').insert(experiment_data).execute()
            
            if not exp_response.data:
                print(f"❌ Failed to insert experiment {i+1}")
                failed_inserts += 1
                continue
            
            # Insert results
            results_response = supabase.table('results').insert(results_data).execute()
            
            if not results_response.data:
                print(f"❌ Failed to insert results for experiment {i+1}")
                # Clean up the experiment
                supabase.table('experiments').delete().eq('id', experiment_data['id']).execute()
                failed_inserts += 1
                continue
            
            successful_inserts += 1
            
            if (i + 1) % 10 == 0:
                print(f"📈 Progress: {i + 1}/{num_records} records processed...")
                
        except Exception as e:
            print(f"❌ Error processing record {i+1}: {str(e)}")
            failed_inserts += 1
            continue
    
    print()
    print("🎉 Completed!")
    print(f"✅ Successfully inserted: {successful_inserts} records")
    if failed_inserts > 0:
        print(f"❌ Failed insertions: {failed_inserts} records")
    
    # Show summary of what was created
    print()
    print("📊 Summary by experiment type:")
    for exp_type in experiment_types:
        try:
            response = supabase.table('experiments').select('id').eq('experiment_type', exp_type).execute()
            count = len(response.data) if response.data else 0
            print(f"   {exp_type.replace('_', ' ').title()}: {count} experiments")
        except:
            print(f"   {exp_type.replace('_', ' ').title()}: Unable to count")
    
    print()
    print("🎯 Next steps:")
    print("   1. Start the frontend: cd frontend && npm start")
    print("   2. Login with: test@neurolab360.com / testpassword123")
    print("   3. Check the dashboard to see your sample data!")

if __name__ == "__main__":
    try:
        # Check if a custom number was provided
        num_records = 100
        if len(sys.argv) > 1:
            num_records = int(sys.argv[1])
        
        print("=" * 60)
        print("🧪 NeuroLab 360 - Sample Data Generator")
        print("=" * 60)
        print()
        
        add_sample_records(num_records)
        
        print()
        print("=" * 60)
        
    except KeyboardInterrupt:
        print("\n⚠️  Operation cancelled by user.")
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        print()
        print("💡 Troubleshooting:")
        print("   1. Ensure test user exists and is confirmed")
        print("   2. Check Supabase credentials in .env file")
        print("   3. Verify network connection to Supabase")