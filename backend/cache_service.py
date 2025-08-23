"""
Multi-level caching service for NeuroLab 360 Dashboard API.

This module provides a comprehensive caching solution with:
- Memory cache for fast access
- Redis cache for persistence and scalability
- TTL management
- Stale data fallback for service degradation
- Cache invalidation strategies
"""

import json
import time
import logging
from typing import Optional, Dict, Any, Union
from datetime import datetime, timedelta
import asyncio
import threading
from functools import wraps

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None

logger = logging.getLogger(__name__)


class CacheEntry:
    """Represents a cache entry with metadata."""
    
    def __init__(self, data: Any, ttl: int = 300):
        self.data = data
        self.created_at = time.time()
        self.expires_at = self.created_at + ttl
        self.ttl = ttl
        self.access_count = 0
        self.last_accessed = self.created_at
    
    def is_expired(self) -> bool:
        """Check if the cache entry has expired."""
        return time.time() > self.expires_at
    
    def is_stale(self, stale_threshold: int = 600) -> bool:
        """Check if the cache entry is stale (older than threshold)."""
        return time.time() > (self.created_at + stale_threshold)
    
    def access(self) -> Any:
        """Access the cached data and update metadata."""
        self.access_count += 1
        self.last_accessed = time.time()
        return self.data
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert cache entry to dictionary for serialization."""
        return {
            'data': self.data,
            'created_at': self.created_at,
            'expires_at': self.expires_at,
            'ttl': self.ttl,
            'access_count': self.access_count,
            'last_accessed': self.last_accessed
        }
    
    @classmethod
    def from_dict(cls, entry_dict: Dict[str, Any]) -> 'CacheEntry':
        """Create cache entry from dictionary."""
        entry = cls(entry_dict['data'], entry_dict['ttl'])
        entry.created_at = entry_dict['created_at']
        entry.expires_at = entry_dict['expires_at']
        entry.access_count = entry_dict['access_count']
        entry.last_accessed = entry_dict['last_accessed']
        return entry


class MemoryCache:
    """In-memory cache with TTL and LRU eviction."""
    
    def __init__(self, max_size: int = 1000, cleanup_interval: int = 60):
        self.cache: Dict[str, CacheEntry] = {}
        self.max_size = max_size
        self.cleanup_interval = cleanup_interval
        self._lock = threading.RLock()
        self._start_cleanup_thread()
    
    def _start_cleanup_thread(self):
        """Start background thread for cache cleanup."""
        def cleanup_worker():
            while True:
                try:
                    self._cleanup_expired()
                    time.sleep(self.cleanup_interval)
                except Exception as e:
                    logger.error(f"Memory cache cleanup error: {e}")
                    time.sleep(self.cleanup_interval)
        
        cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
        cleanup_thread.start()
    
    def _cleanup_expired(self):
        """Remove expired entries from cache."""
        with self._lock:
            expired_keys = [
                key for key, entry in self.cache.items() 
                if entry.is_expired()
            ]
            for key in expired_keys:
                del self.cache[key]
            
            # LRU eviction if cache is too large
            if len(self.cache) > self.max_size:
                # Sort by last accessed time and remove oldest
                sorted_items = sorted(
                    self.cache.items(),
                    key=lambda x: x[1].last_accessed
                )
                items_to_remove = len(self.cache) - self.max_size
                for key, _ in sorted_items[:items_to_remove]:
                    del self.cache[key]
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from memory cache."""
        with self._lock:
            if key in self.cache:
                entry = self.cache[key]
                if not entry.is_expired():
                    return entry.access()
                else:
                    del self.cache[key]
            return None
    
    def set(self, key: str, value: Any, ttl: int = 300):
        """Set value in memory cache."""
        with self._lock:
            # Limit memory cache TTL to prevent excessive memory usage
            memory_ttl = min(ttl, 300)  # Max 5 minutes in memory
            self.cache[key] = CacheEntry(value, memory_ttl)
    
    def delete(self, key: str):
        """Delete key from memory cache."""
        with self._lock:
            if key in self.cache:
                del self.cache[key]
    
    def clear(self):
        """Clear all entries from memory cache."""
        with self._lock:
            self.cache.clear()
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            total_entries = len(self.cache)
            expired_entries = sum(1 for entry in self.cache.values() if entry.is_expired())
            total_accesses = sum(entry.access_count for entry in self.cache.values())
            
            return {
                'total_entries': total_entries,
                'expired_entries': expired_entries,
                'active_entries': total_entries - expired_entries,
                'total_accesses': total_accesses,
                'max_size': self.max_size
            }


