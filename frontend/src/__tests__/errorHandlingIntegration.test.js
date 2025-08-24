import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useOptimizedDashboardData } from '../hooks/useOptimizedDataFetching';
import { EnhancedErrorDisplay } from '../components/EnhancedErrorDisplay';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

// Mock dependencies
jest.mock('../contexts/AuthContext');
jest.mock('../lib/supabase');
jest.mock('react-hot-toast');
jest.mock('../hooks/useEnhancedCache', () => ({
  enhancedCache: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    has: jest.fn()
  }
}));
jest.mock('../hooks/useDataSync', () => ({
  useDataSync: () => ({
    isOnline: true,
    addPendingChange: jest.fn()
  })
}));

// Mock fetch
global.fetch = jest.fn();

// Test component that uses the enhanced error handling
const TestDashboardComponent = () => {
  const {
    summary,
    charts,
    recent,
    isInitialLoading,
    hasAllErrors,
    hasPartialFailures,
    overallServiceStatus,
    intelligentRetryAll,
    getErrorSummary
  } = useOptimizedDashboardData();

  if (isInitialLoading) {
    return <div>Loading...</div>;
  }

  const errorSummary = getErrorSummary();

  return (
    <div>
      <div data-testid="service-status">{overallServiceStatus}</div>
      
      {hasAllErrors && (
        <EnhancedErrorDisplay
          error={errorSummary?.message}
          errorDetails={errorSummary}
          onIntelligentRetry={() => intelligentRetryAll(true)}
          serviceStatus={overallServiceStatus}
        />
      )}

      {hasPartialFailures && !hasAllErrors && (
        <div data-testid="partial-failure-notice">
          Some dashboard sections failed to load
        </div>
      )}

      {summary.data && (
        <div data-testid="summary-data">
          {JSON.stringify(summary.data)}
        </div>
      )}

      {charts.data && (
        <div data-testid="charts-data">
          {JSON.stringify(charts.data)}
        </div>
      )}

      {recent.data && (
        <div data-testid="recent-data">
          {JSON.stringify(recent.data)}
        </div>
      )}

      {summary.isStale && (
        <div data-testid="stale-notice">Data may be outdated</div>
      )}
    </div>
  );
};

