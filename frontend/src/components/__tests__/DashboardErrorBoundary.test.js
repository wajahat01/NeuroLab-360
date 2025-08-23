import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DashboardErrorBoundary from '../DashboardErrorBoundary';

// Mock console.error to avoid noise in tests
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
});

// Component that throws an error for testing
const ThrowError = ({ shouldThrow = false, errorMessage = 'Test error' }) => {
  if (shouldThrow) {
    throw new Error(errorMessage);
  }
  return <div data-testid="success">No error</div>;
};

// Wrapper component for testing
const TestWrapper = ({ children }) => (
  <BrowserRouter>
    {children}
  </BrowserRouter>
);

describe('DashboardErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders children when there is no error', () => {
    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ThrowError shouldThrow={false} />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    expect(screen.getByTestId('success')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('displays error UI when child component throws', () => {
    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Dashboard crashed" />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/We encountered an error while loading the dashboard/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go to home/i })).toBeInTheDocument();
  });

  it('maintains layout structure in error state', () => {
    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ThrowError shouldThrow={true} />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Check that the error UI maintains proper layout classes
    const errorContainer = document.querySelector('.min-h-screen.bg-gray-50');
    expect(errorContainer).toBeInTheDocument();
    expect(errorContainer).toHaveClass('min-h-screen');
    expect(errorContainer).toHaveClass('bg-gray-50');
  });

  it('allows retry functionality', async () => {
    let shouldThrow = true;
    
    const ConditionalThrowError = () => {
      if (shouldThrow) {
        throw new Error('Test error');
      }
      return <div data-testid="success">No error</div>;
    };

    const { rerender } = render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ConditionalThrowError />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Error should be displayed
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Change the condition to not throw
    shouldThrow = false;

    // Click retry button
    const retryButton = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retryButton);

    // Re-render with the same component (but now it won't throw)
    rerender(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ConditionalThrowError />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByTestId('success')).toBeInTheDocument();
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });
  });

  it('disables retry button after max retries', async () => {
    let clickCount = 0;
    
    const MultiRetryError = () => {
      clickCount++;
      throw new Error(`Error ${clickCount}`);
    };

    const { rerender } = render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <MultiRetryError />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Click retry button multiple times to simulate retries
    for (let i = 0; i < 3; i++) {
      const retryButton = screen.getByRole('button', { name: /try again/i });
      fireEvent.click(retryButton);
      
      // Re-render to trigger another error and increment retry count
      rerender(
        <TestWrapper>
          <DashboardErrorBoundary>
            <MultiRetryError />
          </DashboardErrorBoundary>
        </TestWrapper>
      );
    }

    // After 3 retries, button should be disabled
    await waitFor(() => {
      const retryButton = screen.getByRole('button', { name: /max retries reached/i });
      expect(retryButton).toBeDisabled();
    });
  });

  it('logs error details when error occurs', () => {
    const testError = new Error('Test dashboard error');
    
    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Test dashboard error" />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    expect(console.error).toHaveBeenCalledWith(
      'Dashboard Error Boundary caught an error:',
      expect.any(Error),
      expect.any(Object)
    );
  });

  it('shows error details in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Development error" />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Should show error details section
    expect(screen.getByText('Error Details (Development)')).toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('hides error details in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Production error" />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Should not show error details section
    expect(screen.queryByText('Error Details (Development)')).not.toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('handles go to home button click', () => {
    // Mock window.location.href
    delete window.location;
    window.location = { href: '' };

    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ThrowError shouldThrow={true} />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    const homeButton = screen.getByRole('button', { name: /go to home/i });
    fireEvent.click(homeButton);

    expect(window.location.href).toBe('/');
  });

  it('tracks analytics when error occurs', () => {
    // Mock analytics
    window.analytics = {
      track: jest.fn()
    };

    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="Analytics test error" />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    expect(window.analytics.track).toHaveBeenCalledWith('Dashboard Error', {
      error: 'Analytics test error',
      stack: expect.any(String),
      componentStack: expect.any(String),
      retryCount: 0
    });

    // Clean up
    delete window.analytics;
  });

  it('prevents flickering during error state transitions', async () => {
    const { rerender } = render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ThrowError shouldThrow={false} />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Initially no error
    expect(screen.getByTestId('success')).toBeInTheDocument();

    // Trigger error
    rerender(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ThrowError shouldThrow={true} />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Error UI should appear immediately without flickering
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.queryByTestId('success')).not.toBeInTheDocument();
  });

  it('maintains consistent styling during error states', () => {
    render(
      <TestWrapper>
        <DashboardErrorBoundary>
          <ThrowError shouldThrow={true} />
        </DashboardErrorBoundary>
      </TestWrapper>
    );

    // Check that error UI has consistent styling
    const errorContainer = screen.getByText('Something went wrong').closest('.min-h-screen');
    expect(errorContainer).toHaveClass('bg-gray-50');
    expect(errorContainer).toHaveClass('flex');
    expect(errorContainer).toHaveClass('items-center');
    expect(errorContainer).toHaveClass('justify-center');
  });
});