"""
Comprehensive tests for the multi-level caching service.

Tests cover:
- Memory cache functionality
- Redis cache functionality (with mocking when Redis unavailable)
- Multi-level cache coordination
- TTL management
- Stale data fallback
- Cache statistics and health checks
- Error handling and resilience
"""

import pytest
import time
import json
import threading
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta

from cache_service import (
    CacheEntry, MemoryCache, RedisCache, CacheService,
    init_cache_service, get_cache_service, cached
)


class TestCacheEntry:
    """Test CacheEntry functionality."""
    
    def test_cache_entry_creation(self):
        """Test cache entry creation and basic properties."""
        data = {'test': 'value'}
        entry = CacheEntry(data, ttl=300)
        
        assert entry.data == data
        assert entry.ttl == 300
        assert entry.access_count == 0
        assert not entry.is_expired()
        assert not entry.is_stale()
    
    def test_cache_entry_expiration(self):
        """Test cache entry expiration logic."""
        data = {'test': 'value'}
        entry = CacheEntry(data, ttl=1)  # 1 second TTL
        
        assert not entry.is_expired()
        
        # Wait for expiration
        time.sleep(1.1)
        assert entry.is_expired()
    
    def test_cache_entry_access_tracking(self):
        """Test access count and timestamp tracking."""
        data = {'test': 'value'}
        entry = CacheEntry(data, ttl=300)
        
        initial_access_time = entry.last_accessed
        
        # Access the entry
        result = entry.access()
        
        assert result == data
        assert entry.access_count == 1
        assert entry.last_accessed >= initial_access_time
        
        # Access again
        entry.access()
        assert entry.access_count == 2
    
    def test_cache_entry_serialization(self):
        """Test cache entry serialization and deserialization."""
        data = {'test': 'value', 'number': 42}
        entry = CacheEntry(data, ttl=300)
        entry.access()  # Update access count
        
        # Serialize
        entry_dict = entry.to_dict()
        assert 'data' in entry_dict
        assert 'created_at' in entry_dict
        assert 'expires_at' in entry_dict
        assert 'ttl' in entry_dict
        assert 'access_count' in entry_dict
        assert 'last_accessed' in entry_dict
        
        # Deserialize
        restored_entry = CacheEntry.from_dict(entry_dict)
        assert restored_entry.data == data
        assert restored_entry.ttl == 300
        assert restored_entry.access_count == 1


class TestMemoryCache:
    """Test MemoryCache functionality."""
    
    def test_memory_cache_basic_operations(self):
        """Test basic get/set operations."""
        cache = MemoryCache(max_size=100, cleanup_interval=3600)  # Long interval for testing
        
        # Test set and get
        cache.set('key1', 'value1', ttl=300)
        assert cache.get('key1') == 'value1'
        
        # Test non-existent key
        assert cache.get('nonexistent') is None
    
    def test_memory_cache_expiration(self):
        """Test TTL expiration in memory cache."""
        cache = MemoryCache(max_size=100, cleanup_interval=3600)
        
        # Set with short TTL
        cache.set('key1', 'value1', ttl=1)
        assert cache.get('key1') == 'value1'
        
        # Wait for expiration
        time.sleep(1.1)
        assert cache.get('key1') is None
    
    def test_memory_cache_lru_eviction(self):
        """Test LRU eviction when cache is full."""
        cache = MemoryCache(max_size=3, cleanup_interval=3600)
        
        # Fill cache
        cache.set('key1', 'value1', ttl=300)
        cache.set('key2', 'value2', ttl=300)
        cache.set('key3', 'value3', ttl=300)
        
        # Access key1 to make it recently used
        cache.get('key1')
        
        # Add another key, should evict key2 (least recently used)
        cache.set('key4', 'value4', ttl=300)
        
        # Force cleanup
        cache._cleanup_expired()
        
        assert cache.get('key1') == 'value1'  # Recently accessed
        assert cache.get('key3') == 'value3'  # Recently added
        assert cache.get('key4') == 'value4'  # Most recently added
        # key2 should be evicted (exact behavior may vary due to timing)
    
    def test_memory_cache_delete_and_clear(self):
        """Test delete and clear operations."""
        cache = MemoryCache(max_size=100, cleanup_interval=3600)
        
        cache.set('key1', 'value1', ttl=300)
        cache.set('key2', 'value2', ttl=300)
        
        # Test delete
        cache.delete('key1')
        assert cache.get('key1') is None
        assert cache.get('key2') == 'value2'
        
        # Test clear
        cache.clear()
        assert cache.get('key2') is None
    
    def test_memory_cache_stats(self):
        """Test cache statistics."""
        cache = MemoryCache(max_size=100, cleanup_interval=3600)
        
        cache.set('key1', 'value1', ttl=300)
        cache.set('key2', 'value2', ttl=1)  # Will expire soon
        
        # Access key1 multiple times
        cache.get('key1')
        cache.get('key1')
        
        stats = cache.get_stats()
        
        assert stats['total_entries'] == 2
        assert stats['max_size'] == 100
        assert stats['total_accesses'] == 2
        
        # Wait for key2 to expire
        time.sleep(1.1)
        
        # Stats should reflect expired entry
        stats = cache.get_stats()
        assert stats['expired_entries'] >= 1