class RedisCache:
    """Redis-based cache with TTL and stale data support."""
    
    def __init__(self, redis_url: Optional[str] = None, **redis_kwargs):
        self.redis_client = None
        self.available = False
        
        if REDIS_AVAILABLE:
            try:
                if redis_url:
                    self.redis_client = redis.from_url(redis_url, **redis_kwargs)
                else:
                    # Default Redis connection
                    self.redis_client = redis.Redis(
                        host=redis_kwargs.get('host', 'localhost'),
                        port=redis_kwargs.get('port', 6379),
                        db=redis_kwargs.get('db', 0),
                        decode_responses=True,
                        socket_connect_timeout=5,
                        socket_timeout=5
                    )
                
                # Test connection
                self.redis_client.ping()
                self.available = True
                logger.info("Redis cache initialized successfully")
                
            except Exception as e:
                logger.warning(f"Redis cache initialization failed: {e}")
                self.redis_client = None
                self.available = False
        else:
            logger.warning("Redis not available - install redis package for Redis caching")
    
    def get(self, key: str) -> Optional[Any]:
        """Get value from Redis cache."""
        if not self.available:
            return None
        
        try:
            cached_data = self.redis_client.get(key)
            if cached_data:
                entry_dict = json.loads(cached_data)
                entry = CacheEntry.from_dict(entry_dict)
                
                if not entry.is_expired():
                    return entry.access()
                else:
                    # Entry expired, delete it
                    self.redis_client.delete(key)
            
            return None
            
        except Exception as e:
            logger.error(f"Redis get error for key {key}: {e}")
            return None
    
    def set(self, key: str, value: Any, ttl: int = 300):
        """Set value in Redis cache."""
        if not self.available:
            return
        
        try:
            entry = CacheEntry(value, ttl)
            entry_json = json.dumps(entry.to_dict(), default=str)
            
            # Set with TTL
            self.redis_client.setex(key, ttl, entry_json)
            
            # Also store as stale data with longer TTL for fallback
            stale_key = f"stale_{key}"
            stale_ttl = ttl * 3  # Keep stale data 3x longer
            self.redis_client.setex(stale_key, stale_ttl, entry_json)
            
        except Exception as e:
            logger.error(f"Redis set error for key {key}: {e}")
    
    def get_stale(self, key: str) -> Optional[Any]:
        """Get stale data for service degradation scenarios."""
        if not self.available:
            return None
        
        try:
            stale_key = f"stale_{key}"
            cached_data = self.redis_client.get(stale_key)
            
            if cached_data:
                entry_dict = json.loads(cached_data)
                entry = CacheEntry.from_dict(entry_dict)
                return entry.access()
            
            return None
            
        except Exception as e:
            logger.error(f"Redis get_stale error for key {key}: {e}")
            return None
    
    def delete(self, key: str):
        """Delete key from Redis cache."""
        if not self.available:
            return
        
        try:
            self.redis_client.delete(key)
            self.redis_client.delete(f"stale_{key}")
        except Exception as e:
            logger.error(f"Redis delete error for key {key}: {e}")
    
    def clear_pattern(self, pattern: str):
        """Clear keys matching pattern."""
        if not self.available:
            return
        
        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                self.redis_client.delete(*keys)
        except Exception as e:
            logger.error(f"Redis clear_pattern error for pattern {pattern}: {e}")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get Redis cache statistics."""
        if not self.available:
            return {'available': False}
        
        try:
            info = self.redis_client.info()
            return {
                'available': True,
                'connected_clients': info.get('connected_clients', 0),
                'used_memory': info.get('used_memory', 0),
                'used_memory_human': info.get('used_memory_human', '0B'),
                'keyspace_hits': info.get('keyspace_hits', 0),
                'keyspace_misses': info.get('keyspace_misses', 0)
            }
        except Exception as e:
            logger.error(f"Redis stats error: {e}")
            return {'available': False, 'error': str(e)}


class CacheService:
    """Multi-level caching service with memory and Redis layers."""
    
    def __init__(self, redis_url: Optional[str] = None, **config):
        self.memory_cache = MemoryCache(
            max_size=config.get('memory_max_size', 1000),
            cleanup_interval=config.get('memory_cleanup_interval', 60)
        )
        
        self.redis_cache = RedisCache(redis_url, **config.get('redis_config', {}))
        
        self.default_ttl = config.get('default_ttl', 300)  # 5 minutes
        self.stale_threshold = config.get('stale_threshold', 600)  # 10 minutes
        
        logger.info("CacheService initialized")
    
    def get(self, key: str) -> Optional[Any]:
        """Get cached data with fallback levels."""
        # Try memory cache first (fastest)
        data = self.memory_cache.get(key)
        if data is not None:
            logger.debug(f"Cache hit (memory): {key}")
            return data
        
        # Try Redis cache
        data = self.redis_cache.get(key)
        if data is not None:
            logger.debug(f"Cache hit (redis): {key}")
            # Store in memory cache for faster future access
            self.memory_cache.set(key, data, ttl=60)  # 1 minute in memory
            return data
        
        logger.debug(f"Cache miss: {key}")
        return None
    
    def set(self, key: str, data: Any, ttl: Optional[int] = None) -> None:
        """Set cached data at multiple levels."""
        ttl = ttl or self.default_ttl
        
        # Store in both caches
        self.memory_cache.set(key, data, ttl)
        self.redis_cache.set(key, data, ttl)
        
        logger.debug(f"Cache set: {key} (TTL: {ttl}s)")
    
    def get_stale(self, key: str) -> Optional[Any]:
        """Get stale cached data during service degradation."""
        # Check memory cache for stale data (ignore expiration)
        with self.memory_cache._lock:
            if key in self.memory_cache.cache:
                entry = self.memory_cache.cache[key]
                if entry.is_stale(self.stale_threshold):
                    logger.debug(f"Stale cache hit (memory): {key}")
                    return entry.access()
        
        # Check Redis for stale data
        stale_data = self.redis_cache.get_stale(key)
        if stale_data is not None:
            logger.debug(f"Stale cache hit (redis): {key}")
            return stale_data
        
        logger.debug(f"No stale cache data: {key}")
        return None
    
    def delete(self, key: str) -> None:
        """Delete key from all cache levels."""
        self.memory_cache.delete(key)
        self.redis_cache.delete(key)
        logger.debug(f"Cache delete: {key}")
    
    def clear_pattern(self, pattern: str) -> None:
        """Clear keys matching pattern from all cache levels."""
        # For memory cache, we need to iterate through keys
        with self.memory_cache._lock:
            keys_to_delete = [
                key for key in self.memory_cache.cache.keys()
                if self._match_pattern(key, pattern)
            ]
            for key in keys_to_delete:
                del self.memory_cache.cache[key]
        
        # Clear from Redis
        self.redis_cache.clear_pattern(pattern)
        
        logger.debug(f"Cache clear pattern: {pattern}")
    
    def _match_pattern(self, key: str, pattern: str) -> bool:
        """Simple pattern matching for cache keys."""
        if '*' in pattern:
            # Convert glob pattern to simple matching
            pattern_parts = pattern.split('*')
            if len(pattern_parts) == 2:
                prefix, suffix = pattern_parts
                return key.startswith(prefix) and key.endswith(suffix)
        return key == pattern
    
    def get_stats(self) -> Dict[str, Any]:
        """Get comprehensive cache statistics."""
        return {
            'memory_cache': self.memory_cache.get_stats(),
            'redis_cache': self.redis_cache.get_stats(),
            'config': {
                'default_ttl': self.default_ttl,
                'stale_threshold': self.stale_threshold
            }
        }
    
    def health_check(self) -> Dict[str, Any]:
        """Perform health check on cache services."""
        health = {
            'memory_cache': {'status': 'healthy'},
            'redis_cache': {'status': 'healthy' if self.redis_cache.available else 'unavailable'}
        }
        
        # Test memory cache
        try:
            test_key = f"health_check_{int(time.time())}"
            self.memory_cache.set(test_key, {'test': True}, ttl=10)
            retrieved = self.memory_cache.get(test_key)
            if retrieved != {'test': True}:
                health['memory_cache']['status'] = 'error'
                health['memory_cache']['error'] = 'Failed to retrieve test data'
        except Exception as e:
            health['memory_cache']['status'] = 'error'
            health['memory_cache']['error'] = str(e)
        
        # Test Redis cache
        if self.redis_cache.available:
            try:
                test_key = f"health_check_{int(time.time())}"
                self.redis_cache.set(test_key, {'test': True}, ttl=10)
                retrieved = self.redis_cache.get(test_key)
                if retrieved != {'test': True}:
                    health['redis_cache']['status'] = 'error'
                    health['redis_cache']['error'] = 'Failed to retrieve test data'
            except Exception as e:
                health['redis_cache']['status'] = 'error'
                health['redis_cache']['error'] = str(e)
        
        return health


# Decorator for caching function results
def cached(ttl: int = 300, key_prefix: str = ""):
    """Decorator to cache function results."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Generate cache key from function name and arguments
            cache_key = f"{key_prefix}{func.__name__}_{hash(str(args) + str(sorted(kwargs.items())))}"
            
            # Try to get from cache
            cached_result = cache_service.get(cache_key)
            if cached_result is not None:
                return cached_result
            
            # Execute function and cache result
            result = func(*args, **kwargs)
            cache_service.set(cache_key, result, ttl)
            
            return result
        return wrapper
    return decorator


