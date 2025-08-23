import { renderHook, act } from '@testing-library/react-hooks';
import { useEnhancedErrorHandling, useApiErrorHandling } from '../useEnhancedErrorHandling';
import toast from 'react-hot-toast';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  error: jest.fn(),
  success: jest.fn()
}));

describe('useEnhancedErrorHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Basic Error Handling', () => {
    it('should handle errors with default options', () => {
      const { result } = renderHook(() => useEnhancedErrorHandling());

      expect(result.current.error).toBe(null);
      expect(result.current.showErrorUI).toBe(false);
      expect(result.current.isRetrying).toBe(false);

      act(() => {
        result.current.handleError(new Error('Test error'));
      });

      expect(result.current.error).toBe('Test error');
      expect(toast.error).toHaveBeenCalledWith('Test error');
    });

    it('should delay error UI display to prevent flickering', () => {
      const { result } = renderHook(() => 
        useEnhancedErrorHandling({ errorDisplayDelay: 1000 })
      );

      act(() => {
        result.current.handleError(new Error('Test error'));
      });

      // Should not show error UI immediately
      expect(result.current.showErrorUI).toBe(false);

      // Fast-forward time
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      // Should show error UI after delay
      expect(result.current.showErrorUI).toBe(true);
    });

    it('should show error UI immediately when requested', () => {
      const { result } = renderHook(() => useEnhancedErrorHandling());

      act(() => {
        result.current.handleError(new Error('Test error'), { immediate: true });
      });

      expect(result.current.showErrorUI).toBe(true);
    });

    it('should not show toast for silent errors', () => {
      const { result } = renderHook(() => useEnhancedErrorHandling());

      act(() => {
        result.current.handleError(new Error('Silent error'), { silent: true });
      });

      expect(result.current.error).toBe('Silent error');
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('Auto Retry Functionality', () => {
    it('should auto-retry on network errors', async () => {
      const retryCallback = jest.fn().mockResolvedValue('success');
      const onRetry = jest.fn();

      const { result } = renderHook(() => 
        useEnhancedErrorHandling({ 
          autoRetry: true, 
          maxRetries: 2,
          retryDelay: 1000,
          onRetry
        })
      );

      act(() => {
        result.current.handleError(new Error('Network error'), { retryCallback });
      });

      expect(result.current.isRetrying).toBe(true);

      // Fast-forward to trigger retry
      await act(async () => {
        jest.advanceTimersByTime(1000);
        await Promise.resolve(); // Allow promises to resolve
      });

      expect(retryCallback).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1);
      expect(result.current.error).toBe(null);
      expect(result.current.isRetrying).toBe(false);
    });

    it('should use exponential backoff for retries', () => {
      const retryCallback = jest.fn().mockRejectedValue(new Error('Retry failed'));

      const { result } = renderHook(() => 
        useEnhancedErrorHandling({ 
          autoRetry: true, 
          maxRetries: 3,
          retryDelay: 1000
        })
      );

      act(() => {
        result.current.handleError(new Error('Network error'), { retryCallback });
      });

      // First retry after 1000ms
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(retryCallback).toHaveBeenCalledTimes(1);

      // Second retry after 2000ms (exponential backoff)
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(retryCallback).toHaveBeenCalledTimes(2);

      // Third retry after 4000ms
      act(() => {
        jest.advanceTimersByTime(4000);
      });

      expect(retryCallback).toHaveBeenCalledTimes(3);
    });

    it('should stop retrying after max attempts', () => {
      const retryCallback = jest.fn().mockRejectedValue(new Error('Retry failed'));
      const onMaxRetriesReached = jest.fn();

      const { result } = renderHook(() => 
        useEnhancedErrorHandling({ 
          autoRetry: true, 
          maxRetries: 2,
          retryDelay: 1000,
          onMaxRetriesReached
        })
      );

      act(() => {
        result.current.handleError(new Error('Network error'), { retryCallback });
      });

      // Exhaust all retries
      act(() => {
        jest.advanceTimersByTime(1000); // First retry
      });
      act(() => {
        jest.advanceTimersByTime(2000); // Second retry
      });

      expect(retryCallback).toHaveBeenCalledTimes(2);
      expect(onMaxRetriesReached).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('Maximum retry attempts reached');
    });
  });

  describe('Manual Retry', () => {
    it('should allow manual retry', async () => {
      const retryCallback = jest.fn().mockResolvedValue('success');

      const { result } = renderHook(() => useEnhancedErrorHandling());

      act(() => {
        result.current.handleError(new Error('Test error'));
      });

      expect(result.current.error).toBe('Test error');

      await act(async () => {
        await result.current.retry(retryCallback);
      });

      expect(retryCallback).toHaveBeenCalledTimes(1);
      expect(result.current.error).toBe(null);
      expect(result.current.isRetrying).toBe(false);
    });

    it('should handle manual retry failures', async () => {
      const retryCallback = jest.fn().mockRejectedValue(new Error('Retry failed'));

      const { result } = renderHook(() => useEnhancedErrorHandling());

      await act(async () => {
        await result.current.retry(retryCallback);
      });

      expect(result.current.error).toBe('Retry failed. Please try again.');
      expect(result.current.isRetrying).toBe(false);
    });
  });

  describe('Error Message Processing', () => {
    it('should provide user-friendly error messages', () => {
      const { result } = renderHook(() => useEnhancedErrorHandling());

      const testCases = [
        { input: 'fetch failed', expected: 'Network connection issue. Please check your internet connection.' },
        { input: 'unauthorized', expected: 'Authentication expired. Please log in again.' },
        { input: 'server error 500', expected: 'Server error. Please try again in a moment.' },
        { input: 'offline', expected: 'You are currently offline. Changes will sync when connection is restored.' },
        { input: 'validation failed', expected: 'Please check your input and try again.' }
      ];

      testCases.forEach(({ input, expected }) => {
        act(() => {
          result.current.handleError(new Error(input));
        });

        expect(result.current.getUserFriendlyMessage()).toBe(expected);
      });
    });

    it('should handle long error messages', () => {
      const { result } = renderHook(() => useEnhancedErrorHandling());

      const longError = 'This is a very long error message that contains technical details that users should not see and it goes on and on with implementation details';

      act(() => {
        result.current.handleError(new Error(longError));
      });

      expect(result.current.getUserFriendlyMessage()).toBe('Something went wrong. Please try again.');
    });
  });

  describe('Error Display Logic', () => {
    it('should not show UI for offline errors', () => {
      const { result } = renderHook(() => useEnhancedErrorHandling());

      act(() => {
        result.current.handleError(new Error('Currently offline'));
      });

      expect(result.current.shouldShowError(result.current.lastError)).toBe(false);
    });

    it('should not show UI for authentication errors', () => {
      const { result } = renderHook(() => useEnhancedErrorHandling());

      act(() => {
        result.current.handleError(new Error('unauthorized access'));
      });

      expect(result.current.shouldShowError(result.current.lastError)).toBe(false);
    });

    it('should show UI for general errors', () => {
      const { result } = renderHook(() => useEnhancedErrorHandling());

      act(() => {
        result.current.handleError(new Error('Something went wrong'));
      });

      expect(result.current.shouldShowError(result.current.lastError)).toBe(true);
    });
  });

  describe('Cleanup', () => {
    it('should clear error state', () => {
      const { result } = renderHook(() => useEnhancedErrorHandling());

      act(() => {
        result.current.handleError(new Error('Test error'));
      });

      expect(result.current.error).toBe('Test error');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
      expect(result.current.showErrorUI).toBe(false);
      expect(result.current.retryCount).toBe(0);
    });

    it('should cleanup timers on unmount', () => {
      const { unmount } = renderHook(() => 
        useEnhancedErrorHandling({ errorDisplayDelay: 1000 })
      );

      // This should not throw or cause memory leaks
      unmount();
    });
  });
});

describe('useApiErrorHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle HTTP status codes appropriately', () => {
    const { result } = renderHook(() => 
      useApiErrorHandling({ endpoint: '/api/test' })
    );

    const testCases = [
      { status: 400, expected: 'Invalid request. Please check your input.' },
      { status: 401, expected: 'Authentication required. Please log in again.' },
      { status: 403, expected: 'Access denied. You don\'t have permission for this action.' },
      { status: 404, expected: 'Resource not found.' },
      { status: 409, expected: 'Conflict detected. The resource may have been modified.' },
      { status: 429, expected: 'Too many requests. Please wait a moment and try again.' },
      { status: 500, expected: 'Server error. Please try again in a moment.' }
    ];

    testCases.forEach(({ status, expected }) => {
      const error = { response: { status } };
      
      act(() => {
        result.current.handleApiError(error);
      });

      expect(result.current.error).toBe(expected);
    });
  });

  it('should ignore aborted requests', () => {
    const { result } = renderHook(() => useApiErrorHandling());

    const abortError = { name: 'AbortError' };

    act(() => {
      result.current.handleApiError(abortError);
    });

    expect(result.current.error).toBe(null);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('should handle network errors with retry', () => {
    const retryCallback = jest.fn();
    const { result } = renderHook(() => 
      useApiErrorHandling({ autoRetry: true })
    );

    const networkError = { message: 'fetch failed' };

    act(() => {
      result.current.handleApiError(networkError, { retryCallback });
    });

    expect(result.current.error).toBe('Network error. Please check your connection.');
  });
});