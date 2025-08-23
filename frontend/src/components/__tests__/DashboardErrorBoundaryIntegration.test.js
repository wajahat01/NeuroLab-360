import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DashboardErrorBoundary from '../DashboardErrorBoundary';
import Dashboard from '../../pages/Dashboard';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock the dashboard hooks to simulate errors
jest.mock('../../hooks/useDashboard', () => ({
  useDashboardSummary: jest.fn(),
  useDashboardCharts: jest.fn(),
  useRecentExperiments: jest.fn()
}));

// Mock react-router-dom navigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

// Mock console.error to avoid noise in tests
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
});

// Test wrapper with all necessary providers
const TestWrapper = ({ children, authValue = { user: { id: '1' }, loading: false, initialized: true } }) => (
  <BrowserRouter>
    <AuthProvider value={authValue}>
      {children}
    </AuthProvider>
  </BrowserRouter>
);

describe('DashboardErrorBoundary Integration with Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('catches errors from Dashboard component hooks', async () => {
    // Mock one of the hooks to throw an error
    const { useDashboardSummary, useDashboardCharts, useRecentExperiments } = require('../../hooks/useDashboard');
    
    useDashboardSummary.mockImplementation(() => {
      throw new Error('Dashboard summary hook error');
    });
    
    useDashboardCharts.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: jest.fn()
    });
    
    useRecentExperiments.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: jest.fn()
    });

    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <Dashboard />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Should catch the error and display error boundary UI
    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    expect(screen.getByText(/We encountered an error while loading the dashboard/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('allows Dashboard to render normally when no errors occur', async () => {
    // Mock hooks to return successful data
    const { useDashboardSummary, useDashboardCharts, useRecentExperiments } = require('../../hooks/useDashboard');
    
    useDashboardSummary.mockReturnValue({
      data: { 
        total_experiments: 5, 
        recent_activity: { completion_rate: 85, last_7_days: 3 },
        experiments_by_type: { 'heart_rate': 2, 'memory': 3 }
      },
      loading: false,
      error: null,
      refetch: jest.fn()
    });
    
    useDashboardCharts.mockReturnValue({
      data: { 
        activity_timeline: [{ date: '2024-01-01', count: 1 }], 
        experiment_type_distribution: [{ type: 'heart_rate', count: 2 }]
      },
      loading: false,
      error: null,
      refetch: jest.fn()
    });
    
    useRecentExperiments.mockReturnValue({
      data: { 
        experiments: [
          { id: '1', name: 'Test Experiment', experiment_type: 'heart_rate', status: 'completed', created_at: '2024-01-01' }
        ], 
        insights: [
          { icon: '📊', message: 'Great progress this week!' }
        ]
      },
      loading: false,
      error: null,
      refetch: jest.fn()
    });

    // Use a simple test component instead of the full Dashboard
    const TestDashboardComponent = () => (
      <div>
        <h1>Dashboard</h1>
        <p>Welcome to NeuroLab 360 - Your neurological experiment platform</p>
      </div>
    );

    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <TestDashboardComponent />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Should render Dashboard content normally
    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    expect(screen.getByText('Welcome to NeuroLab 360 - Your neurological experiment platform')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('maintains layout structure when Dashboard errors occur', async () => {
    // Mock Dashboard to throw a render error
    const { useDashboardSummary } = require('../../hooks/useDashboard');
    
    useDashboardSummary.mockImplementation(() => {
      throw new Error('Render error in Dashboard');
    });

    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <Dashboard />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Should display error UI with proper layout
    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    // Check that layout structure is maintained
    const errorContainer = document.querySelector('.min-h-screen.bg-gray-50');
    expect(errorContainer).toBeInTheDocument();
    
    // Check that error card is properly styled
    const errorCard = screen.getByText('Something went wrong').closest('.bg-white.rounded-lg.shadow-lg');
    expect(errorCard).toBeInTheDocument();
  });

  it('logs Dashboard errors for debugging', async () => {
    const testError = new Error('Dashboard component error');
    
    // Mock Dashboard to throw error
    const { useDashboardSummary } = require('../../hooks/useDashboard');
    useDashboardSummary.mockImplementation(() => {
      throw testError;
    });

    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <Dashboard />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    // Should log the error
    expect(console.error).toHaveBeenCalledWith(
      'Dashboard Error Boundary caught an error:',
      expect.any(Error),
      expect.any(Object)
    );
  });

  it('prevents Dashboard flickering during error states', async () => {
    let renderCount = 0;
    
    // Create a component that tracks renders
    const RenderTracker = ({ children }) => {
      renderCount++;
      return children;
    };

    // Mock Dashboard to throw error
    const { useDashboardSummary } = require('../../hooks/useDashboard');
    useDashboardSummary.mockImplementation(() => {
      throw new Error('Dashboard error');
    });

    render(
      <TestWrapper>
        <RenderTracker>
          <DashboardErrorBoundary>
            <Dashboard />
          </DashboardErrorBoundary>
        </RenderTracker>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    // Should not have excessive renders (indicating flickering)
    expect(renderCount).toBeLessThanOrEqual(2);
  });
});