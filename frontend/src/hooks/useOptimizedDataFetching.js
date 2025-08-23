import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { enhancedCache } from './useEnhancedCache';
import { useDataSync } from './useDataSync';

/**
 * Optimized data fetching hook with proper loading state management
 * Prevents flickering by maintaining consistent UI states during data operations
 */
export const useOptimizedDataFetching = (endpoint, options = {}) => {
  const {
    method = 'GET',
    body = null,
    enabled = true,
    retry = 3,
    retryDelay = 1000,
    cacheKey: customCacheKey,
    ttl = 300000, // 5 minutes
    staleWhileRevalidate = true,
    onSuccess,
    onError,
    dependencies = [],
    priority = 'normal'
  } = options;

  // Stable state management to prevent unnecessary re-renders
  const [state, setState] = useState({
    data: null,
    loading: false,
    error: null,
    isStale: false,
    lastFetch: null,
    isValidating: false
  });

  const { user } = useAuth();
  const { isOnline, addPendingChange } = useDataSync();
  const abortControllerRef = useRef(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);
  const lastSuccessfulDataRef = useRef(null);

  // Generate stable cache key
  const cacheKey = useMemo(() => {
    return customCacheKey || `${method}:${endpoint}:${JSON.stringify(body)}:${user?.id}`;
  }, [customCacheKey, method, endpoint, body, user?.id]);

  // Stable update function to prevent flickering
  const updateState = useCallback((updates) => {
    if (!mountedRef.current) return;
    
    setState(prevState => {
      const newState = {
        ...prevState,
        ...updates
      };

      // Update last fetch time only when we get new data
      if (updates.data !== undefined) {
        newState.lastFetch = Date.now();
        if (updates.data !== null) {
          lastSuccessfulDataRef.current = updates.data;
        }
      }

      return newState;
    });
  }, []);

  // Get auth headers with error handling
  const getAuthHeaders = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }
      
      return {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      };
    } catch (error) {
      throw new Error('Authentication failed');
    }
  }, []);

  // Enhanced fetch function with stable loading states
  const fetchData = useCallback(async (isBackground = false, forceRefresh = false) => {
    if (!enabled || !user) return;

    // Cancel previous request to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      // For background requests, show validation state instead of loading
      if (isBackground) {
        updateState({ isValidating: true, error: null });
      } else {
        updateState({ loading: true, error: null, isValidating: false });
      }

      // Check cache first for GET requests (unless force refresh)
      if (method === 'GET' && !forceRefresh) {
        const cachedData = enhancedCache.get(cacheKey);
        if (cachedData) {
          updateState({ 
            data: cachedData, 
            loading: false,
            isValidating: false,
            isStale: false 
          });
          
          // If stale-while-revalidate, continue with background fetch
          if (!staleWhileRevalidate) {
            return cachedData;
          } else {
            updateState({ isStale: true, isValidating: true });
          }
        }
      }

      // Handle offline state gracefully
      if (!isOnline && method !== 'GET') {
        const offlineError = new Error('Currently offline. Changes will sync when connection is restored.');
        
        // Add to pending changes for later sync
        addPendingChange({
          type: method.toLowerCase(),
          endpoint,
          data: body,
          callback: () => fetchData(false, true)
        });
        
        // Don't clear existing data, just show error
        updateState({
          loading: false,
          isValidating: false,
          error: offlineError.message
        });
        
        return lastSuccessfulDataRef.current;
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

      const response = await fetch(endpoint, requestOptions);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      // Cache successful GET requests with enhanced metadata
      if (method === 'GET') {
        enhancedCache.set(cacheKey, result, {
          ttl,
          tags: ['api-data', endpoint.split('/')[2] || 'general'],
          priority,
          dependencies: dependencies.map(dep => `${dep}:${user?.id}`)
        });
      }

      // Update state with successful result
      updateState({
        data: result,
        loading: false,
        isValidating: false,
        error: null,
        isStale: false
      });

      retryCountRef.current = 0;

      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (err) {
      if (err.name === 'AbortError') {
        return; // Request was cancelled
      }

      console.error(`Optimized fetch error for ${endpoint}:`, err);

      // Retry logic for network errors
      if (retryCountRef.current < retry && (err.message.includes('fetch') || err.message.includes('network'))) {
        retryCountRef.current++;
        setTimeout(() => {
          fetchData(isBackground, forceRefresh);
        }, retryDelay * Math.pow(2, retryCountRef.current - 1)); // Exponential backoff
        return;
      }

      // Update error state without clearing existing data to prevent flickering
      updateState({
        loading: false,
        isValidating: false,
        error: err.message || 'Request failed',
        isStale: false
      });

      if (onError) {
        onError(err);
      }

      // Return last successful data if available
      return lastSuccessfulDataRef.current;
    }
  }, [
    enabled,
    user,
    method,
    endpoint,
    body,
    cacheKey,
    ttl,
    staleWhileRevalidate,
    retry,
    retryDelay,
    isOnline,
    addPendingChange,
    getAuthHeaders,
    updateState,
    onSuccess,
    onError,
    priority,
    dependencies
  ]);

  // Manual refetch function
  const refetch = useCallback((force = false) => {
    if (force && method === 'GET') {
      enhancedCache.delete(cacheKey);
    }
    return fetchData(false, force);
  }, [fetchData, cacheKey, method]);

  // Mutate function for manual data updates
  const mutate = useCallback((newData, shouldRevalidate = true) => {
    updateState({ data: newData });
    
    if (method === 'GET') {
      enhancedCache.set(cacheKey, newData, {
        ttl,
        tags: ['api-data', endpoint.split('/')[2] || 'general'],
        priority
      });
    }
    
    if (shouldRevalidate) {
      fetchData(true); // Background revalidation
    }
  }, [updateState, method, cacheKey, ttl, fetchData, endpoint, priority]);

  // Preload function for better performance
  const preload = useCallback(() => {
    if (method === 'GET' && !enhancedCache.has(cacheKey)) {
      fetchData(true);
    }
  }, [method, cacheKey, fetchData]);

  // Effect to trigger initial fetch and handle dependencies
  useEffect(() => {
    fetchData();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchData, ...dependencies]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    isStale: state.isStale,
    isValidating: state.isValidating,
    lastFetch: state.lastFetch,
    refetch,
    mutate,
    preload
  };
};

