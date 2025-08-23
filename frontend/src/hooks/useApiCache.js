import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

// Cache storage with TTL support
class ApiCache {
  constructor() {
    this.cache = new Map();
    this.timers = new Map();
  }

  set(key, data, ttl = 300000) { // Default 5 minutes TTL
    // Clear existing timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
    }

    // Set data
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });

    // Set expiration timer
    const timer = setTimeout(() => {
      this.delete(key);
    }, ttl);
    
    this.timers.set(key, timer);
  }

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

    return data;
  }

  delete(key) {
    this.cache.delete(key);
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key));
      this.timers.delete(key);
    }
  }

  clear() {
    this.cache.clear();
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
  }

  has(key) {
    return this.cache.has(key) && this.get(key) !== null;
  }
}

// Global cache instance
const apiCache = new ApiCache();

// Custom hook for API calls with caching and error handling
export const useApiCache = (
  url,
  options = {},
  dependencies = [],
  cacheOptions = {}
) => {
  const {
    method = 'GET',
    body = null,
    enabled = true,
    retry = 3,
    retryDelay = 1000,
    onSuccess,
    onError
  } = options;

  const {
    ttl = 300000, // 5 minutes default
    cacheKey: customCacheKey,
    staleWhileRevalidate = false
  } = cacheOptions;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isStale, setIsStale] = useState(false);

  const { user, getAuthHeaders } = useAuth();
  const abortControllerRef = useRef(null);
  const retryCountRef = useRef(0);

  // Generate cache key
  const cacheKey = customCacheKey || `${method}:${url}:${JSON.stringify(body)}:${user?.id}`;

  const executeRequest = useCallback(async (isBackground = false) => {
    if (!enabled || !user) return;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    try {
      if (!isBackground) {
        setLoading(true);
        setError(null);
      }

      // Check cache first for GET requests
      if (method === 'GET') {
        const cachedData = apiCache.get(cacheKey);
        if (cachedData) {
          setData(cachedData);
          if (!isBackground) {
            setLoading(false);
          }
          
          // If stale-while-revalidate, continue with background fetch
          if (!staleWhileRevalidate) {
            return cachedData;
          } else {
            setIsStale(true);
          }
        }
      }

      const headers = await getAuthHeaders();
      const requestOptions = {
        method,
        headers,
        signal: abortControllerRef.current.signal,
      };

      if (body && method !== 'GET') {
        requestOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Cache successful GET requests
      if (method === 'GET') {
        apiCache.set(cacheKey, result, ttl);
      }

      setData(result);
      setIsStale(false);
      retryCountRef.current = 0;

      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (err) {
      if (err.name === 'AbortError') {
        return; // Request was cancelled
      }

      console.error(`API request failed: ${url}`, err);

      // Retry logic
      if (retryCountRef.current < retry) {
        retryCountRef.current++;
        setTimeout(() => {
          executeRequest(isBackground);
        }, retryDelay * retryCountRef.current);
        return;
      }

      setError(err.message || 'Request failed');
      
      if (onError) {
        onError(err);
      }
    } finally {
      if (!isBackground) {
        setLoading(false);
      }
    }
  }, [
    url,
    method,
    body,
    enabled,
    user,
    retry,
    retryDelay,
    cacheKey,
    ttl,
    staleWhileRevalidate,
    getAuthHeaders,
    onSuccess,
    onError
  ]);

  // Manual refetch function
  const refetch = useCallback((force = false) => {
    if (force && method === 'GET') {
      apiCache.delete(cacheKey);
    }
    return executeRequest();
  }, [executeRequest, cacheKey, method]);

  // Mutate function for optimistic updates
  const mutate = useCallback((newData, shouldRevalidate = true) => {
    setData(newData);
    
    if (method === 'GET') {
      apiCache.set(cacheKey, newData, ttl);
    }
    
    if (shouldRevalidate) {
      executeRequest(true); // Background revalidation
    }
  }, [cacheKey, method, ttl, executeRequest]);

  // Effect to trigger request
  useEffect(() => {
    executeRequest();
    
    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [executeRequest, ...dependencies]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    loading,
    error,
    isStale,
    refetch,
    mutate
  };
};

// Hook for clearing cache
export const useClearCache = () => {
  return useCallback((pattern) => {
    if (pattern) {
      // Clear cache entries matching pattern
      const keys = Array.from(apiCache.cache.keys());
      keys.forEach(key => {
        if (key.includes(pattern)) {
          apiCache.delete(key);
        }
      });
    } else {
      // Clear all cache
      apiCache.clear();
    }
  }, []);
};

// Export cache instance for direct access if needed
export { apiCache };