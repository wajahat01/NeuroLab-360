"""
Integration tests for dashboard health check system.
Tests health check functionality with real service interactions.
"""

import pytest
import json
import time
from unittest.mock import Mock, patch
from datetime import datetime

from app import create_app
from cache_service import get_cache_service
from supabase_client import get_supabase_client
from retry_logic import get_database_circuit_breaker, get_api_circuit_breaker, CircuitBreakerState


class TestDashboardHealthIntegration:
    """Integration test suite for dashboard health check system."""
    
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
    
    def test_health_check_with_real_cache_service(self, client):
        """Test health check with real cache service integration."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            # Setup healthy database response
            mock_supabase.execute_query.return_value = {
                'success': True,
                'data': [{'id': 'test_experiment'}]
            }
            
            # Use real cache service
            cache_service = get_cache_service()
            
            with patch('psutil.cpu_percent', return_value=30.0):
                with patch('psutil.virtual_memory') as mock_memory:
                    with patch('psutil.disk_usage') as mock_disk:
                        mock_memory.return_value.percent = 50.0
                        mock_disk.return_value.percent = 30.0
                        
                        response = client.get('/api/dashboard/health')
                        
                        assert response.status_code == 200
                        data = json.loads(response.data)
                        
                        assert data['status'] in ['healthy', 'degraded']
                        
                        # Check cache health with real service
                        cache_health = data['checks']['cache']
                        if cache_service:
                            assert cache_health['available'] is True
                            # Cache operations should work
                            assert 'response_time_ms' in cache_health
                        else:
                            assert cache_health['available'] is False
    
    def test_health_check_database_connectivity_real(self, client):
        """Test health check with real database connectivity patterns."""
        # Test with mocked successful connection
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            mock_supabase.execute_query.return_value = {
                'success': True,
                'data': [{'id': 'real_test'}]
            }
            
            response = client.get('/api/dashboard/health/database')
            
            assert response.status_code == 200
            data = json.loads(response.data)
            
            assert data['status'] == 'healthy'
            assert data['connection'] == 'established'
            assert data['query_success'] is True
            assert data['response_time_ms'] > 0
        
        # Test with connection failure
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            mock_supabase.execute_query.return_value = {
                'success': False,
                'error': 'Network timeout'
            }
            
            response = client.get('/api/dashboard/health/database')
            
            assert response.status_code == 503
            data = json.loads(response.data)
            
            assert data['status'] == 'unhealthy'
            assert data['connection'] == 'failed'
            assert data['query_success'] is False
            assert data['error'] == 'Network timeout'
    
    def test_health_check_circuit_breaker_integration(self, client):
        """Test health check integration with real circuit breaker states."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                with patch('psutil.cpu_percent', return_value=25.0):
                    with patch('psutil.virtual_memory') as mock_memory:
                        with patch('psutil.disk_usage') as mock_disk:
                            # Setup healthy services
                            mock_supabase.execute_query.return_value = {
                                'success': True,
                                'data': [{'id': 'test'}]
                            }
                            
                            mock_cache = Mock()
                            mock_cache.get.return_value = {'test': True}
                            mock_cache.set.return_value = None
                            mock_cache.delete.return_value = None
                            mock_cache.get_stats.return_value = {'hit_rate': 0.85}
                            mock_cache.redis_cache = Mock()
                            mock_cache.redis_cache.available = True
                            mock_cache_service.return_value = mock_cache
                            
                            mock_memory.return_value.percent = 60.0
                            mock_disk.return_value.percent = 40.0
                            
                            # Test with closed circuit breakers (healthy)
                            response = client.get('/api/dashboard/health')
                            data = json.loads(response.data)
                            
                            assert data['circuit_breakers']['database']['state'] == 'closed'
                            assert data['circuit_breakers']['database']['healthy'] is True
                            assert data['circuit_breakers']['api']['state'] == 'closed'
                            assert data['circuit_breakers']['api']['healthy'] is True
                            
                            # Manually trigger circuit breaker failure
                            db_cb = get_database_circuit_breaker()
                            for _ in range(5):  # Trigger failure threshold
                                db_cb.record_failure()
                            
                            response = client.get('/api/dashboard/health')
                            data = json.loads(response.data)
                            
                            assert data['circuit_breakers']['database']['state'] == 'open'
                            assert data['circuit_breakers']['database']['healthy'] is False
                            assert data['circuit_breakers']['database']['failure_count'] == 5
                            assert data['status'] == 'degraded'
                            assert 'circuit_breaker_database' in data['degraded_services']
    
    def test_health_check_performance_monitoring_integration(self, client):
        """Test health check performance monitoring with realistic scenarios."""
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                # Simulate slow database response
                def slow_db_query(*args, **kwargs):
                    time.sleep(0.2)  # 200ms delay
                    return {'success': True, 'data': [{'id': 'test'}]}
                
                mock_supabase.execute_query.side_effect = slow_db_query
                
                # Setup cache service
                mock_cache = Mock()
                mock_cache.get.return_value = {'test': True}
                mock_cache.set.return_value = None
                mock_cache.delete.return_value = None
                mock_cache.get_stats.return_value = {
                    'hit_rate': 0.75,
                    'total_requests': 2500,
                    'memory_usage': 85
                }
                mock_cache.redis_cache = Mock()
                mock_cache.redis_cache.available = True
                mock_cache_service.return_value = mock_cache
                
                with patch('psutil.cpu_percent', return_value=75.0):
                    with patch('psutil.virtual_memory') as mock_memory:
                        with patch('psutil.disk_usage') as mock_disk:
                            mock_memory.return_value.percent = 85.0
                            mock_disk.return_value.percent = 60.0
                            
                            start_time = time.time()
                            response = client.get('/api/dashboard/health')
                            end_time = time.time()
                            
                            # Health check should complete despite slow database
                            assert (end_time - start_time) < 1.0  # Should complete within 1 second
                            
                            data = json.loads(response.data)
                            
                            # Database should be marked as degraded due to slow response
                            assert data['checks']['database']['status'] in ['degraded', 'unhealthy']
                            assert data['checks']['database']['response_time_ms'] >= 200
                            
                            # Performance metrics should reflect system load
                            metrics = data['performance_metrics']
                            assert metrics['system']['cpu_percent'] == 75.0
                            assert metrics['system']['memory_percent'] == 85.0
                            assert metrics['system']['disk_usage_percent'] == 60.0
                            
                            # Cache metrics should be included
                            assert metrics['cache']['hit_rate'] == 0.75
                            assert metrics['cache']['total_requests'] == 2500
    
    def test_health_check_component_functionality_integration(self, client):
        """Test health check component functionality with realistic component testing."""
        response = client.get('/api/dashboard/health/components')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # All components should be tested
        expected_components = ['summary', 'charts', 'recent_experiments']
        for component in expected_components:
            assert component in data['components']
            
            component_data = data['components'][component]
            assert component_data['functional'] is True
            assert component_data['status'] in ['healthy', 'degraded']
            assert component_data['response_time_ms'] >= 0
            
            # Component tests should be fast
            assert component_data['response_time_ms'] < 1000  # Less than 1 second
        
        # Summary should show correct counts
        summary = data['summary']
        assert summary['total_components'] == len(expected_components)
        assert summary['healthy_components'] >= 0
        assert summary['degraded_components'] >= 0
        assert summary['unhealthy_components'] >= 0
        
        # Total should match
        total_checked = (summary['healthy_components'] + 
                        summary['degraded_components'] + 
                        summary['unhealthy_components'])
        assert total_checked == summary['total_components']
    
    def test_health_check_error_recovery_integration(self, client):
        """Test health check error recovery and resilience."""
        # Test partial service failure recovery
        with patch('routes.dashboard.supabase_client') as mock_supabase:
            with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                # First request: database fails
                mock_supabase.execute_query.side_effect = Exception("Database connection lost")
                mock_cache_service.return_value = None  # Cache also unavailable
                
                with patch('psutil.cpu_percent', return_value=50.0):
                    with patch('psutil.virtual_memory') as mock_memory:
                        with patch('psutil.disk_usage') as mock_disk:
                            mock_memory.return_value.percent = 70.0
                            mock_disk.return_value.percent = 45.0
                            
                            response = client.get('/api/dashboard/health')
                            
                            assert response.status_code == 503
                            data = json.loads(response.data)
                            assert data['status'] == 'unhealthy'
                
                # Second request: services recover
                mock_supabase.execute_query.side_effect = None
                mock_supabase.execute_query.return_value = {
                    'success': True,
                    'data': [{'id': 'recovered'}]
                }
                
                mock_cache = Mock()
                mock_cache.get.return_value = {'test': True}
                mock_cache.set.return_value = None
                mock_cache.delete.return_value = None
                mock_cache.get_stats.return_value = {'hit_rate': 0.80}
                mock_cache.redis_cache = Mock()
                mock_cache.redis_cache.available = True
                mock_cache_service.return_value = mock_cache
                
                with patch('psutil.cpu_percent', return_value=30.0):
                    with patch('psutil.virtual_memory') as mock_memory:
                        with patch('psutil.disk_usage') as mock_disk:
                            mock_memory.return_value.percent = 50.0
                            mock_disk.return_value.percent = 35.0
                            
                            response = client.get('/api/dashboard/health')
                            
                            assert response.status_code == 200
                            data = json.loads(response.data)
                            assert data['status'] == 'healthy'
                            
                            # Services should show as recovered
                            assert data['checks']['database']['status'] == 'healthy'
                            assert data['checks']['cache']['status'] == 'healthy'
    
    def test_health_check_concurrent_requests_integration(self, client):
        """Test health check behavior under concurrent requests."""
        import threading
        import queue
        
        results = queue.Queue()
        
        def make_health_request():
            """Make a health check request and store the result."""
            try:
                with patch('routes.dashboard.supabase_client') as mock_supabase:
                    with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                        mock_supabase.execute_query.return_value = {
                            'success': True,
                            'data': [{'id': 'concurrent_test'}]
                        }
                        
                        mock_cache = Mock()
                        mock_cache.get.return_value = {'test': True}
                        mock_cache.set.return_value = None
                        mock_cache.delete.return_value = None
                        mock_cache.get_stats.return_value = {'hit_rate': 0.85}
                        mock_cache.redis_cache = Mock()
                        mock_cache.redis_cache.available = True
                        mock_cache_service.return_value = mock_cache
                        
                        with patch('psutil.cpu_percent', return_value=40.0):
                            with patch('psutil.virtual_memory') as mock_memory:
                                with patch('psutil.disk_usage') as mock_disk:
                                    mock_memory.return_value.percent = 60.0
                                    mock_disk.return_value.percent = 40.0
                                    
                                    response = client.get('/api/dashboard/health')
                                    results.put({
                                        'status_code': response.status_code,
                                        'data': json.loads(response.data)
                                    })
            except Exception as e:
                results.put({'error': str(e)})
        
        # Create multiple concurrent threads
        threads = []
        num_threads = 5
        
        for _ in range(num_threads):
            thread = threading.Thread(target=make_health_request)
            threads.append(thread)
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join(timeout=5.0)  # 5 second timeout
        
        # Collect results
        collected_results = []
        while not results.empty():
            collected_results.append(results.get())
        
        # All requests should succeed
        assert len(collected_results) == num_threads
        
        for result in collected_results:
            assert 'error' not in result
            assert result['status_code'] == 200
            assert result['data']['status'] == 'healthy'
            assert 'timestamp' in result['data']
    
    def test_health_check_monitoring_integration_over_time(self, client):
        """Test health check monitoring behavior over time."""
        # Simulate multiple health checks over time with changing conditions
        scenarios = [
            {
                'name': 'healthy_system',
                'db_success': True,
                'db_response_time': 0.05,  # 50ms
                'cache_available': True,
                'expected_status': 'healthy'
            },
            {
                'name': 'degraded_database',
                'db_success': True,
                'db_response_time': 0.8,  # 800ms
                'cache_available': True,
                'expected_status': 'degraded'
            },
            {
                'name': 'failed_database',
                'db_success': False,
                'db_response_time': 2.0,  # 2000ms
                'cache_available': True,
                'expected_status': 'unhealthy'
            },
            {
                'name': 'recovered_system',
                'db_success': True,
                'db_response_time': 0.1,  # 100ms
                'cache_available': True,
                'expected_status': 'healthy'
            }
        ]
        
        for scenario in scenarios:
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    # Setup database response
                    if scenario['db_success']:
                        mock_supabase.execute_query.return_value = {
                            'success': True,
                            'data': [{'id': f"test_{scenario['name']}"}]
                        }
                    else:
                        mock_supabase.execute_query.return_value = {
                            'success': False,
                            'error': 'Database connection failed'
                        }
                    
                    # Setup cache response
                    if scenario['cache_available']:
                        mock_cache = Mock()
                        mock_cache.get.return_value = {'test': True}
                        mock_cache.set.return_value = None
                        mock_cache.delete.return_value = None
                        mock_cache.get_stats.return_value = {'hit_rate': 0.85}
                        mock_cache.redis_cache = Mock()
                        mock_cache.redis_cache.available = True
                        mock_cache_service.return_value = mock_cache
                    else:
                        mock_cache_service.return_value = None
                    
                    # Simulate response time
                    with patch('time.time') as mock_time:
                        mock_time.side_effect = [0, scenario['db_response_time']]
                        
                        with patch('psutil.cpu_percent', return_value=35.0):
                            with patch('psutil.virtual_memory') as mock_memory:
                                with patch('psutil.disk_usage') as mock_disk:
                                    mock_memory.return_value.percent = 55.0
                                    mock_disk.return_value.percent = 42.0
                                    
                                    response = client.get('/api/dashboard/health')
                                    data = json.loads(response.data)
                                    
                                    # Verify expected status
                                    if scenario['expected_status'] == 'healthy':
                                        assert response.status_code == 200
                                        assert data['status'] == 'healthy'
                                    elif scenario['expected_status'] == 'degraded':
                                        assert response.status_code == 200
                                        assert data['status'] == 'degraded'
                                    else:  # unhealthy
                                        assert response.status_code == 503
                                        assert data['status'] == 'unhealthy'
                                    
                                    # Verify timestamp is recent
                                    timestamp = datetime.fromisoformat(data['timestamp'].replace('Z', '+00:00'))
                                    now = datetime.utcnow()
                                    time_diff = abs((now - timestamp.replace(tzinfo=None)).total_seconds())
                                    assert time_diff < 5  # Within 5 seconds