/**
 * Hook for optimized dashboard data fetching with coordinated loading states
 */
export const useOptimizedDashboardData = () => {
  const { user } = useAuth();
  
  // Fetch all dashboard data with coordinated loading states
  const summary = useOptimizedDataFetching('/api/dashboard/summary', {
    enabled: !!user,
    cacheKey: `dashboard-summary-${user?.id}`,
    ttl: 300000, // 5 minutes
    staleWhileRevalidate: true,
    priority: 'high',
    dependencies: ['user-auth']
  });

  const charts = useOptimizedDataFetching('/api/dashboard/charts', {
    enabled: !!user,
    cacheKey: `dashboard-charts-${user?.id}`,
    ttl: 300000,
    staleWhileRevalidate: true,
    priority: 'normal',
    dependencies: ['user-auth', 'dashboard-summary']
  });

  const recent = useOptimizedDataFetching('/api/dashboard/recent', {
    enabled: !!user,
    cacheKey: `dashboard-recent-${user?.id}`,
    ttl: 180000, // 3 minutes for recent data
    staleWhileRevalidate: true,
    priority: 'normal',
    dependencies: ['user-auth']
  });

  // Coordinated loading state - only show loading if all are loading initially
  const isInitialLoading = useMemo(() => {
    return (summary.loading || charts.loading || recent.loading) && 
           !summary.data && !charts.data && !recent.data &&
           !summary.error && !charts.error && !recent.error;
  }, [
    summary.loading, charts.loading, recent.loading, 
    summary.data, charts.data, recent.data,
    summary.error, charts.error, recent.error
  ]);

  // Coordinated validation state
  const isValidating = useMemo(() => {
    return summary.isValidating || charts.isValidating || recent.isValidating;
  }, [summary.isValidating, charts.isValidating, recent.isValidating]);

  // Coordinated error state - only show error if all requests failed
  const hasAllErrors = useMemo(() => {
    return summary.error && charts.error && recent.error;
  }, [summary.error, charts.error, recent.error]);

  // Check if any data is stale
  const hasStaleData = useMemo(() => {
    return summary.isStale || charts.isStale || recent.isStale;
  }, [summary.isStale, charts.isStale, recent.isStale]);

  // Coordinated refetch function
  const refetchAll = useCallback((force = false) => {
    return Promise.all([
      summary.refetch(force),
      charts.refetch(force),
      recent.refetch(force)
    ]);
  }, [summary.refetch, charts.refetch, recent.refetch]);

  // Preload all dashboard data
  const preloadAll = useCallback(() => {
    summary.preload();
    charts.preload();
    recent.preload();
  }, [summary.preload, charts.preload, recent.preload]);

  return {
    summary,
    charts,
    recent,
    isInitialLoading,
    isValidating,
    hasAllErrors,
    hasStaleData,
    refetchAll,
    preloadAll
  };
};