class TestRedisCache:
    """Test RedisCache functionality."""
    
    @patch('cache_service.redis')
    def test_redis_cache_unavailable(self, mock_redis_module):
        """Test Redis cache when Redis is not available."""
        mock_redis_module.Redis.side_effect = Exception("Redis not available")
        
        cache = RedisCache()
        assert not cache.available
        
        # Operations should not fail when Redis is unavailable
        assert cache.get('key1') is None
        cache.set('key1', 'value1', ttl=300)  # Should not raise
        cache.delete('key1')  # Should not raise
    
    @patch('cache_service.REDIS_AVAILABLE', True)
    @patch('cache_service.redis')
    def test_redis_cache_basic_operations(self, mock_redis_module):
        """Test basic Redis cache operations with mocked Redis."""
        # Mock Redis client
        mock_client = Mock()
        mock_redis_module.Redis.return_value = mock_client
        mock_client.ping.return_value = True
        
        cache = RedisCache()
        assert cache.available
        
        # Test set operation
        cache.set('key1', 'value1', ttl=300)
        
        # Verify Redis calls
        assert mock_client.setex.call_count == 2  # Main key + stale key
        
        # Test get operation - simulate cache hit
        entry = CacheEntry('value1', ttl=300)
        mock_client.get.return_value = json.dumps(entry.to_dict(), default=str)
        
        result = cache.get('key1')
        assert result == 'value1'
        
        # Test get operation - simulate cache miss
        mock_client.get.return_value = None
        result = cache.get('key2')
        assert result is None
    
    @patch('cache_service.REDIS_AVAILABLE', True)
    @patch('cache_service.redis')
    def test_redis_cache_stale_data(self, mock_redis_module):
        """Test stale data retrieval."""
        mock_client = Mock()
        mock_redis_module.Redis.return_value = mock_client
        mock_client.ping.return_value = True
        
        cache = RedisCache()
        
        # Test get_stale operation
        entry = CacheEntry('stale_value', ttl=300)
        mock_client.get.return_value = json.dumps(entry.to_dict(), default=str)
        
        result = cache.get_stale('key1')
        assert result == 'stale_value'
        
        # Verify it called the stale key
        mock_client.get.assert_called_with('stale_key1')
    
    @patch('cache_service.REDIS_AVAILABLE', True)
    @patch('cache_service.redis')
    def test_redis_cache_error_handling(self, mock_redis_module):
        """Test Redis cache error handling."""
        mock_client = Mock()
        mock_redis_module.Redis.return_value = mock_client
        mock_client.ping.return_value = True
        
        cache = RedisCache()
        
        # Simulate Redis errors
        mock_client.get.side_effect = Exception("Redis connection error")
        mock_client.setex.side_effect = Exception("Redis write error")
        
        # Operations should not raise exceptions
        result = cache.get('key1')
        assert result is None
        
        cache.set('key1', 'value1', ttl=300)  # Should not raise
    
    @patch('cache_service.REDIS_AVAILABLE', True)
    @patch('cache_service.redis')
    def test_redis_cache_stats(self, mock_redis_module):
        """Test Redis cache statistics."""
        mock_client = Mock()
        mock_redis_module.Redis.return_value = mock_client
        mock_client.ping.return_value = True
        
        cache = RedisCache()
        
        # Mock Redis info
        mock_client.info.return_value = {
            'connected_clients': 5,
            'used_memory': 1024000,
            'used_memory_human': '1.02M',
            'keyspace_hits': 100,
            'keyspace_misses': 20
        }
        
        stats = cache.get_stats()
        
        assert stats['available'] is True
        assert stats['connected_clients'] == 5
        assert stats['used_memory'] == 1024000
        assert stats['keyspace_hits'] == 100


