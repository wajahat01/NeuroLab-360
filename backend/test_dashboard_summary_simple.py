"""
Simple integration tests for enhanced dashboard summary endpoint.
Tests core resilience features with simplified mocking.
"""

import pytest
import json
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

from routes.dashboard import get_dashboard_summary
from cache_service import CacheService
from exceptions import DatabaseError, CircuitBreakerOpenError


class TestDashboardSummarySimple:
    """Simplified test suite for dashboard summary resilience."""
    
    @pytest.fixture
    def mock_user(self):
        """Mock user data."""
        return {
            'id': 'test_user_123',
            'email': 'test@example.com'
        }
    
    @pytest.fixture
    def sample_experiments(self):
        """Sample experiment data."""
        return [
            {
                'id': 'exp_1',
                'user_id': 'test_user_123',
                'name': 'Test Experiment 1',
                'experiment_type': 'cognitive',
                'status': 'completed',
                'created_at': '2024-01-15T10:00:00+00:00'
            },
            {
                'id': 'exp_2',
                'user_id': 'test_user_123',
                'name': 'Test Experiment 2',
                'experiment_type': 'behavioral',
                'status': 'running',
                'created_at': datetime.utcnow().isoformat() + '+00:00'
            }
        ]
    
    def test_successful_summary_generation(self, mock_user, sample_experiments):
        """Test successful dashboard summary generation."""
        with patch('routes.dashboard.request') as mock_request:
            with patch('routes.dashboard.get_supabase_client') as mock_supabase:
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    # Setup request mock
                    mock_request.current_user = mock_user
                    mock_request.args.get.return_value = None
                    
                    # Setup supabase mock
                    mock_client = MagicMock()
                    mock_supabase.return_value = mock_client
                    mock_client.execute_query.side_effect = [
                        {'success': True, 'data': sample_experiments},
                        {'success': True, 'data': []},
                        {'success': True, 'data': []}
                    ]
                    
                    # Setup cache mock
                    mock_cache = MagicMock()
                    mock_cache_service.return_value = mock_cache
                    mock_cache.get.return_value = None  # No cached data
                    
                    # Call the function
                    result = get_dashboard_summary()
                    
                    # Verify result
                    assert result is not None
                    # The function should return a Flask response, so we can't easily test the JSON
                    # But we can verify that cache.set was called
                    mock_cache.set.assert_called_once()
    
    def test_database_error_handling(self, mock_user):
        """Test handling of database errors."""
        with patch('routes.dashboard.request') as mock_request:
            with patch('routes.dashboard.get_supabase_client') as mock_supabase:
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    # Setup request mock
                    mock_request.current_user = mock_user
                    mock_request.args.get.return_value = None
                    
                    # Setup supabase mock to raise error
                    mock_client = MagicMock()
                    mock_supabase.return_value = mock_client
                    
                    from retry_logic import RetryableOperation
                    with patch.object(RetryableOperation, 'execute') as mock_execute:
                        mock_execute.side_effect = DatabaseError("Database connection failed")
                        
                        # Setup cache mock with stale data
                        mock_cache = MagicMock()
                        mock_cache_service.return_value = mock_cache
                        mock_cache.get.return_value = None
                        mock_cache.get_stale.return_value = {
                            'total_experiments': 1,
                            'last_updated': '2024-01-01T00:00:00Z'
                        }
                        
                        # Call the function
                        result = get_dashboard_summary()
                        
                        # Should return stale data
                        assert result is not None
                        mock_cache.get_stale.assert_called_once()
    
    def test_circuit_breaker_handling(self, mock_user):
        """Test handling of circuit breaker open state."""
        with patch('routes.dashboard.request') as mock_request:
            with patch('routes.dashboard.get_supabase_client') as mock_supabase:
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    # Setup request mock
                    mock_request.current_user = mock_user
                    mock_request.args.get.return_value = None
                    
                    # Setup supabase mock
                    mock_client = MagicMock()
                    mock_supabase.return_value = mock_client
                    
                    from retry_logic import RetryableOperation
                    with patch.object(RetryableOperation, 'execute') as mock_execute:
                        mock_execute.side_effect = CircuitBreakerOpenError("Circuit breaker is open")
                        
                        # Setup cache mock
                        mock_cache = MagicMock()
                        mock_cache_service.return_value = mock_cache
                        mock_cache.get.return_value = None
                        mock_cache.get_stale.return_value = None
                        
                        # Call the function
                        result = get_dashboard_summary()
                        
                        # Should handle circuit breaker gracefully
                        assert result is not None
                        mock_cache.get_stale.assert_called_once()
    
    def test_partial_data_handling(self, mock_user, sample_experiments):
        """Test handling of partial data failures."""
        with patch('routes.dashboard.request') as mock_request:
            with patch('routes.dashboard.get_supabase_client') as mock_supabase:
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    # Setup request mock
                    mock_request.current_user = mock_user
                    mock_request.args.get.return_value = None
                    
                    # Setup supabase mock
                    mock_client = MagicMock()
                    mock_supabase.return_value = mock_client
                    
                    # Experiments succeed, but results fail
                    mock_client.execute_query.side_effect = [
                        {'success': True, 'data': sample_experiments},  # experiments succeed
                        DatabaseError("Results query failed"),  # results fail
                        DatabaseError("Results query failed")   # results fail
                    ]
                    
                    # Setup cache mock
                    mock_cache = MagicMock()
                    mock_cache_service.return_value = mock_cache
                    mock_cache.get.return_value = None
                    
                    # Call the function
                    result = get_dashboard_summary()
                    
                    # Should handle partial failure and still cache with reduced TTL
                    assert result is not None
                    mock_cache.set.assert_called_once()
                    # Verify reduced TTL for partial data
                    call_args = mock_cache.set.call_args
                    assert call_args[1]['ttl'] == 60  # Reduced TTL
    
    def test_cache_integration(self, mock_user, sample_experiments):
        """Test cache integration and TTL management."""
        with patch('routes.dashboard.request') as mock_request:
            with patch('routes.dashboard.get_supabase_client') as mock_supabase:
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    # Setup request mock
                    mock_request.current_user = mock_user
                    mock_request.args.get.return_value = None
                    
                    # Setup supabase mock
                    mock_client = MagicMock()
                    mock_supabase.return_value = mock_client
                    mock_client.execute_query.side_effect = [
                        {'success': True, 'data': sample_experiments},
                        {'success': True, 'data': []},
                        {'success': True, 'data': []}
                    ]
                    
                    # Setup cache mock
                    mock_cache = MagicMock()
                    mock_cache_service.return_value = mock_cache
                    mock_cache.get.return_value = None  # No cached data initially
                    
                    # Call the function
                    result = get_dashboard_summary()
                    
                    # Verify cache operations
                    assert result is not None
                    mock_cache.get.assert_called_once_with(f"dashboard_summary_{mock_user['id']}")
                    mock_cache.set.assert_called_once()
                    
                    # Verify cache key and TTL
                    call_args = mock_cache.set.call_args
                    assert call_args[0][0] == f"dashboard_summary_{mock_user['id']}"  # cache key
                    assert call_args[1]['ttl'] == 300  # default TTL for successful data
    
    def test_force_refresh_bypasses_cache(self, mock_user, sample_experiments):
        """Test that force_refresh parameter bypasses cache."""
        with patch('routes.dashboard.request') as mock_request:
            with patch('routes.dashboard.get_supabase_client') as mock_supabase:
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    # Setup request mock with force_refresh
                    mock_request.current_user = mock_user
                    mock_request.args.get.side_effect = lambda key, default=None: 'true' if key == 'force_refresh' else default
                    
                    # Setup supabase mock
                    mock_client = MagicMock()
                    mock_supabase.return_value = mock_client
                    mock_client.execute_query.side_effect = [
                        {'success': True, 'data': sample_experiments},
                        {'success': True, 'data': []},
                        {'success': True, 'data': []}
                    ]
                    
                    # Setup cache mock
                    mock_cache = MagicMock()
                    mock_cache_service.return_value = mock_cache
                    
                    # Call the function
                    result = get_dashboard_summary()
                    
                    # Should not call cache.get() when force_refresh is true
                    assert result is not None
                    mock_cache.get.assert_not_called()
                    mock_cache.set.assert_called_once()  # Should still cache the result
    
    def test_no_cache_service_fallback(self, mock_user, sample_experiments):
        """Test fallback when cache service is unavailable."""
        with patch('routes.dashboard.request') as mock_request:
            with patch('routes.dashboard.get_supabase_client') as mock_supabase:
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    # Setup request mock
                    mock_request.current_user = mock_user
                    mock_request.args.get.return_value = None
                    
                    # Setup supabase mock
                    mock_client = MagicMock()
                    mock_supabase.return_value = mock_client
                    mock_client.execute_query.side_effect = [
                        {'success': True, 'data': sample_experiments},
                        {'success': True, 'data': []},
                        {'success': True, 'data': []}
                    ]
                    
                    # Cache service unavailable
                    mock_cache_service.return_value = None
                    
                    # Call the function
                    result = get_dashboard_summary()
                    
                    # Should work without cache service
                    assert result is not None


if __name__ == '__main__':
    pytest.main([__file__, '-v'])