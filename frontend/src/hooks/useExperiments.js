import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { useOptimisticCrud } from './useOptimisticUpdates';
import { useDataSync } from './useDataSync';
import { useCleanup, useIsMounted } from './useCleanup';
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '../utils/localStorage';

const useExperiments = () => {
  // Load filters from localStorage
  const savedFilters = getStorageItem(STORAGE_KEYS.EXPERIMENT_FILTERS);
  
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(savedFilters);
  const [sortBy, setSortBy] = useState(savedFilters.sortBy);
  const [sortOrder, setSortOrder] = useState(savedFilters.sortOrder);

  const { isMounted, safeSetState } = useIsMounted();
  const { addPendingChange, isOnline } = useDataSync();

  // Get auth token for API calls
  const getAuthToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  }, []);

  // Fetch experiments from API
  const fetchExperiments = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Build query parameters
      const params = new URLSearchParams();
      if (filters.experiment_type) {
        params.append('experiment_type', filters.experiment_type);
      }
      if (filters.status) {
        params.append('status', filters.status);
      }

      const response = await fetch(`/api/experiments?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch experiments');
      }

      const data = await response.json();
      let experimentsData = data.experiments || [];

      // Apply client-side search filter
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        experimentsData = experimentsData.filter(exp =>
          exp.name.toLowerCase().includes(searchTerm) ||
          exp.experiment_type.toLowerCase().includes(searchTerm)
        );
      }

      // Apply client-side sorting
      experimentsData.sort((a, b) => {
        let aValue = a[sortBy];
        let bValue = b[sortBy];

        // Handle date sorting
        if (sortBy === 'created_at' || sortBy === 'updated_at') {
          aValue = new Date(aValue);
          bValue = new Date(bValue);
        }

        // Handle string sorting
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (sortOrder === 'asc') {
          return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
        } else {
          return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
        }
      });

      setExperiments(experimentsData);
    } catch (err) {
      console.error('Error fetching experiments:', err);
      setError(err.message);
      toast.error('Failed to load experiments');
    } finally {
      setLoading(false);
    }
  }, [filters, sortBy, sortOrder, getAuthToken]);

  // Optimistic CRUD operations
  const {
    data: optimisticExperiments,
    isOptimistic,
    optimisticCreate,
    optimisticUpdate,
    optimisticDelete
  } = useOptimisticCrud('/api/experiments', experiments, {
    onCreateSuccess: (result) => {
      toast.success('Experiment created and completed successfully!');
    },
    onUpdateSuccess: (result) => {
      toast.success('Experiment updated successfully!');
    },
    onDeleteSuccess: (id) => {
      toast.success('Experiment deleted successfully');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  // Create new experiment with optimistic updates
  const createExperiment = useCallback(async (experimentData) => {
    const apiCall = async (data) => {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      if (!isOnline) {
        // Add to pending changes for offline sync
        addPendingChange({
          type: 'create',
          endpoint: '/api/experiments',
          data,
          callback: () => createExperiment(data)
        });
        throw new Error('Currently offline. Changes will sync when connection is restored.');
      }

      const response = await fetch('/api/experiments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create experiment');
      }

      const result = await response.json();
      return result.experiment;
    };

    return optimisticCreate(experimentData, apiCall);
  }, [getAuthToken, optimisticCreate, isOnline, addPendingChange]);

  // Delete experiment with optimistic updates
  const deleteExperiment = useCallback(async (experimentId) => {
    const apiCall = async (id) => {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      if (!isOnline) {
        addPendingChange({
          type: 'delete',
          endpoint: `/api/experiments/${id}`,
          data: { id },
          callback: () => deleteExperiment(id)
        });
        throw new Error('Currently offline. Changes will sync when connection is restored.');
      }

      const response = await fetch(`/api/experiments/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete experiment');
      }
    };

    return optimisticDelete(experimentId, apiCall);
  }, [getAuthToken, optimisticDelete, isOnline, addPendingChange]);

  // Get experiment details
  const getExperimentDetails = useCallback(async (experimentId) => {
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/experiments/${experimentId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch experiment details');
      }

      return await response.json();
    } catch (err) {
      console.error('Error fetching experiment details:', err);
      toast.error(err.message);
      throw err;
    }
  }, [getAuthToken]);

  // Update filters with persistence
  const updateFilters = useCallback((newFilters) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    
    // Save to localStorage
    setStorageItem(STORAGE_KEYS.EXPERIMENT_FILTERS, {
      ...savedFilters,
      ...updatedFilters
    });
  }, [filters, savedFilters]);

  // Update sorting with persistence
  const updateSorting = useCallback((field) => {
    let newSortOrder = 'desc';
    if (sortBy === field) {
      newSortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    }
    
    setSortBy(field);
    setSortOrder(newSortOrder);
    
    // Save to localStorage
    setStorageItem(STORAGE_KEYS.EXPERIMENT_FILTERS, {
      ...savedFilters,
      sortBy: field,
      sortOrder: newSortOrder
    });
  }, [sortBy, sortOrder, savedFilters]);

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
    setSortBy('created_at');
    setSortOrder('desc');
    
    setStorageItem(STORAGE_KEYS.EXPERIMENT_FILTERS, defaultFilters);
  }, []);

  // Load experiments on mount and when filters/sorting change
  useEffect(() => {
    fetchExperiments();
  }, [fetchExperiments]);

  // Use optimistic data if available, otherwise use regular experiments
  const displayExperiments = isOptimistic ? optimisticExperiments : experiments;

  return {
    experiments: displayExperiments,
    loading,
    error,
    filters,
    sortBy,
    sortOrder,
    isOptimistic,
    isOnline,
    createExperiment,
    deleteExperiment,
    getExperimentDetails,
    updateFilters,
    updateSorting,
    clearFilters,
    refetch: fetchExperiments,
  };
};

export default useExperiments;