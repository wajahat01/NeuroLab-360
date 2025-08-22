"""
Unit tests for experiments API endpoints.
Tests all CRUD operations and edge cases for the experiments service.
"""

import pytest
import json
import uuid
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime

# Import the Flask app and test client
import sys
import os
sys.path.append(os.path.dirname(__file__))

from app import create_app
from routes.experiments import generate_mock_experiment_data

class TestExperimentsAPI:
    """Test class for experiments API endpoints."""
    
    @pytest.fixture
    def app(self):
        """Create test Flask app."""
        app = create_app()
        app.config['TESTING'] = True
        return app
    
    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return app.test_client()
    
    @pytest.fixture
    def mock_user(self):
        """Mock user data."""
        return {
            'id': 'test-user-id-123',
            'email': 'test@example.com',
            'created_at': '2024-01-01T00:00:00Z'
        }
    
    @pytest.fixture
    def auth_headers(self):
        """Mock authorization headers."""
        return {'Authorization': 'Bearer mock-jwt-token'}
    
    @pytest.fixture
    def sample_experiment_data(self):
        """Sample experiment data for testing."""
        return {
            'name': 'Test Heart Rate Experiment',
            'experiment_type': 'heart_rate',
            'parameters': {
                'duration_minutes': 5,
                'baseline_bpm': 75
            }
        }
    
    def test_generate_mock_experiment_data_heart_rate(self):
        """Test mock data generation for heart rate experiments."""
        parameters = {'duration_minutes': 2, 'baseline_bpm': 80}
        result = generate_mock_experiment_data('heart_rate', parameters)
        
        assert 'data_points' in result
        assert 'metrics' in result
        assert 'analysis_summary' in result
        
        # Should have 120 data points (2 minutes * 60 seconds)
        assert len(result['data_points']) == 120
        
        # Check data point structure
        data_point = result['data_points'][0]
        assert 'timestamp' in data_point
        assert 'value' in data_point
        assert 'metadata' in data_point
        assert data_point['metadata']['unit'] == 'bpm'
        
        # Check metrics
        assert 'mean' in result['metrics']
        assert 'std_dev' in result['metrics']
        assert 'min' in result['metrics']
        assert 'max' in result['metrics']
        
        # Values should be reasonable for heart rate
        assert 50 <= result['metrics']['min'] <= 200
        assert 50 <= result['metrics']['max'] <= 200
    
    def test_generate_mock_experiment_data_reaction_time(self):
        """Test mock data generation for reaction time experiments."""
        parameters = {'trials': 5, 'stimulus_type': 'visual'}
        result = generate_mock_experiment_data('reaction_time', parameters)
        
        assert len(result['data_points']) == 5
        
        # Check data point structure
        data_point = result['data_points'][0]
        assert data_point['metadata']['unit'] == 'ms'
        assert data_point['metadata']['stimulus'] == 'visual'
        assert 'trial' in data_point['metadata']
        
        # Reaction times should be reasonable (150-800ms typically)
        for dp in result['data_points']:
            assert 100 <= dp['value'] <= 1000
    
    def test_generate_mock_experiment_data_memory(self):
        """Test mock data generation for memory experiments."""
        parameters = {'test_type': 'visual', 'items_count': 8}
        result = generate_mock_experiment_data('memory', parameters)
        
        assert len(result['data_points']) == 8
        
        # Check data point structure
        data_point = result['data_points'][0]
        assert data_point['value'] in [0, 1]  # Binary correct/incorrect
        assert data_point['metadata']['test_type'] == 'visual'
        assert 'response_time' in data_point['metadata']
        
        # Check accuracy metric
        assert 'accuracy' in result['metrics']
        assert 0 <= result['metrics']['accuracy'] <= 100
    
    def test_generate_mock_experiment_data_eeg(self):
        """Test mock data generation for EEG experiments."""
        parameters = {'duration_minutes': 1, 'sampling_rate': 256}
        result = generate_mock_experiment_data('eeg', parameters)
        
        # Should have 60 data points (1 minute, 1 per second)
        assert len(result['data_points']) == 60
        
        # Check data point structure
        data_point = result['data_points'][0]
        assert 'alpha' in data_point['metadata']
        assert 'beta' in data_point['metadata']
        assert 'theta' in data_point['metadata']
        assert 'delta' in data_point['metadata']
        assert data_point['metadata']['unit'] == 'μV'
        
        # Check frequency band averages in metrics
        assert 'alpha_avg' in result['metrics']
        assert 'beta_avg' in result['metrics']
        assert 'theta_avg' in result['metrics']
        assert 'delta_avg' in result['metrics']
    
    @patch('routes.experiments.supabase_client')
    def test_create_experiment_success(self, mock_supabase, client, mock_user, auth_headers, sample_experiment_data):
        """Test successful experiment creation."""
        # Mock authentication
        mock_supabase.get_user_from_token.return_value = mock_user
        
        # Mock database operations
        experiment_id = str(uuid.uuid4())
        mock_supabase.execute_query.side_effect = [
            # Experiment insertion
            {
                'success': True,
                'data': [{
                    'id': experiment_id,
                    'user_id': mock_user['id'],
                    'name': sample_experiment_data['name'],
                    'experiment_type': sample_experiment_data['experiment_type'],
                    'parameters': sample_experiment_data['parameters'],
                    'status': 'running',
                    'created_at': '2024-01-01T00:00:00Z',
                    'updated_at': '2024-01-01T00:00:00Z'
                }]
            },
            # Results insertion
            {
                'success': True,
                'data': [{
                    'id': str(uuid.uuid4()),
                    'experiment_id': experiment_id,
                    'data_points': [],
                    'metrics': {},
                    'analysis_summary': 'Test summary',
                    'created_at': '2024-01-01T00:00:00Z'
                }]
            },
            # Status update
            {'success': True, 'data': []}
        ]
        
        response = client.post(
            '/api/experiments',
            data=json.dumps(sample_experiment_data),
            content_type='application/json',
            headers=auth_headers
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert 'experiment' in data
        assert 'results' in data
        assert data['experiment']['name'] == sample_experiment_data['name']
    
    @patch('routes.experiments.supabase_client')
    def test_create_experiment_missing_auth(self, mock_supabase, client, sample_experiment_data):
        """Test experiment creation without authentication."""
        response = client.post(
            '/api/experiments',
            data=json.dumps(sample_experiment_data),
            content_type='application/json'
        )
        
        assert response.status_code == 401
        data = json.loads(response.data)
        assert 'error' in data
    
    @patch('routes.experiments.supabase_client')
    def test_create_experiment_invalid_type(self, mock_supabase, client, mock_user, auth_headers):
        """Test experiment creation with invalid experiment type."""
        mock_supabase.get_user_from_token.return_value = mock_user
        
        invalid_data = {
            'name': 'Test Experiment',
            'experiment_type': 'invalid_type',
            'parameters': {}
        }
        
        response = client.post(
            '/api/experiments',
            data=json.dumps(invalid_data),
            content_type='application/json',
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'Invalid experiment type' in data['error']
    
    @patch('routes.experiments.supabase_client')
    def test_create_experiment_missing_fields(self, mock_supabase, client, mock_user, auth_headers):
        """Test experiment creation with missing required fields."""
        mock_supabase.get_user_from_token.return_value = mock_user
        
        incomplete_data = {
            'experiment_type': 'heart_rate'
            # Missing 'name' field
        }
        
        response = client.post(
            '/api/experiments',
            data=json.dumps(incomplete_data),
            content_type='application/json',
            headers=auth_headers
        )
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'Missing required field: name' in data['error']
    
    @patch('routes.experiments.supabase_client')
    def test_get_experiments_success(self, mock_supabase, client, mock_user, auth_headers):
        """Test successful retrieval of experiments."""
        mock_supabase.get_user_from_token.return_value = mock_user
        
        # Mock experiments query
        mock_experiments = [
            {
                'id': str(uuid.uuid4()),
                'user_id': mock_user['id'],
                'name': 'Test Experiment 1',
                'experiment_type': 'heart_rate',
                'status': 'completed',
                'created_at': '2024-01-01T00:00:00Z'
            },
            {
                'id': str(uuid.uuid4()),
                'user_id': mock_user['id'],
                'name': 'Test Experiment 2',
                'experiment_type': 'memory',
                'status': 'completed',
                'created_at': '2024-01-02T00:00:00Z'
            }
        ]
        
        mock_supabase.execute_query.side_effect = [
            {'success': True, 'data': mock_experiments},
            {'success': True, 'data': [{'id': 'result1'}]},  # Results for exp 1
            {'success': True, 'data': [{'id': 'result2'}]}   # Results for exp 2
        ]
        
        response = client.get('/api/experiments', headers=auth_headers)
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'experiments' in data
        assert len(data['experiments']) == 2
        assert data['total'] == 2
    
    @patch('routes.experiments.supabase_client')
    def test_get_experiments_with_filters(self, mock_supabase, client, mock_user, auth_headers):
        """Test experiments retrieval with query filters."""
        mock_supabase.get_user_from_token.return_value = mock_user
        mock_supabase.execute_query.return_value = {'success': True, 'data': []}
        
        response = client.get(
            '/api/experiments?experiment_type=heart_rate&status=completed&limit=10',
            headers=auth_headers
        )
        
        assert response.status_code == 200
        
        # Verify that filters were applied in the query
        call_args = mock_supabase.execute_query.call_args
        filters = call_args[1]['filters']
        
        # Should have user_id, experiment_type, and status filters
        assert len(filters) == 3
        assert any(f['column'] == 'experiment_type' and f['value'] == 'heart_rate' for f in filters)
        assert any(f['column'] == 'status' and f['value'] == 'completed' for f in filters)
    
    @patch('routes.experiments.supabase_client')
    def test_get_experiment_by_id_success(self, mock_supabase, client, mock_user, auth_headers):
        """Test successful retrieval of specific experiment."""
        experiment_id = str(uuid.uuid4())
        mock_supabase.get_user_from_token.return_value = mock_user
        
        mock_experiment = {
            'id': experiment_id,
            'user_id': mock_user['id'],
            'name': 'Test Experiment',
            'experiment_type': 'heart_rate',
            'status': 'completed'
        }
        
        mock_results = [
            {'id': 'result1', 'experiment_id': experiment_id, 'data_points': []}
        ]
        
        mock_supabase.execute_query.side_effect = [
            {'success': True, 'data': [mock_experiment]},
            {'success': True, 'data': mock_results}
        ]
        
        response = client.get(f'/api/experiments/{experiment_id}', headers=auth_headers)
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['id'] == experiment_id
        assert 'results' in data
        assert len(data['results']) == 1
    
    @patch('routes.experiments.supabase_client')
    def test_get_experiment_by_id_not_found(self, mock_supabase, client, mock_user, auth_headers):
        """Test retrieval of non-existent experiment."""
        experiment_id = str(uuid.uuid4())
        mock_supabase.get_user_from_token.return_value = mock_user
        mock_supabase.execute_query.return_value = {'success': True, 'data': []}
        
        response = client.get(f'/api/experiments/{experiment_id}', headers=auth_headers)
        
        assert response.status_code == 404
        data = json.loads(response.data)
        assert 'Experiment not found' in data['error']
    
    @patch('routes.experiments.supabase_client')
    def test_get_experiment_invalid_id_format(self, mock_supabase, client, mock_user, auth_headers):
        """Test retrieval with invalid UUID format."""
        mock_supabase.get_user_from_token.return_value = mock_user
        
        response = client.get('/api/experiments/invalid-uuid', headers=auth_headers)
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'Invalid experiment ID format' in data['error']
    
    @patch('routes.experiments.supabase_client')
    def test_delete_experiment_success(self, mock_supabase, client, mock_user, auth_headers):
        """Test successful experiment deletion."""
        experiment_id = str(uuid.uuid4())
        mock_supabase.get_user_from_token.return_value = mock_user
        
        mock_supabase.execute_query.side_effect = [
            # Check experiment exists
            {'success': True, 'data': [{'id': experiment_id, 'user_id': mock_user['id']}]},
            # Delete experiment
            {'success': True, 'data': []}
        ]
        
        response = client.delete(f'/api/experiments/{experiment_id}', headers=auth_headers)
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'deleted successfully' in data['message']
    
    @patch('routes.experiments.supabase_client')
    def test_delete_experiment_not_found(self, mock_supabase, client, mock_user, auth_headers):
        """Test deletion of non-existent experiment."""
        experiment_id = str(uuid.uuid4())
        mock_supabase.get_user_from_token.return_value = mock_user
        mock_supabase.execute_query.return_value = {'success': True, 'data': []}
        
        response = client.delete(f'/api/experiments/{experiment_id}', headers=auth_headers)
        
        assert response.status_code == 404
        data = json.loads(response.data)
        assert 'Experiment not found' in data['error']
    
    @patch('routes.experiments.supabase_client')
    def test_delete_experiment_invalid_id(self, mock_supabase, client, mock_user, auth_headers):
        """Test deletion with invalid UUID format."""
        mock_supabase.get_user_from_token.return_value = mock_user
        
        response = client.delete('/api/experiments/invalid-uuid', headers=auth_headers)
        
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'Invalid experiment ID format' in data['error']
    
    def test_experiments_health_endpoint(self, client):
        """Test experiments health check endpoint."""
        response = client.get('/api/experiments/health')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['service'] == 'experiments'
        assert data['status'] == 'healthy'
        assert 'timestamp' in data
    
    @patch('routes.experiments.supabase_client')
    def test_create_experiment_database_failure(self, mock_supabase, client, mock_user, auth_headers, sample_experiment_data):
        """Test experiment creation with database failure."""
        mock_supabase.get_user_from_token.return_value = mock_user
        mock_supabase.execute_query.return_value = {'success': False, 'error': 'Database error'}
        
        response = client.post(
            '/api/experiments',
            data=json.dumps(sample_experiment_data),
            content_type='application/json',
            headers=auth_headers
        )
        
        assert response.status_code == 500
        data = json.loads(response.data)
        assert 'Failed to create experiment' in data['error']
    
    @patch('routes.experiments.supabase_client')
    def test_create_experiment_results_failure_cleanup(self, mock_supabase, client, mock_user, auth_headers, sample_experiment_data):
        """Test experiment creation with results insertion failure and cleanup."""
        mock_supabase.get_user_from_token.return_value = mock_user
        
        experiment_id = str(uuid.uuid4())
        mock_supabase.execute_query.side_effect = [
            # Experiment insertion succeeds
            {'success': True, 'data': [{'id': experiment_id}]},
            # Results insertion fails
            {'success': False, 'error': 'Results error'},
            # Cleanup deletion
            {'success': True, 'data': []}
        ]
        
        response = client.post(
            '/api/experiments',
            data=json.dumps(sample_experiment_data),
            content_type='application/json',
            headers=auth_headers
        )
        
        assert response.status_code == 500
        data = json.loads(response.data)
        assert 'Failed to store experiment results' in data['error']
        
        # Verify cleanup was called
        assert mock_supabase.execute_query.call_count == 3

if __name__ == '__main__':
    pytest.main([__file__, '-v'])