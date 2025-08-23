import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOptimizedDataFetching } from './useOptimizedDataFetching';
import { enhancedCache } from './useEnhancedCache';
import { useDataSync } from './useDataSync';
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '../utils/localStorage';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

/**
 * Optimized experiments hook with enhanced caching and error handling
 * Provides stable loading states and optimistic updates
 */
export const useOptimizedExperiments = (options = {}) => {
  const {
    enableOptimisticUpdates = true,
    autoRefresh = false,
    refreshInterval = 300000 // 5 minutes
  } = options;

  const { user } = useAuth();
  const { isOnline, addPendingChange } = useDataSync();
  
  // Load saved filters and sorting from localStorage
  const savedFilters = getStorageItem(STORAGE_KEYS.EXPERIMENT_FILTERS, {
    experiment_type: '',
    status: '',
    search: '',
    sortBy: 'created_at',
    sortOrder: 'desc'
  });

  const [filters, setFilters] = useState(savedFilters);
  const [optimisticOperations, setOptimisticOperations] = useState(new Map());

  // Build query parameters for API call
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.experiment_type) {
      params.append('experiment_type', filters.experiment_type);
    }
    if (filters.status) {
      params.append('status', filters.status);
    }
    if (filters.sortBy) {
      params.append('sort_by', filters.sortBy);
    }
    if (filters.sortOrder) {
      params.append('sort_order', filters.sortOrder);
    }
    return params.toString();
  }, [filters]);

  // Fetch experiments with optimized caching
  const {
    data: rawExperiments,
    loading,
    error,
    isStale,
    isValidating,
    refetch,
    mutate,
    preload
  } = useOptimizedDataFetching(`/api/experiments?${queryParams}`, {
    enabled: !!user,
    cacheKey: `experiments-${user?.id}-${queryParams}`,
    ttl: refreshInterval,
    staleWhileRevalidate: true,
    priority: 'normal',
    dependencies: ['user-auth', 'experiment-filters'],
    onSuccess: (data) => {
      // Cache successful response with metadata
      enhancedCache.set(`experiments-raw-${user?.id}`, data, {
        ttl: refreshInterval,
        tags: ['experiments', 'user-data'],
        priority: 'normal'
      });
    },
    onError: (error) => {
      console.error('Failed to fetch experiments:', error);
      if (!rawExperiments) {
        toast.error('Failed to load experiments');
      }
    }
  });

  // Apply client-side filtering and optimistic updates
  const experiments = useMemo(() => {
    let experimentsData = rawExperiments?.experiments || [];

    // Apply optimistic operations
    optimisticOperations.forEach((operation, operationId) => {
      switch (operation.type) {
        case 'create':
          experimentsData = [operation.data, ...experimentsData];
          break;
        case 'update':
          experimentsData = experimentsData.map(exp =>
            exp.id === operation.data.id ? { ...exp, ...operation.data } : exp
          );
          break;
        case 'delete':
          experimentsData = experimentsData.filter(exp => exp.id !== operation.data.id);
          break;
      }
    });

    // Apply client-side search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      experimentsData = experimentsData.filter(exp =>
        exp.name?.toLowerCase().includes(searchTerm) ||
        exp.experiment_type?.toLowerCase().includes(searchTerm) ||
        exp.description?.toLowerCase().includes(searchTerm)
      );
    }

    return experimentsData;
  }, [rawExperiments, optimisticOperations, filters.search]);

  // Get auth headers helper
  const getAuthHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('No authentication token available');
    }
    
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    };
  }, []);

  // Apply optimistic operation
  const applyOptimisticOperation = useCallback((type, data) => {
    if (!enableOptimisticUpdates) return null;

    const operationId = `${type}_${Date.now()}_${Math.random()}`;
    setOptimisticOperations(prev => new Map(prev).set(operationId, {
      type,
      data,
      timestamp: Date.now()
    }));

    // Auto-remove optimistic operation after timeout
    setTimeout(() => {
      setOptimisticOperations(prev => {
        const newMap = new Map(prev);
        newMap.delete(operationId);
        return newMap;
      });
    }, 10000); // 10 second timeout

    return operationId;
  }, [enableOptimisticUpdates]);

  // Remove optimistic operation
  const removeOptimisticOperation = useCallback((operationId) => {
    setOptimisticOperations(prev => {
      const newMap = new Map(prev);
      newMap.delete(operationId);
      return newMap;
    });
  }, []);

  // Create experiment with optimistic updates
  const createExperiment = useCallback(async (experimentData) => {
    const optimisticExperiment = {
      id: `temp-${Date.now()}`,
      ...experimentData,
      status: 'creating',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const operationId = applyOptimisticOperation('create', optimisticExperiment);

    try {
      if (!isOnline) {
        // Queue for offline sync
        addPendingChange({
          type: 'create',
          endpoint: '/api/experiments',
          data: experimentData,
          callback: () => createExperiment(experimentData)
        });
        throw new Error('Currently offline. Changes will sync when connection is restored.');
      }

      const headers = await getAuthHeaders();
      const response = await fetch('/api/experiments', {
        method: 'POST',
        headers,
        body: JSON.stringify(experimentData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create experiment');
      }

      const result = await response.json();
      
      // Remove optimistic operation and update cache
      if (operationId) {
        removeOptimisticOperation(operationId);
      }

      // Update experiments cache
      const updatedExperiments = {
        experiments: [result.experiment, ...(rawExperiments?.experiments || [])]
      };
      mutate(updatedExperiments, false);

      // Invalidate related cache entries
      enhancedCache.invalidateByTag('experiments');

      toast.success('Experiment created successfully!');
      return result.experiment;
    } catch (error) {
      if (operationId) {
        removeOptimisticOperation(operationId);
      }
      
      if (!error.message.includes('offline')) {
        toast.error(error.message || 'Failed to create experiment');
      }
      throw error;
    }
  }, [
    isOnline,
    addPendingChange,
    getAuthHeaders,
    applyOptimisticOperation,
    removeOptimisticOperation,
    rawExperiments,
    mutate
  ]);

  // Update experiment with optimistic updates
  const updateExperiment = useCallback(async (experimentId, updates) => {
    const existingExperiment = experiments.find(exp => exp.id === experimentId);
    if (!existingExperiment) {
      throw new Error('Experiment not found');
    }

    const optimisticUpdate = {
      ...existingExperiment,
      ...updates,
      updated_at: new Date().toISOString()
    };

    const operationId = applyOptimisticOperation('update', optimisticUpdate);

    try {
      if (!isOnline) {
        addPendingChange({
          type: 'update',
          endpoint: `/api/experiments/${experimentId}`,
          data: updates,
          callback: () => updateExperiment(experimentId, updates)
        });
        throw new Error('Currently offline. Changes will sync when connection is restored.');
      }

      const headers = await getAuthHeaders();
      const response = await fetch(`/api/experiments/${experimentId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update experiment');
      }

      const result = await response.json();
      
      // Remove optimistic operation and update cache
      if (operationId) {
        removeOptimisticOperation(operationId);
      }

      // Update experiments cache
      const updatedExperiments = {
        experiments: rawExperiments?.experiments?.map(exp =>
          exp.id === experimentId ? result.experiment : exp
        ) || []
      };
      mutate(updatedExperiments, false);

      enhancedCache.invalidateByTag('experiments');

      toast.success('Experiment updated successfully!');
      return result.experiment;
    } catch (error) {
      if (operationId) {
        removeOptimisticOperation(operationId);
      }
      
      if (!error.message.includes('offline')) {
        toast.error(error.message || 'Failed to update experiment');
      }
      throw error;
    }
  }, [
    experiments,
    isOnline,
    addPendingChange,
    getAuthHeaders,
    applyOptimisticOperation,
    removeOptimisticOperation,
    rawExperiments,
    mutate
  ]);

  // Delete experiment with optimistic updates
  const deleteExperiment = useCallback(async (experimentId) => {
    const experimentToDelete = experiments.find(exp => exp.id === experimentId);
    if (!experimentToDelete) {
      throw new Error('Experiment not found');
    }

    const operationId = applyOptimisticOperation('delete', { id: experimentId });

    try {
      if (!isOnline) {
        addPendingChange({
          type: 'delete',
          endpoint: `/api/experiments/${experimentId}`,
          data: { id: experimentId },
          callback: () => deleteExperiment(experimentId)
        });
        throw new Error('Currently offline. Changes will sync when connection is restored.');
      }

      const headers = await getAuthHeaders();
      const response = await fetch(`/api/experiments/${experimentId}`, {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete experiment');
      }

      // Remove optimistic operation and update cache
      if (operationId) {
        removeOptimisticOperation(operationId);
      }

      // Update experiments cache
      const updatedExperiments = {
        experiments: rawExperiments?.experiments?.filter(exp => exp.id !== experimentId) || []
      };
      mutate(updatedExperiments, false);

      enhancedCache.invalidateByTag('experiments');

      toast.success('Experiment deleted successfully');
    } catch (error) {
      if (operationId) {
        removeOptimisticOperation(operationId);
      }
      
      if (!error.message.includes('offline')) {
        toast.error(error.message || 'Failed to delete experiment');
      }
      throw error;
    }
  }, [
    experiments,
    isOnline,
    addPendingChange,
    getAuthHeaders,
    applyOptimisticOperation,
    removeOptimisticOperation,
    rawExperiments,
    mutate
  ]);

  // Get experiment details with caching
  const getExperimentDetails = useCallback(async (experimentId) => {
    const cacheKey = `experiment-details-${experimentId}-${user?.id}`;
    
    // Check cache first
    const cachedDetails = enhancedCache.get(cacheKey);
    if (cachedDetails) {
      return cachedDetails;
    }

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/experiments/${experimentId}`, {
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch experiment details');
      }

      const result = await response.json();
      
      // Cache the result
      enhancedCache.set(cacheKey, result, {
        ttl: 300000, // 5 minutes
        tags: ['experiment-details', 'experiments'],
        priority: 'normal'
      });

      return result;
    } catch (error) {
      console.error('Error fetching experiment details:', error);
      toast.error(error.message || 'Failed to load experiment details');
      throw error;
    }
  }, [getAuthHeaders, user?.id]);

  // Update filters with persistence
  const updateFilters = useCallback((newFilters) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    
    // Save to localStorage
    setStorageItem(STORAGE_KEYS.EXPERIMENT_FILTERS, updatedFilters);
  }, [filters]);

  // Update sorting with persistence
  const updateSorting = useCallback((field) => {
    let newSortOrder = 'desc';
    if (filters.sortBy === field) {
      newSortOrder = filters.sortOrder === 'asc' ? 'desc' : 'asc';
    }
    
    const updatedFilters = {
      ...filters,
      sortBy: field,
      sortOrder: newSortOrder
    };
    
    setFilters(updatedFilters);
    setStorageItem(STORAGE_KEYS.EXPERIMENT_FILTERS, updatedFilters);
  }, [filters]);

  // Clear filters with persistence
  const clearFilters = useCallback(() => {
    const defaultFilters = {
      experiment_type: '',
      status: '',
      search: '',
      sortBy: 'created_at',
      sortOrder: 'desc'
    };
    
    setFilters(defaultFilters);
    setStorageItem(STORAGE_KEYS.EXPERIMENT_FILTERS, defaultFilters);
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh || !user) return;

    const interval = setInterval(() => {
      refetch(false); // Background refresh
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, user, refreshInterval, refetch]);

  return {
    experiments,
    loading,
    error,
    isStale,
    isValidating,
    filters,
    isOptimistic: optimisticOperations.size > 0,
    isOnline,
    createExperiment,
    updateExperiment,
    deleteExperiment,
    getExperimentDetails,
    updateFilters,
    updateSorting,
    clearFilters,
    refetch,
    preload
  };
};