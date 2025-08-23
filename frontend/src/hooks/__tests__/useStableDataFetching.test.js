import { renderHook, act, waitFor } from '@testing-library/react';
import { useStableDataFetching, useStableDashboardData, useStableExperiments } from '../useStableDataFetching';
import { useAuth } from '../../contexts/AuthContext';
import { apiCache } from '../useApiCache';
import { useDataSync } from '../useDataSync';

// Mock dependencies
jest.mock('../../contexts/AuthContext');
jest.mock('../useApiCache');
jest.mock('../useDataSync');

// Mock fetch
global.fetch = jest.fn();

describe('useStableDataFetching', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com'
  };

  const mockAuthHeaders = {
    'Authorization': 'Bearer mock-token',
    'Content-Type': 'application/json'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    useAuth.mockReturnValue({
      user: mockUser,
      getAuthHeaders: jest.fn().mockResolvedValue(mockAuthHeaders)
    });

    useDataSync.mockReturnValue({
      isOnline: true,
      addPendingChange: jest.fn()
    });

    apiCache.get = jest.fn();
    apiCache.set = jest.fn();
    apiCache.delete = jest.fn();

    fetch.mockClear();
  });

  describe('stable loading states', () => {
    it('should maintain consistent loading states without flickering', async () => {
      const mockData = { id: 1, name: 'Test Data' };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData)
      });

      const { result } = renderHook(() => 
        useStableDataFetching('/api/test', { enabled: true })
      );

      // Initial state
      expect(result.current.loading).toBe(false);
      expect(result.current.data).toBe(null);
      expect(result.current.error).toBe(null);

      // Wait for fetch to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
        expect(result.current.data).toEqual(mockData);
      });

      // Verify no flickering occurred
      expect(result.current.error).toBe(null);
    });

    it('should show loading only for foreground requests', async () => {
      const mockData = { id: 1, name: 'Test Data' };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData)
      });

      const { result } = renderHook(() => 
        useStableDataFetching('/api/test', { enabled: true })
      );

      // Background refetch should not show loading
      act(() => {
        result.current.refetch();
      });

      // Loading state should remain false for background requests
      expect(result.current.loading).toBe(false);
    });

    it('should handle stale-while-revalidate correctly', async () => {
      const cachedData = { id: 1, name: 'Cached Data' };
      const freshData = { id: 1, name: 'Fresh Data' };

      // Mock cached data
      apiCache.get.mockReturnValue(cachedData);

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(freshData)
      });

      const { result } = renderHook(() => 
        useStableDataFetching('/api/test', { 
          enabled: true,
          staleWhileRevalidate: true 
        })
      );

      // Should immediately return cached data
      expect(result.current.data).toEqual(cachedData);
      expect(result.current.isStale).toBe(true);

      // Wait for background revalidation
      await waitFor(() => {
        expect(result.current.data).toEqual(freshData);
        expect(result.current.isStale).toBe(false);
      });
    });
  });

  describe('error handling without visual disruptions', () => {
    it('should handle errors gracefully without clearing existing data', async () => {
      const existingData = { id: 1, name: 'Existing Data' };
      
      // First successful request
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(existingData)
      });

      const { result } = renderHook(() => 
        useStableDataFetching('/api/test', { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(existingData);
      });

      // Second request fails
      fetch.mockRejectedValueOnce(new Error('Network error'));

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.error).toBe('Network error');
      });

      // Data should still be available
      expect(result.current.data).toEqual(existingData);
    });

    it('should retry failed requests automatically', async () => {
      const mockData = { id: 1, name: 'Test Data' };
      
      // First request fails
      fetch.mockRejectedValueOnce(new Error('fetch failed'));
      
      // Second request succeeds
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData)
      });

      const { result } = renderHook(() => 
        useStableDataFetching('/api/test', { 
          enabled: true,
          retry: 1,
          retryDelay: 100
        })
      );

      // Wait for retry and success
      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
        expect(result.current.error).toBe(null);
      }, { timeout: 1000 });

      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle offline state gracefully', async () => {
      useDataSync.mockReturnValue({
        isOnline: false,
        addPendingChange: jest.fn()
      });

      const { result } = renderHook(() => 
        useStableDataFetching('/api/test', { 
          method: 'POST',
          body: { name: 'Test' }
        })
      );

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(result.current.error).toContain('offline');
      });

      // Should not make fetch request when offline
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('optimistic updates', () => {
    it('should handle optimistic updates correctly', async () => {
      const initialData = [{ id: 1, name: 'Item 1' }];
      const optimisticData = [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }];
      const finalData = [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2', status: 'saved' }];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(finalData)
      });

      const { result } = renderHook(() => 
        useStableDataFetching('/api/items', { 
          enabled: true,
          optimisticUpdates: true
        })
      );

      // Set initial data
      act(() => {
        result.current.mutate(initialData);
      });

      expect(result.current.data).toEqual(initialData);

      // Perform optimistic update
      const updatePromise = act(async () => {
        return result.current.optimisticUpdate(
          optimisticData,
          () => fetch('/api/items', { method: 'POST' }).then(res => res.json())
        );
      });

      // Should immediately show optimistic data
      expect(result.current.data).toEqual(optimisticData);
      expect(result.current.isOptimistic).toBe(true);

      // Wait for real update
      await updatePromise;

      await waitFor(() => {
        expect(result.current.data).toEqual(finalData);
        expect(result.current.isOptimistic).toBe(false);
      });
    });

    it('should revert optimistic updates on error', async () => {
      const initialData = [{ id: 1, name: 'Item 1' }];
      const optimisticData = [{ id: 1, name: 'Item 1' }, { id: 2, name: 'Item 2' }];

      fetch.mockRejectedValueOnce(new Error('Update failed'));

      const { result } = renderHook(() => 
        useStableDataFetching('/api/items', { 
          enabled: true,
          optimisticUpdates: true
        })
      );

      // Set initial data
      act(() => {
        result.current.mutate(initialData);
      });

      // Perform optimistic update that will fail
      await act(async () => {
        try {
          await result.current.optimisticUpdate(
            optimisticData,
            () => fetch('/api/items', { method: 'POST' }).then(res => res.json())
          );
        } catch (error) {
          // Expected to fail
        }
      });

      // Should revert to original data
      expect(result.current.data).toEqual(initialData);
      expect(result.current.isOptimistic).toBe(false);
      expect(result.current.error).toBe('Update failed');
    });
  });

  describe('caching behavior', () => {
    it('should cache successful GET requests', async () => {
      const mockData = { id: 1, name: 'Test Data' };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData)
      });

      const { result } = renderHook(() => 
        useStableDataFetching('/api/test', { 
          enabled: true,
          ttl: 300000
        })
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
      });

      // Verify cache was set
      expect(apiCache.set).toHaveBeenCalledWith(
        expect.stringContaining('/api/test'),
        mockData,
        300000
      );
    });

    it('should not cache non-GET requests', async () => {
      const mockData = { id: 1, name: 'Test Data' };
      
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockData)
      });

      const { result } = renderHook(() => 
        useStableDataFetching('/api/test', { 
          method: 'POST',
          body: { name: 'Test' },
          enabled: true
        })
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(mockData);
      });

      // Verify cache was not set for POST request
      expect(apiCache.set).not.toHaveBeenCalled();
    });
  });
});

