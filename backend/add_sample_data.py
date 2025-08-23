#!/usr/bin/env python3
"""
Script to add 100 sample records to Supabase for NeuroLab 360.
Creates realistic experiment data across different types with corresponding results.
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

from supabase_client import get_supabase_client

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
        for i in range(duration * 60):  # One point per second
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
        
        for i in range(0, min(total_samples, 1000), sampling_rate):  # Limit data points for storage
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

def create_test_user() -> str:
    """Create a test user and return the user ID."""
    supabase_client = get_supabase_client()
    
    # Generate a unique test user
    user_id = str(uuid.uuid4())
    username = f"test_user_{random.randint(1000, 9999)}"
    email = f"test_{random.randint(1000, 9999)}@neurolab360.com"
    
    user_data = {
        'id': user_id,
        'username': username,
        'email': email,
        'created_at': datetime.utcnow().isoformat()
    }
    
    # Insert user
    result = supabase_client.execute_query(
        'users',
        'insert',
        data=user_data
    )
    
    if result['success']:
        print(f"Created test user: {username} ({user_id})")
        return user_id
    else:
        print(f"Failed to create user: {result.get('error', 'Unknown error')}")
        return None

def add_sample_records(num_records: int = 100):
    """Add sample experiment records to the database."""
    supabase_client = get_supabase_client()
    
    print(f"Adding {num_records} sample records to Supabase...")
    
    # Create a few test users
    test_users = []
    for i in range(3):  # Create 3 test users
        user_id = create_test_user()
        if user_id:
            test_users.append(user_id)
    
    if not test_users:
        print("Failed to create test users. Exiting.")
        return
    
    experiment_types = ['heart_rate', 'reaction_time', 'memory', 'eeg']
    
    # Generate records over the past 90 days
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=90)
    
    successful_inserts = 0
    failed_inserts = 0
    
    for i in range(num_records):
        try:
            # Random date within the range
            random_date = start_date + timedelta(
                seconds=random.randint(0, int((end_date - start_date).total_seconds()))
            )
            
            # Random user and experiment type
            user_id = random.choice(test_users)
            experiment_type = random.choice(experiment_types)
            
            # Generate experiment and results data
            experiment_data, results_data = generate_realistic_experiment_data(
                experiment_type, user_id, random_date
            )
            
            # Insert experiment
            exp_result = supabase_client.execute_query(
                'experiments',
                'insert',
                data=experiment_data
            )
            
            if not exp_result['success']:
                print(f"Failed to insert experiment {i+1}: {exp_result.get('error', 'Unknown error')}")
                failed_inserts += 1
                continue
            
            # Insert results
            results_result = supabase_client.execute_query(
                'results',
                'insert',
                data=results_data
            )
            
            if not results_result['success']:
                print(f"Failed to insert results for experiment {i+1}: {results_result.get('error', 'Unknown error')}")
                # Clean up the experiment
                supabase_client.execute_query(
                    'experiments',
                    'delete',
                    filters=[{'column': 'id', 'value': experiment_data['id']}]
                )
                failed_inserts += 1
                continue
            
            successful_inserts += 1
            
            if (i + 1) % 10 == 0:
                print(f"Progress: {i + 1}/{num_records} records processed...")
                
        except Exception as e:
            print(f"Error processing record {i+1}: {str(e)}")
            failed_inserts += 1
            continue
    
    print(f"\nCompleted!")
    print(f"Successfully inserted: {successful_inserts} records")
    print(f"Failed insertions: {failed_inserts} records")
    print(f"Test users created: {len(test_users)}")
    
    # Show summary of what was created
    print(f"\nSummary by experiment type:")
    for exp_type in experiment_types:
        count_result = supabase_client.execute_query(
            'experiments',
            'select',
            columns='id',
            filters=[{'column': 'experiment_type', 'value': exp_type}]
        )
        if count_result['success']:
            count = len(count_result['data'])
            print(f"  {exp_type}: {count} experiments")

if __name__ == "__main__":
    try:
        # Check if a custom number was provided
        num_records = 100
        if len(sys.argv) > 1:
            num_records = int(sys.argv[1])
        
        add_sample_records(num_records)
        
    except KeyboardInterrupt:
        print("\nOperation cancelled by user.")
    except Exception as e:
        print(f"Error: {str(e)}")