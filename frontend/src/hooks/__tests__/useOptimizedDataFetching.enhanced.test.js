import { renderHook, act, waitFor } from '@testing-library/react';
import { useOptimizedDataFetching } from '../useOptimizedDataFetching';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

// Mock dependencies
jest.mock('../../contexts/AuthContext');
jest.mock('../../lib/supabase');
jest.mock('react-hot-toast');
jest.mock('../useEnhancedCache', () => ({
  enhancedCache: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    has: jest.fn()
  }
}));
jest.mock('../useDataSync', () => ({
  useDataSync: () => ({
    isOnline: true,
    addPendingChange: jest.fn()
  })
}));

// Mock fetch
global.fetch = jest.fn();

describe('useOptimizedDataFetching - Enhanced Error Handling', () => {
  const mockUser = { id: 'user-123', email: 'test@example.com' };
  const mockEndpoint = '/api/dashboard/summary';

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

  describe('New Error Response Format Handling', () => {
    test('should handle standardized authentication error response', async () => {
      const errorResponse = {
        error: 'Authentication failed',
        error_code: 'AUTH_FAILED',
        error_id: 'err-123',
        message: 'Please refresh your session and try again',
        actions: ['refresh_token', 'login_again']
      };

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve(errorResponse)
      });

      const { result } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.error).toBe(errorResponse.message);
        expect(result.current.errorDetails).toMatchObject({
          code: 'AUTH_FAILED',
          message: errorResponse.message,
          actions: ['refresh_token', 'login_again']
        });
        expect(result.current.serviceStatus).toBe('auth_required');
      });

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('log in again'),
        expect.any(Object)
      );
    });

    test('should handle database error with fallback data', async () => {
      const errorResponse = {
        error: 'Data temporarily unavailable',
        error_code: 'DATABASE_ERROR',
        error_id: 'err-456',
        message: 'We are experiencing technical difficulties. Please try again in a few moments.',
        retry_after: 30,
        fallback_available: true
      };

      const cachedData = { summary: 'cached data' };
      const { enhancedCache } = require('../useEnhancedCache');
      enhancedCache.get.mockReturnValue(cachedData);

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve(errorResponse)
      });

      const { result } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(cachedData);
        expect(result.current.isStale).toBe(true);
        expect(result.current.fallbackAvailable).toBe(true);
        expect(result.current.serviceStatus).toBe('degraded');
      });

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('cached data'),
        expect.any(Object)
      );
    });

    test('should handle partial failure response', async () => {
      const partialResponse = {
        data: { summary: 'partial data' },
        partial_failure: true,
        errors: { experiments: 'Failed to load experiments' },
        message: 'Some data could not be loaded'
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(partialResponse)
      });

      const { result } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(partialResponse);
        expect(result.current.partialFailure).toBe(true);
        expect(result.current.serviceStatus).toBe('degraded');
      });

      expect(toast.warning).toHaveBeenCalledWith(
        'Some data could not be loaded',
        expect.any(Object)
      );
    });

    test('should handle stale data response', async () => {
      const staleResponse = {
        data: { summary: 'stale data' },
        stale: true,
        message: 'Showing cached data due to service issues'
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(staleResponse)
      });

      const { result } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.data).toEqual(staleResponse);
        expect(result.current.isStale).toBe(true);
        expect(result.current.serviceStatus).toBe('degraded');
      });

      expect(toast.info).toHaveBeenCalledWith(
        'Showing cached data due to service issues',
        expect.any(Object)
      );
    });
  });

  describe('Intelligent Retry Logic', () => {
    test('should implement exponential backoff for network errors', async () => {
      jest.useFakeTimers();
      
      fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: 'success' })
        });

      const { result } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { 
          enabled: true, 
          retry: 3,
          retryDelay: 1000 
        })
      );

      // First attempt fails
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Fast-forward first retry (1 second)
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Fast-forward second retry (2 seconds - exponential backoff)
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(result.current.data).toEqual({ data: 'success' });
        expect(result.current.error).toBeNull();
      });

      expect(fetch).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });

    test('should respect retry_after from error response', async () => {
      jest.useFakeTimers();
      
      const errorResponse = {
        error_code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable',
        retry_after: 5
      };

      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: () => Promise.resolve(errorResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: 'success' })
        });

      const { result } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.retryAfter).toBe(5);
      });

      // Fast-forward by retry_after time (5 seconds)
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      await waitFor(() => {
        expect(result.current.data).toEqual({ data: 'success' });
      });

      jest.useRealTimers();
    });

    test('should implement circuit breaker pattern', async () => {
      // Simulate 3 consecutive failures to trigger circuit breaker
      fetch
        .mockRejectedValueOnce(new Error('Service error'))
        .mockRejectedValueOnce(new Error('Service error'))
        .mockRejectedValueOnce(new Error('Service error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: 'success' })
        });

      const { result, rerender } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { enabled: true, retry: 0 })
      );

      // First failure
      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // Second failure
      rerender();
      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // Third failure - should trigger circuit breaker
      rerender();
      await waitFor(() => {
        expect(result.current.serviceStatus).toBe('unavailable');
      });

      // Next request should be blocked by circuit breaker
      rerender();
      await waitFor(() => {
        expect(result.current.error).toContain('temporarily unavailable');
      });
    });
  });

  describe('Authentication Token Refresh', () => {
    test('should attempt token refresh on AUTH_FAILED error', async () => {
      const errorResponse = {
        error_code: 'AUTH_FAILED',
        message: 'Authentication failed',
        actions: ['refresh_token']
      };

      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve(errorResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: 'success after refresh' })
        });

      supabase.auth.refreshSession.mockResolvedValueOnce({
        data: { session: { access_token: 'new-token' } }
      });

      const { result } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.data).toEqual({ data: 'success after refresh' });
      });

      expect(supabase.auth.refreshSession).toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    test('should handle failed token refresh gracefully', async () => {
      const errorResponse = {
        error_code: 'AUTH_FAILED',
        message: 'Authentication failed',
        actions: ['refresh_token']
      };

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve(errorResponse)
      });

      supabase.auth.refreshSession.mockRejectedValueOnce(
        new Error('Refresh failed')
      );

      const { result } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { enabled: true })
      );

      await waitFor(() => {
        expect(result.current.error).toBe('Authentication failed');
        expect(result.current.serviceStatus).toBe('auth_required');
      });

      expect(supabase.auth.refreshSession).toHaveBeenCalled();
    });
  });

  describe('User-Friendly Error Messages', () => {
    test('should provide user-friendly error messages with recovery suggestions', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { enabled: true, retry: 0 })
      );

      await waitFor(() => {
        const errorMessage = result.current.getErrorMessage();
        expect(errorMessage).toMatchObject({
          message: expect.stringContaining('Network connection issue'),
          suggestions: expect.arrayContaining([
            'Check your internet connection',
            'Try again in a moment'
          ]),
          canRetry: true
        });
      });
    });

    test('should provide different suggestions based on error type', async () => {
      const errorResponse = {
        error_code: 'DATABASE_ERROR',
        message: 'Database temporarily unavailable'
      };

      fetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve(errorResponse)
      });

      const { result } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { enabled: true })
      );

      await waitFor(() => {
        const errorMessage = result.current.getErrorMessage();
        expect(errorMessage.suggestions).toContain('Try again in a few minutes');
        expect(errorMessage.suggestions).toContain('Contact support if the issue persists');
      });
    });
  });

  describe('Intelligent Retry Function', () => {
    test('should handle intelligent retry with token refresh', async () => {
      const errorResponse = {
        error_code: 'AUTH_FAILED',
        actions: ['refresh_token']
      };

      fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve(errorResponse)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: 'success' })
        });

      supabase.auth.refreshSession.mockResolvedValueOnce({
        data: { session: { access_token: 'new-token' } }
      });

      const { result } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { enabled: true, retry: 0 })
      );

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });

      // Call intelligent retry
      await act(async () => {
        await result.current.intelligentRetry();
      });

      await waitFor(() => {
        expect(result.current.data).toEqual({ data: 'success' });
        expect(result.current.error).toBeNull();
      });

      expect(toast.success).toHaveBeenCalledWith('Session refreshed, retrying...');
    });

    test('should reset circuit breaker on forced retry', async () => {
      // Trigger circuit breaker
      fetch
        .mockRejectedValueOnce(new Error('Service error'))
        .mockRejectedValueOnce(new Error('Service error'))
        .mockRejectedValueOnce(new Error('Service error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: 'success' })
        });

      const { result, rerender } = renderHook(() => 
        useOptimizedDataFetching(mockEndpoint, { enabled: true, retry: 0 })
      );

      // Trigger circuit breaker
      await waitFor(() => expect(result.current.error).toBeTruthy());
      rerender();
      await waitFor(() => expect(result.current.error).toBeTruthy());
      rerender();
      await waitFor(() => expect(result.current.serviceStatus).toBe('unavailable'));

      // Force retry should reset circuit breaker
      await act(async () => {
        await result.current.intelligentRetry(true);
      });

      await waitFor(() => {
        expect(result.current.data).toEqual({ data: 'success' });
        expect(result.current.serviceStatus).toBe('healthy');
      });
    });
  });
});

