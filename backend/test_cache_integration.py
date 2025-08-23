"""
Integration tests for cache service with Flask application.

Tests the cache service integration with the Flask app and
verifies it works correctly in the application context.
"""

import pytest
import time
from unittest.mock import patch, Mock

from app import create_app
from cache_service import get_cache_service


class TestCacheIntegration:
    """Test cache service integration with Flask app."""
    
    def setup_method(self):
        """Set up test Flask app with cache service."""
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        
        # Get the cache service from the app
        self.cache_service = self.app.cache_service
    
    def test_cache_service_initialized_in_app(self):
        """Test that cache service is properly initialized in Flask app."""
        assert hasattr(self.app, 'cache_service')
        assert self.cache_service is not None
        
        # Test that global cache service is also set
        global_cache = get_cache_service()
        assert global_cache is self.cache_service
    
    def test_cache_service_basic_functionality_in_app_context(self):
        """Test basic cache functionality within Flask app context."""
        with self.app.app_context():
            # Test set and get
            self.cache_service.set('test_key', 'test_value', ttl=300)
            retrieved = self.cache_service.get('test_key')
            assert retrieved == 'test_value'
            
            # Test delete
            self.cache_service.delete('test_key')
            assert self.cache_service.get('test_key') is None
    
    def test_cache_service_health_endpoint(self):
        """Test cache service health check through HTTP endpoint."""
        # First, let's add a cache health endpoint to test
        with self.app.app_context():
            @self.app.route('/cache/health')
            def cache_health():
                from flask import jsonify
                health = self.cache_service.health_check()
                return jsonify(health)
            
            # Test the endpoint
            response = self.client.get('/cache/health')
            assert response.status_code == 200
            
            data = response.get_json()
            assert 'memory_cache' in data
            assert 'redis_cache' in data
    
    def test_cache_service_stats_endpoint(self):
        """Test cache service statistics through HTTP endpoint."""
        with self.app.app_context():
            @self.app.route('/cache/stats')
            def cache_stats():
                from flask import jsonify
                stats = self.cache_service.get_stats()
                return jsonify(stats)
            
            # Add some data to cache first
            self.cache_service.set('stats_test_1', 'value1', ttl=300)
            self.cache_service.set('stats_test_2', 'value2', ttl=300)
            
            # Test the endpoint
            response = self.client.get('/cache/stats')
            assert response.status_code == 200
            
            data = response.get_json()
            assert 'memory_cache' in data
            assert 'redis_cache' in data
            assert 'config' in data
            
            # Should have at least 2 entries in memory cache
            assert data['memory_cache']['total_entries'] >= 2
    
    def test_cache_decorator_in_app_context(self):
        """Test cache decorator functionality within Flask app context."""
        from cache_service import cached
        
        call_count = 0
        
        @cached(ttl=300, key_prefix="integration_test_")
        def expensive_operation(x, y):
            nonlocal call_count
            call_count += 1
            return x * y + call_count
        
        with self.app.app_context():
            # First call should execute function
            result1 = expensive_operation(5, 10)
            assert result1 == 51  # 5*10 + 1
            assert call_count == 1
            
            # Second call should use cache
            result2 = expensive_operation(5, 10)
            assert result2 == 51  # Same result from cache
            assert call_count == 1  # Function not called again
            
            # Different parameters should execute function again
            result3 = expensive_operation(3, 4)
            assert result3 == 14  # 3*4 + 2
            assert call_count == 2
    
    def test_cache_service_with_flask_config(self):
        """Test cache service respects Flask configuration."""
        # Create app with custom cache config
        app = create_app()
        app.config.update({
            'CACHE_DEFAULT_TTL': 600,
            'CACHE_MEMORY_MAX_SIZE': 50,
            'REDIS_HOST': 'custom-redis-host',
            'REDIS_PORT': 6380,
            'REDIS_DB': 1
        })
        
        # Re-initialize cache service with new config
        from cache_service import init_cache_service
        cache_service = init_cache_service(app)
        
        # The cache service should use these settings
        assert cache_service.default_ttl == 600
        assert cache_service.memory_cache.max_size == 50
    
    def test_cache_service_error_handling_in_app(self):
        """Test cache service error handling within Flask app."""
        with self.app.app_context():
            # Test with invalid data that might cause serialization issues
            try:
                # This should not crash the app
                self.cache_service.set('test_key', lambda x: x, ttl=300)
                # Getting it back might return None due to serialization issues
                result = self.cache_service.get('test_key')
                # The important thing is that it doesn't crash
                assert True  # If we get here, error handling worked
            except Exception as e:
                # If there's an exception, it should be handled gracefully
                assert "serializ" in str(e).lower() or "json" in str(e).lower()
    
    def test_concurrent_cache_access_in_app(self):
        """Test concurrent cache access within Flask app context."""
        import threading
        
        results = []
        errors = []
        
        def worker(worker_id):
            try:
                with self.app.app_context():
                    for i in range(5):
                        key = f"concurrent_test_{worker_id}_{i}"
                        value = f"value_{worker_id}_{i}"
                        
                        # Set and get value
                        self.cache_service.set(key, value, ttl=300)
                        retrieved = self.cache_service.get(key)
                        results.append((key, value, retrieved))
                        
                        time.sleep(0.001)  # Small delay
            except Exception as e:
                errors.append(e)
        
        # Start multiple threads
        threads = []
        for i in range(3):
            thread = threading.Thread(target=worker, args=(i,))
            threads.append(thread)
            thread.start()
        
        # Wait for completion
        for thread in threads:
            thread.join()
        
        # Verify results
        assert len(errors) == 0, f"Errors occurred: {errors}"
        assert len(results) == 15  # 3 workers * 5 operations each
        
        # All operations should be successful
        for key, original, retrieved in results:
            assert retrieved == original


class TestCacheServiceConfiguration:
    """Test cache service configuration options."""
    
    def test_cache_service_without_redis_config(self):
        """Test cache service works without Redis configuration."""
        app = create_app()
        # Don't set any Redis config
        
        cache_service = app.cache_service
        assert cache_service is not None
        
        # Should still work with memory cache only
        with app.app_context():
            cache_service.set('test_key', 'test_value', ttl=300)
            assert cache_service.get('test_key') == 'test_value'
    
    @patch('cache_service.REDIS_AVAILABLE', True)
    @patch('cache_service.redis')
    def test_cache_service_with_redis_config(self, mock_redis_module):
        """Test cache service with Redis configuration."""
        # Mock Redis
        mock_client = Mock()
        mock_redis_module.Redis.return_value = mock_client
        mock_client.ping.return_value = True
        
        app = create_app()
        app.config.update({
            'REDIS_HOST': 'localhost',
            'REDIS_PORT': 6379,
            'REDIS_DB': 0
        })
        
        cache_service = app.cache_service
        assert cache_service is not None
        
        # Redis cache should be available
        assert cache_service.redis_cache.available
    
    def test_cache_service_custom_ttl_config(self):
        """Test cache service with custom TTL configuration."""
        app = create_app()
        app.config['CACHE_DEFAULT_TTL'] = 900  # 15 minutes
        
        # Re-initialize cache service with new config
        from cache_service import init_cache_service
        cache_service = init_cache_service(app)
        assert cache_service.default_ttl == 900
        
        # Test that default TTL is used
        with app.app_context():
            cache_service.set('test_key', 'test_value')  # No TTL specified
            
            # The entry should use the default TTL
            # We can't easily test the exact TTL without accessing internals,
            # but we can verify the value is cached
            assert cache_service.get('test_key') == 'test_value'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])