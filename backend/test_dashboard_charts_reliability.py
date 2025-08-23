"""
Comprehensive tests for dashboard charts endpoint reliability and error recovery.
Tests various failure scenarios and data aggregation error handling.
"""

import pytest
import json
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock, Mock
from flask import Flask

from app import create_app
from routes.dashboard import _parse_experiment_date, _process_experiment_metrics
from exceptions import DatabaseError, NetworkError, CircuitBreakerOpenError
from cache_service import CacheService
from retry_logic import RetryableOperation


class TestDashboardChartsReliability:
    """Test suite for dashboard charts endpoint reliability."""
    
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
        return {'Authorization': 'Bearer test_token'}
    
    @pytest.fixture
    def mock_user(self):
        """Mock user data."""
        return {'id': 'test_user_123', 'email': 'test@example.com'}
    
    @pytest.fixture
    def sample_experiments(self):
        """Sample experiment data for testing."""
        return [
            {
                'id': 'exp_1',
                'user_id': 'test_user_123',
                'name': 'Test Experiment 1',
                'experiment_type': 'classification',
                'status': 'completed',
                'created_at': '2024-01-15T10:30:00Z'
            },
            {
                'id': 'exp_2',
                'user_id': 'test_user_123',
                'name': 'Test Experiment 2',
                'experiment_type': 'regression',
                'status': 'running',
                'created_at': '2024-01-20T14:45:00Z'
            },
            {
                'id': 'exp_3',
                'user_id': 'test_user_123',
                'name': 'Test Experiment 3',
                'experiment_type': 'classification',
                'status': 'completed',
                'created_at': '2024-01-25T09:15:00Z'
            }
        ]
    
    @pytest.fixture
    def sample_results(self):
        """Sample results data for testing."""
        return [
            {
                'id': 'result_1',
                'experiment_id': 'exp_1',
                'metrics': {
                    'accuracy': 0.95,
                    'precision': 0.92,
                    'recall': 0.88
                },
                'created_at': '2024-01-15T11:00:00Z'
            },
            {
                'id': 'result_2',
                'experiment_id': 'exp_2',
                'metrics': {
                    'mse': 0.15,
                    'r2_score': 0.85
                },
                'created_at': '2024-01-20T15:00:00Z'
            },
            {
                'id': 'result_3',
                'experiment_id': 'exp_3',
                'metrics': {
                    'accuracy': 0.88,
                    'precision': 0.90,
                    'recall': 0.85
                },
                'created_at': '2024-01-25T10:00:00Z'
            }
        ]
    
    def test_successful_charts_request(self, client, auth_headers, mock_user, sample_experiments, sample_results):
        """Test successful charts request with all data available."""
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = None
            mock_request.args.to_dict.return_value = {}
            mock_request.endpoint = '/dashboard/charts'
            mock_request.method = 'GET'
            mock_request.headers = auth_headers
            mock_request.remote_addr = '127.0.0.1'
            
            # Mock validated parameters
            mock_request.validated_params = {'period': '30d'}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                # Mock experiments query
                mock_supabase.execute_query.side_effect = [
                    {'success': True, 'data': sample_experiments},
                    {'success': True, 'data': [sample_results[0]]},
                    {'success': True, 'data': [sample_results[1]]},
                    {'success': True, 'data': [sample_results[2]]}
                ]
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value = None  # No cache for this test
                    
                    response = client.get('/api/dashboard/charts', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Verify response structure
                    assert 'activity_timeline' in data
                    assert 'experiment_type_distribution' in data
                    assert 'performance_trends' in data
                    assert 'metric_comparisons' in data
                    assert 'total_experiments' in data
                    assert data['total_experiments'] == 3
                    assert data['period'] == '30d'
                    assert 'partial_failure' in data
                    assert data['partial_failure'] is False
    
    def test_database_failure_with_cache_fallback(self, client, auth_headers, mock_user, sample_experiments):
        """Test graceful handling of database failures with fallback to cached data."""
        cached_chart_data = {
            'activity_timeline': [{'date': '2024-01-15', 'count': 1}],
            'experiment_type_distribution': [{'type': 'classification', 'count': 1}],
            'performance_trends': [],
            'metric_comparisons': [],
            'total_experiments': 1,
            'period': '30d',
            'last_updated': '2024-01-15T10:00:00Z'
        }
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = None
            mock_request.validated_params = {'period': '30d'}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.side_effect = DatabaseError("Connection failed")
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache = Mock()
                    mock_cache.get.return_value = None  # No fresh cache
                    mock_cache.get_stale.return_value = cached_chart_data  # Stale cache available
                    mock_cache_service.return_value = mock_cache
                    
                    response = client.get('/api/dashboard/charts', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should return stale cached data
                    assert data['stale'] is True
                    assert 'message' in data
                    assert 'cached chart data' in data['message']
                    assert data['total_experiments'] == 1
    
    def test_circuit_breaker_open_scenario(self, client, auth_headers, mock_user):
        """Test handling of circuit breaker open scenario."""
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = None
            mock_request.validated_params = {'period': '30d'}
            
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
                    
                    assert 'error' in data
                    assert 'temporarily unavailable' in data['error']
                    assert 'retry_after' in data
                    assert data['fallback_data'] is True
    
    def test_partial_results_failure(self, client, auth_headers, mock_user, sample_experiments):
        """Test handling of partial results fetch failures."""
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = None
            mock_request.validated_params = {'period': '30d'}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                # Experiments query succeeds
                mock_supabase.execute_query.side_effect = [
                    {'success': True, 'data': sample_experiments},
                    {'success': True, 'data': [{'metrics': {'accuracy': 0.95}}]},  # First result succeeds
                    DatabaseError("Results fetch failed"),  # Second result fails
                    NetworkError("Network timeout")  # Third result fails
                ]
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value = None
                    
                    response = client.get('/api/dashboard/charts', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should indicate partial failure
                    assert data['partial_failure'] is True
                    assert 'failed_operations' in data
                    assert data['failed_operations']['results_fetch_failures'] == 2
                    assert data['failed_operations']['successful_results'] == 1
                    assert 'warning' in data
    
    def test_date_parsing_error_recovery(self, client, auth_headers, mock_user):
        """Test recovery from date parsing errors."""
        experiments_with_bad_dates = [
            {
                'id': 'exp_1',
                'user_id': 'test_user_123',
                'experiment_type': 'classification',
                'created_at': 'invalid_date_format'
            },
            {
                'id': 'exp_2',
                'user_id': 'test_user_123',
                'experiment_type': 'regression',
                'created_at': None
            },
            {
                'id': 'exp_3',
                'user_id': 'test_user_123',
                'experiment_type': 'classification',
                'created_at': '2024-01-15T10:30:00Z'  # Valid date
            }
        ]
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = None
            mock_request.validated_params = {'period': '30d'}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.return_value = {
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
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = None
            mock_request.validated_params = {'period': 'invalid_period'}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.return_value = {'success': True, 'data': []}
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value = None
                    
                    response = client.get('/api/dashboard/charts', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should default to 30d period
                    assert data['period'] == '30d'
    
    def test_cache_integration(self, client, auth_headers, mock_user, sample_experiments):
        """Test cache integration with TTL management."""
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = None
            mock_request.validated_params = {'period': '7d'}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.return_value = {'success': True, 'data': sample_experiments}
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache = Mock()
                    mock_cache.get.return_value = None  # Cache miss
                    mock_cache.set = Mock()
                    mock_cache_service.return_value = mock_cache
                    
                    response = client.get('/api/dashboard/charts', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Verify cache was called
                    mock_cache.get.assert_called_once()
                    mock_cache.set.assert_called_once()
                    
                    # Verify cache key and TTL
                    cache_call_args = mock_cache.set.call_args
                    cache_key = cache_call_args[0][0]
                    cached_data = cache_call_args[0][1]
                    cache_ttl = cache_call_args[1]['ttl']
                    
                    assert 'dashboard_charts_test_user_123' in cache_key
                    assert '7d' in cache_key
                    assert isinstance(cached_data, dict)
                    assert cache_ttl == 300  # Default TTL for successful request
    
    def test_force_refresh_bypasses_cache(self, client, auth_headers, mock_user, sample_experiments):
        """Test that force_refresh parameter bypasses cache."""
        cached_data = {'cached': True, 'total_experiments': 1}
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.side_effect = lambda key, default=None: 'true' if key == 'force_refresh' else default
            mock_request.validated_params = {'period': '30d'}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.return_value = {'success': True, 'data': sample_experiments}
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache = Mock()
                    mock_cache.get.return_value = cached_data  # Cache hit available
                    mock_cache_service.return_value = mock_cache
                    
                    response = client.get('/api/dashboard/charts', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should not return cached data due to force refresh
                    assert data['total_experiments'] == 3  # Fresh data
                    assert 'cached' not in data or data['cached'] is False


class TestDateParsingUtility:
    """Test suite for the _parse_experiment_date utility function."""
    
    def test_valid_iso_formats(self):
        """Test parsing of valid ISO date formats."""
        test_cases = [
            ('2024-01-15T10:30:00Z', datetime(2024, 1, 15, 10, 30, 0)),
            ('2024-01-15T10:30:00.123Z', datetime(2024, 1, 15, 10, 30, 0, 123000)),
            ('2024-01-15T10:30:00+00:00', datetime(2024, 1, 15, 10, 30, 0)),
            ('2024-01-15T10:30:00.123+00:00', datetime(2024, 1, 15, 10, 30, 0, 123000)),
            ('2024-01-15T10:30:00', datetime(2024, 1, 15, 10, 30, 0)),
            ('2024-01-15 10:30:00', datetime(2024, 1, 15, 10, 30, 0)),
            ('2024-01-15', datetime(2024, 1, 15, 0, 0, 0))
        ]
        
        for date_str, expected in test_cases:
            result = _parse_experiment_date(date_str)
            assert result is not None, f"Failed to parse: {date_str}"
            # Compare without timezone info for simplicity
            assert result.replace(tzinfo=None) == expected, f"Mismatch for {date_str}"
    
    def test_invalid_date_formats(self):
        """Test handling of invalid date formats."""
        invalid_dates = [
            None,
            '',
            'invalid_date',
            '2024-13-45',  # Invalid month/day
            '2024/01/15',  # Wrong separator
            'January 15, 2024',  # Text format
            123456789,  # Number
            {'date': '2024-01-15'}  # Dictionary
        ]
        
        for invalid_date in invalid_dates:
            result = _parse_experiment_date(invalid_date)
            assert result is None, f"Should have failed to parse: {invalid_date}"
    
    def test_edge_cases(self):
        """Test edge cases in date parsing."""
        # Empty string
        assert _parse_experiment_date('') is None
        
        # Whitespace
        result = _parse_experiment_date('  2024-01-15T10:30:00Z  ')
        assert result is not None
        
        # Different timezone formats
        result = _parse_experiment_date('2024-01-15T10:30:00-05:00')
        assert result is not None


class TestMetricsProcessingUtility:
    """Test suite for the _process_experiment_metrics utility function."""
    
    def test_valid_metrics_processing(self):
        """Test processing of valid metrics."""
        metrics = {
            'accuracy': 0.95,
            'precision': 0.88,
            'recall': 0.92,
            'f1_score': 0.90
        }
        
        performance_trends = {}
        metric_comparisons = {}
        
        _process_experiment_metrics(
            metrics, '2024-01-15', 'classification', 
            performance_trends, metric_comparisons
        )
        
        # Verify performance trends
        assert '2024-01-15' in performance_trends
        assert 'accuracy' in performance_trends['2024-01-15']
        assert performance_trends['2024-01-15']['accuracy'] == [0.95]
        
        # Verify metric comparisons
        assert 'classification' in metric_comparisons
        assert 'accuracy' in metric_comparisons['classification']
        assert metric_comparisons['classification']['accuracy'] == [0.95]
    
    def test_invalid_metrics_handling(self):
        """Test handling of invalid metrics."""
        invalid_metrics = {
            'valid_metric': 0.95,
            'string_metric': 'not_a_number',
            'none_metric': None,
            'bool_metric': True,
            'list_metric': [1, 2, 3],
            'dict_metric': {'nested': 'value'},
            'extreme_value': 1e20  # Out of bounds
        }
        
        performance_trends = {}
        metric_comparisons = {}
        
        _process_experiment_metrics(
            invalid_metrics, '2024-01-15', 'test', 
            performance_trends, metric_comparisons
        )
        
        # Should only process the valid metric
        assert '2024-01-15' in performance_trends
        assert 'valid_metric' in performance_trends['2024-01-15']
        assert len(performance_trends['2024-01-15']) == 1
        
        # Invalid metrics should be ignored
        assert 'string_metric' not in performance_trends['2024-01-15']
        assert 'extreme_value' not in performance_trends['2024-01-15']
    
    def test_string_number_conversion(self):
        """Test conversion of string numbers to numeric values."""
        metrics = {
            'string_int': '95',
            'string_float': '0.95',
            'string_negative': '-0.15',
            'invalid_string': 'abc123'
        }
        
        performance_trends = {}
        metric_comparisons = {}
        
        _process_experiment_metrics(
            metrics, '2024-01-15', 'test', 
            performance_trends, metric_comparisons
        )
        
        # Valid string numbers should be converted
        assert performance_trends['2024-01-15']['string_int'] == [95.0]
        assert performance_trends['2024-01-15']['string_float'] == [0.95]
        assert performance_trends['2024-01-15']['string_negative'] == [-0.15]
        
        # Invalid string should be ignored
        assert 'invalid_string' not in performance_trends['2024-01-15']
    
    def test_empty_inputs(self):
        """Test handling of empty or None inputs."""
        performance_trends = {}
        metric_comparisons = {}
        
        # Test with None metrics
        _process_experiment_metrics(None, '2024-01-15', 'test', performance_trends, metric_comparisons)
        assert len(performance_trends) == 0
        
        # Test with empty metrics
        _process_experiment_metrics({}, '2024-01-15', 'test', performance_trends, metric_comparisons)
        # Empty metrics should create the date entry but with no metrics
        assert '2024-01-15' in performance_trends
        assert len(performance_trends['2024-01-15']) == 0
        
        # Test with None date_key
        _process_experiment_metrics({'accuracy': 0.95}, None, 'test', performance_trends, metric_comparisons)
        assert len(performance_trends) == 0
        
        # Test with None exp_type
        _process_experiment_metrics({'accuracy': 0.95}, '2024-01-15', None, performance_trends, metric_comparisons)
        assert len(performance_trends) == 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])