describe('useOptimizedDashboardData - Enhanced Error Handling', () => {
  const mockUser = { id: 'user-123' };

  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ user: mockUser });
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { access_token: 'mock-token' } }
    });
  });

  test('should provide comprehensive error summary', async () => {
    // Mock different errors for different endpoints
    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({
          error_code: 'DATABASE_ERROR',
          message: 'Database unavailable'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'charts success' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({
          error_code: 'AUTH_FAILED',
          message: 'Authentication failed'
        })
      });

    const { result } = renderHook(() => 
      require('../useOptimizedDataFetching').useOptimizedDashboardData()
    );

    await waitFor(() => {
      const errorSummary = result.current.getErrorSummary();
      expect(errorSummary).toMatchObject({
        message: '2 of 3 dashboard sections failed to load',
        severity: 'warning',
        unified: false,
        details: expect.arrayContaining([
          expect.objectContaining({ name: 'summary' }),
          expect.objectContaining({ name: 'recent' })
        ])
      });
    });
  });

  test('should show unified error message when all endpoints fail with same error', async () => {
    const sameError = {
      error_code: 'SERVICE_UNAVAILABLE',
      message: 'Service temporarily unavailable'
    };

    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve(sameError)
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve(sameError)
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve(sameError)
      });

    const { result } = renderHook(() => 
      require('../useOptimizedDataFetching').useOptimizedDashboardData()
    );

    await waitFor(() => {
      const errorSummary = result.current.getErrorSummary();
      expect(errorSummary).toMatchObject({
        message: 'Service temporarily unavailable',
        unified: true
      });
    });
  });

  test('should determine overall service status correctly', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'success' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ 
          data: 'degraded', 
          partial_failure: true 
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'success' })
      });

    const { result } = renderHook(() => 
      require('../useOptimizedDataFetching').useOptimizedDashboardData()
    );

    await waitFor(() => {
      expect(result.current.overallServiceStatus).toBe('degraded');
      expect(result.current.hasPartialFailures).toBe(true);
    });
  });
});