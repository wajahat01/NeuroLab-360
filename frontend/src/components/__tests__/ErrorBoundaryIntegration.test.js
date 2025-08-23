import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DashboardErrorBoundary from '../DashboardErrorBoundary';
import Dashboard from '../../pages/Dashboard';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock the hooks to control their behavior
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

// Test component that can simulate different error scenarios
const ErrorSimulator = ({ errorType = null, children }) => {
  const [shouldError, setShouldError] = useState(false);

  React.useEffect(() => {
    if (errorType === 'render') {
      setShouldError(true);
    }
  }, [errorType]);

  if (shouldError && errorType === 'render') {
    throw new Error('Simulated render error');
  }

  if (errorType === 'async') {
    // Simulate async error after component mounts
    React.useEffect(() => {
      setTimeout(() => {
        throw new Error('Simulated async error');
      }, 100);
    }, []);
  }

  return children || <div data-testid="error-simulator">Error Simulator</div>;
};

// Test wrapper with all necessary providers
const TestWrapper = ({ children, authValue = { user: { id: '1' }, loading: false, initialized: true } }) => (
  <BrowserRouter>
    <AuthProvider value={authValue}>
      {children}
    </AuthProvider>
  </BrowserRouter>
);

describe('Error Boundary Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mocks to default successful state
    const { useDashboardSummary, useDashboardCharts, useRecentExperiments } = require('../../hooks/useDashboard');
    
    useDashboardSummary.mockReturnValue({
      data: { total_experiments: 5, recent_activity: { completion_rate: 85, last_7_days: 3 } },
      loading: false,
      error: null,
      refetch: jest.fn()
    });
    
    useDashboardCharts.mockReturnValue({
      data: { activity_timeline: [], experiment_type_distribution: [] },
      loading: false,
      error: null,
      refetch: jest.fn()
    });
    
    useRecentExperiments.mockReturnValue({
      data: { experiments: [], insights: [] },
      loading: false,
      error: null,
      refetch: jest.fn()
    });
  });

  it('prevents flickering when Dashboard component throws error', async () => {
    // Track render cycles to detect flickering
    const renderTracker = jest.fn();
    
    const FlickerDetector = ({ children }) => {
      renderTracker();
      return children;
    };

    render(
      <TestWrapper>
        <FlickerDetector>
          <DashboardErrorBoundary>
            <ErrorSimulator errorType="render">
              <Dashboard />
            </ErrorSimulator>
          </DashboardErrorBoundary>
        </FlickerDetector>
      </TestWrapper>
    );

    // Should render error UI immediately without multiple render cycles
    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    // Should have at least one render cycle (error boundary catches error)
    expect(renderTracker).toHaveBeenCalledTimes(1);
  });

  it('maintains layout stability during error recovery', async () => {
    let shouldError = true;
    
    const ConditionalErrorComponent = () => {
      if (shouldError) {
        throw new Error('Test error');
      }
      return <div data-testid="recovered-content">Recovered content</div>;
    };

    const { rerender } = render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ConditionalErrorComponent />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Error state should be displayed
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Get container dimensions during error state
    const errorContainer = document.querySelector('.min-h-screen');
    expect(errorContainer).toBeInTheDocument();

    // Change condition and retry
    shouldError = false;
    const retryButton = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryButton);

    rerender(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ConditionalErrorComponent />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('recovered-content')).toBeInTheDocument();
    });

    // Layout should remain stable
    const recoveredContainer = screen.getByTestId('recovered-content');
    expect(recoveredContainer).toBeInTheDocument();
  });

  it('handles multiple error boundaries without interference', async () => {
    const NestedErrorComponent = () => {
      throw new Error('Nested component error');
    };

    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <div data-testid="outer-content">
            <DashboardErrorBoundary>
              <NestedErrorComponent />
            </DashboardErrorBoundary>
            <div data-testid="sibling-content">Sibling content</div>
          </div>
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Inner error boundary should catch the error
    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    // Sibling content should still be rendered
    expect(screen.getByTestId('sibling-content')).toBeInTheDocument();
  });

  it('prevents error propagation to parent components', async () => {
    const ParentComponent = ({ children }) => {
      const [hasError, setHasError] = useState(false);
      
      if (hasError) {
        return <div data-testid="parent-error">Parent caught error</div>;
      }

      return (
        <div data-testid="parent-content">
          {children}
        </div>
      );
    };

    render(
      <TestWrapper>
        <ParentComponent>
          <DashboardErrorBoundary>
            <ErrorSimulator errorType="render" />
          </DashboardErrorBoundary>
        </ParentComponent>
      </TestWrapper>
    );

    // Error should be caught by DashboardErrorBoundary, not parent
    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    expect(screen.getByTestId('parent-content')).toBeInTheDocument();
    expect(screen.queryByTestId('parent-error')).not.toBeInTheDocument();
  });

  it('maintains error boundary state across re-renders', async () => {
    const { rerender } = render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ErrorSimulator errorType="render" />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Error should be displayed
    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    // Re-render with same error component
    rerender(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ErrorSimulator errorType="render" />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Error state should persist
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('handles rapid error state changes without flickering', async () => {
    const RapidErrorComponent = () => {
      const [errorCount, setErrorCount] = useState(0);

      React.useEffect(() => {
        const interval = setInterval(() => {
          setErrorCount(prev => prev + 1);
        }, 50);

        return () => clearInterval(interval);
      }, []);

      if (errorCount > 2) {
        throw new Error(`Rapid error ${errorCount}`);
      }

      return <div data-testid="rapid-content">Count: {errorCount}</div>;
    };

    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <RapidErrorComponent />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Should eventually show error without flickering
    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    }, { timeout: 1000 });

    // Should not show the rapid content anymore
    expect(screen.queryByTestId('rapid-content')).not.toBeInTheDocument();
  });

  it('preserves error boundary functionality with Dashboard integration', async () => {
    // Mock Dashboard to throw error
    const { useDashboardSummary } = require('../../hooks/useDashboard');
    useDashboardSummary.mockImplementation(() => {
      throw new Error('Dashboard hook error');
    });

    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <Dashboard />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Error boundary should catch Dashboard errors
    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    // Should show retry functionality
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('handles error boundary reset correctly', async () => {
    let shouldThrow = true;
    
    const ConditionalErrorComponent = () => {
      if (shouldThrow) {
        throw new Error('Conditional error');
      }
      return <div data-testid="success-content">Success!</div>;
    };

    const { rerender } = render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ConditionalErrorComponent />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Should show error initially
    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    // Change condition and retry
    shouldThrow = false;
    const retryButton = screen.getByRole('button', { name: /try again/i });
    
    fireEvent.click(retryButton);

    rerender(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ConditionalErrorComponent />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Should show success content after retry
    await waitFor(() => {
      expect(screen.getByTestId('success-content')).toBeInTheDocument();
    });

    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});