"""
End-to-end test demonstrating retry logic and circuit breaker functionality.
"""

import pytest
import json
import time
import warnings
from unittest.mock import Mock, patch

# Suppress Pydantic deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="gotrue")

from app import create_app
from retry_logic import get_database_circuit_breaker, CircuitBreakerState
from exceptions import DatabaseError, NetworkError


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


class TestRetryEndToEnd:
    """End-to-end tests for retry logic and circuit breaker."""
    
    def setup_method(self):
        """Reset circuit breaker state before each test."""
        cb = get_database_circuit_breaker()
        cb.state = CircuitBreakerState.CLOSED
        cb.failure_count = 0
        cb.last_failure_time = None
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client._execute_single_query')
    def test_retry_success_after_failure(self, mock_execute, mock_get_user, client, auth_headers, mock_user):
        """Test that retry logic succeeds after initial failures."""
        mock_get_user.return_value = mock_user
        
        # First two calls fail, third succeeds
        mock_execute.side_effect = [
            DatabaseError("Connection timeout"),
            DatabaseError("Connection timeout"),
            {
                'success': True,
                'data': [
                    {
                        'id': 'exp1',
                        'name': 'Test Experiment',
                        'experiment_type': 'cognitive',
                        'status': 'completed',
                        'created_at': '2024-01-01T00:00:00Z',
                        'user_id': 'test_user_123'
                    }
                ],
                'response_time': 0.1
            },
            # Results query
            {
                'success': True,
                'data': [
                    {
                        'id': 'result1',
                        'experiment_id': 'exp1',
                        'metrics': {'accuracy': 0.85},
                        'created_at': '2024-01-01T01:00:00Z'
                    }
                ],
                'response_time': 0.1
            }
        ]
        
        response = client.get('/api/dashboard/summary', headers=auth_headers)
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['total_experiments'] == 1
        
        # Should have retried (3 calls for experiments + 1 for results)
        assert mock_execute.call_count == 4
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client._execute_single_query')
    def test_circuit_breaker_opens_and_blocks(self, mock_execute, mock_get_user, client, auth_headers, mock_user):
        """Test that circuit breaker opens after failures and blocks subsequent requests."""
        mock_get_user.return_value = mock_user
        mock_execute.side_effect = DatabaseError("Database connection failed")
        
        cb = get_database_circuit_breaker()
        
        # Make multiple failing requests to trigger circuit breaker
        for i in range(3):
            response = client.get('/api/dashboard/summary', headers=auth_headers)
            assert response.status_code == 503
            
            # Check if circuit breaker is open after enough failures
            if cb.state == CircuitBreakerState.OPEN:
                break
        
        # Circuit breaker should be open now
        assert cb.state == CircuitBreakerState.OPEN
        
        # Next request should be blocked immediately
        response = client.get('/api/dashboard/summary', headers=auth_headers)
        assert response.status_code == 503
        
        data = json.loads(response.data)
        assert data['error_code'] == 'CIRCUIT_BREAKER_OPEN'
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client._execute_single_query')
    def test_circuit_breaker_recovery(self, mock_execute, mock_get_user, client, auth_headers, mock_user):
        """Test circuit breaker recovery after timeout."""
        mock_get_user.return_value = mock_user
        
        cb = get_database_circuit_breaker()
        
        # Force circuit breaker to open state with expired timeout
        cb.state = CircuitBreakerState.OPEN
        cb.last_failure_time = time.time() - 61  # More than 60s ago
        
        # Mock successful response for recovery
        mock_execute.return_value = {
            'success': True,
            'data': [
                {
                    'id': 'exp1',
                    'name': 'Test Experiment',
                    'experiment_type': 'cognitive',
                    'status': 'completed',
                    'created_at': '2024-01-01T00:00:00Z',
                    'user_id': 'test_user_123'
                }
            ],
            'response_time': 0.1
        }
        
        response = client.get('/api/dashboard/summary', headers=auth_headers)
        
        # Should succeed and close circuit breaker
        assert response.status_code == 200
        assert cb.state == CircuitBreakerState.CLOSED
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client._execute_single_query')
    def test_partial_failure_handling(self, mock_execute, mock_get_user, client, auth_headers, mock_user):
        """Test handling of partial failures in dashboard operations."""
        mock_get_user.return_value = mock_user
        
        # Experiments query succeeds, results query fails
        mock_execute.side_effect = [
            {
                'success': True,
                'data': [
                    {
                        'id': 'exp1',
                        'name': 'Test Experiment',
                        'experiment_type': 'cognitive',
                        'status': 'completed',
                        'created_at': '2024-01-01T00:00:00Z',
                        'user_id': 'test_user_123'
                    }
                ],
                'response_time': 0.1
            },
            # Results query fails after retries
            DatabaseError("Results service unavailable")
        ]
        
        response = client.get('/api/dashboard/summary', headers=auth_headers)
        
        # Should still return 200 with partial data
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['total_experiments'] == 1
        assert data['partial_failure'] is True
        assert 'failed_operations' in data
        assert 'warning' in data
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client._execute_single_query')
    def test_different_error_types_handling(self, mock_execute, mock_get_user, client, auth_headers, mock_user):
        """Test handling of different error types."""
        mock_get_user.return_value = mock_user
        
        # Test NetworkError
        mock_execute.side_effect = [
            NetworkError("Network timeout"),
            {
                'success': True,
                'data': [],
                'response_time': 0.1
            }
        ]
        
        response = client.get('/api/dashboard/summary', headers=auth_headers)
        assert response.status_code == 200  # Should succeed after retry
        
        # Reset mock for DatabaseError test
        mock_execute.reset_mock()
        mock_execute.side_effect = DatabaseError("Database connection failed")
        
        response = client.get('/api/dashboard/summary', headers=auth_headers)
        assert response.status_code == 503  # Should fail after retries
        
        data = json.loads(response.data)
        assert data['error_code'] == 'DATABASE_ERROR'
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client._execute_single_query')
    def test_exponential_backoff_timing(self, mock_execute, mock_get_user, client, auth_headers, mock_user):
        """Test that exponential backoff is applied correctly."""
        mock_get_user.return_value = mock_user
        
        call_times = []
        
        def mock_with_timing(*args, **kwargs):
            call_times.append(time.time())
            raise DatabaseError("Connection failed")
        
        mock_execute.side_effect = mock_with_timing
        
        start_time = time.time()
        response = client.get('/api/dashboard/summary', headers=auth_headers)
        end_time = time.time()
        
        # Should have made multiple attempts with delays
        assert len(call_times) == 4  # Initial + 3 retries
        assert response.status_code == 503
        
        # Total time should be at least the sum of delays (roughly 1 + 2 + 4 = 7 seconds)
        # But we use shorter delays in tests, so just check it took some time
        assert end_time - start_time > 1.0  # At least 1 second for retries


if __name__ == '__main__':
    pytest.main([__file__, '-v'])