"""
Simple tests for dashboard health check system.
Tests core health check functionality without complex mocking.
"""

import pytest
import json
from unittest.mock import Mock, patch

from app import create_app


class TestDashboardHealthSimple:
    """Simple test suite for dashboard health check endpoints."""
    
    @pytest.fixture
    def app(self):
        """Create test application."""
        app = create_app()
        app.config['TESTING'] = True
        return app
    
    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return app.test_client()
    
    def test_database_health_endpoint_healthy(self, client):
        """Test database health endpoint when database is healthy."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            mock_supabase.execute_query.return_value = {
                'success': True,
                'data': [{'id': 'test'}]
            }
            
            response = client.get('/api/dashboard/health/database')
            
            assert response.status_code == 200
            data = json.loads(response.data)
            
            assert data['service'] == 'dashboard_database'
            assert data['status'] == 'healthy'
            assert data['connection'] == 'established'
            assert data['query_success'] is True
            assert 'response_time_ms' in data
    
    def test_database_health_endpoint_unhealthy(self, client):
        """Test database health endpoint when database is unhealthy."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            mock_supabase.execute_query.return_value = {
                'success': False,
                'error': 'Connection failed'
            }
            
            response = client.get('/api/dashboard/health/database')
            
            assert response.status_code == 503
            data = json.loads(response.data)
            
            assert data['service'] == 'dashboard_database'
            assert data['status'] == 'unhealthy'
            assert data['connection'] == 'failed'
            assert data['query_success'] is False
            assert data['error'] == 'Connection failed'
    
    def test_cache_health_endpoint_healthy(self, client):
        """Test cache health endpoint when cache is healthy."""
        with patch('routes.dashboard.get_cache_service') as mock_cache_service:
            mock_cache = Mock()
            mock_cache.get.return_value = {'test': True}
            mock_cache.set.return_value = None
            mock_cache.get_stats.return_value = {'hit_rate': 0.85}
            mock_cache.redis_cache = Mock()
            mock_cache.redis_cache.available = True
            mock_cache_service.return_value = mock_cache
            
            response = client.get('/api/dashboard/health/cache')
            
            assert response.status_code == 200
            data = json.loads(response.data)
            
            assert data['service'] == 'dashboard_cache'
            assert data['status'] == 'healthy'
            assert data['available'] is True
            assert data['read_write_success'] is True
    
    def test_cache_health_endpoint_unavailable(self, client):
        """Test cache health endpoint when cache is unavailable."""
        with patch('routes.dashboard.get_cache_service', return_value=None):
            response = client.get('/api/dashboard/health/cache')
            
            assert response.status_code == 503
            data = json.loads(response.data)
            
            assert data['service'] == 'dashboard_cache'
            assert data['status'] == 'unhealthy'
            assert data['available'] is False
    
    def test_components_health_endpoint(self, client):
        """Test components health endpoint."""
        response = client.get('/api/dashboard/health/components')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert data['service'] == 'dashboard_components'
        assert data['status'] == 'healthy'
        assert 'components' in data
        assert 'summary' in data
        
        # Check that all expected components are present
        expected_components = ['summary', 'charts', 'recent_experiments']
        for component in expected_components:
            assert component in data['components']
            assert 'status' in data['components'][component]
            assert 'functional' in data['components'][component]
            assert 'response_time_ms' in data['components'][component]
    
    def test_main_health_endpoint_with_mocked_services(self, client):
        """Test main health endpoint with mocked services."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                # Setup healthy database
                mock_supabase.execute_query.return_value = {
                    'success': True,
                    'data': [{'id': 'test'}]
                }
                
                # Setup healthy cache
                mock_cache = Mock()
                mock_cache.get.return_value = {'test': True}
                mock_cache.set.return_value = None
                mock_cache.get_stats.return_value = {'hit_rate': 0.85}
                mock_cache.redis_cache = Mock()
                mock_cache.redis_cache.available = True
                mock_cache_service.return_value = mock_cache
                
                response = client.get('/api/dashboard/health')
                
                assert response.status_code == 200
                data = json.loads(response.data)
                
                assert data['service'] == 'dashboard'
                assert data['status'] in ['healthy', 'degraded']  # May be degraded due to system metrics
                assert 'checks' in data
                assert 'performance_metrics' in data
                assert 'circuit_breakers' in data
    
    def test_health_endpoint_response_format(self, client):
        """Test that health endpoints return properly formatted responses."""
        # Test main health endpoint
        response = client.get('/api/dashboard/health')
        data = json.loads(response.data)
        
        # Required fields for main health check
        required_fields = ['service', 'status', 'timestamp', 'version', 'checks']
        for field in required_fields:
            assert field in data, f"Missing required field: {field}"
        
        # Status should be valid
        assert data['status'] in ['healthy', 'degraded', 'unhealthy']
        
        # Test individual endpoints
        endpoints = [
            '/api/dashboard/health/database',
            '/api/dashboard/health/cache',
            '/api/dashboard/health/components'
        ]
        
        for endpoint in endpoints:
            response = client.get(endpoint)
            data = json.loads(response.data)
            
            assert 'service' in data
            assert 'status' in data
            assert 'timestamp' in data
            assert data['status'] in ['healthy', 'degraded', 'unhealthy']
    
    def test_health_check_error_handling(self, client):
        """Test health check error handling."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            # Test exception in database health check
            mock_supabase.execute_query.side_effect = Exception("Unexpected error")
            
            response = client.get('/api/dashboard/health/database')
            
            assert response.status_code == 503
            data = json.loads(response.data)
            
            assert data['status'] == 'unhealthy'
            assert data['connection'] == 'failed'
            assert 'Unexpected error' in data['error']