import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Enhanced caching system with intelligent cache management
 * Prevents unnecessary refetching that causes flickering
 */
class EnhancedCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
    this.accessTimes = new Map();
    this.dependencies = new Map();
    this.subscribers = new Map();
  }

  // Set cache entry with dependencies and subscribers
  set(key, data, options = {}) {
    const {
      ttl = 300000, // 5 minutes default
      dependencies = [],
      tags = [],
      priority = 'normal' // low, normal, high
    } = options;

    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Store data with metadata
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      dependencies,
      tags,
      priority,
      accessCount: 0
    });

    this.accessTimes.set(key, Date.now());

    // Set dependencies
    dependencies.forEach(dep => {
      if (!this.dependencies.has(dep)) {
        this.dependencies.set(dep, new Set());
      }
      this.dependencies.get(dep).add(key);
    });

    // Set expiration timer
    const timer = setTimeout(() => {
      this.delete(key);
    }, ttl);
    
    this.timers.set(key, timer);

    // Notify subscribers
    this.notifySubscribers(key, data);
  }

  // Get cache entry with access tracking
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const { data, timestamp, ttl } = entry;
    const now = Date.now();

    // Check if expired
    if (now - timestamp > ttl) {
      this.delete(key);
      return null;
    }

    // Update access tracking
    entry.accessCount++;
    this.accessTimes.set(key, now);

    return data;
  }

  // Check if cache entry exists and is valid
  has(key) {
    return this.cache.has(key) && this.get(key) !== null;
  }

  // Delete cache entry and cleanup
  delete(key) {
    const entry = this.cache.get(key);
    if (entry) {
      // Clean up dependencies
      entry.dependencies.forEach(dep => {
        const depSet = this.dependencies.get(dep);
        if (depSet) {
          depSet.delete(key);
          if (depSet.size === 0) {
            this.dependencies.delete(dep);
          }
        }
      });
    }

    this.cache.delete(key);
    this.accessTimes.delete(key);
    
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }

    // Notify subscribers of deletion
    this.notifySubscribers(key, null);
  }

  // Invalidate cache entries by dependency
  invalidateByDependency(dependency) {
    const dependentKeys = this.dependencies.get(dependency);
    if (dependentKeys) {
      dependentKeys.forEach(key => this.delete(key));
    }
  }

  // Invalidate cache entries by tag
  invalidateByTag(tag) {
    const keysToDelete = [];
    this.cache.forEach((entry, key) => {
      if (entry.tags.includes(tag)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => this.delete(key));
  }

  // Subscribe to cache changes
  subscribe(key, callback) {
    if (!this.subscribers.has(key)) {
      this.subscribers.set(key, new Set());
    }
    this.subscribers.get(key).add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscribers.get(key);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscribers.delete(key);
        }
      }
    };
  }

  // Notify subscribers of cache changes
  notifySubscribers(key, data) {
    const callbacks = this.subscribers.get(key);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in cache subscriber:', error);
        }
      });
    }
  }

  // Get cache statistics
  getStats() {
    const entries = Array.from(this.cache.entries());
    
    return {
      totalEntries: entries.length,
      totalSize: this.estimateSize(),
      hitRate: this.calculateHitRate(),
      oldestEntry: Math.min(...Array.from(this.accessTimes.values())),
      newestEntry: Math.max(...Array.from(this.accessTimes.values())),
      entriesByPriority: {
        high: entries.filter(([, entry]) => entry.priority === 'high').length,
        normal: entries.filter(([, entry]) => entry.priority === 'normal').length,
        low: entries.filter(([, entry]) => entry.priority === 'low').length
      }
    };
  }

  // Estimate cache size
  estimateSize() {
    let size = 0;
    this.cache.forEach(entry => {
      size += JSON.stringify(entry.data).length;
    });
    return size;
  }

  // Calculate cache hit rate
  calculateHitRate() {
    const totalAccess = Array.from(this.cache.values())
      .reduce((sum, entry) => sum + entry.accessCount, 0);
    const totalEntries = this.cache.size;
    
    return totalEntries > 0 ? totalAccess / totalEntries : 0;
  }

  // Clean up expired entries
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];
    
    this.cache.forEach((entry, key) => {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.delete(key));
    return keysToDelete.length;
  }

  // Clear cache with optional filter
  clear(filter = null) {
    if (filter) {
      const keysToDelete = [];
      this.cache.forEach((entry, key) => {
        if (filter(key, entry)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => this.delete(key));
    } else {
      this.cache.clear();
      this.timers.forEach(timer => clearTimeout(timer));
      this.timers.clear();
      this.accessTimes.clear();
      this.dependencies.clear();
      this.subscribers.clear();
    }
  }
}

// Global enhanced cache instance
const enhancedCache = new EnhancedCache();

// Periodic cleanup
setInterval(() => {
  enhancedCache.cleanup();
}, 60000); // Clean up every minute

/**
 * Hook for enhanced caching with intelligent cache management
 */
export const useEnhancedCache = (key, options = {}) => {
  const {
    ttl = 300000,
    dependencies = [],
    tags = [],
    priority = 'normal',
    onCacheHit,
    onCacheMiss
  } = options;

  const [cachedData, setCachedData] = useState(() => enhancedCache.get(key));
  const [cacheStats, setCacheStats] = useState(null);

  // Subscribe to cache changes
  useEffect(() => {
    const unsubscribe = enhancedCache.subscribe(key, (data) => {
      setCachedData(data);
      if (data && onCacheHit) {
        onCacheHit(data);
      }
    });

    return unsubscribe;
  }, [key, onCacheHit]);

  // Set cache data
  const setCache = useCallback((data) => {
    enhancedCache.set(key, data, {
      ttl,
      dependencies,
      tags,
      priority
    });
  }, [key, ttl, dependencies, tags, priority]);

  // Get cache data
  const getCache = useCallback(() => {
    const data = enhancedCache.get(key);
    if (!data && onCacheMiss) {
      onCacheMiss();
    }
    return data;
  }, [key, onCacheMiss]);

  // Check if cache has data
  const hasCache = useCallback(() => {
    return enhancedCache.has(key);
  }, [key]);

  // Delete cache entry
  const deleteCache = useCallback(() => {
    enhancedCache.delete(key);
  }, [key]);

  // Invalidate related cache entries
  const invalidateByDependency = useCallback((dependency) => {
    enhancedCache.invalidateByDependency(dependency);
  }, []);

  const invalidateByTag = useCallback((tag) => {
    enhancedCache.invalidateByTag(tag);
  }, []);

  // Get cache statistics
  const getStats = useCallback(() => {
    const stats = enhancedCache.getStats();
    setCacheStats(stats);
    return stats;
  }, []);

  return {
    cachedData,
    cacheStats,
    setCache,
    getCache,
    hasCache,
    deleteCache,
    invalidateByDependency,
    invalidateByTag,
    getStats
  };
};

/**
 * Hook for smart cache preloading
 */
export const useCachePreloader = () => {
  const { user } = useAuth();
  const preloadQueueRef = useRef([]);
  const isPreloadingRef = useRef(false);

  // Add item to preload queue
  const addToPreloadQueue = useCallback((endpoint, options = {}) => {
    preloadQueueRef.current.push({ endpoint, options });
  }, []);

  // Process preload queue
  const processPreloadQueue = useCallback(async () => {
    if (isPreloadingRef.current || !user) return;

    isPreloadingRef.current = true;

    try {
      while (preloadQueueRef.current.length > 0) {
        const { endpoint, options } = preloadQueueRef.current.shift();
        const cacheKey = `${endpoint}:${user.id}`;

        // Skip if already cached
        if (enhancedCache.has(cacheKey)) {
          continue;
        }

        try {
          const headers = await user.getAuthHeaders();
          const response = await fetch(endpoint, { headers });
          
          if (response.ok) {
            const data = await response.json();
            enhancedCache.set(cacheKey, data, {
              ttl: options.ttl || 300000,
              tags: ['preloaded'],
              priority: 'low'
            });
          }
        } catch (error) {
          console.warn(`Failed to preload ${endpoint}:`, error);
        }

        // Small delay to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } finally {
      isPreloadingRef.current = false;
    }
  }, [user]);

  // Preload common dashboard data
  const preloadDashboardData = useCallback(() => {
    addToPreloadQueue('/api/dashboard/summary');
    addToPreloadQueue('/api/dashboard/charts');
    addToPreloadQueue('/api/dashboard/recent');
    addToPreloadQueue('/api/experiments', { ttl: 180000 });
    
    // Process queue after a short delay
    setTimeout(processPreloadQueue, 1000);
  }, [addToPreloadQueue, processPreloadQueue]);

  return {
    addToPreloadQueue,
    processPreloadQueue,
    preloadDashboardData
  };
};

export { enhancedCache };