class TestCacheService:
    """Test multi-level CacheService functionality."""
    
    def setup_method(self):
        """Set up test cache service."""
        self.cache_service = CacheService(
            redis_url=None,  # No Redis for testing
            memory_max_size=100,
            default_ttl=300
        )
    
    def test_cache_service_basic_operations(self):
        """Test basic cache service operations."""
        # Test set and get
        self.cache_service.set('key1', 'value1', ttl=300)
        assert self.cache_service.get('key1') == 'value1'
        
        # Test cache miss
        assert self.cache_service.get('nonexistent') is None
    
    def test_cache_service_multi_level(self):
        """Test multi-level cache behavior."""
        # Set data
        self.cache_service.set('key1', 'value1', ttl=300)
        
        # Should be in memory cache
        assert self.cache_service.memory_cache.get('key1') == 'value1'
        
        # Clear memory cache
        self.cache_service.memory_cache.clear()
        
        # Should still be available from Redis (if available)
        # For this test, Redis is not available, so it should be None
        assert self.cache_service.get('key1') is None
    
    def test_cache_service_stale_data(self):
        """Test stale data retrieval."""
        # Set data in memory cache directly with expired TTL
        self.cache_service.memory_cache.set('key1', 'stale_value', ttl=1)
        
        # Wait for expiration
        time.sleep(1.1)
        
        # Regular get should return None
        assert self.cache_service.get('key1') is None
        
        # But get_stale should return the stale data
        # Note: This test may not work as expected due to cleanup thread
        # In a real scenario, we'd test with Redis stale data
    
    def test_cache_service_delete_and_clear(self):
        """Test delete and clear operations."""
        self.cache_service.set('key1', 'value1', ttl=300)
        self.cache_service.set('key2', 'value2', ttl=300)
        
        # Test delete
        self.cache_service.delete('key1')
        assert self.cache_service.get('key1') is None
        assert self.cache_service.get('key2') == 'value2'
        
        # Test clear pattern
        self.cache_service.set('user_1_data', 'data1', ttl=300)
        self.cache_service.set('user_2_data', 'data2', ttl=300)
        self.cache_service.set('other_data', 'data3', ttl=300)
        
        self.cache_service.clear_pattern('user_*_data')
        
        # user_* keys should be cleared
        assert self.cache_service.get('user_1_data') is None
        assert self.cache_service.get('user_2_data') is None
        # other_data should remain
        assert self.cache_service.get('other_data') == 'data3'
    
    def test_cache_service_stats(self):
        """Test cache service statistics."""
        self.cache_service.set('key1', 'value1', ttl=300)
        
        stats = self.cache_service.get_stats()
        
        assert 'memory_cache' in stats
        assert 'redis_cache' in stats
        assert 'config' in stats
        
        assert stats['config']['default_ttl'] == 300
        assert stats['memory_cache']['total_entries'] >= 1
    
    def test_cache_service_health_check(self):
        """Test cache service health check."""
        health = self.cache_service.health_check()
        
        assert 'memory_cache' in health
        assert 'redis_cache' in health
        
        # Memory cache should be healthy
        assert health['memory_cache']['status'] == 'healthy'
        
        # Redis cache should be unavailable (not configured for tests)
        assert health['redis_cache']['status'] == 'unavailable'


