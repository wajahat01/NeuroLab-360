"""
Integration tests for dashboard recent experiments endpoint.
Tests the actual endpoint functionality with mocked dependencies.
"""

import pytest
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock
from flask import Flask

from app import create_app


class TestDashboardRecentExperimentsIntegration:
    """Integration test suite for recent experiments endpoint."""
    
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
    def mock_user(self):
        """Mock user data."""
        return {
            'id': '550e8400-e29b-41d4-a716-446655440000',
            'email': 'test@example.com'
        }
    
    @pytest.fixture
    def sample_experiments(self):
        """Sample experiment data with proper UUIDs and timezone-aware dates."""
        now = datetime.now(timezone.utc)
        return [
            {
                'id': '550e8400-e29b-41d4-a716-446655440001',
                'name': 'Test Experiment 1',
                'experiment_type': 'eeg',
                'status': 'completed',
                'created_at': now.isoformat(),
                'user_id': '550e8400-e29b-41d4-a716-446655440000',
                'description': 'Test description 1'
            },
            {
                'id': '550e8400-e29b-41d4-a716-446655440002',
                'name': 'Test Experiment 2',
                'experiment_type': 'fmri',
                'status': 'active',
                'created_at': (now - timedelta(days=2)).isoformat(),
                'user_id': '550e8400-e29b-41d4-a716-446655440000',
                'description': 'Test description 2'
            }
        ]
    
    def test_successful_recent_experiments_basic(self, client, mock_user, sample_experiments):
        """Test basic successful retrieval of recent experiments."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            # Mock the get_user_from_token method
            mock_supabase.get_user_from_token.return_value = mock_user
            
            # Mock experiments query
            mock_supabase.execute_query.side_effect = [
                {'success': True, 'data': sample_experiments},
                {'success': True, 'data': []},  # No results for exp-1
                {'success': True, 'data': []}   # No results for exp-2
            ]
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                mock_cache_service.return_value.get.return_value = None
                mock_cache_service.return_value.set.return_value = None
                
                response = client.get('/api/dashboard/recent', headers={
                    'Authorization': 'Bearer test_token'
                })
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Verify response structure
                assert 'experiments' in data
                assert 'activity_summary' in data
                assert 'insights' in data
                assert 'period' in data
                
                # Verify experiments data
                assert len(data['experiments']) > 0
                assert data['activity_summary']['total_recent'] > 0
    
    def test_empty_experiments_response(self, client, mock_user):
        """Test handling of empty experiments response."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            mock_supabase.get_user_from_token.return_value = mock_user
            mock_supabase.execute_query.return_value = {'success': True, 'data': []}
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                mock_cache_service.return_value.get.return_value = None
                
                response = client.get('/api/dashboard/recent', headers={
                    'Authorization': 'Bearer test_token'
                })
                
                assert response.status_code == 200
                data = response.get_json()
                
                assert data['experiments'] == []
                assert data['activity_summary']['total_recent'] == 0
    
    def test_authentication_required(self, client):
        """Test that authentication is required."""
        response = client.get('/api/dashboard/recent')
        assert response.status_code == 401
    
    def test_invalid_token(self, client):
        """Test handling of invalid authentication token."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            mock_supabase.get_user_from_token.return_value = None
            
            response = client.get('/api/dashboard/recent', headers={
                'Authorization': 'Bearer invalid_token'
            })
            
            assert response.status_code == 401
    
    def test_query_parameters(self, client, mock_user, sample_experiments):
        """Test handling of query parameters."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            mock_supabase.get_user_from_token.return_value = mock_user
            mock_supabase.execute_query.side_effect = [
                {'success': True, 'data': sample_experiments},
                {'success': True, 'data': []},
                {'success': True, 'data': []}
            ]
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                mock_cache_service.return_value.get.return_value = None
                
                # Test with custom parameters
                response = client.get('/api/dashboard/recent?limit=5&days=14', headers={
                    'Authorization': 'Bearer test_token'
                })
                
                assert response.status_code == 200
                data = response.get_json()
                
                assert data['period']['days'] == 14
                assert data['period']['limit'] == 5
    
    def test_caching_functionality(self, client, mock_user, sample_experiments):
        """Test caching functionality."""
        cached_data = {
            'experiments': sample_experiments[:1],
            'activity_summary': {'total_recent': 1},
            'last_updated': datetime.now(timezone.utc).isoformat(),
            'cached': True
        }
        
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            mock_supabase.get_user_from_token.return_value = mock_user
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                # Return cached data
                mock_cache_service.return_value.get.return_value = cached_data
                
                response = client.get('/api/dashboard/recent', headers={
                    'Authorization': 'Bearer test_token'
                })
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Should return cached data
                assert data['cached'] is True
                assert len(data['experiments']) == 1
    
    def test_date_parsing_resilience(self, client, mock_user):
        """Test resilience to date parsing issues."""
        experiments_with_bad_dates = [
            {
                'id': '550e8400-e29b-41d4-a716-446655440001',
                'name': 'Test Experiment 1',
                'experiment_type': 'eeg',
                'status': 'completed',
                'created_at': 'invalid-date-format',
                'user_id': '550e8400-e29b-41d4-a716-446655440000'
            }
        ]
        
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            mock_supabase.get_user_from_token.return_value = mock_user
            mock_supabase.execute_query.side_effect = [
                {'success': True, 'data': experiments_with_bad_dates},
                {'success': True, 'data': []}
            ]
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                mock_cache_service.return_value.get.return_value = None
                
                response = client.get('/api/dashboard/recent', headers={
                    'Authorization': 'Bearer test_token'
                })
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Should still return experiments despite date parsing errors
                assert len(data['experiments']) > 0
                assert 'date_parsing_warnings' in data
                assert len(data['date_parsing_warnings']) > 0
    
    def test_partial_results_handling(self, client, mock_user, sample_experiments):
        """Test handling of partial results failures."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            mock_supabase.get_user_from_token.return_value = mock_user
            
            # First call returns experiments, second call fails
            mock_supabase.execute_query.side_effect = [
                {'success': True, 'data': sample_experiments},
                {'success': True, 'data': [{'id': 'result-1', 'metrics': {'accuracy': 0.95}}]},
                {'success': False, 'error': 'Database timeout'}
            ]
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                mock_cache_service.return_value.get.return_value = None
                
                response = client.get('/api/dashboard/recent', headers={
                    'Authorization': 'Bearer test_token'
                })
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Should return partial data
                assert len(data['experiments']) > 0
                assert data['partial_failure'] is True
                assert 'failed_operations' in data
    
    def test_response_structure_completeness(self, client, mock_user, sample_experiments):
        """Test that response contains all expected fields."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            mock_supabase.get_user_from_token.return_value = mock_user
            mock_supabase.execute_query.side_effect = [
                {'success': True, 'data': sample_experiments},
                {'success': True, 'data': []},
                {'success': True, 'data': []}
            ]
            
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                mock_cache_service.return_value.get.return_value = None
                
                response = client.get('/api/dashboard/recent', headers={
                    'Authorization': 'Bearer test_token'
                })
                
                assert response.status_code == 200
                data = response.get_json()
                
                # Check all required fields are present
                required_fields = [
                    'experiments', 'activity_summary', 'insights', 'period',
                    'last_updated', 'partial_failure', 'failed_operations',
                    'data_sources', 'date_parsing_warnings', 'cache_info'
                ]
                
                for field in required_fields:
                    assert field in data, f"Missing required field: {field}"
                
                # Check activity_summary structure
                activity_summary = data['activity_summary']
                summary_fields = [
                    'total_recent', 'by_type', 'by_status', 'completion_rate',
                    'with_results', 'without_results'
                ]
                
                for field in summary_fields:
                    assert field in activity_summary, f"Missing activity_summary field: {field}"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])