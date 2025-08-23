"""
Test dashboard charts endpoint error recovery and resilience features.
"""

import pytest
from unittest.mock import patch, Mock
from datetime import datetime, timedelta

from app import create_app
from exceptions import DatabaseError, NetworkError, CircuitBreakerOpenError


class TestDashboardChartsErrorRecovery:
    """Test error recovery features of dashboard charts endpoint."""
    
    @pytest.fixture
    def app(self):
        """Create test Flask application."""
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
        return {'Authorization': 'Bearer mock_token'}
    
    @pytest.fixture
    def mock_user(self):
        """Mock user data."""
        return {
            'id': 'test_user_123',
            'email': 'test@example.com',
            'created_at': datetime.utcnow().isoformat()
        }
    
    def test_database_error_with_stale_cache_fallback(self, client, auth_headers, mock_user):
        """Test fallback to stale cache when database fails."""
        stale_cache_data = {
            'activity_timeline': [{'date': '2024-01-15', 'count': 2}],
            'experiment_type_distribution': [{'type': 'eeg', 'count': 2}],
            'performance_trends': [],
            'metric_comparisons': [],
            'total_experiments': 2,
            'period': '30d',
            'last_updated': '2024-01-15T10:00:00Z'
        }
        
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            mock_supabase.return_value.get_user_from_token.return_value = mock_user
            mock_supabase.return_value.execute_query.side_effect = DatabaseError("Connection failed")
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                mock_cache = Mock()
                mock_cache.get.return_value = None  # No fresh cache
                mock_cache.get_stale.return_value = stale_cache_data  # Stale cache available
                mock_cache_service.return_value = mock_cache
                
                response = client.get('/api/dashboard/charts', headers=auth_headers)
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Should return stale cached data
                assert data['stale'] is True
                assert 'cached chart data' in data['message']
                assert data['total_experiments'] == 2
    
    def test_circuit_breaker_open_with_no_cache(self, client, auth_headers, mock_user):
        """Test circuit breaker open scenario with no cache available."""
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            mock_supabase.return_value.get_user_from_token.return_value = mock_user
            
            with patch('routes.dashboard.RetryableOperation') as mock_retry:
                mock_retry.return_value.execute.side_effect = CircuitBreakerOpenError("Circuit breaker open")
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache = Mock()
                    mock_cache.get.return_value = None
                    mock_cache.get_stale.return_value = None  # No stale cache
                    mock_cache_service.return_value = mock_cache
                    
                    response = client.get('/api/dashboard/charts', headers=auth_headers)
                    
                    assert response.status_code == 503
                    data = response.get_json()
                    
                    assert 'temporarily unavailable' in data['error']
                    assert 'retry_after' in data
                    assert data['fallback_data'] is True
    
    def test_partial_results_failure_handling(self, client, auth_headers, mock_user):
        """Test handling of partial results fetch failures."""
        sample_experiments = [
            {
                'id': 'exp_1',
                'user_id': 'test_user_123',
                'experiment_type': 'eeg',
                'status': 'completed',
                'created_at': '2024-01-15T10:30:00Z'
            },
            {
                'id': 'exp_2',
                'user_id': 'test_user_123',
                'experiment_type': 'fmri',
                'status': 'running',
                'created_at': '2024-01-20T14:45:00Z'
            }
        ]
        
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            mock_supabase.return_value.get_user_from_token.return_value = mock_user
            
            # Experiments query succeeds, but some results queries fail
            mock_supabase.return_value.execute_query.side_effect = [
                {'success': True, 'data': sample_experiments},  # experiments query
                {'success': True, 'data': [{'metrics': {'accuracy': 0.95}}]},  # first result succeeds
                DatabaseError("Results fetch failed")  # second result fails
            ]
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                mock_cache_service.return_value = None
                
                response = client.get('/api/dashboard/charts', headers=auth_headers)
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Should indicate partial failure
                assert data['partial_failure'] is True
                assert 'failed_operations' in data
                assert data['failed_operations']['results_fetch_failures'] == 1
                assert data['failed_operations']['successful_results'] == 1
                assert 'warning' in data
    
    def test_date_parsing_error_recovery(self, client, auth_headers, mock_user):
        """Test recovery from date parsing errors."""
        experiments_with_bad_dates = [
            {
                'id': 'exp_1',
                'user_id': 'test_user_123',
                'experiment_type': 'eeg',
                'created_at': 'invalid_date_format'
            },
            {
                'id': 'exp_2',
                'user_id': 'test_user_123',
                'experiment_type': 'fmri',
                'created_at': None
            },
            {
                'id': 'exp_3',
                'user_id': 'test_user_123',
                'experiment_type': 'behavioral',
                'created_at': '2024-01-15T10:30:00Z'  # Valid date
            }
        ]
        
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            mock_supabase.return_value.get_user_from_token.return_value = mock_user
            mock_supabase.return_value.execute_query.return_value = {
                'success': True,
                'data': experiments_with_bad_dates
            }
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                mock_cache_service.return_value = None
                
                response = client.get('/api/dashboard/charts', headers=auth_headers)
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Should include all experiments despite date parsing errors
                assert data['total_experiments'] == 3
                assert 'date_parsing_warnings' in data
                assert data['date_parsing_warnings']['count'] == 2
    
    def test_invalid_period_parameter_handling(self, client, auth_headers, mock_user):
        """Test handling of invalid period parameters."""
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            mock_supabase.return_value.get_user_from_token.return_value = mock_user
            mock_supabase.return_value.execute_query.return_value = {'success': True, 'data': []}
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                mock_cache_service.return_value = None
                
                # Test with invalid period parameter
                response = client.get('/api/dashboard/charts?period=invalid_period', headers=auth_headers)
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Should default to 30d period
                assert data['period'] == '30d'
    
    def test_cache_integration_with_ttl_adjustment(self, client, auth_headers, mock_user):
        """Test cache integration with TTL adjustment for partial failures."""
        sample_experiments = [
            {
                'id': 'exp_1',
                'user_id': 'test_user_123',
                'experiment_type': 'eeg',
                'created_at': '2024-01-15T10:30:00Z'
            }
        ]
        
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            mock_supabase.return_value.get_user_from_token.return_value = mock_user
            
            # Experiments succeed, results fail (partial failure)
            mock_supabase.return_value.execute_query.side_effect = [
                {'success': True, 'data': sample_experiments},
                DatabaseError("Results fetch failed")
            ]
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                mock_cache = Mock()
                mock_cache.get.return_value = None  # Cache miss
                mock_cache.set = Mock()
                mock_cache_service.return_value = mock_cache
                
                response = client.get('/api/dashboard/charts', headers=auth_headers)
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Verify cache was called with reduced TTL due to partial failure
                mock_cache.set.assert_called_once()
                cache_call_args = mock_cache.set.call_args
                cache_ttl = cache_call_args[1]['ttl']
                
                # Should use reduced TTL (60s) for partial data
                assert cache_ttl == 60
                assert data['partial_failure'] is True
    
    def test_force_refresh_bypasses_cache(self, client, auth_headers, mock_user):
        """Test that force_refresh parameter bypasses cache."""
        sample_experiments = [
            {
                'id': 'exp_1',
                'user_id': 'test_user_123',
                'experiment_type': 'eeg',
                'created_at': '2024-01-15T10:30:00Z'
            }
        ]
        
        cached_data = {'cached': True, 'total_experiments': 1}
        
        with patch('routes.dashboard.get_supabase_client') as mock_supabase:
            mock_supabase.return_value.get_user_from_token.return_value = mock_user
            mock_supabase.return_value.execute_query.return_value = {'success': True, 'data': sample_experiments}
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                mock_cache = Mock()
                mock_cache.get.return_value = cached_data  # Cache hit available
                mock_cache_service.return_value = mock_cache
                
                # Request with force_refresh=true
                response = client.get('/api/dashboard/charts?force_refresh=true', headers=auth_headers)
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Should not return cached data due to force refresh
                assert data['total_experiments'] == 1  # Fresh data
                assert 'cached' not in data or data['cached'] is False


if __name__ == '__main__':
    pytest.main([__file__, '-v'])