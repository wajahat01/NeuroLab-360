/**
 * Advanced data caching utility to prevent unnecessary refetching
 * Provides intelligent cache management with TTL, dependencies, and invalidation
 */

class DataCache {
  constructor() {
    this.cache = new Map();
    this.metadata = new Map();
    this.subscribers = new Map();
    this.dependencies = new Map();
    this.cleanupInterval = null;
    
    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Set cache entry with advanced options
   */
  set(key, data, options = {}) {
    const {
      ttl = 300000, // 5 minutes default
      tags = [],
      dependencies = [],
      priority = 'normal',
      maxAge = null,
      staleWhileRevalidate = false
    } = options;

    const now = Date.now();
    const entry = {
      data,
      timestamp: now,
      ttl,
      tags: new Set(tags),
      dependencies: new Set(dependencies),
      priority,
      maxAge: maxAge || (ttl * 2), // Max age is 2x TTL by default
      staleWhileRevalidate,
      accessCount: 0,
      lastAccess: now
    };

    this.cache.set(key, entry);
    this.metadata.set(key, {
      size: this.estimateSize(data),
      created: now,
      updated: now
    });

    // Set up dependencies
    dependencies.forEach(dep => {
      if (!this.dependencies.has(dep)) {
        this.dependencies.set(dep, new Set());
      }
      this.dependencies.get(dep).add(key);
    });

    // Notify subscribers
    this.notifySubscribers(key, data, 'set');

    return key;
  }

  /**
   * Get cache entry with staleness check
   */
  get(key, options = {}) => {
    const { allowStale = false, updateAccess = true } = options;
    
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    const age = now - entry.timestamp;

    // Check if expired
    if (age > entry.maxAge) {
      this.delete(key);
      return null;
    }

    // Check if stale
    const isStale = age > entry.ttl;
    if (isStale && !allowStale && !entry.staleWhileRevalidate) {
      this.delete(key);
      return null;
    }

    // Update access tracking
    if (updateAccess) {
      entry.accessCount++;
      entry.lastAccess = now;
    }

    // Return data with metadata
    return {
      data: entry.data,
      isStale,
      age,
      metadata: {
        timestamp: entry.timestamp,
        ttl: entry.ttl,
        priority: entry.priority,
        accessCount: entry.accessCount
      }
    };
  }

  /**
   * Check if cache has valid entry
   */
  has(key, options = {}) => {
    const result = this.get(key, { ...options, updateAccess: false });
    return result !== null;
  }

  /**
   * Delete cache entry and cleanup
   */
  delete(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;

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

    this.cache.delete(key);
    this.metadata.delete(key);

    // Notify subscribers
    this.notifySubscribers(key, null, 'delete');

    return true;
  }

  /**
   * Update existing cache entry
   */
  update(key, updater, options = {}) => {
    const entry = this.cache.get(key);
    if (!entry) return false;

    const newData = typeof updater === 'function' 
      ? updater(entry.data) 
      : updater;

    const now = Date.now();
    entry.data = newData;
    entry.timestamp = now;

    const metadata = this.metadata.get(key);
    if (metadata) {
      metadata.updated = now;
      metadata.size = this.estimateSize(newData);
    }

    // Notify subscribers
    this.notifySubscribers(key, newData, 'update');

    return true;
  }

  /**
   * Invalidate cache entries by dependency
   */
  invalidateByDependency(dependency) {
    const dependentKeys = this.dependencies.get(dependency);
    if (!dependentKeys) return 0;

    let count = 0;
    dependentKeys.forEach(key => {
      if (this.delete(key)) count++;
    });

    return count;
  }

  /**
   * Invalidate cache entries by tag
   */
  invalidateByTag(tag) {
    const keysToDelete = [];
    
    this.cache.forEach((entry, key) => {
      if (entry.tags.has(tag)) {
        keysToDelete.push(key);
      }
    });

    let count = 0;
    keysToDelete.forEach(key => {
      if (this.delete(key)) count++;
    });

    return count;
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidateByPattern(pattern) {
    const regex = new RegExp(pattern);
    const keysToDelete = [];

    this.cache.forEach((entry, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    });

    let count = 0;
    keysToDelete.forEach(key => {
      if (this.delete(key)) count++;
    });

    return count;
  }

  /**
   * Subscribe to cache changes
   */
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

  /**
   * Notify subscribers of changes
   */
  notifySubscribers(key, data, action) {
    const callbacks = this.subscribers.get(key);
    if (!callbacks) return;

    callbacks.forEach(callback => {
      try {
        callback(data, action, key);
      } catch (error) {
        console.error('Error in cache subscriber:', error);
      }
    });
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    const metadataEntries = Array.from(this.metadata.entries());

    const totalSize = metadataEntries.reduce((sum, [, meta]) => sum + meta.size, 0);
    const totalAccess = entries.reduce((sum, [, entry]) => sum + entry.accessCount, 0);

    const ageDistribution = entries.map(([, entry]) => now - entry.timestamp);
    const avgAge = ageDistribution.length > 0 
      ? ageDistribution.reduce((sum, age) => sum + age, 0) / ageDistribution.length 
      : 0;

    return {
      totalEntries: entries.length,
      totalSize,
      totalAccess,
      avgAge,
      hitRate: this.calculateHitRate(),
      entriesByPriority: this.getEntriesByPriority(),
      staleness: this.getStalenessStats(),
      memoryUsage: this.getMemoryUsage()
    };
  }

  /**
   * Calculate cache hit rate
   */
  calculateHitRate() {
    const entries = Array.from(this.cache.values());
    if (entries.length === 0) return 0;

    const totalAccess = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    return totalAccess / entries.length;
  }

  /**
   * Get entries grouped by priority
   */
  getEntriesByPriority() {
    const priorities = { high: 0, normal: 0, low: 0 };
    
    this.cache.forEach(entry => {
      priorities[entry.priority] = (priorities[entry.priority] || 0) + 1;
    });

    return priorities;
  }

  /**
   * Get staleness statistics
   */
  getStalenessStats() {
    const now = Date.now();
    let stale = 0;
    let fresh = 0;
    let expired = 0;

    this.cache.forEach(entry => {
      const age = now - entry.timestamp;
      if (age > entry.maxAge) {
        expired++;
      } else if (age > entry.ttl) {
        stale++;
      } else {
        fresh++;
      }
    });

    return { fresh, stale, expired };
  }

  /**
   * Get memory usage estimation
   */
  getMemoryUsage() {
    let totalSize = 0;
    let entryCount = 0;

    this.cache.forEach((entry, key) => {
      totalSize += this.estimateSize(entry);
      totalSize += key.length * 2; // Approximate string size
      entryCount++;
    });

    return {
      totalBytes: totalSize,
      avgEntrySize: entryCount > 0 ? totalSize / entryCount : 0,
      entryCount
    };
  }

  /**
   * Estimate object size in bytes
   */
  estimateSize(obj) {
    try {
      return JSON.stringify(obj).length * 2; // Approximate UTF-16 size
    } catch {
      return 0;
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];

    this.cache.forEach((entry, key) => {
      const age = now - entry.timestamp;
      if (age > entry.maxAge) {
        keysToDelete.push(key);
      }
    });

    let deletedCount = 0;
    keysToDelete.forEach(key => {
      if (this.delete(key)) deletedCount++;
    });

    return deletedCount;
  }

  /**
   * Start periodic cleanup
   */
  startCleanup(interval = 60000) { // 1 minute default
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      const deleted = this.cleanup();
      if (deleted > 0) {
        console.debug(`Cache cleanup: removed ${deleted} expired entries`);
      }
    }, interval);
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clear all cache entries
   */
  clear(filter = null) {
    if (filter) {
      const keysToDelete = [];
      this.cache.forEach((entry, key) => {
        if (filter(key, entry)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach(key => this.delete(key));
      return keysToDelete.length;
    } else {
      const count = this.cache.size;
      this.cache.clear();
      this.metadata.clear();
      this.dependencies.clear();
      this.subscribers.clear();
      return count;
    }
  }

  /**
   * Export cache data for persistence
   */
  export() {
    const data = {};
    this.cache.forEach((entry, key) => {
      data[key] = {
        data: entry.data,
        timestamp: entry.timestamp,
        ttl: entry.ttl,
        tags: Array.from(entry.tags),
        dependencies: Array.from(entry.dependencies),
        priority: entry.priority
      };
    });
    return data;
  }

  /**
   * Import cache data from persistence
   */
  import(data) {
    const now = Date.now();
    let importedCount = 0;

    Object.entries(data).forEach(([key, entry]) => {
      // Check if entry is still valid
      const age = now - entry.timestamp;
      if (age < (entry.ttl * 2)) { // Within max age
        this.set(key, entry.data, {
          ttl: entry.ttl,
          tags: entry.tags,
          dependencies: entry.dependencies,
          priority: entry.priority
        });
        importedCount++;
      }
    });

    return importedCount;
  }

  /**
   * Destroy cache and cleanup
   */
  destroy() {
    this.stopCleanup();
    this.clear();
  }
}

// Create global cache instance
const dataCache = new DataCache();

// Export cache instance and utilities
export { dataCache };

/**
 * Cache key generator utility
 */
export const generateCacheKey = (endpoint, params = {}, userId = null) => {
  const paramString = Object.keys(params).length > 0 
    ? JSON.stringify(params) 
    : '';
  
  return `${endpoint}:${paramString}:${userId || 'anonymous'}`;
};

/**
 * Cache invalidation utilities
 */
export const cacheInvalidation = {
  // Invalidate all user-specific data
  invalidateUser: (userId) => {
    return dataCache.invalidateByPattern(`.*:.*:${userId}$`);
  },

  // Invalidate all data for a specific endpoint
  invalidateEndpoint: (endpoint) => {
    return dataCache.invalidateByPattern(`^${endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`);
  },

  // Invalidate all experiment-related data
  invalidateExperiments: () => {
    return dataCache.invalidateByTag('experiments');
  },

  // Invalidate all dashboard data
  invalidateDashboard: () => {
    return dataCache.invalidateByTag('dashboard');
  },

  // Invalidate stale data
  invalidateStale: () => {
    const keysToDelete = [];
    const now = Date.now();

    dataCache.cache.forEach((entry, key) => {
      const age = now - entry.timestamp;
      if (age > entry.ttl && !entry.staleWhileRevalidate) {
        keysToDelete.push(key);
      }
    });

    let count = 0;
    keysToDelete.forEach(key => {
      if (dataCache.delete(key)) count++;
    });

    return count;
  }
};

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    dataCache.destroy();
  });
}