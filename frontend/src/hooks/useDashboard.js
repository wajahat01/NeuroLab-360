import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export const useDashboardSummary = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user, getAuthHeaders } = useAuth();

  const fetchSummary = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/dashboard/summary`, {
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
      setError(err.message || 'Failed to fetch dashboard summary');
    } finally {
      setLoading(false);
    }
  }, [user, getAuthHeaders]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return { data, loading, error, refetch: fetchSummary };
};

export const useDashboardCharts = (period = '30d', experimentType = null) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user, getAuthHeaders } = useAuth();

  const fetchCharts = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ period });
      if (experimentType) {
        params.append('experiment_type', experimentType);
      }

      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/dashboard/charts?${params}`, {
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error fetching dashboard charts:', err);
      setError(err.message || 'Failed to fetch dashboard charts');
    } finally {
      setLoading(false);
    }
  }, [user, getAuthHeaders, period, experimentType]);

  useEffect(() => {
    fetchCharts();
  }, [fetchCharts]);

  return { data, loading, error, refetch: fetchCharts };
};

export const useRecentExperiments = (limit = 10, days = 7) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user, getAuthHeaders } = useAuth();

  const fetchRecent = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({ 
        limit: limit.toString(), 
        days: days.toString() 
      });

      const headers = await getAuthHeaders();
      const response = await fetch(`${API_BASE_URL}/dashboard/recent?${params}`, {
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error fetching recent experiments:', err);
      setError(err.message || 'Failed to fetch recent experiments');
    } finally {
      setLoading(false);
    }
  }, [user, getAuthHeaders, limit, days]);

  useEffect(() => {
    fetchRecent();
  }, [fetchRecent]);

  return { data, loading, error, refetch: fetchRecent };
};