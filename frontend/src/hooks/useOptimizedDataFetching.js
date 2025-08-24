import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { enhancedCache } from './useEnhancedCache';
import { useDataSync } from './useDataSync';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

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
    isValidating: false,
    errorDetails: null,
    retryAfter: null,
    fallbackAvailable: false,
    partialFailure: false,
    serviceStatus: 'healthy'
  });

  const { user } = useAuth();
  const { isOnline, addPendingChange } = useDataSync();
  const abortControllerRef = useRef(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);
  const lastSuccessfulDataRef = useRef(null);
  const circuitBreakerRef = useRef({ failures: 0, lastFailure: null, isOpen: false });

  // Parse enhanced error response format
  const parseErrorResponse = useCallback((error, response) => {
    let errorInfo = {
      message: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
      retryAfter: null,
      fallbackAvailable: false,
      actions: [],
      userFriendly: true,
      shouldRetry: false,
      severity: 'error'
    };

    try {
      // Handle new standardized error format
      if (response && typeof response === 'object') {
        errorInfo = {
          message: response.message || response.error || errorInfo.message,
          code: response.error_code || response.code || errorInfo.code,
          retryAfter: response.retry_after || null,
          fallbackAvailable: response.fallback_available || false,
          actions: response.actions || [],
          userFriendly: true,
          shouldRetry: response.retry_after > 0 || response.fallback_available,
          severity: response.error_code === 'AUTH_FAILED' ? 'warning' : 'error',
          errorId: response.error_id,
          details: response.details
        };

        // Handle partial failure responses
        if (response.partial_failure) {
          errorInfo.severity = 'warning';
          errorInfo.message = 'Some data could not be loaded';
          errorInfo.fallbackAvailable = true;
        }

        // Handle stale data responses
        if (response.stale) {
          errorInfo.severity = 'info';
          errorInfo.message = 'Showing cached data due to service issues';
          errorInfo.fallbackAvailable = true;
        }
      } else {
        // Handle legacy error formats
        const errorMessage = error?.message || error || 'Unknown error';
        
        if (errorMessage.includes('401') || errorMessage.includes('unauthorized')) {
          errorInfo.code = 'AUTH_FAILED';
          errorInfo.message = 'Please refresh your session and try again';
          errorInfo.actions = ['refresh_token', 'login_again'];
          errorInfo.severity = 'warning';
        } else if (errorMessage.includes('503') || errorMessage.includes('temporarily unavailable')) {
          errorInfo.code = 'SERVICE_UNAVAILABLE';
          errorInfo.message = 'Service temporarily unavailable';
          errorInfo.retryAfter = 30;
          errorInfo.shouldRetry = true;
        } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          errorInfo.code = 'NETWORK_ERROR';
          errorInfo.message = 'Network connection issue. Please check your internet connection.';
          errorInfo.shouldRetry = true;
          errorInfo.retryAfter = 5;
        }
      }
    } catch (parseError) {
      console.warn('Error parsing error response:', parseError);
    }

    return errorInfo;
  }, []);

  // Circuit breaker logic
  const updateCircuitBreaker = useCallback((success = false) => {
    const breaker = circuitBreakerRef.current;
    
    if (success) {
      breaker.failures = 0;
      breaker.isOpen = false;
    } else {
      breaker.failures += 1;
      breaker.lastFailure = Date.now();
      
      // Open circuit breaker after 3 consecutive failures
      if (breaker.failures >= 3) {
        breaker.isOpen = true;
        // Auto-reset after 30 seconds
        setTimeout(() => {
          breaker.isOpen = false;
          breaker.failures = 0;
        }, 30000);
      }
    }
  }, []);

  // Check if circuit breaker allows request
  const canMakeRequest = useCallback(() => {
    const breaker = circuitBreakerRef.current;
    return !breaker.isOpen;
  }, []);

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
      console.warn('Authentication failed:', error.message);
      throw new Error('Authentication failed');
    }
  }, []);

  // Enhanced fetch function with intelligent error handling and retry logic
  const fetchData = useCallback(async (isBackground = false, forceRefresh = false) => {
    if (!enabled || !user) return;

    // Check circuit breaker
    if (!canMakeRequest()) {
      const cachedData = enhancedCache.get(cacheKey);
      if (cachedData) {
        updateState({
          data: cachedData,
          loading: false,
          isValidating: false,
          error: 'Service temporarily unavailable, showing cached data',
          isStale: true,
          serviceStatus: 'degraded',
          fallbackAvailable: true
        });
        return cachedData;
      } else {
        updateState({
          loading: false,
          isValidating: false,
          error: 'Service temporarily unavailable',
          serviceStatus: 'unavailable',
          retryAfter: 30
        });
        return null;
      }
    }

    // Cancel previous request to prevent race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    try {
      // For background requests, show validation state instead of loading
      if (isBackground) {
        updateState({ isValidating: true, error: null, serviceStatus: 'healthy' });
      } else {
        updateState({ loading: true, error: null, isValidating: false, serviceStatus: 'healthy' });
      }

      // Check cache first for GET requests (unless force refresh)
      if (method === 'GET' && !forceRefresh) {
        const cachedData = enhancedCache.get(cacheKey);
        if (cachedData) {
          updateState({ 
            data: cachedData, 
            loading: false,
            isValidating: false,
            isStale: false,
            serviceStatus: 'healthy'
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
          error: offlineError.message,
          serviceStatus: 'offline'
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
      let result;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorInfo = parseErrorResponse(null, errorData);
        
        // Handle specific error codes
        if (errorInfo.code === 'AUTH_FAILED') {
          // Handle authentication errors
          if (errorInfo.actions.includes('refresh_token')) {
            try {
              const { data: { session } } = await supabase.auth.refreshSession();
              if (session) {
                // Retry with new token
                return fetchData(isBackground, forceRefresh);
              }
            } catch (refreshError) {
              console.warn('Token refresh failed:', refreshError);
            }
          }
          
          updateState({
            loading: false,
            isValidating: false,
            error: errorInfo.message,
            errorDetails: errorInfo,
            serviceStatus: 'auth_required'
          });
          
          // Show user-friendly toast
          toast.error('Please log in again to continue', {
            duration: 5000,
            action: {
              label: 'Login',
              onClick: () => window.location.href = '/login'
            }
          });
          
          updateCircuitBreaker(false);
          throw new Error(errorInfo.message);
        }
        
        // Handle service unavailable with fallback
        if (errorInfo.code === 'DATABASE_ERROR' || response.status === 503) {
          const cachedData = enhancedCache.get(cacheKey);
          if (cachedData && errorInfo.fallbackAvailable) {
            updateState({
              data: cachedData,
              loading: false,
              isValidating: false,
              error: errorInfo.message,
              isStale: true,
              errorDetails: errorInfo,
              fallbackAvailable: true,
              serviceStatus: 'degraded'
            });
            
            toast.error('Service temporarily unavailable, showing cached data', {
              duration: 4000
            });
            
            updateCircuitBreaker(false);
            return cachedData;
          }
        }
        
        updateCircuitBreaker(false);
        throw new Error(errorInfo.message);
      }

      result = await response.json();

      // Handle partial failure responses
      if (result.partial_failure) {
        const errorInfo = parseErrorResponse(null, result);
        updateState({
          data: result,
          loading: false,
          isValidating: false,
          error: errorInfo.message,
          errorDetails: errorInfo,
          partialFailure: true,
          serviceStatus: 'degraded'
        });
        
        toast.warning('Some data could not be loaded', {
          duration: 3000
        });
      } else if (result.stale) {
        // Handle stale data responses
        updateState({
          data: result,
          loading: false,
          isValidating: false,
          isStale: true,
          serviceStatus: 'degraded'
        });
        
        toast.info('Showing cached data due to service issues', {
          duration: 3000
        });
      } else {
        // Handle successful response
        updateState({
          data: result,
          loading: false,
          isValidating: false,
          error: null,
          isStale: false,
          partialFailure: false,
          serviceStatus: 'healthy'
        });
      }

      // Cache successful GET requests with enhanced metadata
      if (method === 'GET') {
        enhancedCache.set(cacheKey, result, {
          ttl,
          tags: ['api-data', endpoint.split('/')[2] || 'general'],
          priority,
          dependencies: dependencies.map(dep => `${dep}:${user?.id}`)
        });
      }

      retryCountRef.current = 0;
      updateCircuitBreaker(true);

      if (onSuccess) {
        onSuccess(result);
      }

      return result;
    } catch (err) {
      if (err.name === 'AbortError') {
        return; // Request was cancelled
      }

      // Parse error for intelligent handling
      const errorInfo = parseErrorResponse(err);
      
      // Only log non-auth errors to reduce console noise
      if (!err.message.includes('Authentication failed')) {
        console.error(`Optimized fetch error for ${endpoint}:`, err);
      }

      // Intelligent retry logic
      const shouldRetry = errorInfo.shouldRetry && retryCountRef.current < retry;
      const isRetryableError = errorInfo.code === 'NETWORK_ERROR' || 
                              errorInfo.code === 'SERVICE_UNAVAILABLE' ||
                              err.message.includes('fetch') || 
                              err.message.includes('network');

      if (shouldRetry && isRetryableError) {
        retryCountRef.current++;
        const retryDelay = errorInfo.retryAfter ? 
          errorInfo.retryAfter * 1000 : 
          retryDelay * Math.pow(2, retryCountRef.current - 1); // Exponential backoff
        
        toast.loading(`Retrying... (${retryCountRef.current}/${retry})`, {
          duration: retryDelay,
          id: `retry-${endpoint}`
        });
        
        setTimeout(() => {
          fetchData(isBackground, forceRefresh);
        }, retryDelay);
        return;
      }

      // Try to return cached data as fallback
      const cachedData = enhancedCache.get(cacheKey);
      if (cachedData && method === 'GET') {
        updateState({
          data: cachedData,
          loading: false,
          isValidating: false,
          error: errorInfo.message,
          isStale: true,
          errorDetails: errorInfo,
          fallbackAvailable: true,
          serviceStatus: 'degraded'
        });
        
        toast.error(`${errorInfo.message}. Showing cached data.`, {
          duration: 4000
        });
        
        updateCircuitBreaker(false);
        return cachedData;
      }

      // Update error state without clearing existing data to prevent flickering
      updateState({
        loading: false,
        isValidating: false,
        error: errorInfo.message,
        errorDetails: errorInfo,
        retryAfter: errorInfo.retryAfter,
        fallbackAvailable: errorInfo.fallbackAvailable,
        serviceStatus: errorInfo.code === 'AUTH_FAILED' ? 'auth_required' : 'error'
      });

      // Show appropriate toast notification
      if (errorInfo.severity === 'error' && retryCountRef.current >= retry) {
        toast.error(errorInfo.message, {
          duration: 5000,
          action: errorInfo.actions.length > 0 ? {
            label: 'Help',
            onClick: () => console.log('Error actions:', errorInfo.actions)
          } : undefined
        });
      }

      updateCircuitBreaker(false);

      if (onError) {
        onError(err, errorInfo);
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
    dependencies,
    parseErrorResponse,
    canMakeRequest,
    updateCircuitBreaker
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
    if (enabled && user) {
      fetchData();
    }
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, user, endpoint, method, JSON.stringify(body), ...dependencies]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Enhanced retry function with intelligent logic
  const intelligentRetry = useCallback(async (force = false) => {
    const errorInfo = state.errorDetails;
    
    if (errorInfo?.code === 'AUTH_FAILED') {
      // Try to refresh token first
      try {
        const { data: { session } } = await supabase.auth.refreshSession();
        if (session) {
          toast.success('Session refreshed, retrying...');
          return fetchData(false, true);
        }
      } catch (refreshError) {
        toast.error('Please log in again');
        window.location.href = '/login';
        return;
      }
    }
    
    // Reset circuit breaker if manually retrying
    if (force) {
      circuitBreakerRef.current = { failures: 0, lastFailure: null, isOpen: false };
      retryCountRef.current = 0;
    }
    
    return refetch(force);
  }, [state.errorDetails, fetchData, refetch]);

  // Get user-friendly error message with recovery suggestions
  const getErrorMessage = useCallback(() => {
    if (!state.error) return null;
    
    const errorInfo = state.errorDetails;
    if (!errorInfo) return state.error;
    
    let message = errorInfo.message;
    let suggestions = [];
    
    switch (errorInfo.code) {
      case 'AUTH_FAILED':
        suggestions = ['Try refreshing the page', 'Log in again'];
        break;
      case 'NETWORK_ERROR':
        suggestions = ['Check your internet connection', 'Try again in a moment'];
        break;
      case 'DATABASE_ERROR':
        suggestions = ['Try again in a few minutes', 'Contact support if the issue persists'];
        break;
      case 'SERVICE_UNAVAILABLE':
        suggestions = [`Wait ${errorInfo.retryAfter || 30} seconds and try again`];
        break;
      default:
        suggestions = ['Try refreshing the page', 'Contact support if the issue persists'];
    }
    
    return {
      message,
      suggestions,
      severity: errorInfo.severity || 'error',
      canRetry: errorInfo.shouldRetry || errorInfo.fallbackAvailable,
      retryAfter: errorInfo.retryAfter
    };
  }, [state.error, state.errorDetails]);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    isStale: state.isStale,
    isValidating: state.isValidating,
    lastFetch: state.lastFetch,
    errorDetails: state.errorDetails,
    retryAfter: state.retryAfter,
    fallbackAvailable: state.fallbackAvailable,
    partialFailure: state.partialFailure,
    serviceStatus: state.serviceStatus,
    refetch,
    mutate,
    preload,
    intelligentRetry,
    getErrorMessage
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

  // Check for partial failures
  const hasPartialFailures = useMemo(() => {
    return summary.partialFailure || charts.partialFailure || recent.partialFailure;
  }, [summary.partialFailure, charts.partialFailure, recent.partialFailure]);

  // Overall service status
  const overallServiceStatus = useMemo(() => {
    const statuses = [summary.serviceStatus, charts.serviceStatus, recent.serviceStatus];
    
    if (statuses.includes('unavailable')) return 'unavailable';
    if (statuses.includes('error')) return 'error';
    if (statuses.includes('auth_required')) return 'auth_required';
    if (statuses.includes('degraded') || statuses.includes('offline')) return 'degraded';
    return 'healthy';
  }, [summary.serviceStatus, charts.serviceStatus, recent.serviceStatus]);

  // Get comprehensive error information
  const getErrorSummary = useCallback(() => {
    const errors = [
      { name: 'summary', ...summary.getErrorMessage() },
      { name: 'charts', ...charts.getErrorMessage() },
      { name: 'recent', ...recent.getErrorMessage() }
    ].filter(error => error.message);

    if (errors.length === 0) return null;

    // If all failed with same error, show unified message
    if (errors.length === 3 && errors.every(e => e.message === errors[0].message)) {
      return {
        message: errors[0].message,
        suggestions: errors[0].suggestions,
        severity: errors[0].severity,
        canRetry: errors[0].canRetry,
        unified: true
      };
    }

    // Show summary of different errors
    return {
      message: `${errors.length} of 3 dashboard sections failed to load`,
      suggestions: ['Try refreshing the page', 'Check individual sections for details'],
      severity: 'warning',
      canRetry: true,
      unified: false,
      details: errors
    };
  }, [summary.getErrorMessage, charts.getErrorMessage, recent.getErrorMessage]);

  // Coordinated refetch function
  const refetchAll = useCallback((force = false) => {
    return Promise.all([
      summary.refetch(force),
      charts.refetch(force),
      recent.refetch(force)
    ]);
  }, [summary.refetch, charts.refetch, recent.refetch]);

  // Intelligent retry for all dashboard data
  const intelligentRetryAll = useCallback((force = false) => {
    return Promise.all([
      summary.intelligentRetry(force),
      charts.intelligentRetry(force),
      recent.intelligentRetry(force)
    ]);
  }, [summary.intelligentRetry, charts.intelligentRetry, recent.intelligentRetry]);

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
    hasPartialFailures,
    overallServiceStatus,
    refetchAll,
    intelligentRetryAll,
    preloadAll,
    getErrorSummary
  };
};