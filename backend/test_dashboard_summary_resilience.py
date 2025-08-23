"""
Integration tests for enhanced dashboard summary endpoint resilience.
Tests caching, error handling, partial data handling, and circuit breaker functionality.
"""

import pytest
import json
import time
from unittest.mock import patch, MagicMock, Mock
from datetime import datetime, timedelta
from flask import Flask

from app import create_app
from cache_service import init_cache_service, CacheService
from retry_logic import CircuitBreaker, CircuitBreakerOpenError
from exceptions import DatabaseError, NetworkError
from supabase_client import get_supabase_client


class TestDashboardSummaryResilience:
    """Test suite for dashboard summary endpoint resilience features."""
    
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
    def auth_headers(self):
        """Mock authentication headers."""
        return {'Authorization': 'Bearer test_token'}
    
    @pytest.fixture
    def mock_user(self):
        """Mock user data."""
        return {
            'id': 'test_user_123',
            'email': 'test@example.com',
            'name': 'Test User'
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
                'created_at': '2024-01-20T14:30:00+00:00'
            },
            {
                'id': 'exp_3',
                'user_id': 'test_user_123',
                'name': 'Test Experiment 3',
                'experiment_type': 'cognitive',
                'status': 'completed',
                'created_at': datetime.utcnow().isoformat() + '+00:00'  # Recent experiment
            }
        ]
    
    @pytest.fixture
    def sample_results(self):
        """Sample results data."""
        return [
            {
                'id': 'result_1',
                'experiment_id': 'exp_1',
                'metrics': {'accuracy': 0.85, 'response_time': 1.2},
                'created_at': '2024-01-15T11:00:00+00:00'
            },
            {
                'id': 'result_2',
                'experiment_id': 'exp_3',
                'metrics': {'accuracy': 0.92, 'response_time': 1.0},
                'created_at': datetime.utcnow().isoformat() + '+00:00'
            }
        ]
    
    def test_successful_dashboard_summary_with_caching(self, client, auth_headers, mock_user, sample_experiments, sample_results):
        """Test successful dashboard summary retrieval with caching."""
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            # Setup mocks
            mock_client = MagicMock()
            mock_supabase.return_value = mock_client
            
            # Mock authentication
            mock_client.get_user_from_token.return_value = mock_user
            
            # Mock successful experiments query
            mock_client.execute_query.side_effect = [
                {'success': True, 'data': sample_experiments},  # experiments query
                {'success': True, 'data': [sample_results[0]]},  # results for exp_1
                {'success': True, 'data': []},  # results for exp_2 (no results)
                {'success': True, 'data': [sample_results[1]]}   # results for exp_3
            ]
            
            # First request - should hit database and cache result
            response = client.get('/api/dashboard/summary', headers=auth_headers)
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Verify response structure
                assert 'total_experiments' in data
                assert 'experiments_by_type' in data
                assert 'experiments_by_status' in data
                assert 'recent_activity' in data
                assert 'average_metrics' in data
                assert 'last_updated' in data
                assert 'cache_info' in data
                
                # Verify data correctness
                assert data['total_experiments'] == 3
                assert data['experiments_by_type']['cognitive'] == 2
                assert data['experiments_by_type']['behavioral'] == 1
                assert data['experiments_by_status']['completed'] == 2
                assert data['experiments_by_status']['running'] == 1
                assert data['recent_activity']['last_7_days'] == 1  # Only exp_3 is recent
                assert data['average_metrics']['accuracy'] == 0.885  # (0.85 + 0.92) / 2
                assert data['cache_info']['cached'] is False
                
                # Second request - should hit cache
                with patch('cache_service.get_cache_service') as mock_cache_service:
                    mock_cache = MagicMock()
                    mock_cache_service.return_value = mock_cache
                    mock_cache.get.return_value = data  # Return cached data
                    
                    response2 = client.get('/api/dashboard/summary', headers=auth_headers)
                    
                    assert response2.status_code == 200
                    cached_data = response2.get_json()
                    assert cached_data['cached'] is True
                    assert 'cache_timestamp' in cached_data
    
    def test_dashboard_summary_with_database_error_and_stale_cache(self, client, auth_headers, mock_user, sample_experiments):
        """Test dashboard summary with database error falling back to stale cache."""
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            with patch('cache_service.get_cache_service') as mock_cache_service:
                # Setup mocks
                mock_client = MagicMock()
                mock_supabase.return_value = mock_client
                
                # Mock authentication
                mock_client.get_user_from_token.return_value = mock_user
                
                # Mock database error
                mock_client.execute_query.side_effect = DatabaseError("Database connection failed")
                
                # Mock cache service with stale data
                mock_cache = MagicMock()
                mock_cache_service.return_value = mock_cache
                mock_cache.get.return_value = None  # No fresh cache
                
                stale_data = {
                    'total_experiments': 2,
                    'experiments_by_type': {'cognitive': 1, 'behavioral': 1},
                    'experiments_by_status': {'completed': 1, 'running': 1},
                    'last_updated': '2024-01-01T00:00:00Z'
                }
                mock_cache.get_stale.return_value = stale_data
                
                response = client.get('/api/dashboard/summary', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should return stale data with appropriate flags
                    assert data['stale'] is True
                    assert data['message'] == 'Using cached data due to temporary service issues'
                    assert data['database_error'] is True
                    assert data['total_experiments'] == 2
    
    def test_dashboard_summary_with_circuit_breaker_open(self, client, auth_headers, mock_user):
        """Test dashboard summary when circuit breaker is open."""
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            with patch('routes.dashboard.request') as mock_request:
                with patch('routes.dashboard.get_database_circuit_breaker') as mock_circuit_breaker:
                    with patch('cache_service.get_cache_service') as mock_cache_service:
                        # Setup mocks
                        mock_request.current_user = mock_user
                        mock_request.args.get.return_value = None
                        
                        mock_client = MagicMock()
                        mock_supabase.return_value = mock_client
                        
                        # Mock circuit breaker open
                        mock_breaker = MagicMock()
                        mock_circuit_breaker.return_value = mock_breaker
                        
                        from retry_logic import RetryableOperation
                        with patch.object(RetryableOperation, 'execute') as mock_execute:
                            mock_execute.side_effect = CircuitBreakerOpenError("Circuit breaker is open")
                            
                            # Mock cache service with stale data
                            mock_cache = MagicMock()
                            mock_cache_service.return_value = mock_cache
                            mock_cache.get.return_value = None  # No fresh cache
                            
                            stale_data = {
                                'total_experiments': 1,
                                'experiments_by_type': {'cognitive': 1},
                                'last_updated': '2024-01-01T00:00:00Z'
                            }
                            mock_cache.get_stale.return_value = stale_data
                            
                            response = client.get('/api/dashboard/summary', headers=auth_headers)
                            
                            assert response.status_code == 200
                            data = response.get_json()
                            
                            # Should return stale data with circuit breaker flags
                            assert data['stale'] is True
                            assert data['message'] == 'Service temporarily degraded, showing cached data'
                            assert data['circuit_breaker_open'] is True
    
    def test_dashboard_summary_with_partial_data_failure(self, client, auth_headers, mock_user, sample_experiments):
        """Test dashboard summary with partial data failures."""
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            with patch('routes.dashboard.request') as mock_request:
                # Setup mocks
                mock_request.current_user = mock_user
                mock_request.args.get.return_value = None
                
                mock_client = MagicMock()
                mock_supabase.return_value = mock_client
                
                # Mock successful experiments query but failed results queries
                mock_client.execute_query.side_effect = [
                    {'success': True, 'data': sample_experiments},  # experiments query succeeds
                    DatabaseError("Results query failed"),  # results for exp_1 fails
                    {'success': False, 'error': 'Network timeout'},  # results for exp_2 fails
                    {'success': True, 'data': []}  # results for exp_3 succeeds but empty
                ]
                
                response = client.get('/api/dashboard/summary', headers=auth_headers)
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Should have experiment data but indicate partial failure
                assert data['total_experiments'] == 3
                assert data['partial_failure'] is True
                assert 'failed_operations' in data
                assert data['failed_operations']['results_fetch_failures'] == 2
                assert data['failed_operations']['total_experiments'] == 3
                assert 'warning' in data
                assert 'Some experiment results could not be loaded (2 out of 3)' in data['warning']
                
                # Should still have basic experiment aggregations
                assert data['experiments_by_type']['cognitive'] == 2
                assert data['experiments_by_status']['completed'] == 2
    
    def test_dashboard_summary_force_refresh(self, client, auth_headers, mock_user, sample_experiments):
        """Test dashboard summary with force refresh parameter."""
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            with patch('routes.dashboard.request') as mock_request:
                with patch('cache_service.get_cache_service') as mock_cache_service:
                    # Setup mocks
                    mock_request.current_user = mock_user
                    mock_request.args.get.side_effect = lambda key, default=None: 'true' if key == 'force_refresh' else default
                    
                    mock_client = MagicMock()
                    mock_supabase.return_value = mock_client
                    mock_client.execute_query.side_effect = [
                        {'success': True, 'data': sample_experiments},
                        {'success': True, 'data': []},
                        {'success': True, 'data': []},
                        {'success': True, 'data': []}
                    ]
                    
                    # Mock cache service
                    mock_cache = MagicMock()
                    mock_cache_service.return_value = mock_cache
                    
                    response = client.get('/api/dashboard/summary?force_refresh=true', headers=auth_headers)
                    
                    assert response.status_code == 200
                    
                    # Should not call cache.get() when force_refresh is true
                    mock_cache.get.assert_not_called()
                    # Should call cache.set() to update cache with fresh data
                    mock_cache.set.assert_called_once()
    
    def test_dashboard_summary_no_cache_service(self, client, auth_headers, mock_user, sample_experiments):
        """Test dashboard summary when cache service is unavailable."""
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            with patch('routes.dashboard.request') as mock_request:
                with patch('cache_service.get_cache_service') as mock_cache_service:
                    # Setup mocks
                    mock_request.current_user = mock_user
                    mock_request.args.get.return_value = None
                    
                    mock_client = MagicMock()
                    mock_supabase.return_value = mock_client
                    mock_client.execute_query.side_effect = [
                        {'success': True, 'data': sample_experiments},
                        {'success': True, 'data': []},
                        {'success': True, 'data': []},
                        {'success': True, 'data': []}
                    ]
                    
                    # Mock cache service as unavailable
                    mock_cache_service.return_value = None
                    
                    response = client.get('/api/dashboard/summary', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should work without cache service
                    assert data['total_experiments'] == 3
                    assert 'cache_info' in data
                    assert data['cache_info']['cached'] is False
    
    def test_dashboard_summary_complete_failure_with_fallback(self, client, auth_headers, mock_user):
        """Test dashboard summary complete failure with fallback response."""
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            with patch('routes.dashboard.request') as mock_request:
                with patch('cache_service.get_cache_service') as mock_cache_service:
                    # Setup mocks
                    mock_request.current_user = mock_user
                    mock_request.args.get.return_value = None
                    
                    mock_client = MagicMock()
                    mock_supabase.return_value = mock_client
                    
                    # Mock circuit breaker open
                    from retry_logic import RetryableOperation
                    with patch.object(RetryableOperation, 'execute') as mock_execute:
                        mock_execute.side_effect = CircuitBreakerOpenError("Circuit breaker is open")
                        
                        # Mock cache service with no stale data
                        mock_cache = MagicMock()
                        mock_cache_service.return_value = mock_cache
                        mock_cache.get.return_value = None
                        mock_cache.get_stale.return_value = None
                        
                        response = client.get('/api/dashboard/summary', headers=auth_headers)
                        
                        assert response.status_code == 503
                        data = response.get_json()
                        
                        # Should return fallback response
                        assert data['error'] == 'Dashboard service temporarily unavailable'
                        assert data['message'] == 'Service is experiencing high load. Please try again in a few moments.'
                        assert data['retry_after'] == 60
                        assert data['fallback_data'] is True
    
    def test_dashboard_summary_cache_ttl_adjustment(self, client, auth_headers, mock_user, sample_experiments):
        """Test that cache TTL is adjusted based on data quality."""
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            with patch('routes.dashboard.request') as mock_request:
                with patch('cache_service.get_cache_service') as mock_cache_service:
                    # Setup mocks
                    mock_request.current_user = mock_user
                    mock_request.args.get.return_value = None
                    
                    mock_client = MagicMock()
                    mock_supabase.return_value = mock_client
                    
                    # Mock partial failure scenario
                    mock_client.execute_query.side_effect = [
                        {'success': True, 'data': sample_experiments},  # experiments succeed
                        DatabaseError("Results query failed"),  # results fail
                        DatabaseError("Results query failed"),  # results fail
                        DatabaseError("Results query failed")   # results fail
                    ]
                    
                    mock_cache = MagicMock()
                    mock_cache_service.return_value = mock_cache
                    
                    response = client.get('/api/dashboard/summary', headers=auth_headers)
                    
                    assert response.status_code == 200
                    
                    # Should cache with reduced TTL due to partial failure
                    mock_cache.set.assert_called_once()
                    call_args = mock_cache.set.call_args
                    assert call_args[1]['ttl'] == 60  # Reduced TTL for partial data
    
    def test_dashboard_summary_date_parsing_resilience(self, client, auth_headers, mock_user):
        """Test dashboard summary resilience to date parsing errors."""
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            with patch('routes.dashboard.request') as mock_request:
                # Setup mocks
                mock_request.current_user = mock_user
                mock_request.args.get.return_value = None
                
                mock_client = MagicMock()
                mock_supabase.return_value = mock_client
                
                # Experiments with various date formats and invalid dates
                experiments_with_bad_dates = [
                    {
                        'id': 'exp_1',
                        'user_id': 'test_user_123',
                        'name': 'Test Experiment 1',
                        'experiment_type': 'cognitive',
                        'status': 'completed',
                        'created_at': 'invalid_date_format'
                    },
                    {
                        'id': 'exp_2',
                        'user_id': 'test_user_123',
                        'name': 'Test Experiment 2',
                        'experiment_type': 'behavioral',
                        'status': 'running',
                        'created_at': None
                    },
                    {
                        'id': 'exp_3',
                        'user_id': 'test_user_123',
                        'name': 'Test Experiment 3',
                        'experiment_type': 'cognitive',
                        'status': 'completed',
                        'created_at': datetime.utcnow().isoformat() + 'Z'  # Valid recent date
                    }
                ]
                
                mock_client.execute_query.side_effect = [
                    {'success': True, 'data': experiments_with_bad_dates},
                    {'success': True, 'data': []},
                    {'success': True, 'data': []},
                    {'success': True, 'data': []}
                ]
                
                response = client.get('/api/dashboard/summary', headers=auth_headers)
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Should handle date parsing errors gracefully
                assert data['total_experiments'] == 3
                assert data['recent_activity']['last_7_days'] >= 1  # Should include experiments with bad dates as recent
                assert 'experiments_by_type' in data
                assert 'experiments_by_status' in data


if __name__ == '__main__':
    pytest.main([__file__, '-v'])