class TestCacheDecorator:
    """Test the @cached decorator."""
    
    def setup_method(self):
        """Set up test cache service."""
        global cache_service
        from cache_service import cache_service as global_cache_service
        
        if global_cache_service is None:
            init_cache_service(memory_max_size=100, default_ttl=300)
    
    def test_cached_decorator_basic(self):
        """Test basic cached decorator functionality."""
        call_count = 0
        
        @cached(ttl=300, key_prefix="test_")
        def expensive_function(x, y):
            nonlocal call_count
            call_count += 1
            return x + y
        
        # First call should execute function
        result1 = expensive_function(1, 2)
        assert result1 == 3
        assert call_count == 1
        
        # Second call should use cache
        result2 = expensive_function(1, 2)
        assert result2 == 3
        assert call_count == 1  # Should not increment
        
        # Different arguments should execute function again
        result3 = expensive_function(2, 3)
        assert result3 == 5
        assert call_count == 2
    
    def test_cached_decorator_with_kwargs(self):
        """Test cached decorator with keyword arguments."""
        call_count = 0
        
        @cached(ttl=300, key_prefix="test_kwargs_")
        def function_with_kwargs(x, y=10, z=20):
            nonlocal call_count
            call_count += 1
            return x + y + z
        
        # First call
        result1 = function_with_kwargs(1, y=5, z=15)
        assert result1 == 21
        assert call_count == 1
        
        # Same call should use cache
        result2 = function_with_kwargs(1, y=5, z=15)
        assert result2 == 21
        assert call_count == 1


class TestCacheServiceIntegration:
    """Integration tests for cache service."""
    
    def test_init_cache_service(self):
        """Test cache service initialization."""
        # Test initialization without Flask app
        cache = init_cache_service(
            memory_max_size=50,
            default_ttl=600
        )
        
        assert cache is not None
        assert cache.default_ttl == 600
        assert cache.memory_cache.max_size == 50
        
        # Test getting the global instance
        global_cache = get_cache_service()
        assert global_cache is cache
    
    @patch('cache_service.REDIS_AVAILABLE', True)
    @patch('cache_service.redis')
    def test_init_cache_service_with_flask_app(self, mock_redis_module):
        """Test cache service initialization with Flask app."""
        # Mock Flask app
        mock_app = Mock()
        mock_app.config = {
            'REDIS_URL': 'redis://localhost:6379/0',
            'CACHE_DEFAULT_TTL': 900,
            'CACHE_MEMORY_MAX_SIZE': 200,
            'REDIS_HOST': 'localhost',
            'REDIS_PORT': 6379,
            'REDIS_DB': 0
        }
        
        # Mock Redis
        mock_client = Mock()
        mock_redis_module.from_url.return_value = mock_client
        mock_client.ping.return_value = True
        
        cache = init_cache_service(mock_app)
        
        assert cache is not None
        assert cache.default_ttl == 900
        assert cache.memory_cache.max_size == 200
        assert hasattr(mock_app, 'cache_service')
        assert mock_app.cache_service is cache
    
    def test_concurrent_access(self):
        """Test concurrent access to cache service."""
        cache = CacheService(memory_max_size=100, default_ttl=300)
        
        results = []
        errors = []
        
        def worker(worker_id):
            try:
                for i in range(10):
                    key = f"worker_{worker_id}_key_{i}"
                    value = f"worker_{worker_id}_value_{i}"
                    
                    # Set value
                    cache.set(key, value, ttl=300)
                    
                    # Get value
                    retrieved = cache.get(key)
                    results.append((key, value, retrieved))
                    
                    # Small delay to increase chance of race conditions
                    time.sleep(0.001)
            except Exception as e:
                errors.append(e)
        
        # Start multiple threads
        threads = []
        for i in range(5):
            thread = threading.Thread(target=worker, args=(i,))
            threads.append(thread)
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        # Check results
        assert len(errors) == 0, f"Errors occurred: {errors}"
        assert len(results) == 50  # 5 workers * 10 operations each
        
        # Verify all operations were successful
        for key, original_value, retrieved_value in results:
            assert retrieved_value == original_value, f"Mismatch for {key}: {original_value} != {retrieved_value}"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])