describe('useStableDashboardData', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { id: 'user-123' },
      getAuthHeaders: jest.fn().mockResolvedValue({})
    });

    useDataSync.mockReturnValue({
      isOnline: true,
      addPendingChange: jest.fn()
    });

    apiCache.get = jest.fn();
    apiCache.set = jest.fn();
  });

  it('should coordinate loading states across multiple endpoints', async () => {
    const summaryData = { total_experiments: 10 };
    const chartsData = { activity_timeline: [] };
    const recentData = { experiments: [] };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(summaryData)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(chartsData)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(recentData)
      });

    const { result } = renderHook(() => useStableDashboardData());

    // Should show coordinated loading initially
    expect(result.current.isInitialLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isInitialLoading).toBe(false);
      expect(result.current.summary.data).toEqual(summaryData);
      expect(result.current.charts.data).toEqual(chartsData);
      expect(result.current.recent.data).toEqual(recentData);
    });
  });

  it('should provide coordinated refetch function', async () => {
    const { result } = renderHook(() => useStableDashboardData());

    act(() => {
      result.current.refetchAll();
    });

    // Should trigger refetch for all endpoints
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledTimes(3);
    });
  });
});

describe('useStableExperiments', () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      user: { 
        id: 'user-123',
        getAuthHeaders: jest.fn().mockResolvedValue({
          'Authorization': 'Bearer token'
        })
      },
      getAuthHeaders: jest.fn().mockResolvedValue({
        'Authorization': 'Bearer token'
      })
    });

    useDataSync.mockReturnValue({
      isOnline: true,
      addPendingChange: jest.fn()
    });
  });

  it('should handle optimistic experiment creation', async () => {
    const existingExperiments = [{ id: 1, name: 'Existing' }];
    const newExperiment = { name: 'New Experiment', type: 'test' };
    const createdExperiment = { id: 2, name: 'New Experiment', type: 'test', status: 'created' };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ experiment: createdExperiment })
    });

    const { result } = renderHook(() => useStableExperiments());

    // Set initial data
    act(() => {
      result.current.mutate(existingExperiments);
    });

    // Create experiment optimistically
    act(() => {
      result.current.createExperiment(newExperiment);
    });

    // Should immediately show optimistic experiment
    expect(result.current.data).toHaveLength(2);
    expect(result.current.isOptimistic).toBe(true);

    await waitFor(() => {
      expect(result.current.data).toContainEqual(createdExperiment);
      expect(result.current.isOptimistic).toBe(false);
    });
  });

  it('should handle optimistic experiment deletion', async () => {
    const experiments = [
      { id: 1, name: 'Experiment 1' },
      { id: 2, name: 'Experiment 2' }
    ];

    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({})
    });

    const { result } = renderHook(() => useStableExperiments());

    // Set initial data
    act(() => {
      result.current.mutate(experiments);
    });

    // Delete experiment optimistically
    act(() => {
      result.current.deleteExperiment(1);
    });

    // Should immediately remove experiment
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].id).toBe(2);
    expect(result.current.isOptimistic).toBe(true);

    await waitFor(() => {
      expect(result.current.isOptimistic).toBe(false);
    });
  });
});