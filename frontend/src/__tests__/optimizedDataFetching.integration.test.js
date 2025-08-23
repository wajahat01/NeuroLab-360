import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import { AuthProvider } from '../contexts/AuthContext';
import { useOptimizedDataFetching, useOptimizedDashboardData } from '../hooks/useOptimizedDataFetching';
import { useOptimizedExperiments } from '../hooks/useOptimizedExperiments';
import { dataCache } from '../utils/dataCache';

// Mock fetch
global.fetch = jest.fn();

// Mock supabase
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(() => Promise.resolve({
        data: {
          session: {
            access_token: 'mock-token',
            user: { id: 'user-123', email: 'test@example.com' }
          }
        }
      }))
    }
  }
}));

// Mock data sync
jest.mock('../hooks/useDataSync', () => ({
  useDataSync: () => ({
    isOnline: true,
    addPendingChange: jest.fn()
  })
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

// Test wrapper with auth context
const TestWrapper = ({ children }) => (
  <AuthProvider>
    {children}
  </AuthProvider>
);

describe('Optimized Data Fetching Integration Tests', () => {
  beforeEach(() => {
    fetch.mockClear();
    dataCache.clear();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  describe('useOptimizedDataFetching', () => {
    it('should prevent flickering during data loading', async () => {
      const mockData = { id: 1, name: 'Test Data' };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData)
      });

      const { result, waitForNextUpdate } = renderHook(
        () => useOptimizedDataFetching('/api/test', {
          cacheKey: 'test-data',
          ttl: 60000
        }),
        { wrapper: TestWrapper }
      );

      // Initial state should show loading
      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBe(null);
      expect(result.current.error).toBe(null);

      await waitForNextUpdate();

      // After loading, should have data without flickering
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual(mockData);
      expect(result.current.error).toBe(null);
      expect(result.current.isStale).toBe(false);
    });

    it('should use cached data to prevent unnecessary requests', async () => {
      const mockData = { id: 1, name: 'Cached Data' };
      const cacheKey = 'test-cached-data';

      // Set data in cache
      dataCache.set(cacheKey, mockData, { ttl: 60000 });

      const { result } = renderHook(
        () => useOptimizedDataFetching('/api/test', {
          cacheKey,
          ttl: 60000
        }),
        { wrapper: TestWrapper }
      );

      // Should immediately return cached data without loading
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toEqual(mockData);
      expect(result.current.isStale).toBe(false);

      // Should not have made any fetch requests
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should handle stale-while-revalidate correctly', async () => {
      const staleData = { id: 1, name: 'Stale Data' };
      const freshData = { id: 1, name: 'Fresh Data' };
      const cacheKey = 'test-stale-data';

      // Set stale data in cache (expired TTL but within max age)
      const pastTimestamp = Date.now() - 70000; // 70 seconds ago
      dataCache.cache.set(cacheKey, {
        data: staleData,
        timestamp: pastTimestamp,
        ttl: 60000, // 1 minute TTL (expired)
        maxAge: 120000, // 2 minute max age (still valid)
        staleWhileRevalidate: true,
        tags: new Set(),
        dependencies: new Set(),
        priority: 'normal',
        accessCount: 0,
        lastAccess: pastTimestamp
      });

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(freshData)
      });

      const { result, waitForNextUpdate } = renderHook(
        () => useOptimizedDataFetching('/api/test', {
          cacheKey,
          ttl: 60000,
          staleWhileRevalidate: true
        }),
        { wrapper: TestWrapper }
      );

      // Should immediately return stale data
      expect(result.current.data).toEqual(staleData);
      expect(result.current.isStale).toBe(true);
      expect(result.current.loading).toBe(false);

      await waitForNextUpdate();

      // Should update with fresh data
      expect(result.current.data).toEqual(freshData);
      expect(result.current.isStale).toBe(false);
    });

    it('should handle errors gracefully without clearing existing data', async () => {
      const existingData = { id: 1, name: 'Existing Data' };
      const cacheKey = 'test-error-handling';

      // Set existing data in cache
      dataCache.set(cacheKey, existingData, { ttl: 60000 });

      fetch.mockRejectedValueOnce(new Error('Network error'));

      const { result, waitForNextUpdate } = renderHook(
        () => useOptimizedDataFetching('/api/test', {
          cacheKey,
          ttl: 60000,
          retry: 0 // Disable retry for this test
        }),
        { wrapper: TestWrapper }
      );

      // Should start with cached data
      expect(result.current.data).toEqual(existingData);

      await waitForNextUpdate();

      // Should retain existing data even after error
      expect(result.current.data).toEqual(existingData);
      expect(result.current.error).toBe('Network error');
      expect(result.current.loading).toBe(false);
    });
  });

  describe('useOptimizedDashboardData', () => {
    it('should coordinate loading states to prevent flickering', async () => {
      const mockSummary = { total_experiments: 10 };
      const mockCharts = { activity_timeline: [] };
      const mockRecent = { experiments: [] };

      // Mock all three API calls
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSummary)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCharts)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockRecent)
        });

      const { result, waitForNextUpdate } = renderHook(
        () => useOptimizedDashboardData(),
        { wrapper: TestWrapper }
      );

      // Should show coordinated loading state
      expect(result.current.isInitialLoading).toBe(true);
      expect(result.current.hasAllErrors).toBe(false);

      await waitForNextUpdate();

      // Should have all data loaded
      expect(result.current.isInitialLoading).toBe(false);
      expect(result.current.summary.data).toEqual(mockSummary);
      expect(result.current.charts.data).toEqual(mockCharts);
      expect(result.current.recent.data).toEqual(mockRecent);
    });

    it('should handle partial failures gracefully', async () => {
      const mockSummary = { total_experiments: 10 };
      const mockCharts = { activity_timeline: [] };

      // Mock two successful calls and one failure
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSummary)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockCharts)
        })
        .mockRejectedValueOnce(new Error('Recent data failed'));

      const { result, waitForNextUpdate } = renderHook(
        () => useOptimizedDashboardData(),
        { wrapper: TestWrapper }
      );

      await waitForNextUpdate();

      // Should not show all errors since some requests succeeded
      expect(result.current.hasAllErrors).toBe(false);
      expect(result.current.summary.data).toEqual(mockSummary);
      expect(result.current.charts.data).toEqual(mockCharts);
      expect(result.current.recent.error).toBeTruthy();
    });
  });

  describe('useOptimizedExperiments', () => {
    it('should handle optimistic updates correctly', async () => {
      const existingExperiments = [
        { id: '1', name: 'Experiment 1', status: 'completed' }
      ];
      const newExperiment = { name: 'New Experiment', experiment_type: 'test' };
      const createdExperiment = { 
        id: '2', 
        name: 'New Experiment', 
        experiment_type: 'test',
        status: 'completed'
      };

      // Mock initial fetch
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ experiments: existingExperiments })
      });

      const { result, waitForNextUpdate } = renderHook(
        () => useOptimizedExperiments({ enableOptimisticUpdates: true }),
        { wrapper: TestWrapper }
      );

      await waitForNextUpdate();

      // Should have initial experiments
      expect(result.current.experiments).toEqual(existingExperiments);

      // Mock create experiment API call
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ experiment: createdExperiment })
      });

      // Create experiment with optimistic update
      act(() => {
        result.current.createExperiment(newExperiment);
      });

      // Should immediately show optimistic experiment
      expect(result.current.experiments).toHaveLength(2);
      expect(result.current.isOptimistic).toBe(true);

      await waitForNextUpdate();

      // Should update with real experiment data
      expect(result.current.experiments).toHaveLength(2);
      expect(result.current.experiments[0]).toEqual(createdExperiment);
      expect(result.current.isOptimistic).toBe(false);
    });

    it('should persist filters to localStorage', async () => {
      const { result } = renderHook(
        () => useOptimizedExperiments(),
        { wrapper: TestWrapper }
      );

      const newFilters = {
        experiment_type: 'cognitive',
        status: 'completed',
        search: 'test'
      };

      act(() => {
        result.current.updateFilters(newFilters);
      });

      // Should save to localStorage
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(expect.objectContaining(newFilters))
      );
    });
  });

  describe('Cache Integration', () => {
    it('should invalidate related cache entries on data mutations', async () => {
      const cacheKey1 = 'experiments-user-123';
      const cacheKey2 = 'dashboard-summary-user-123';
      
      // Set up cache entries with experiment tag
      dataCache.set(cacheKey1, { experiments: [] }, { 
        tags: ['experiments'], 
        ttl: 60000 
      });
      dataCache.set(cacheKey2, { total_experiments: 5 }, { 
        tags: ['experiments'], 
        ttl: 60000 
      });

      expect(dataCache.has(cacheKey1)).toBe(true);
      expect(dataCache.has(cacheKey2)).toBe(true);

      // Invalidate by tag
      const invalidatedCount = dataCache.invalidateByTag('experiments');

      expect(invalidatedCount).toBe(2);
      expect(dataCache.has(cacheKey1)).toBe(false);
      expect(dataCache.has(cacheKey2)).toBe(false);
    });

    it('should handle cache cleanup properly', async () => {
      const expiredKey = 'expired-data';
      const validKey = 'valid-data';

      // Set expired data (past max age)
      const pastTimestamp = Date.now() - 130000; // 130 seconds ago
      dataCache.cache.set(expiredKey, {
        data: { old: 'data' },
        timestamp: pastTimestamp,
        ttl: 60000,
        maxAge: 120000, // Expired
        tags: new Set(),
        dependencies: new Set(),
        priority: 'normal',
        accessCount: 0,
        lastAccess: pastTimestamp
      });

      // Set valid data
      dataCache.set(validKey, { new: 'data' }, { ttl: 60000 });

      expect(dataCache.has(expiredKey)).toBe(true);
      expect(dataCache.has(validKey)).toBe(true);

      // Run cleanup
      const cleanedCount = dataCache.cleanup();

      expect(cleanedCount).toBe(1);
      expect(dataCache.has(expiredKey)).toBe(false);
      expect(dataCache.has(validKey)).toBe(true);
    });
  });
});