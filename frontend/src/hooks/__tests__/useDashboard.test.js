import { renderHook, waitFor, act } from '@testing-library/react';
import { useDashboardSummary, useDashboardCharts, useRecentExperiments } from '../useDashboard';

// Mock the AuthContext
const mockGetAuthHeaders = jest.fn();
const mockUser = { id: 'test-user-id', email: 'test@example.com' };

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    getAuthHeaders: mockGetAuthHeaders,
  }),
}));

// Mock fetch
global.fetch = jest.fn();

describe('useDashboard hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthHeaders.mockResolvedValue({
      'Authorization': 'Bearer test-token',
      'Content-Type': 'application/json',
    });
  });

  describe('useDashboardSummary', () => {
    it('fetches dashboard summary successfully', async () => {
      const mockSummaryData = {
        total_experiments: 5,
        experiments_by_type: { 'Type A': 3, 'Type B': 2 },
        experiments_by_status: { completed: 4, pending: 1 },
        recent_activity: { last_7_days: 2, completion_rate: 80 },
        average_metrics: { mean: 15.5, std_dev: 2.3 },
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockSummaryData,
      });

      const { result } = renderHook(() => useDashboardSummary());

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toBe(null);
      expect(result.current.error).toBe(null);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockSummaryData);
      expect(result.current.error).toBe(null);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/dashboard/summary',
        {
          headers: {
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('handles fetch error correctly', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useDashboardSummary());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBe(null);
      expect(result.current.error).toBe('Network error');
    });

    it('handles HTTP error response', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useDashboardSummary());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBe(null);
      expect(result.current.error).toBe('HTTP error! status: 500');
    });

    it('does not fetch when user is not authenticated', async () => {
      // Temporarily mock useAuth to return null user
      const originalMock = require('../../contexts/AuthContext').useAuth;
      require('../../contexts/AuthContext').useAuth = jest.fn(() => ({
        user: null,
        getAuthHeaders: mockGetAuthHeaders,
      }));

      const { result } = renderHook(() => useDashboardSummary());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toBe(null);
      
      // Restore original mock
      require('../../contexts/AuthContext').useAuth = originalMock;
    });
  });

  describe('useDashboardCharts', () => {
    it('fetches chart data with correct parameters', async () => {
      const mockChartData = {
        activity_timeline: [
          { date: '2024-01-01', count: 2 },
          { date: '2024-01-02', count: 3 },
        ],
        experiment_type_distribution: [
          { type: 'Type A', count: 3 },
          { type: 'Type B', count: 2 },
        ],
        performance_trends: [],
        metric_comparisons: [],
        period: '30d',
        total_experiments: 5,
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockChartData,
      });

      const { result } = renderHook(() => useDashboardCharts('30d', 'Type A'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockChartData);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/dashboard/charts?period=30d&experiment_type=Type+A',
        {
          headers: {
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('fetches chart data without experiment type filter', async () => {
      const mockChartData = {
        activity_timeline: [],
        experiment_type_distribution: [],
        performance_trends: [],
        metric_comparisons: [],
        period: '7d',
        total_experiments: 0,
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockChartData,
      });

      const { result } = renderHook(() => useDashboardCharts('7d'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockChartData);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/dashboard/charts?period=7d',
        {
          headers: {
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        }
      );
    });
  });

  describe('useRecentExperiments', () => {
    it('fetches recent experiments with correct parameters', async () => {
      const mockRecentData = {
        experiments: [
          {
            id: '1',
            name: 'Test Experiment',
            experiment_type: 'Type A',
            status: 'completed',
            created_at: '2024-01-01T10:00:00Z',
            results: { metrics: { mean: 15.5 } },
          },
        ],
        activity_summary: {
          total_recent: 1,
          by_type: { 'Type A': 1 },
          by_status: { completed: 1 },
          completion_rate: 100,
        },
        insights: [
          {
            type: 'completion',
            message: 'Great completion rate!',
            icon: '✅',
          },
        ],
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRecentData,
      });

      const { result } = renderHook(() => useRecentExperiments(5, 7));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toEqual(mockRecentData);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/dashboard/recent?limit=5&days=7',
        {
          headers: {
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        }
      );
    });

    it('uses default parameters when not provided', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ experiments: [], activity_summary: {}, insights: [] }),
      });

      const { result } = renderHook(() => useRecentExperiments());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/dashboard/recent?limit=10&days=7',
        {
          headers: {
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        }
      );
    });
  });

  describe('refetch functionality', () => {
    it('allows manual refetch of dashboard summary', async () => {
      const mockData = { total_experiments: 5 };
      
      fetch.mockResolvedValue({
        ok: true,
        json: async () => mockData,
      });

      const { result } = renderHook(() => useDashboardSummary());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Clear the mock to verify refetch call
      fetch.mockClear();

      // Call refetch
      await act(async () => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledTimes(1);
      });
    });
  });
});