# Global cache service instance
cache_service = None


def init_cache_service(app=None, **config) -> CacheService:
    """Initialize the global cache service."""
    global cache_service
    
    # If we already have a cache service and no new config, return existing
    if cache_service is not None and not config and not app:
        return cache_service
    
    if app and hasattr(app, 'config'):
        # Get Redis configuration from Flask app config
        redis_url = app.config.get('REDIS_URL')
        app_config = {
            'default_ttl': app.config.get('CACHE_DEFAULT_TTL', 300),
            'memory_max_size': app.config.get('CACHE_MEMORY_MAX_SIZE', 1000),
            'stale_threshold': app.config.get('CACHE_STALE_THRESHOLD', 600),
            'redis_config': {
                'host': app.config.get('REDIS_HOST', 'localhost'),
                'port': app.config.get('REDIS_PORT', 6379),
                'db': app.config.get('REDIS_DB', 0)
            }
        }
        # Merge app config with provided config, giving precedence to provided config
        app_config.update(config)
        config = app_config
    else:
        redis_url = config.get('redis_url')
    
    cache_service = CacheService(redis_url, **config)
    
    if app:
        app.cache_service = cache_service
    
    return cache_service


def get_cache_service() -> Optional[CacheService]:
    """Get the global cache service instance."""
    return cache_service