import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiCache } from './useApiCache';
import { useDataSync } from './useDataSync';

/**
 * Enhanced data fetching hook with stable loading states and optimistic updates
 * Prevents flickering by maintaining consistent UI states during data operations
 */
export const useStableDataFetching = (endpoint, options = {}) => {
  const {
    method = 'GET',
    body = null,
    enabled = true,
    retry = 3,
    retryDelay = 1000,
    cacheKey: customCacheKey,
    ttl = 300000, // 5 minutes
    staleWhileRevalidate = true,
    optimisticUpdates = false,
    onSuccess,
    onError,
    dependencies = []
  } = options;

  // Stable state management to prevent unnecessary re-renders
  const [state, setState] = useState({
    data: null,
    loading: false,
    error: null,
    isStale: false,
    lastFetch: null,
    optimisticData: null
  });

  const { user, getAuthHeaders } = useAuth();
  const { isOnline, addPendingChange } = useDataSync();
  const abortControllerRef = useRef(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  // Generate stable cache key
  const cacheKey = useMemo(() => {
    return customCacheKey || `${method}:${endpoint}:${JSON.stringify(body)}:${user?.id}`;
  }, [customCacheKey, method, endpoint, body, user?.id]);

  // Stable update function to prevent flickering
  const updateState = useCallback((updates) => {
    if (!mountedRef.current) return;
    
    setState(prevState => ({
      ...prevState,
      ...updates,
      lastFetch: updates.data ? Date.now() : prevState.lastFetch
    }));
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
      // Only show loading for foreground requests to prevent flickering
      if (!isBackground) {
        updateState({ loading: true, error: null });
      }

      // Check cache first for GET requests (unless force refresh)
      if (method === 'GET' && !forceRefresh) {
        const cachedData = apiCache.get(cacheKey);
        if (cachedData) {
          updateState({ 
            data: cachedData, 
            loading: false, 
            isStale: false 
          });
          
          // If stale-while-revalidate, continue with background fetch
          if (!staleWhileRevalidate) {
            return cachedData;
          } else {
            updateState({ isStale: true });
          }
        }
      }

      // Handle offline state
      if (!isOnline && method !== 'GET') {
        const offlineError = new Error('Currently offline. Changes will sync when connection is restored.');
        
        // Add to pending changes for later sync
        addPendingChange({
          type: method.toLowerCase(),
          endpoint,
          data: body,
          callback: () => fetchData(false, true)
        });
        
        throw offlineError;
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

      // Cache successful GET requests
      if (method === 'GET') {
        apiCache.set(cacheKey, result, ttl);
      }

      // Update state with successful result
      updateState({
        data: result,
        loading: false,
        error: null,
        isStale: false,
        optimisticData: null // Clear optimistic data on successful fetch
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

      console.error(`Stable fetch error for ${endpoint}:`, err);

      // Retry logic for network errors
      if (retryCountRef.current < retry && err.message.includes('fetch')) {
        retryCountRef.current++;
        setTimeout(() => {
          fetchData(isBackground, forceRefresh);
        }, retryDelay * retryCountRef.current);
        return;
      }

      // Update error state without clearing existing data to prevent flickering
      updateState({
        loading: false,
        error: err.message || 'Request failed',
        isStale: false
      });

      if (onError) {
        onError(err);
      }
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
    onError
  ]);

  // Optimistic update function
  const optimisticUpdate = useCallback((optimisticData, updateFn) => {
    if (!optimisticUpdates) {
      console.warn('Optimistic updates not enabled for this hook');
      return updateFn();
    }

    // Apply optimistic update immediately
    updateState({ 
      optimisticData,
      loading: true 
    });

    // Execute actual update
    return updateFn()
      .then(result => {
        // Clear optimistic data and update with real result
        updateState({
          data: result,
          optimisticData: null,
          loading: false,
          error: null
        });
        return result;
      })
      .catch(err => {
        // Revert optimistic update on error
        updateState({
          optimisticData: null,
          loading: false,
          error: err.message
        });
        throw err;
      });
  }, [optimisticUpdates, updateState]);

  // Manual refetch function
  const refetch = useCallback((force = false) => {
    if (force && method === 'GET') {
      apiCache.delete(cacheKey);
    }
    return fetchData(false, force);
  }, [fetchData, cacheKey, method]);

  // Mutate function for manual data updates
  const mutate = useCallback((newData, shouldRevalidate = true) => {
    updateState({ data: newData });
    
    if (method === 'GET') {
      apiCache.set(cacheKey, newData, ttl);
    }
    
    if (shouldRevalidate) {
      fetchData(true); // Background revalidation
    }
  }, [updateState, method, cacheKey, ttl, fetchData]);

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

  // Return stable data (optimistic data takes precedence)
  const stableData = useMemo(() => {
    return state.optimisticData || state.data;
  }, [state.optimisticData, state.data]);

  return {
    data: stableData,
    loading: state.loading,
    error: state.error,
    isStale: state.isStale,
    lastFetch: state.lastFetch,
    isOptimistic: !!state.optimisticData,
    refetch,
    mutate,
    optimisticUpdate
  };
};

/**
 * Hook for stable dashboard data fetching with coordinated loading states
 */
export const useStableDashboardData = () => {
  const { user } = useAuth();
  
  // Fetch all dashboard data with coordinated loading states
  const summary = useStableDataFetching('/api/dashboard/summary', {
    enabled: !!user,
    cacheKey: `dashboard-summary-${user?.id}`,
    ttl: 300000, // 5 minutes
    staleWhileRevalidate: true
  });

  const charts = useStableDataFetching('/api/dashboard/charts', {
    enabled: !!user,
    cacheKey: `dashboard-charts-${user?.id}`,
    ttl: 300000,
    staleWhileRevalidate: true,
    dependencies: [user?.id]
  });

  const recent = useStableDataFetching('/api/dashboard/recent', {
    enabled: !!user,
    cacheKey: `dashboard-recent-${user?.id}`,
    ttl: 180000, // 3 minutes for recent data
    staleWhileRevalidate: true
  });

  // Coordinated loading state - only show loading if all are loading initially
  const isInitialLoading = useMemo(() => {
    return summary.loading && charts.loading && recent.loading && 
           !summary.data && !charts.data && !recent.data;
  }, [summary.loading, charts.loading, recent.loading, summary.data, charts.data, recent.data]);

  // Coordinated error state
  const hasAllErrors = useMemo(() => {
    return summary.error && charts.error && recent.error;
  }, [summary.error, charts.error, recent.error]);

  // Coordinated refetch function
  const refetchAll = useCallback(() => {
    summary.refetch();
    charts.refetch();
    recent.refetch();
  }, [summary.refetch, charts.refetch, recent.refetch]);

  return {
    summary,
    charts,
    recent,
    isInitialLoading,
    hasAllErrors,
    refetchAll
  };
};

/**
 * Hook for stable experiment data with optimistic updates
 */
export const useStableExperiments = () => {
  const { user } = useAuth();
  
  const experiments = useStableDataFetching('/api/experiments', {
    enabled: !!user,
    cacheKey: `experiments-${user?.id}`,
    ttl: 180000, // 3 minutes
    staleWhileRevalidate: true,
    optimisticUpdates: true
  });

  // Optimistic create function
  const createExperiment = useCallback(async (experimentData) => {
    const optimisticExperiment = {
      id: `temp-${Date.now()}`,
      ...experimentData,
      status: 'creating',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return experiments.optimisticUpdate(
      experiments.data ? [...experiments.data, optimisticExperiment] : [optimisticExperiment],
      async () => {
        const headers = await user.getAuthHeaders();
        const response = await fetch('/api/experiments', {
          method: 'POST',
          headers,
          body: JSON.stringify(experimentData)
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create experiment');
        }

        const result = await response.json();
        
        // Update cache with new experiment list
        const updatedExperiments = experiments.data 
          ? experiments.data.filter(exp => exp.id !== optimisticExperiment.id).concat(result.experiment)
          : [result.experiment];
        
        return updatedExperiments;
      }
    );
  }, [experiments, user]);

  // Optimistic delete function
  const deleteExperiment = useCallback(async (experimentId) => {
    const optimisticData = experiments.data 
      ? experiments.data.filter(exp => exp.id !== experimentId)
      : [];

    return experiments.optimisticUpdate(
      optimisticData,
      async () => {
        const headers = await user.getAuthHeaders();
        const response = await fetch(`/api/experiments/${experimentId}`, {
          method: 'DELETE',
          headers
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to delete experiment');
        }

        return optimisticData;
      }
    );
  }, [experiments, user]);

  return {
    ...experiments,
    createExperiment,
    deleteExperiment
  };
};