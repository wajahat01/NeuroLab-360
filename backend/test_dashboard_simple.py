"""
Simple test to verify dashboard routes work with retry logic.
"""

import pytest
import json
import warnings
from unittest.mock import Mock, patch

# Suppress Pydantic deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="gotrue")

from app import create_app


@pytest.fixture
def app():
    """Create test Flask application."""
    app = create_app()
    app.config['TESTING'] = True
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()


@pytest.fixture
def auth_headers():
    """Mock authentication headers."""
    return {
        'Authorization': 'Bearer test_token',
        'Content-Type': 'application/json'
    }


@pytest.fixture
def mock_user():
    """Mock user data."""
    return {
        'id': 'test_user_123',
        'email': 'test@example.com'
    }


class TestDashboardBasic:
    """Basic tests for dashboard endpoints."""
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_summary_success(self, mock_execute, mock_get_user, client, auth_headers, mock_user):
        """Test successful summary request."""
        mock_get_user.return_value = mock_user
        
        # Mock experiments query
        experiments_data = [
            {
                'id': 'exp1',
                'name': 'Test Experiment',
                'experiment_type': 'cognitive',
                'status': 'completed',
                'created_at': '2024-01-01T00:00:00Z',
                'user_id': 'test_user_123'
            }
        ]
        
        # Mock results query
        results_data = [
            {
                'id': 'result1',
                'experiment_id': 'exp1',
                'metrics': {'accuracy': 0.85, 'response_time': 1.2},
                'created_at': '2024-01-01T01:00:00Z'
            }
        ]
        
        # Set up mock to return different data for different calls
        mock_execute.side_effect = [
            {'success': True, 'data': experiments_data},  # experiments query
            {'success': True, 'data': results_data}       # results query
        ]
        
        response = client.get('/api/dashboard/summary', headers=auth_headers)
        
        if response.status_code != 200:
            print(f"Response status: {response.status_code}")
            print(f"Response data: {response.data}")
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['total_experiments'] == 1
        assert 'experiments_by_type' in data
        assert 'experiments_by_status' in data
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_summary_database_failure(self, mock_execute, mock_get_user, client, auth_headers, mock_user):
        """Test summary endpoint handles database failures."""
        mock_get_user.return_value = mock_user
        mock_execute.return_value = {
            'success': False,
            'error': 'Database connection failed',
            'data': None
        }
        
        response = client.get('/api/dashboard/summary', headers=auth_headers)
        
        assert response.status_code == 503
        data = json.loads(response.data)
        assert 'error' in data
        assert data['error_code'] == 'DATABASE_ERROR'
        assert 'retry_after' in data


if __name__ == '__main__':
    pytest.main([__file__, '-v'])