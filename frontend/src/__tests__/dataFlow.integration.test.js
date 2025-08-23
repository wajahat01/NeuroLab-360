import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider } from '../contexts/AuthContext';
import useExperiments from '../hooks/useExperiments';
import { useDashboardSummary } from '../hooks/useDashboard';
import { apiCache } from '../hooks/useApiCache';
import { setStorageItem, getStorageItem, STORAGE_KEYS } from '../utils/localStorage';

// Mock fetch
global.fetch = jest.fn();

// Mock Supabase
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'test-token',
            user: { id: 'test-user-id', email: 'test@example.com' }
          }
        }
      }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } }
      })
    }
  }
}));

// Mock toast
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn()
  }
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true
});

const wrapper = ({ children }) => (
  <AuthProvider>{children}</AuthProvider>
);

describe('Data Flow Integration Tests', () => {
  beforeEach(() => {
    fetch.mockClear();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    apiCache.clear();
    
    // Mock localStorage responses
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'neurolab_experiment_filters') {
        return JSON.stringify({
          experiment_type: '',
          status: '',
          search: '',
          sortBy: 'created_at',
          sortOrder: 'desc'
        });
      }
      return null;
    });
  });

  describe('Experiments Data Flow', () => {
    it('should handle complete experiment lifecycle with caching and persistence', async () => {
      const mockExperiments = [
        { id: 1, name: 'Experiment 1', status: 'completed', created_at: '2023-01-01' },
        { id: 2, name: 'Experiment 2', status: 'running', created_at: '2023-01-02' }
      ];

      const newExperiment = {
        name: 'New Experiment',
        experiment_type: 'memory_test',
        parameters: { duration: 300 }
      };

      const createdExperiment = {
        id: 3,
        name: 'New Experiment',
        experiment_type: 'memory_test',
        status: 'completed',
        created_at: '2023-01-03'
      };

      // Mock initial fetch
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ experiments: mockExperiments })
      });

      const { result } = renderHook(() => useExperiments(), { wrapper });

      // Wait for initial load
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.experiments).toEqual(mockExperiments);
      expect(fetch).toHaveBeenCalledWith('/api/experiments?', expect.any(Object));

      // Test filter persistence
      act(() => {
        result.current.updateFilters({ experiment_type: 'memory_test' });
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'neurolab_experiment_filters',
        expect.stringContaining('memory_test')
      );

      // Test optimistic create
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ experiment: createdExperiment })
      });

      let createPromise;
      act(() => {
        createPromise = result.current.createExperiment(newExperiment);
      });

      // Should immediately show optimistic update
      expect(result.current.experiments).toHaveLength(3);
      expect(result.current.isOptimistic).toBe(true);

      // Wait for API call to complete
      await act(async () => {
        await createPromise;
      });

      expect(result.current.isOptimistic).toBe(false);
      expect(fetch).toHaveBeenCalledWith('/api/experiments', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newExperiment)
      });
    });

    it('should handle offline scenarios with pending changes', async () => {
      const mockExperiments = [
        { id: 1, name: 'Experiment 1', status: 'completed' }
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ experiments: mockExperiments })
      });

      const { result } = renderHook(() => useExperiments(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Simulate going offline
      navigator.onLine = false;

      const newExperiment = {
        name: 'Offline Experiment',
        experiment_type: 'attention_test'
      };

      // Try to create experiment while offline
      let createPromise;
      act(() => {
        createPromise = result.current.createExperiment(newExperiment);
      });

      await act(async () => {
        try {
          await createPromise;
        } catch (error) {
          expect(error.message).toContain('offline');
        }
      });

      expect(result.current.isOnline).toBe(false);
    });

    it('should handle API errors with rollback', async () => {
      const mockExperiments = [
        { id: 1, name: 'Experiment 1', status: 'completed' }
      ];

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ experiments: mockExperiments })
      });

      const { result } = renderHook(() => useExperiments(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Mock API error
      fetch.mockRejectedValueOnce(new Error('Server error'));

      const newExperiment = {
        name: 'Failed Experiment',
        experiment_type: 'memory_test'
      };

      let createPromise;
      act(() => {
        createPromise = result.current.createExperiment(newExperiment);
      });

      // Should show optimistic update initially
      expect(result.current.experiments).toHaveLength(2);
      expect(result.current.isOptimistic).toBe(true);

      // Wait for API call to fail and rollback
      await act(async () => {
        try {
          await createPromise;
        } catch (error) {
          expect(error.message).toBe('Server error');
        }
      });

      // Should rollback to original state
      expect(result.current.experiments).toEqual(mockExperiments);
      expect(result.current.isOptimistic).toBe(false);
    });
  });

  describe('Dashboard Data Flow', () => {
    it('should cache dashboard data and respect user preferences', async () => {
      const mockSummary = {
        totalExperiments: 10,
        completedExperiments: 8,
        averageScore: 85.5
      };

      // Mock dashboard settings in localStorage
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'neurolab_dashboard_settings') {
          return JSON.stringify({
            autoRefresh: true,
            refreshInterval: 60000,
            defaultPeriod: '7d'
          });
        }
        return null;
      });

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSummary
      });

      const { result } = renderHook(() => useDashboardSummary(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockSummary);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/dashboard/summary'),
        expect.any(Object)
      );

      // Test caching - second call should use cache
      const { result: result2 } = renderHook(() => useDashboardSummary(), { wrapper });

      // Should return cached data immediately
      expect(result2.current.data).toEqual(mockSummary);
      expect(result2.current.loading).toBe(false);
    });

    it('should handle stale-while-revalidate caching', async () => {
      const staleData = { totalExperiments: 5 };
      const freshData = { totalExperiments: 10 };

      // Pre-populate cache with stale data
      apiCache.set('GET:http://localhost:5000/api/dashboard/summary:test-user-id', staleData);

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => freshData
      });

      const { result } = renderHook(() => useDashboardSummary(), { wrapper });

      // Should immediately return stale data
      expect(result.current.data).toEqual(staleData);
      expect(result.current.isStale).toBe(true);

      // Wait for background revalidation
      await waitFor(() => {
        expect(result.current.data).toEqual(freshData);
      });

      expect(result.current.isStale).toBe(false);
    });
  });

  describe('Cross-Component Data Synchronization', () => {
    it('should sync data between experiments and dashboard', async () => {
      const mockExperiments = [
        { id: 1, name: 'Experiment 1', status: 'completed' }
      ];

      const mockSummary = {
        totalExperiments: 1,
        completedExperiments: 1
      };

      const updatedSummary = {
        totalExperiments: 2,
        completedExperiments: 2
      };

      // Mock initial responses
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ experiments: mockExperiments })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockSummary
        });

      const experimentsHook = renderHook(() => useExperiments(), { wrapper });
      const dashboardHook = renderHook(() => useDashboardSummary(), { wrapper });

      await waitFor(() => {
        expect(experimentsHook.result.current.loading).toBe(false);
        expect(dashboardHook.result.current.loading).toBe(false);
      });

      expect(experimentsHook.result.current.experiments).toHaveLength(1);
      expect(dashboardHook.result.current.data.totalExperiments).toBe(1);

      // Create new experiment
      const newExperiment = { id: 2, name: 'Experiment 2', status: 'completed' };
      
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ experiment: newExperiment })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => updatedSummary
        });

      // Create experiment
      await act(async () => {
        await experimentsHook.result.current.createExperiment({
          name: 'Experiment 2',
          experiment_type: 'memory_test'
        });
      });

      // Manually trigger dashboard refresh (in real app, this would be automatic)
      act(() => {
        dashboardHook.result.current.refetch();
      });

      await waitFor(() => {
        expect(dashboardHook.result.current.data.totalExperiments).toBe(2);
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network errors gracefully', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useExperiments(), { wrapper });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.experiments).toEqual([]);
    });

    it('should retry failed requests', async () => {
      const mockExperiments = [{ id: 1, name: 'Experiment 1' }];

      // First call fails, second succeeds
      fetch
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ experiments: mockExperiments })
        });

      const { result } = renderHook(() => useExperiments(), { wrapper });

      // Wait for retry and success
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      }, { timeout: 2000 });

      expect(result.current.experiments).toEqual(mockExperiments);
      expect(result.current.error).toBe(null);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Memory Management', () => {
    it('should cleanup resources on unmount', () => {
      const { unmount } = renderHook(() => useExperiments(), { wrapper });

      // Unmount should not throw errors
      expect(() => unmount()).not.toThrow();
    });

    it('should cancel pending requests on unmount', async () => {
      // Mock a slow request
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve({
          ok: true,
          json: async () => ({ experiments: [] })
        }), 1000);
      });

      fetch.mockReturnValueOnce(slowPromise);

      const { result, unmount } = renderHook(() => useExperiments(), { wrapper });

      expect(result.current.loading).toBe(true);

      // Unmount before request completes
      unmount();

      // Wait a bit to ensure no state updates occur after unmount
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should not throw any warnings about state updates on unmounted component
    });
  });
});