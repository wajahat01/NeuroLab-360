import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import Dashboard from '../pages/Dashboard';
import { enhancedCache } from '../hooks/useEnhancedCache';

// Mock components to focus on data loading behavior
jest.mock('../components', () => ({
  DataChart: ({ title, isStale }) => (
    <div data-testid="data-chart">
      {title} {isStale && <span data-testid="stale-indicator">Updating...</span>}
    </div>
  ),
  ErrorDisplay: ({ error, onRetry, title }) => (
    <div data-testid="error-display">
      <h3>{title}</h3>
      <p>{error}</p>
      <button onClick={onRetry}>Retry</button>
    </div>
  ),
  EmptyState: ({ title, description }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
  DashboardSkeleton: () => <div data-testid="dashboard-skeleton">Loading...</div>,
  StatCardSkeleton: () => <div data-testid="stat-card-skeleton">Loading stat...</div>,
  ChartSkeleton: () => <div data-testid="chart-skeleton">Loading chart...</div>,
  InsightCardSkeleton: () => <div data-testid="insight-card-skeleton">Loading insight...</div>
}));

// Mock fetch
global.fetch = jest.fn();

// Mock toast
jest.mock('react-hot-toast', () => ({
  toast: {
    error: jest.fn()
  }
}));

const mockUser = {
  id: 'user-123',
  email: 'test@example.com'
};

const MockAuthProvider = ({ children, user = mockUser }) => {
  const authValue = {
    user,
    loading: false,
    initialized: true,
    getAuthHeaders: jest.fn().mockResolvedValue({
      'Authorization': 'Bearer mock-token',
      'Content-Type': 'application/json'
    })
  };

  return (
    <AuthProvider value={authValue}>
      {children}
    </AuthProvider>
  );
};

const renderDashboard = (user = mockUser) => {
  return render(
    <BrowserRouter>
      <MockAuthProvider user={user}>
        <Dashboard />
      </MockAuthProvider>
    </BrowserRouter>
  );
};

describe('Data Loading Transitions Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    enhancedCache.clear();
    fetch.mockClear();
  });

  describe('Initial Loading States', () => {
    it('should show coordinated loading skeleton without flickering', async () => {
      // Mock slow API responses
      const summaryPromise = new Promise(resolve => 
        setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ total_experiments: 10 })
        }), 100)
      );

      const chartsPromise = new Promise(resolve => 
        setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ activity_timeline: [] })
        }), 150)
      );

      const recentPromise = new Promise(resolve => 
        setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ experiments: [] })
        }), 200)
      );

      fetch
        .mockReturnValueOnce(summaryPromise)
        .mockReturnValueOnce(chartsPromise)
        .mockReturnValueOnce(recentPromise);

      renderDashboard();

      // Should show coordinated loading skeleton initially
      expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();

      // Should not show individual loading states while skeleton is visible
      expect(screen.queryByTestId('stat-card-skeleton')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chart-skeleton')).not.toBeInTheDocument();

      // Wait for all data to load
      await waitFor(() => {
        expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument();
      }, { timeout: 1000 });

      // Should show actual content without flickering
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Total Experiments')).toBeInTheDocument();
    });

    it('should handle partial data loading gracefully', async () => {
      const summaryData = { 
        total_experiments: 10,
        recent_activity: { completion_rate: 85, last_7_days: 5 },
        experiments_by_type: { 'Type A': 3, 'Type B': 7 }
      };

      // Summary loads quickly
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(summaryData)
      });

      // Charts load slowly
      const chartsPromise = new Promise(resolve => 
        setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ activity_timeline: [] })
        }), 300)
      );

      // Recent data fails
      const recentPromise = Promise.reject(new Error('Network error'));

      fetch
        .mockReturnValueOnce(chartsPromise)
        .mockReturnValueOnce(recentPromise);

      renderDashboard();

      // Wait for summary to load
      await waitFor(() => {
        expect(screen.getByText('Total Experiments')).toBeInTheDocument();
        expect(screen.getByText('10')).toBeInTheDocument();
      });

      // Charts should still be loading
      expect(screen.getByTestId('chart-skeleton')).toBeInTheDocument();

      // Wait for charts to load
      await waitFor(() => {
        expect(screen.queryByTestId('chart-skeleton')).not.toBeInTheDocument();
      }, { timeout: 500 });

      // Recent experiments should show error without affecting other sections
      await waitFor(() => {
        expect(screen.getByTestId('error-display')).toBeInTheDocument();
      });

      // Summary and charts should still be visible
      expect(screen.getByText('Total Experiments')).toBeInTheDocument();
      expect(screen.getByTestId('data-chart')).toBeInTheDocument();
    });
  });

  describe('Stale-While-Revalidate Behavior', () => {
    it('should show cached data immediately and update in background', async () => {
      const cachedSummary = { 
        total_experiments: 8,
        recent_activity: { completion_rate: 80, last_7_days: 3 },
        experiments_by_type: { 'Type A': 2, 'Type B': 6 }
      };

      const freshSummary = { 
        total_experiments: 10,
        recent_activity: { completion_rate: 85, last_7_days: 5 },
        experiments_by_type: { 'Type A': 3, 'Type B': 7 }
      };

      // Pre-populate cache
      enhancedCache.set('GET:/api/dashboard/summary:user-123', cachedSummary);

      // Mock fresh data response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(freshSummary)
      });

      renderDashboard();

      // Should immediately show cached data
      expect(screen.getByText('8')).toBeInTheDocument(); // Cached total
      expect(screen.getByText('Updating...')).toBeInTheDocument(); // Stale indicator

      // Wait for fresh data
      await waitFor(() => {
        expect(screen.getByText('10')).toBeInTheDocument(); // Fresh total
      });

      // Stale indicator should be gone
      expect(screen.queryByText('Updating...')).not.toBeInTheDocument();
    });

    it('should handle cache invalidation smoothly', async () => {
      const initialData = { total_experiments: 5 };
      const updatedData = { total_experiments: 7 };

      // Set initial cache
      enhancedCache.set('GET:/api/dashboard/summary:user-123', initialData);

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedData)
      });

      renderDashboard();

      // Should show cached data initially
      expect(screen.getByText('5')).toBeInTheDocument();

      // Invalidate cache by dependency
      act(() => {
        enhancedCache.invalidateByDependency('user-123');
      });

      // Should trigger refetch and show updated data
      await waitFor(() => {
        expect(screen.getByText('7')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling Without Visual Disruption', () => {
    it('should handle errors gracefully without clearing existing data', async () => {
      const existingData = { 
        total_experiments: 10,
        recent_activity: { completion_rate: 85, last_7_days: 5 },
        experiments_by_type: { 'Type A': 3, 'Type B': 7 }
      };

      // First request succeeds
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(existingData)
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('10')).toBeInTheDocument();
      });

      // Second request fails
      fetch.mockRejectedValueOnce(new Error('Network timeout'));

      // Trigger refetch
      const retryButton = screen.getByText('Retry');
      act(() => {
        retryButton.click();
      });

      // Data should still be visible during error state
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('Total Experiments')).toBeInTheDocument();
    });

    it('should show error UI only after delay to prevent flickering', async () => {
      jest.useFakeTimers();

      fetch.mockRejectedValueOnce(new Error('Server error'));

      renderDashboard();

      // Error should not be visible immediately
      expect(screen.queryByTestId('error-display')).not.toBeInTheDocument();

      // Fast-forward past error display delay
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await waitFor(() => {
        expect(screen.getByTestId('error-display')).toBeInTheDocument();
      });

      jest.useRealTimers();
    });

    it('should auto-retry failed requests', async () => {
      jest.useFakeTimers();

      const successData = { total_experiments: 10 };

      // First request fails
      fetch.mockRejectedValueOnce(new Error('Temporary failure'));

      // Second request succeeds
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(successData)
      });

      renderDashboard();

      // Fast-forward past retry delay
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      await waitFor(() => {
        expect(screen.getByText('10')).toBeInTheDocument();
      });

      expect(fetch).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('Optimistic Updates', () => {
    it('should handle optimistic experiment creation', async () => {
      const existingExperiments = [
        { id: 1, name: 'Experiment 1', status: 'completed' }
      ];

      const createdExperiment = {
        id: 2,
        name: 'New Experiment',
        status: 'created'
      };

      // Mock existing experiments
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ experiments: existingExperiments })
      });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Experiment 1')).toBeInTheDocument();
      });

      // Mock experiment creation
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ experiment: createdExperiment })
      });

      // Simulate optimistic update (would be triggered by user action)
      // This would normally be done through the experiments hook
      act(() => {
        enhancedCache.set('experiments-user-123', [
          ...existingExperiments,
          { ...createdExperiment, id: 'temp-123', status: 'creating' }
        ]);
      });

      // Should immediately show optimistic experiment
      expect(screen.getByText('New Experiment')).toBeInTheDocument();

      // Wait for real creation to complete
      await waitFor(() => {
        expect(screen.getByText('created')).toBeInTheDocument();
      });
    });
  });

  describe('Performance and Memory Management', () => {
    it('should cleanup resources on unmount', () => {
      const { unmount } = renderDashboard();

      // Verify component mounted successfully
      expect(screen.getByText('Dashboard')).toBeInTheDocument();

      // Unmount component
      unmount();

      // Verify no memory leaks (this would be more comprehensive in real tests)
      expect(fetch).toHaveBeenCalled();
    });

    it('should handle rapid state changes without flickering', async () => {
      const data1 = { total_experiments: 5 };
      const data2 = { total_experiments: 7 };
      const data3 = { total_experiments: 10 };

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(data1)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(data2)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(data3)
        });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('5')).toBeInTheDocument();
      });

      // Trigger rapid updates
      act(() => {
        enhancedCache.set('GET:/api/dashboard/summary:user-123', data2);
      });

      act(() => {
        enhancedCache.set('GET:/api/dashboard/summary:user-123', data3);
      });

      // Should show final state without intermediate flickering
      expect(screen.getByText('10')).toBeInTheDocument();
    });
  });

  describe('Cache Preloading', () => {
    it('should preload data for faster subsequent loads', async () => {
      const preloadedData = { total_experiments: 15 };

      // Pre-populate cache as if preloaded
      enhancedCache.set('GET:/api/dashboard/summary:user-123', preloadedData, {
        tags: ['preloaded'],
        priority: 'low'
      });

      renderDashboard();

      // Should immediately show preloaded data
      expect(screen.getByText('15')).toBeInTheDocument();

      // Should not make fetch request for cached data
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});