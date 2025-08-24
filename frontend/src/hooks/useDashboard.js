import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useApiCache } from './useApiCache';
import { useDataSync } from './useDataSync';
import { useCleanup } from './useCleanup';
import { getStorageItem, setStorageItem, STORAGE_KEYS } from '../utils/localStorage';
import { API_CONFIG, ENDPOINTS, buildUrl } from '../config/api';

export const useDashboardSummary = () => {
  const { user } = useAuth();
  const { safeSetState } = useCleanup();
  
  // Get dashboard settings from localStorage
  const dashboardSettings = getStorageItem(STORAGE_KEYS.DASHBOARD_SETTINGS);
  
  const {
    data,
    loading,
    error,
    refetch
  } = useApiCache(
    buildUrl(ENDPOINTS.DASHBOARD.SUMMARY),
    {
      enabled: !!user,
      onSuccess: (data) => {
        // Cache successful response
        setStorageItem('dashboard_summary_cache', {
          data,
          timestamp: Date.now()
        });
      }
    },
    [user?.id],
    {
      ttl: dashboardSettings?.autoRefresh ? dashboardSettings.refreshInterval : 300000,
      staleWhileRevalidate: true
    }
  );

  return { data, loading, error, refetch };
};

export const useDashboardCharts = (period = '30d', experimentType = null) => {
  const { user } = useAuth();
  const dashboardSettings = getStorageItem(STORAGE_KEYS.DASHBOARD_SETTINGS);
  
  // Use user's preferred period if not specified
  const effectivePeriod = period || dashboardSettings?.defaultPeriod || '30d';
  
  const params = new URLSearchParams({ period: effectivePeriod });
  if (experimentType) {
    params.append('experiment_type', experimentType);
  }

  const {
    data,
    loading,
    error,
    refetch
  } = useApiCache(
    buildUrl(ENDPOINTS.DASHBOARD.CHARTS, { period, experiment_type }),
    {
      enabled: !!user,
      onSuccess: (data) => {
        // Save user's chart preferences
        setStorageItem(STORAGE_KEYS.DASHBOARD_SETTINGS, {
          ...dashboardSettings,
          lastUsedPeriod: effectivePeriod,
          lastUsedExperimentType: experimentType
        });
      }
    },
    [user?.id, effectivePeriod, experimentType],
    {
      ttl: dashboardSettings?.autoRefresh ? dashboardSettings.refreshInterval : 300000,
      staleWhileRevalidate: true
    }
  );

  return { data, loading, error, refetch };
};

export const useRecentExperiments = (limit = 10, days = 7) => {
  const { user } = useAuth();
  const dashboardSettings = getStorageItem(STORAGE_KEYS.DASHBOARD_SETTINGS);
  
  const params = new URLSearchParams({ 
    limit: limit.toString(), 
    days: days.toString() 
  });

  const {
    data,
    loading,
    error,
    refetch
  } = useApiCache(
    buildUrl(ENDPOINTS.DASHBOARD.RECENT, { limit, days }),
    {
      enabled: !!user,
      onSuccess: (data) => {
        // Cache recent experiments for offline access
        setStorageItem('recent_experiments_cache', {
          data,
          timestamp: Date.now(),
          params: { limit, days }
        });
      }
    },
    [user?.id, limit, days],
    {
      ttl: dashboardSettings?.autoRefresh ? dashboardSettings.refreshInterval : 180000, // 3 minutes for recent data
      staleWhileRevalidate: true
    }
  );

  return { data, loading, error, refetch };
};

// Hook for dashboard settings management
export const useDashboardSettings = () => {
  const [settings, setSettings] = useState(() => 
    getStorageItem(STORAGE_KEYS.DASHBOARD_SETTINGS)
  );

  const updateSettings = useCallback((newSettings) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    setStorageItem(STORAGE_KEYS.DASHBOARD_SETTINGS, updatedSettings);
  }, [settings]);

  const resetSettings = useCallback(() => {
    const defaultSettings = getStorageItem(STORAGE_KEYS.DASHBOARD_SETTINGS, {});
    setSettings(defaultSettings);
    setStorageItem(STORAGE_KEYS.DASHBOARD_SETTINGS, defaultSettings);
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings
  };
};