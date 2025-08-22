import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const useExperiments = () => {
  const [experiments, setExperiments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    experiment_type: '',
    status: '',
    search: ''
  });
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

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

  // Create new experiment
  const createExperiment = useCallback(async (experimentData) => {
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch('/api/experiments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(experimentData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create experiment');
      }

      const data = await response.json();
      
      // Add the new experiment to the list
      setExperiments(prev => [data.experiment, ...prev]);
      
      toast.success('Experiment created and completed successfully!');
      return data;
    } catch (err) {
      console.error('Error creating experiment:', err);
      toast.error(err.message);
      throw err;
    }
  }, [getAuthToken]);

  // Delete experiment
  const deleteExperiment = useCallback(async (experimentId) => {
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/experiments/${experimentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete experiment');
      }

      // Remove the experiment from the list
      setExperiments(prev => prev.filter(exp => exp.id !== experimentId));
      
      toast.success('Experiment deleted successfully');
    } catch (err) {
      console.error('Error deleting experiment:', err);
      toast.error(err.message);
      throw err;
    }
  }, [getAuthToken]);

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

  // Update filters
  const updateFilters = useCallback((newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  // Update sorting
  const updateSorting = useCallback((field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  }, [sortBy]);

  // Clear filters
  const clearFilters = useCallback(() => {
    setFilters({
      experiment_type: '',
      status: '',
      search: ''
    });
  }, []);

  // Load experiments on mount and when filters/sorting change
  useEffect(() => {
    fetchExperiments();
  }, [fetchExperiments]);

  return {
    experiments,
    loading,
    error,
    filters,
    sortBy,
    sortOrder,
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