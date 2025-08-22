"""
Experiments API routes for NeuroLab 360.
Handles CRUD operations for neurological experiments.
"""

import uuid
import random
import time
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from functools import wraps
from typing import Dict, List, Any, Optional

from supabase_client import get_supabase_client

# Create blueprint for experiments routes
experiments_bp = Blueprint('experiments', __name__)

# Get Supabase client
supabase_client = get_supabase_client()

def require_auth(f):
    """Decorator to require authentication for protected routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authorization header required'}), 401
        
        user = supabase_client.get_user_from_token(auth_header)
        if not user:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        # Add user to request context
        request.current_user = user
        return f(*args, **kwargs)
    
    return decorated_function

def generate_mock_experiment_data(experiment_type: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generate realistic mock data for different experiment types.
    
    Args:
        experiment_type: Type of experiment (heart_rate, reaction_time, memory, eeg)
        parameters: Experiment configuration parameters
        
    Returns:
        Dictionary containing data_points, metrics, and analysis_summary
    """
    data_points = []
    metrics = {}
    analysis_summary = ""
    
    if experiment_type == 'heart_rate':
        duration = parameters.get('duration_minutes', 5)
        baseline_bpm = parameters.get('baseline_bpm', 75)
        
        # Generate heart rate data points over time
        for i in range(duration * 60):  # One data point per second
            # Add some realistic variation
            variation = random.uniform(-10, 15)
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
            'max': max(values)
        }
        
        analysis_summary = f"Heart rate monitoring completed over {duration} minutes. Average BPM: {metrics['mean']}"
        
    elif experiment_type == 'reaction_time':
        trials = parameters.get('trials', 10)
        stimulus_type = parameters.get('stimulus_type', 'visual')
        
        # Generate reaction time data
        for i in range(trials):
            # Realistic reaction times (200-600ms with some outliers)
            base_time = 250 if stimulus_type == 'visual' else 180  # Audio is typically faster
            reaction_time = max(150, base_time + random.normalvariate(0, 50))
            
            data_points.append({
                'timestamp': i,
                'value': round(reaction_time, 1),
                'metadata': {'unit': 'ms', 'stimulus': stimulus_type, 'trial': i + 1}
            })
        
        values = [dp['value'] for dp in data_points]
        metrics = {
            'mean': round(sum(values) / len(values), 2),
            'std_dev': round((sum((x - sum(values)/len(values))**2 for x in values) / len(values))**0.5, 2),
            'min': min(values),
            'max': max(values)
        }
        
        analysis_summary = f"Reaction time test completed with {trials} trials. Average reaction time: {metrics['mean']}ms"
        
    elif experiment_type == 'memory':
        test_type = parameters.get('test_type', 'visual')
        items_count = parameters.get('items_count', 10)
        
        # Generate memory test results
        correct_answers = random.randint(max(1, items_count - 4), items_count)
        
        for i in range(items_count):
            is_correct = i < correct_answers
            response_time = random.uniform(1.0, 5.0)  # 1-5 seconds per item
            
            data_points.append({
                'timestamp': i,
                'value': 1 if is_correct else 0,
                'metadata': {
                    'item_number': i + 1,
                    'response_time': round(response_time, 2),
                    'test_type': test_type
                }
            })
        
        accuracy = correct_answers / items_count
        avg_response_time = sum(dp['metadata']['response_time'] for dp in data_points) / len(data_points)
        
        metrics = {
            'mean': round(accuracy, 2),
            'std_dev': 0,  # Binary data
            'min': 0,
            'max': 1,
            'accuracy': round(accuracy * 100, 1),
            'avg_response_time': round(avg_response_time, 2)
        }
        
        analysis_summary = f"Memory test completed. Accuracy: {metrics['accuracy']}% ({correct_answers}/{items_count})"
        
    elif experiment_type == 'eeg':
        duration = parameters.get('duration_minutes', 2)
        sampling_rate = parameters.get('sampling_rate', 256)  # Hz
        
        # Generate EEG-like data for different frequency bands
        total_samples = duration * 60 * sampling_rate
        
        for i in range(0, total_samples, sampling_rate):  # One data point per second
            # Simulate different brainwave frequencies
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
        
        # Calculate average band powers
        alpha_avg = sum(dp['metadata']['alpha'] for dp in data_points) / len(data_points)
        beta_avg = sum(dp['metadata']['beta'] for dp in data_points) / len(data_points)
        theta_avg = sum(dp['metadata']['theta'] for dp in data_points) / len(data_points)
        delta_avg = sum(dp['metadata']['delta'] for dp in data_points) / len(data_points)
        
        values = [dp['value'] for dp in data_points]
        metrics = {
            'mean': round(sum(values) / len(values), 2),
            'std_dev': round((sum((x - sum(values)/len(values))**2 for x in values) / len(values))**0.5, 2),
            'min': min(values),
            'max': max(values),
            'alpha_avg': round(alpha_avg, 2),
            'beta_avg': round(beta_avg, 2),
            'theta_avg': round(theta_avg, 2),
            'delta_avg': round(delta_avg, 2)
        }
        
        analysis_summary = f"EEG recording completed over {duration} minutes. Dominant frequency: Alpha ({alpha_avg:.1f} Hz)"
    
    else:
        # Default case for unknown experiment types
        data_points = [{'timestamp': 0, 'value': 0, 'metadata': {}}]
        metrics = {'mean': 0, 'std_dev': 0, 'min': 0, 'max': 0}
        analysis_summary = "Unknown experiment type completed"
    
    return {
        'data_points': data_points,
        'metrics': metrics,
        'analysis_summary': analysis_summary
    }

