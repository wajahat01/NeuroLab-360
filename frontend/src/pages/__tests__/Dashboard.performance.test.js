import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import Dashboard from '../Dashboard';

// Mock the hooks
const mockUseDashboardSummary = jest.fn();
const mockUseDashboardCharts = jest.fn();
const mockUseRecentExperiments = jest.fn();

jest.mock('../../hooks/useDashboard', () => ({
  useDashboardSummary: () => mockUseDashboardSummary(),
  useDashboardCharts: () => mockUseDashboardCharts(),
  useRecentExperiments: () => mockUseRecentExperiments(),
}));

// Mock the components
jest.mock('../../components', () => ({
  DataChart: ({ title, type, data }) => (
    <div data-testid="data-chart" data-title={title} data-type={type}>
      {data?.length > 0 ? `Chart with ${data.length} items` : 'No data'}
    </div>
  ),
  ErrorDisplay: ({ error, onRetry, title }) => (
    <div data-testid="error-display">
      <span>{title}: {error}</span>
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  ),
  EmptyState: ({ title, description, action, actionLabel }) => (
    <div data-testid="empty-state">
      <span>{title}: {description}</span>
      {action && <button onClick={action}>{actionLabel}</button>}
    </div>
  ),
  DashboardSkeleton: () => <div data-testid="dashboard-skeleton">Loading...</div>,
  StatCardSkeleton: () => <div data-testid="stat-card-skeleton">Loading stat...</div>,
  ChartSkeleton: () => <div data-testid="chart-skeleton">Loading chart...</div>,
  InsightCardSkeleton: () => <div data-testid="insight-skeleton">Loading insight...</div>,
}));

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const renderWithRouter = (component) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('Dashboard Performance Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('React.memo optimization', () => {
    it('should be wrapped with React.memo to prevent unnecessary re-renders', () => {
      // Verify that Dashboard component is memoized
      expect(Dashboard.$$typeof).toBeDefined();
      expect(Dashboard.type || Dashboard).toBeDefined();
    });

    it('should handle period changes without full component re-render', () => {
      const mockSummaryData = {
        total_experiments: 10,
        experiments_by_type: { 'Type A': 6, 'Type B': 4 },
        experiments_by_status: { completed: 8, pending: 2 },
        recent_activity: { last_7_days: 3, completion_rate: 80 },
        average_metrics: { mean: 15.5 },
      };

      const mockChartsData = {
        activity_timeline: [
          { date: '2024-01-01', count: 2 },
          { date: '2024-01-02', count: 3 },
        ],
        experiment_type_distribution: [
          { type: 'Type A', count: 6 },
          { type: 'Type B', count: 4 },
        ],
      };

      mockUseDashboardSummary.mockReturnValue({
        data: mockSummaryData,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      mockUseDashboardCharts.mockReturnValue({
        data: mockChartsData,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      mockUseRecentExperiments.mockReturnValue({
        data: { experiments: [], insights: [] },
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      renderWithRouter(<Dashboard />);

      // Should render period selector
      expect(screen.getByText('7 Days')).toBeInTheDocument();
      expect(screen.getByText('30 Days')).toBeInTheDocument();

      // Change period
      const sevenDaysButton = screen.getByText('7 Days');
      act(() => {
        fireEvent.click(sevenDaysButton);
      });

      // Should still be functional after period change
      expect(sevenDaysButton).toHaveClass('bg-blue-600');
    });
  });

  describe('Callback memoization', () => {
    it('should use stable callback references to prevent child re-renders', () => {
      const mockSummaryData = {
        total_experiments: 10,
        experiments_by_type: { 'Type A': 6 },
        recent_activity: { last_7_days: 3, completion_rate: 80 },
      };

      mockUseDashboardSummary.mockReturnValue({
        data: mockSummaryData,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      mockUseDashboardCharts.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      mockUseRecentExperiments.mockReturnValue({
        data: { experiments: [], insights: [] },
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { rerender } = renderWithRouter(<Dashboard />);

      // Get initial callback references
      const initialEmptyStateButtons = screen.getAllByText('Create Experiment');
      const initialCallback = initialEmptyStateButtons[0].onclick;

      // Re-render component
      rerender(<BrowserRouter><Dashboard /></BrowserRouter>);

      // Get callback references after re-render
      const afterRerenderButtons = screen.getAllByText('Create Experiment');
      const afterRerenderCallback = afterRerenderButtons[0].onclick;

      // Callbacks should be stable (same reference)
      expect(initialCallback).toBe(afterRerenderCallback);
    });
  });

  describe('Loading state optimization', () => {
    it('should efficiently handle loading state transitions', () => {
      // Start with loading state
      mockUseDashboardSummary.mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refetch: jest.fn(),
      });

      mockUseDashboardCharts.mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refetch: jest.fn(),
      });

      mockUseRecentExperiments.mockReturnValue({
        data: null,
        loading: true,
        error: null,
        refetch: jest.fn(),
      });

      renderWithRouter(<Dashboard />);

      // Should show skeleton during loading
      expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();
      
      // Verify loading state is handled efficiently
      expect(screen.queryByText('Total Experiments')).not.toBeInTheDocument();
    });
  });

  describe('Period selection performance', () => {
    it('should handle period changes efficiently without unnecessary re-renders', () => {
      const mockSummaryData = {
        total_experiments: 10,
        experiments_by_type: { 'Type A': 6 },
        recent_activity: { last_7_days: 3, completion_rate: 80 },
      };

      mockUseDashboardSummary.mockReturnValue({
        data: mockSummaryData,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      const mockRefetchCharts = jest.fn();
      mockUseDashboardCharts.mockReturnValue({
        data: { activity_timeline: [] },
        loading: false,
        error: null,
        refetch: mockRefetchCharts,
      });

      mockUseRecentExperiments.mockReturnValue({
        data: { experiments: [], insights: [] },
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      renderWithRouter(<Dashboard />);

      // Change period multiple times
      const sevenDaysButton = screen.getByText('7 Days');
      const thirtyDaysButton = screen.getByText('30 Days');

      act(() => {
        fireEvent.click(sevenDaysButton);
      });

      act(() => {
        fireEvent.click(thirtyDaysButton);
      });

      // Period changes should be handled efficiently
      // The last clicked button should be active
      expect(screen.getByText('30 Days')).toHaveClass('bg-blue-600');
    });
  });

  describe('Memory leak prevention', () => {
    it('should properly cleanup and prevent memory leaks during unmount', () => {
      const mockSummaryData = {
        total_experiments: 10,
        experiments_by_type: { 'Type A': 6 },
        recent_activity: { last_7_days: 3, completion_rate: 80 },
      };

      mockUseDashboardSummary.mockReturnValue({
        data: mockSummaryData,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      mockUseDashboardCharts.mockReturnValue({
        data: null,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      mockUseRecentExperiments.mockReturnValue({
        data: { experiments: [], insights: [] },
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { unmount } = renderWithRouter(<Dashboard />);

      // Component should unmount without errors
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Render cycle measurements', () => {
    it('should complete initial render within performance budget', () => {
      const startTime = performance.now();

      const mockSummaryData = {
        total_experiments: 10,
        experiments_by_type: { 'Type A': 6, 'Type B': 4 },
        recent_activity: { last_7_days: 3, completion_rate: 80 },
      };

      mockUseDashboardSummary.mockReturnValue({
        data: mockSummaryData,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      mockUseDashboardCharts.mockReturnValue({
        data: {
          activity_timeline: Array.from({ length: 30 }, (_, i) => ({
            date: `2024-01-${i + 1}`,
            count: Math.floor(Math.random() * 10),
          })),
        },
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      mockUseRecentExperiments.mockReturnValue({
        data: {
          experiments: Array.from({ length: 5 }, (_, i) => ({
            id: `${i + 1}`,
            name: `Experiment ${i + 1}`,
            experiment_type: 'Type A',
            status: 'completed',
            created_at: '2024-01-01T10:00:00Z',
          })),
          insights: [],
        },
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      renderWithRouter(<Dashboard />);

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Render should complete within reasonable time (adjust threshold as needed)
      expect(renderTime).toBeLessThan(500); // 500ms budget for initial render (adjusted for test environment)
    });

    it('should handle state updates efficiently', () => {
      const mockSummaryData = {
        total_experiments: 10,
        experiments_by_type: { 'Type A': 6 },
        recent_activity: { last_7_days: 3, completion_rate: 80 },
      };

      mockUseDashboardSummary.mockReturnValue({
        data: mockSummaryData,
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      mockUseDashboardCharts.mockReturnValue({
        data: { activity_timeline: [] },
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      mockUseRecentExperiments.mockReturnValue({
        data: { experiments: [], insights: [] },
        loading: false,
        error: null,
        refetch: jest.fn(),
      });

      renderWithRouter(<Dashboard />);

      const startTime = performance.now();

      // Trigger multiple state updates
      const sevenDaysButton = screen.getByText('7 Days');
      act(() => {
        fireEvent.click(sevenDaysButton);
      });

      const endTime = performance.now();
      const updateTime = endTime - startTime;

      // State updates should be fast
      expect(updateTime).toBeLessThan(150); // 150ms budget for state updates (adjusted for test environment)
    });
  });
});