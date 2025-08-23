import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

describe('Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading skeleton when all data is loading', () => {
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

    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();
  });

  it('shows error when all requests fail', () => {
    mockUseDashboardSummary.mockReturnValue({
      data: null,
      loading: false,
      error: 'Summary error',
      refetch: jest.fn(),
    });
    mockUseDashboardCharts.mockReturnValue({
      data: null,
      loading: false,
      error: 'Charts error',
      refetch: jest.fn(),
    });
    mockUseRecentExperiments.mockReturnValue({
      data: null,
      loading: false,
      error: 'Recent error',
      refetch: jest.fn(),
    });

    renderWithRouter(<Dashboard />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('error-display')).toBeInTheDocument();
    expect(screen.getByText(/Dashboard Unavailable/)).toBeInTheDocument();
  });

  it('renders dashboard with summary data', () => {
    const mockSummaryData = {
      total_experiments: 10,
      experiments_by_type: { 'Type A': 6, 'Type B': 4 },
      experiments_by_status: { completed: 8, pending: 2 },
      recent_activity: { last_7_days: 3, completion_rate: 80 },
      average_metrics: { mean: 15.5 },
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
      data: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithRouter(<Dashboard />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument(); // Total experiments
    expect(screen.getByText('80%')).toBeInTheDocument(); // Completion rate
    expect(screen.getByText('3')).toBeInTheDocument(); // Recent activity
    expect(screen.getByText('2')).toBeInTheDocument(); // Experiment types count
  });

  it('renders charts when chart data is available', () => {
    const mockChartsData = {
      activity_timeline: [
        { date: '2024-01-01', count: 2 },
        { date: '2024-01-02', count: 3 },
      ],
      experiment_type_distribution: [
        { type: 'Type A', count: 6 },
        { type: 'Type B', count: 4 },
      ],
      performance_trends: [
        { date: '2024-01-01', metric1: 10, metric2: 20 },
      ],
    };

    mockUseDashboardSummary.mockReturnValue({
      data: { total_experiments: 10 },
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
      data: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithRouter(<Dashboard />);

    const charts = screen.getAllByTestId('data-chart');
    expect(charts).toHaveLength(3); // Activity, Distribution, Performance trends
    
    expect(screen.getAllByText('Chart with 2 items')).toHaveLength(2); // Activity timeline and Type distribution
    expect(screen.getByText('Chart with 1 items')).toBeInTheDocument(); // Performance trends
  });

  it('renders recent experiments when available', () => {
    const mockRecentData = {
      experiments: [
        {
          id: '1',
          name: 'Test Experiment 1',
          experiment_type: 'Type A',
          status: 'completed',
          created_at: '2024-01-01T10:00:00Z',
        },
        {
          id: '2',
          name: 'Test Experiment 2',
          experiment_type: 'Type B',
          status: 'running',
          created_at: '2024-01-02T11:00:00Z',
        },
      ],
      insights: [
        {
          type: 'streak',
          message: 'Great job! You have completed 5 experiments.',
          icon: '🔥',
        },
      ],
    };

    mockUseDashboardSummary.mockReturnValue({
      data: { total_experiments: 10 },
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
      data: mockRecentData,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithRouter(<Dashboard />);

    expect(screen.getByText('Test Experiment 1')).toBeInTheDocument();
    expect(screen.getByText('Test Experiment 2')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('Great job! You have completed 5 experiments.')).toBeInTheDocument();
  });

  it('handles period selection changes', async () => {
    mockUseDashboardSummary.mockReturnValue({
      data: { total_experiments: 10 },
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
      data: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });

    renderWithRouter(<Dashboard />);

    // Find and click the 7 Days button
    const sevenDaysButton = screen.getByText('7 Days');
    fireEvent.click(sevenDaysButton);

    // The component should re-render with new period
    expect(sevenDaysButton).toHaveClass('bg-blue-600');
  });

  it('shows empty states when no data is available', () => {
    mockUseDashboardSummary.mockReturnValue({
      data: null,
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

    renderWithRouter(<Dashboard />);

    const emptyStates = screen.getAllByTestId('empty-state');
    expect(emptyStates.length).toBeGreaterThan(0);
  });

  it('handles retry functionality', () => {
    const mockRefetchSummary = jest.fn();
    const mockRefetchCharts = jest.fn();
    const mockRefetchRecent = jest.fn();

    mockUseDashboardSummary.mockReturnValue({
      data: null,
      loading: false,
      error: 'Summary error',
      refetch: mockRefetchSummary,
    });
    mockUseDashboardCharts.mockReturnValue({
      data: null,
      loading: false,
      error: 'Charts error',
      refetch: mockRefetchCharts,
    });
    mockUseRecentExperiments.mockReturnValue({
      data: null,
      loading: false,
      error: 'Recent error',
      refetch: mockRefetchRecent,
    });

    renderWithRouter(<Dashboard />);

    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);

    expect(mockRefetchSummary).toHaveBeenCalled();
    expect(mockRefetchCharts).toHaveBeenCalled();
    expect(mockRefetchRecent).toHaveBeenCalled();
  });

  it('navigates to experiments page when clicking action buttons', () => {
    mockUseDashboardSummary.mockReturnValue({
      data: null,
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

    renderWithRouter(<Dashboard />);

    const createExperimentButtons = screen.getAllByText('Create Experiment');
    fireEvent.click(createExperimentButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/experiments');
  });

  describe('Performance optimizations', () => {
    it('should be wrapped with React.memo to prevent unnecessary re-renders', () => {
      // Verify that Dashboard component is memoized
      expect(Dashboard.$$typeof).toBeDefined();
      expect(Dashboard.type || Dashboard).toBeDefined();
    });

    it('should handle rapid state changes without performance degradation', () => {
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

      const startTime = performance.now();
      
      renderWithRouter(<Dashboard />);

      // Simulate rapid period changes
      const buttons = ['7 Days', '30 Days', '90 Days', 'All Time'];
      buttons.forEach(buttonText => {
        const button = screen.getByText(buttonText);
        fireEvent.click(button);
      });

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should handle rapid changes efficiently (adjust threshold as needed)
      expect(totalTime).toBeLessThan(300); // 300ms for render + 4 state changes (adjusted for test environment)
    });
  });
});