@experiments_bp.route('/experiments', methods=['POST'])
@require_auth
def create_experiment():
    """
    Create and run a new experiment.
    
    Expected JSON payload:
    {
        "name": "My Heart Rate Test",
        "experiment_type": "heart_rate",
        "parameters": {
            "duration_minutes": 5,
            "baseline_bpm": 75
        }
    }
    """
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'JSON payload required'}), 400
        
        # Validate required fields
        required_fields = ['name', 'experiment_type']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        # Validate experiment type
        valid_types = ['heart_rate', 'reaction_time', 'memory', 'eeg']
        if data['experiment_type'] not in valid_types:
            return jsonify({
                'error': f'Invalid experiment type. Must be one of: {", ".join(valid_types)}'
            }), 400
        
        user_id = request.current_user['id']
        experiment_id = str(uuid.uuid4())
        
        # Create experiment record
        experiment_data = {
            'id': experiment_id,
            'user_id': user_id,
            'name': data['name'],
            'experiment_type': data['experiment_type'],
            'parameters': data.get('parameters', {}),
            'status': 'running',
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        # Insert experiment into database
        experiment_result = supabase_client.execute_query(
            'experiments',
            'insert',
            data=experiment_data
        )
        
        if not experiment_result['success']:
            return jsonify({'error': 'Failed to create experiment'}), 500
        
        # Generate mock experiment data
        mock_data = generate_mock_experiment_data(
            data['experiment_type'],
            data.get('parameters', {})
        )
        
        # Create results record
        results_data = {
            'experiment_id': experiment_id,
            'data_points': mock_data['data_points'],
            'metrics': mock_data['metrics'],
            'analysis_summary': mock_data['analysis_summary'],
            'created_at': datetime.utcnow().isoformat()
        }
        
        # Insert results into database
        results_result = supabase_client.execute_query(
            'results',
            'insert',
            data=results_data
        )
        
        if not results_result['success']:
            # Clean up experiment if results insertion fails
            supabase_client.execute_query(
                'experiments',
                'delete',
                filters=[{'column': 'id', 'value': experiment_id}]
            )
            return jsonify({'error': 'Failed to store experiment results'}), 500
        
        # Update experiment status to completed
        supabase_client.execute_query(
            'experiments',
            'update',
            data={'status': 'completed', 'updated_at': datetime.utcnow().isoformat()},
            filters=[{'column': 'id', 'value': experiment_id}]
        )
        
        # Return the created experiment with results
        response_data = {
            'experiment': experiment_result['data'][0],
            'results': results_result['data'][0]
        }
        
        return jsonify(response_data), 201
        
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@experiments_bp.route('/experiments', methods=['GET'])
@require_auth
def get_experiments():
    """
    Retrieve user's experiment history.
    
    Query parameters:
    - limit: Maximum number of experiments to return (default: 50)
    - offset: Number of experiments to skip (default: 0)
    - experiment_type: Filter by experiment type
    - status: Filter by status
    """
    try:
        user_id = request.current_user['id']
        
        # Parse query parameters
        limit = min(int(request.args.get('limit', 50)), 100)  # Max 100 items
        offset = int(request.args.get('offset', 0))
        experiment_type = request.args.get('experiment_type')
        status = request.args.get('status')
        
        # Build filters
        filters = [{'column': 'user_id', 'value': user_id}]
        
        if experiment_type:
            filters.append({'column': 'experiment_type', 'value': experiment_type})
        
        if status:
            filters.append({'column': 'status', 'value': status})
        
        # Query experiments
        result = supabase_client.execute_query(
            'experiments',
            'select',
            columns='*',
            filters=filters,
            order='created_at.desc',
            limit=limit
        )
        
        if not result['success']:
            return jsonify({'error': 'Failed to retrieve experiments'}), 500
        
        experiments = result['data']
        
        # For each experiment, get the latest results
        for experiment in experiments:
            results_result = supabase_client.execute_query(
                'results',
                'select',
                columns='*',
                filters=[{'column': 'experiment_id', 'value': experiment['id']}],
                order='created_at.desc',
                limit=1
            )
            
            if results_result['success'] and results_result['data']:
                experiment['results'] = results_result['data'][0]
            else:
                experiment['results'] = None
        
        return jsonify({
            'experiments': experiments,
            'total': len(experiments),
            'limit': limit,
            'offset': offset
        })
        
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@experiments_bp.route('/experiments/<experiment_id>', methods=['GET'])
@require_auth
def get_experiment(experiment_id: str):
    """
    Get specific experiment details including results.
    """
    try:
        user_id = request.current_user['id']
        
        # Validate UUID format
        try:
            uuid.UUID(experiment_id)
        except ValueError:
            return jsonify({'error': 'Invalid experiment ID format'}), 400
        
        # Get experiment
        experiment_result = supabase_client.execute_query(
            'experiments',
            'select',
            columns='*',
            filters=[
                {'column': 'id', 'value': experiment_id},
                {'column': 'user_id', 'value': user_id}
            ]
        )
        
        if not experiment_result['success']:
            return jsonify({'error': 'Failed to retrieve experiment'}), 500
        
        if not experiment_result['data']:
            return jsonify({'error': 'Experiment not found'}), 404
        
        experiment = experiment_result['data'][0]
        
        # Get experiment results
        results_result = supabase_client.execute_query(
            'results',
            'select',
            columns='*',
            filters=[{'column': 'experiment_id', 'value': experiment_id}],
            order='created_at.desc'
        )
        
        if results_result['success']:
            experiment['results'] = results_result['data']
        else:
            experiment['results'] = []
        
        return jsonify(experiment)
        
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@experiments_bp.route('/experiments/<experiment_id>', methods=['DELETE'])
@require_auth
def delete_experiment(experiment_id: str):
    """
    Delete an experiment and all associated results.
    """
    try:
        user_id = request.current_user['id']
        
        # Validate UUID format
        try:
            uuid.UUID(experiment_id)
        except ValueError:
            return jsonify({'error': 'Invalid experiment ID format'}), 400
        
        # Check if experiment exists and belongs to user
        experiment_result = supabase_client.execute_query(
            'experiments',
            'select',
            columns='id, user_id',
            filters=[
                {'column': 'id', 'value': experiment_id},
                {'column': 'user_id', 'value': user_id}
            ]
        )
        
        if not experiment_result['success']:
            return jsonify({'error': 'Failed to check experiment'}), 500
        
        if not experiment_result['data']:
            return jsonify({'error': 'Experiment not found'}), 404
        
        # Delete experiment (results will be deleted automatically due to CASCADE)
        delete_result = supabase_client.execute_query(
            'experiments',
            'delete',
            filters=[
                {'column': 'id', 'value': experiment_id},
                {'column': 'user_id', 'value': user_id}
            ]
        )
        
        if not delete_result['success']:
            return jsonify({'error': 'Failed to delete experiment'}), 500
        
        return jsonify({'message': 'Experiment deleted successfully'}), 200
        
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

# Health check endpoint for experiments service
@experiments_bp.route('/experiments/health', methods=['GET'])
def experiments_health():
    """Health check for experiments service."""
    return jsonify({
        'service': 'experiments',
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat()
    })