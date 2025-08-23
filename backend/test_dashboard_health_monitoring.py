"""
Monitoring integration tests for dashboard health check system.
Tests health check monitoring and alerting functionality.
"""

import pytest
import json
import time
from unittest.mock import Mock, patch
from datetime import datetime

from app import create_app
from retry_logic import get_database_circuit_breaker, get_api_circuit_breaker, CircuitBreakerState


class TestDashboardHealthMonitoring:
    """Test suite for dashboard health check monitoring."""
    
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
    
    def setup_method(self):
        """Reset circuit breaker states before each test."""
        # Reset database circuit breaker
        db_cb = get_database_circuit_breaker()
        db_cb.state = CircuitBreakerState.CLOSED
        db_cb.failure_count = 0
        db_cb.last_failure_time = None
        
        # Reset API circuit breaker
        api_cb = get_api_circuit_breaker()
        api_cb.state = CircuitBreakerState.CLOSED
        api_cb.failure_count = 0
        api_cb.last_failure_time = None
    
    def test_health_check_circuit_breaker_monitoring(self, client):
        """Test health check monitoring of circuit breaker states."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                # Setup healthy services
                mock_supabase.execute_query.return_value = {
                    'success': True,
                    'data': [{'id': 'test'}]
                }
                
                mock_cache = Mock()
                mock_cache.get.return_value = {'test': True}
                mock_cache.set.return_value = None
                mock_cache.get_stats.return_value = {'hit_rate': 0.85}
                mock_cache.redis_cache = Mock()
                mock_cache.redis_cache.available = True
                mock_cache_service.return_value = mock_cache
                
                # Test with closed circuit breakers (healthy)
                response = client.get('/api/dashboard/health')
                data = json.loads(response.data)
                
                assert 'circuit_breakers' in data
                assert 'database' in data['circuit_breakers']
                assert 'api' in data['circuit_breakers']
                
                # Both should be healthy initially
                assert data['circuit_breakers']['database']['healthy'] is True
                assert data['circuit_breakers']['api']['healthy'] is True
                
                # Manually trigger circuit breaker failure
                db_cb = get_database_circuit_breaker()
                for _ in range(5):  # Trigger failure threshold
                    db_cb.record_failure()
                
                response = client.get('/api/dashboard/health')
                data = json.loads(response.data)
                
                # Database circuit breaker should now be open
                assert data['circuit_breakers']['database']['state'] == 'open'
                assert data['circuit_breakers']['database']['healthy'] is False
                assert data['circuit_breakers']['database']['failure_count'] == 5
                
                # Overall status should be degraded
                assert data['status'] == 'degraded'
                assert 'degraded_services' in data
                assert 'circuit_breaker_database' in data['degraded_services']
    
    def test_health_check_performance_metrics_collection(self, client):
        """Test health check performance metrics collection."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                with patch('routes.dashboard.error_handler') as mock_error_handler:
                    # Setup services
                    mock_supabase.execute_query.return_value = {
                        'success': True,
                        'data': [{'id': 'test'}]
                    }
                    
                    mock_cache = Mock()
                    mock_cache.get.return_value = {'test': True}
                    mock_cache.set.return_value = None
                    mock_cache.get_stats.return_value = {
                        'hit_rate': 0.92,
                        'total_requests': 5000,
                        'memory_usage': 75
                    }
                    mock_cache.redis_cache = Mock()
                    mock_cache.redis_cache.available = True
                    mock_cache_service.return_value = mock_cache
                    
                    # Mock error metrics
                    mock_error_metrics = Mock()
                    mock_error_metrics.error_counts = {
                        '/api/dashboard/summary:DatabaseError': 5,
                        '/api/dashboard/charts:ValidationError': 2
                    }
                    mock_error_handler.error_metrics = mock_error_metrics
                    
                    response = client.get('/api/dashboard/health')
                    data = json.loads(response.data)
                    
                    # Check performance metrics
                    assert 'performance_metrics' in data
                    metrics = data['performance_metrics']
                    
                    # Check error metrics
                    assert 'errors' in metrics
                    assert 'total_errors' in metrics['errors']
                    assert 'error_rates' in metrics['errors']
                    
                    # Check cache metrics
                    assert 'cache' in metrics
                    assert metrics['cache']['hit_rate'] == 0.92
                    assert metrics['cache']['total_requests'] == 5000
                    
                    # Check system metrics (if available)
                    assert 'system' in metrics
                    
                    # Check collection timestamp
                    assert 'collection_timestamp' in metrics
                    timestamp = datetime.fromisoformat(metrics['collection_timestamp'])
                    now = datetime.utcnow()
                    time_diff = abs((now - timestamp).total_seconds())
                    assert time_diff < 5  # Within 5 seconds
    
    def test_health_check_component_monitoring(self, client):
        """Test health check monitoring of individual components."""
        response = client.get('/api/dashboard/health/components')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # Check component monitoring structure
        assert 'components' in data
        assert 'summary' in data
        
        expected_components = ['summary', 'charts', 'recent_experiments']
        for component in expected_components:
            assert component in data['components']
            
            component_data = data['components'][component]
            
            # Each component should have monitoring data
            assert 'status' in component_data
            assert 'functional' in component_data
            assert 'response_time_ms' in component_data
            assert 'message' in component_data
            
            # Status should be valid
            assert component_data['status'] in ['healthy', 'degraded', 'unhealthy']
            
            # Response time should be reasonable
            assert component_data['response_time_ms'] >= 0
            assert component_data['response_time_ms'] < 5000  # Less than 5 seconds
        
        # Check summary statistics
        summary = data['summary']
        assert 'total_components' in summary
        assert 'healthy_components' in summary
        assert 'degraded_components' in summary
        assert 'unhealthy_components' in summary
        
        # Totals should match
        total_checked = (summary['healthy_components'] + 
                        summary['degraded_components'] + 
                        summary['unhealthy_components'])
        assert total_checked == summary['total_components']
        assert summary['total_components'] == len(expected_components)
    
    def test_health_check_service_degradation_detection(self, client):
        """Test health check detection of service degradation."""
        # Test database degradation (slow response)
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            # Simulate slow database response
            def slow_query(*args, **kwargs):
                time.sleep(0.6)  # 600ms - should be marked as degraded
                return {'success': True, 'data': [{'id': 'test'}]}
            
            mock_supabase.execute_query.side_effect = slow_query
            
            response = client.get('/api/dashboard/health/database')
            data = json.loads(response.data)
            
            # Should be marked as degraded due to slow response
            assert data['status'] == 'degraded'
            assert data['response_time_ms'] >= 600
            assert 'responding' in data['message'].lower()  # Should indicate response time
        
        # Test cache degradation
        with patch('routes.dashboard.get_cache_service') as mock_cache_service:
            mock_cache = Mock()
            mock_cache.get.return_value = {'test': True}
            mock_cache.set.return_value = None
            mock_cache.get_stats.return_value = {'hit_rate': 0.85}
            mock_cache.redis_cache = Mock()
            mock_cache.redis_cache.available = True
            mock_cache_service.return_value = mock_cache
            
            # Simulate slow cache response
            def slow_cache_operation(*args, **kwargs):
                time.sleep(0.15)  # 150ms - should be marked as degraded
                return {'test': True}
            
            mock_cache.get.side_effect = slow_cache_operation
            
            response = client.get('/api/dashboard/health/cache')
            data = json.loads(response.data)
            
            # Should be marked as degraded due to slow response
            assert data['status'] == 'degraded'
            assert data['response_time_ms'] >= 150
    
    def test_health_check_failure_recovery_monitoring(self, client):
        """Test health check monitoring of failure recovery."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                # First: simulate service failure
                mock_supabase.execute_query.side_effect = Exception("Database connection lost")
                mock_cache_service.return_value = None
                
                response = client.get('/api/dashboard/health')
                
                assert response.status_code == 503
                data = json.loads(response.data)
                assert data['status'] == 'unhealthy'
                
                # Second: simulate service recovery
                mock_supabase.execute_query.side_effect = None
                mock_supabase.execute_query.return_value = {
                    'success': True,
                    'data': [{'id': 'recovered'}]
                }
                
                mock_cache = Mock()
                mock_cache.get.return_value = {'test': True}
                mock_cache.set.return_value = None
                mock_cache.get_stats.return_value = {'hit_rate': 0.80}
                mock_cache.redis_cache = Mock()
                mock_cache.redis_cache.available = True
                mock_cache_service.return_value = mock_cache
                
                response = client.get('/api/dashboard/health')
                
                # Should recover to healthy status
                assert response.status_code == 200
                data = json.loads(response.data)
                assert data['status'] in ['healthy', 'degraded']  # May be degraded due to system metrics
                
                # Services should show as recovered
                assert data['checks']['database']['status'] in ['healthy', 'degraded']
                assert data['checks']['cache']['status'] == 'healthy'
    
    def test_health_check_monitoring_timestamps(self, client):
        """Test health check monitoring includes proper timestamps."""
        response = client.get('/api/dashboard/health')
        data = json.loads(response.data)
        
        # Main health check should have timestamp
        assert 'timestamp' in data
        main_timestamp = datetime.fromisoformat(data['timestamp'])
        
        # Performance metrics should have collection timestamp
        if 'performance_metrics' in data:
            assert 'collection_timestamp' in data['performance_metrics']
            metrics_timestamp = datetime.fromisoformat(data['performance_metrics']['collection_timestamp'])
            
            # Timestamps should be close to each other and current time
            now = datetime.utcnow()
            assert abs((now - main_timestamp).total_seconds()) < 5
            assert abs((now - metrics_timestamp).total_seconds()) < 5
            assert abs((main_timestamp - metrics_timestamp).total_seconds()) < 2
        
        # Individual endpoints should also have timestamps
        endpoints = [
            '/api/dashboard/health/database',
            '/api/dashboard/health/cache',
            '/api/dashboard/health/components'
        ]
        
        for endpoint in endpoints:
            response = client.get(endpoint)
            data = json.loads(response.data)
            
            assert 'timestamp' in data
            endpoint_timestamp = datetime.fromisoformat(data['timestamp'])
            
            # Should be recent
            now = datetime.utcnow()
            assert abs((now - endpoint_timestamp).total_seconds()) < 5
    
    def test_health_check_monitoring_consistency(self, client):
        """Test health check monitoring consistency across multiple calls."""
        # Make multiple health check calls
        responses = []
        for _ in range(3):
            response = client.get('/api/dashboard/health')
            responses.append(json.loads(response.data))
            time.sleep(0.1)  # Small delay between calls
        
        # All responses should have consistent structure
        for data in responses:
            assert 'service' in data
            assert 'status' in data
            assert 'timestamp' in data
            assert 'checks' in data
            
            # Status should be consistent (assuming no real changes)
            assert data['status'] in ['healthy', 'degraded', 'unhealthy']
        
        # Timestamps should be different but close
        timestamps = [datetime.fromisoformat(r['timestamp']) for r in responses]
        for i in range(1, len(timestamps)):
            time_diff = abs((timestamps[i] - timestamps[i-1]).total_seconds())
            assert 0.05 < time_diff < 1.0  # Between 50ms and 1 second
    
    def test_health_check_monitoring_error_tracking(self, client):
        """Test health check monitoring tracks errors properly."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            # Simulate database error
            mock_supabase.execute_query.side_effect = Exception("Connection timeout")
            
            response = client.get('/api/dashboard/health/database')
            data = json.loads(response.data)
            
            # Error should be tracked
            assert data['status'] == 'unhealthy'
            assert 'error' in data
            assert 'Connection timeout' in data['error']
            assert 'response_time_ms' in data
            
            # Error should include context
            assert data['connection'] == 'failed'
            assert data['query_success'] is False