describe('Error Handling Integration Tests', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: mockUser });
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'mock-token' } }
    });
    toast.error = jest.fn();
    toast.warning = jest.fn();
    toast.info = jest.fn();
    toast.success = jest.fn();
    toast.loading = jest.fn();
  });

  describe('Complete Error Handling Flow', () => {
    test('should handle authentication error with token refresh flow', async () => {
      // Initial auth failure
      const authError = {
        error: 'Authentication failed',
        error_code: 'AUTH_FAILED',
        message: 'Please refresh your session and try again',
        actions: ['refresh_token']
      };

      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve(authError)
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve(authError)
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve(authError)
        })
        // After token refresh
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ summary: 'success' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ charts: 'success' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ recent: 'success' })
        });

      // Mock successful token refresh
      supabase.auth.refreshSession.mockResolvedValueOnce({
        data: { session: { access_token: 'new-token' } }
      });

      render(<TestDashboardComponent />);

      // Should show loading initially
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Should show authentication error
      await waitFor(() => {
        expect(screen.getByText('Authentication Required')).toBeInTheDocument();
        expect(screen.getByText('Please refresh your session and try again')).toBeInTheDocument();
      });

      // Should show service status as auth_required
      expect(screen.getByTestId('service-status')).toHaveTextContent('auth_required');

      // Click retry button to trigger token refresh
      const retryButton = screen.getByText('Try again');
      fireEvent.click(retryButton);

      // Should eventually show success data after token refresh
      await waitFor(() => {
        expect(screen.getByTestId('summary-data')).toHaveTextContent('summary');
        expect(screen.getByTestId('charts-data')).toHaveTextContent('charts');
        expect(screen.getByTestId('recent-data')).toHaveTextContent('recent');
      });

      expect(screen.getByTestId('service-status')).toHaveTextContent('healthy');
      expect(supabase.auth.refreshSession).toHaveBeenCalled();
    });

    test('should handle partial failure with graceful degradation', async () => {
      const { enhancedCache } = require('../hooks/useEnhancedCache');
      enhancedCache.get.mockReturnValue(null);

      // Summary succeeds
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ summary: 'success' })
      });

      // Charts fails with database error but has fallback
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({
          error_code: 'DATABASE_ERROR',
          message: 'Database temporarily unavailable',
          fallback_available: true
        })
      });

      // Recent succeeds with partial failure
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          recent: 'partial data',
          partial_failure: true,
          errors: { experiments: 'Failed to load some experiments' }
        })
      });

      render(<TestDashboardComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('summary-data')).toHaveTextContent('summary');
        expect(screen.getByTestId('recent-data')).toHaveTextContent('recent');
        expect(screen.getByTestId('partial-failure-notice')).toBeInTheDocument();
      });

      expect(screen.getByTestId('service-status')).toHaveTextContent('degraded');
      expect(toast.warning).toHaveBeenCalledWith(
        'Some data could not be loaded',
        expect.any(Object)
      );
    });

    test('should handle complete service failure with cached data fallback', async () => {
      const { enhancedCache } = require('../hooks/useEnhancedCache');
      
      // Mock cached data
      enhancedCache.get
        .mockReturnValueOnce({ summary: 'cached summary' })
        .mockReturnValueOnce({ charts: 'cached charts' })
        .mockReturnValueOnce({ recent: 'cached recent' });

      const serviceError = {
        error_code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable',
        retry_after: 30,
        fallback_available: true
      };

      // All endpoints fail
      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: () => Promise.resolve(serviceError)
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: () => Promise.resolve(serviceError)
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: () => Promise.resolve(serviceError)
        });

      render(<TestDashboardComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('summary-data')).toHaveTextContent('cached summary');
        expect(screen.getByTestId('charts-data')).toHaveTextContent('cached charts');
        expect(screen.getByTestId('recent-data')).toHaveTextContent('cached recent');
        expect(screen.getByTestId('stale-notice')).toBeInTheDocument();
      });

      expect(screen.getByTestId('service-status')).toHaveTextContent('degraded');
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('cached data'),
        expect.any(Object)
      );
    });

    test('should handle network errors with intelligent retry', async () => {
      jest.useFakeTimers();

      // First attempts fail with network error
      fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        // Retry attempts succeed
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ summary: 'retry success' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ charts: 'retry success' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ recent: 'retry success' })
        });

      render(<TestDashboardComponent />);

      // Should show loading initially
      expect(screen.getByText('Loading...')).toBeInTheDocument();

      // Fast-forward through retry delays
      act(() => {
        jest.advanceTimersByTime(5000); // Network retry delay
      });

      await waitFor(() => {
        expect(screen.getByTestId('summary-data')).toHaveTextContent('retry success');
        expect(screen.getByTestId('charts-data')).toHaveTextContent('retry success');
        expect(screen.getByTestId('recent-data')).toHaveTextContent('retry success');
      });

      expect(screen.getByTestId('service-status')).toHaveTextContent('healthy');
      expect(toast.loading).toHaveBeenCalledWith(
        expect.stringContaining('Retrying'),
        expect.any(Object)
      );

      jest.useRealTimers();
    });

    test('should handle circuit breaker activation', async () => {
      const { enhancedCache } = require('../hooks/useEnhancedCache');
      enhancedCache.get.mockReturnValue({ fallback: 'data' });

      // Simulate multiple failures to trigger circuit breaker
      const serviceError = new Error('Service error');
      
      fetch
        .mockRejectedValueOnce(serviceError)
        .mockRejectedValueOnce(serviceError)
        .mockRejectedValueOnce(serviceError)
        .mockRejectedValueOnce(serviceError)
        .mockRejectedValueOnce(serviceError)
        .mockRejectedValueOnce(serviceError);

      const { rerender } = render(<TestDashboardComponent />);

      // Trigger multiple failures
      await waitFor(() => {
        expect(screen.getByTestId('service-status')).toBeTruthy();
      });

      // Force multiple re-renders to trigger circuit breaker
      rerender(<TestDashboardComponent />);
      await waitFor(() => {
        expect(screen.getByTestId('service-status')).toBeTruthy();
      });

      rerender(<TestDashboardComponent />);
      await waitFor(() => {
        expect(screen.getByTestId('service-status')).toBe('unavailable');
      });

      // Should show circuit breaker error
      expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    });
  });

  describe('User Experience Validation', () => {
    test('should provide clear error messages and recovery actions', async () => {
      const validationError = {
        error_code: 'VALIDATION_ERROR',
        message: 'Invalid data format',
        details: 'Date parameter is malformed'
      };

      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve(validationError)
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve(validationError)
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve(validationError)
        });

      render(<TestDashboardComponent />);

      await waitFor(() => {
        expect(screen.getByText('Invalid Data')).toBeInTheDocument();
        expect(screen.getByText('Invalid data format')).toBeInTheDocument();
        expect(screen.getByText('What you can try:')).toBeInTheDocument();
        expect(screen.getByText('Check your input')).toBeInTheDocument();
      });
    });

    test('should show appropriate loading states during retry', async () => {
      const networkError = new Error('Network error');
      
      fetch
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ summary: 'success' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ charts: 'success' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ recent: 'success' })
        });

      render(<TestDashboardComponent />);

      await waitFor(() => {
        expect(screen.getByText('Connection Issue')).toBeInTheDocument();
      });

      // Click retry button
      const retryButton = screen.getByText('Try again');
      fireEvent.click(retryButton);

      // Should show loading state during retry
      expect(screen.getByText('Retrying...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByTestId('summary-data')).toHaveTextContent('success');
      });
    });

    test('should maintain data consistency during error states', async () => {
      const { enhancedCache } = require('../hooks/useEnhancedCache');
      enhancedCache.get.mockReturnValue({ existing: 'data' });

      // First request succeeds
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ summary: 'initial data' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ charts: 'initial data' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ recent: 'initial data' })
        });

      const { rerender } = render(<TestDashboardComponent />);

      await waitFor(() => {
        expect(screen.getByTestId('summary-data')).toHaveTextContent('initial data');
      });

      // Subsequent request fails but should retain data
      fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'));

      rerender(<TestDashboardComponent />);

      await waitFor(() => {
        // Should still show initial data, not clear it
        expect(screen.getByTestId('summary-data')).toHaveTextContent('initial data');
        expect(screen.getByText('Connection Issue')).toBeInTheDocument();
      });
    });
  });
});