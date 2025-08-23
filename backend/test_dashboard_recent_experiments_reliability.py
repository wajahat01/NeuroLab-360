"""
Comprehensive tests for dashboard recent experiments endpoint reliability and data consistency.
Tests error handling, date parsing, partial results, and data validation.
"""

import pytest
import json
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from flask import Flask

from app import create_app
from routes.dashboard import dashboard_bp
from exceptions import DatabaseError, NetworkError, CircuitBreakerOpenError, ValidationError
from data_validator import validator


class TestDashboardRecentExperimentsReliability:
    """Test suite for dashboard recent experiments endpoint reliability."""
    
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
        return {
            'id': 'test-user-123',
            'email': 'test@example.com'
        }
    
    @pytest.fixture
    def sample_experiments(self):
        """Sample experiment data with various date formats."""
        now = datetime.utcnow()
        return [
            {
                'id': 'exp-1',
                'name': 'Test Experiment 1',
                'experiment_type': 'eeg',
                'status': 'completed',
                'created_at': now.isoformat() + 'Z',
                'user_id': 'test-user-123',
                'description': 'Test description 1'
            },
            {
                'id': 'exp-2',
                'name': 'Test Experiment 2',
                'experiment_type': 'fmri',
                'status': 'active',
                'created_at': (now - timedelta(days=2)).isoformat(),
                'user_id': 'test-user-123',
                'description': 'Test description 2'
            },
            {
                'id': 'exp-3',
                'name': 'Test Experiment 3',
                'experiment_type': 'behavioral',
                'status': 'completed',
                'created_at': (now - timedelta(days=5)).isoformat() + '+00:00',
                'user_id': 'test-user-123',
                'description': 'Test description 3'
            },
            {
                'id': 'exp-4',
                'name': 'Test Experiment 4',
                'experiment_type': 'cognitive',
                'status': 'draft',
                'created_at': 'invalid-date-format',  # Invalid date for testing
                'user_id': 'test-user-123',
                'description': 'Test description 4'
            }
        ]
    
    @pytest.fixture
    def sample_results(self):
        """Sample results data."""
        return [
            {
                'id': 'result-1',
                'experiment_id': 'exp-1',
                'metrics': {'accuracy': 0.95, 'response_time': 250},
                'created_at': datetime.utcnow().isoformat()
            },
            {
                'id': 'result-2',
                'experiment_id': 'exp-2',
                'metrics': {'accuracy': 0.87, 'response_time': 300},
                'created_at': datetime.utcnow().isoformat()
            }
        ]
    
    def test_successful_recent_experiments_retrieval(self, client, auth_headers, mock_user, sample_experiments, sample_results):
        """Test successful retrieval of recent experiments."""
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                # Mock experiments query
                mock_supabase.execute_query.side_effect = [
                    {'success': True, 'data': sample_experiments},
                    {'success': True, 'data': [sample_results[0]]},  # Results for exp-1
                    {'success': True, 'data': [sample_results[1]]},  # Results for exp-2
                    {'success': True, 'data': []},  # No results for exp-3
                    {'success': True, 'data': []}   # No results for exp-4
                ]
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    assert 'experiments' in data
                    assert 'activity_summary' in data
                    assert 'insights' in data
                    assert len(data['experiments']) > 0
                    assert data['activity_summary']['total_recent'] > 0
    
    def test_database_failure_handling(self, client, auth_headers, mock_user):
        """Test graceful handling of database failures."""
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.side_effect = DatabaseError("Connection failed")
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    # No cached data available
                    mock_cache_service.return_value.get.return_value = None
                    mock_cache_service.return_value.get_stale.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    # Should return service unavailable with fallback data
                    assert response.status_code == 503
                    data = response.get_json()
                    assert 'error' in data
                    assert 'fallback_data' in data
    
    def test_database_failure_with_stale_cache(self, client, auth_headers, mock_user, sample_experiments):
        """Test fallback to stale cached data during database failures."""
        stale_data = {
            'experiments': sample_experiments[:2],
            'activity_summary': {'total_recent': 2},
            'last_updated': (datetime.utcnow() - timedelta(hours=2)).isoformat()
        }
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.side_effect = DatabaseError("Connection failed")
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    mock_cache_service.return_value.get_stale.return_value = stale_data
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    assert data['stale'] is True
                    assert 'database_error' in data
                    assert len(data['experiments']) == 2
    
    def test_circuit_breaker_handling(self, client, auth_headers, mock_user):
        """Test circuit breaker functionality."""
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.RetryableOperation') as mock_retry:
                mock_retry.return_value.execute.side_effect = CircuitBreakerOpenError("Service unavailable")
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    mock_cache_service.return_value.get_stale.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 503
                    data = response.get_json()
                    assert 'circuit_breaker_open' in data or 'fallback_data' in data
    
    def test_date_parsing_error_handling(self, client, auth_headers, mock_user):
        """Test handling of various date parsing errors."""
        experiments_with_bad_dates = [
            {
                'id': 'exp-1',
                'name': 'Test Experiment 1',
                'experiment_type': 'eeg',
                'status': 'completed',
                'created_at': 'invalid-date',
                'user_id': 'test-user-123'
            },
            {
                'id': 'exp-2',
                'name': 'Test Experiment 2',
                'experiment_type': 'fmri',
                'status': 'active',
                'created_at': None,
                'user_id': 'test-user-123'
            },
            {
                'id': 'exp-3',
                'name': 'Test Experiment 3',
                'experiment_type': 'behavioral',
                'status': 'completed',
                'created_at': '2024-13-45T25:70:80Z',  # Invalid date values
                'user_id': 'test-user-123'
            }
        ]
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.side_effect = [
                    {'success': True, 'data': experiments_with_bad_dates},
                    {'success': True, 'data': []},  # No results
                    {'success': True, 'data': []},  # No results
                    {'success': True, 'data': []}   # No results
                ]
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should still return experiments despite date parsing errors
                    assert len(data['experiments']) > 0
                    assert 'date_parsing_warnings' in data
                    assert len(data['date_parsing_warnings']) > 0
    
    def test_partial_results_failure_handling(self, client, auth_headers, mock_user, sample_experiments):
        """Test handling when some experiment results fail to load."""
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                # First call returns experiments, subsequent calls for results have mixed success
                mock_supabase.execute_query.side_effect = [
                    {'success': True, 'data': sample_experiments[:3]},  # Experiments query succeeds
                    {'success': True, 'data': [{'id': 'result-1', 'metrics': {'accuracy': 0.95}}]},  # exp-1 results succeed
                    {'success': False, 'error': 'Database timeout'},  # exp-2 results fail
                    DatabaseError("Connection lost")  # exp-3 results throw exception
                ]
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should return partial data
                    assert len(data['experiments']) > 0
                    assert data['partial_failure'] is True
                    assert 'failed_operations' in data
                    assert data['failed_operations']['results_fetch_failures'] > 0
                    
                    # Check that some experiments have results and others have errors
                    experiments_with_results = [exp for exp in data['experiments'] if exp.get('results')]
                    experiments_with_errors = [exp for exp in data['experiments'] if exp.get('results_error')]
                    
                    assert len(experiments_with_results) > 0
                    assert len(experiments_with_errors) > 0
    
    def test_data_validation_and_sanitization(self, client, auth_headers, mock_user):
        """Test data validation and sanitization for experiments and results."""
        malicious_experiments = [
            {
                'id': 'exp-1',
                'name': '<script>alert("xss")</script>Test Experiment',
                'experiment_type': 'eeg',
                'status': 'completed',
                'created_at': datetime.utcnow().isoformat(),
                'user_id': 'test-user-123',
                'description': 'Test with <b>HTML</b> content'
            }
        ]
        
        malicious_results = [
            {
                'id': 'result-1',
                'experiment_id': 'exp-1',
                'metrics': {
                    'accuracy': 0.95,
                    'malicious_field': '<script>alert("xss")</script>',
                    'sql_injection': "'; DROP TABLE users; --"
                },
                'created_at': datetime.utcnow().isoformat()
            }
        ]
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.side_effect = [
                    {'success': True, 'data': malicious_experiments},
                    {'success': True, 'data': malicious_results}
                ]
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Check that malicious content has been sanitized
                    experiment = data['experiments'][0]
                    assert '<script>' not in experiment['name']
                    assert '<b>' not in experiment['description']
                    
                    # Check that result metrics have been sanitized
                    if experiment.get('results') and experiment['results'].get('metrics'):
                        metrics = experiment['results']['metrics']
                        for key, value in metrics.items():
                            if isinstance(value, str):
                                assert '<script>' not in value
                                assert 'DROP TABLE' not in value
    
    def test_activity_summary_generation(self, client, auth_headers, mock_user, sample_experiments):
        """Test activity summary generation with various experiment types and statuses."""
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.side_effect = [
                    {'success': True, 'data': sample_experiments},
                    {'success': True, 'data': []},  # No results for all experiments
                    {'success': True, 'data': []},
                    {'success': True, 'data': []},
                    {'success': True, 'data': []}
                ]
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    summary = data['activity_summary']
                    assert summary['total_recent'] > 0
                    assert 'by_type' in summary
                    assert 'by_status' in summary
                    assert 'completion_rate' in summary
                    assert 'with_results' in summary
                    assert 'without_results' in summary
                    
                    # Check that different experiment types are counted
                    assert len(summary['by_type']) > 1
                    assert len(summary['by_status']) > 1
    
    def test_insights_generation(self, client, auth_headers, mock_user, sample_experiments, sample_results):
        """Test insights and achievements generation."""
        # Create experiments with high completion rate
        completed_experiments = []
        for i in range(5):
            exp = sample_experiments[0].copy()
            exp['id'] = f'exp-{i}'
            exp['status'] = 'completed'
            completed_experiments.append(exp)
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                # Return completed experiments and some results
                results_responses = [{'success': True, 'data': completed_experiments}]
                for _ in completed_experiments:
                    results_responses.append({'success': True, 'data': [sample_results[0]]})
                
                mock_supabase.execute_query.side_effect = results_responses
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    insights = data['insights']
                    assert len(insights) > 0
                    
                    # Should have insights for streak, completion rate, and data quality
                    insight_types = [insight['type'] for insight in insights]
                    assert 'streak' in insight_types
                    assert 'completion' in insight_types
                    assert 'data_quality' in insight_types
    
    def test_caching_behavior(self, client, auth_headers, mock_user, sample_experiments):
        """Test caching behavior for recent experiments."""
        cached_data = {
            'experiments': sample_experiments[:2],
            'activity_summary': {'total_recent': 2},
            'last_updated': datetime.utcnow().isoformat()
        }
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                # First call returns cached data
                mock_cache_service.return_value.get.return_value = cached_data
                
                response = client.get('/api/dashboard/recent', headers=auth_headers)
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Should return cached data
                assert data['cached'] is True
                assert len(data['experiments']) == 2
                
                # Verify cache was accessed
                mock_cache_service.return_value.get.assert_called_once()
    
    def test_force_refresh_bypasses_cache(self, client, auth_headers, mock_user, sample_experiments):
        """Test that force_refresh parameter bypasses cache."""
        cached_data = {
            'experiments': sample_experiments[:1],
            'activity_summary': {'total_recent': 1}
        }
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.side_effect = lambda key, default='false': 'true' if key == 'force_refresh' else default
            mock_request.args.to_dict.return_value = {'force_refresh': 'true'}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.side_effect = [
                    {'success': True, 'data': sample_experiments},
                    {'success': True, 'data': []},
                    {'success': True, 'data': []},
                    {'success': True, 'data': []},
                    {'success': True, 'data': []}
                ]
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = cached_data
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should not return cached data
                    assert 'cached' not in data or data.get('cached') is False
                    assert len(data['experiments']) > 1  # Should get fresh data
    
    def test_parameter_validation(self, client, auth_headers, mock_user):
        """Test parameter validation for limit and days."""
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            
            # Test with invalid parameters that should be validated by middleware
            mock_request.validated_params = {'limit': 200, 'days': 500}  # Exceeds max values
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.return_value = {'success': True, 'data': []}
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    # Should still work but with validated parameters
                    assert response.status_code == 200
    
    def test_comprehensive_error_logging(self, client, auth_headers, mock_user, caplog):
        """Test that errors are properly logged for debugging."""
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.side_effect = DatabaseError("Test database error")
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    mock_cache_service.return_value.get_stale.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    # Check that error was logged
                    assert "Database/Network error in recent experiments" in caplog.text
                    assert "Test database error" in caplog.text


if __name__ == '__main__':
    pytest.main([__file__, '-v'])