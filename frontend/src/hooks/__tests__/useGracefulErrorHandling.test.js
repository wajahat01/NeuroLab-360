import { renderHook, act, waitFor } from '@testing-library/react';
import { toast } from 'react-hot-toast';
import { 
  useGracefulErrorHandling, 
  useNetworkAwareErrorHandling, 
  useComponentErrorBoundary 
} from '../useGracefulErrorHandling';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  toast: {
    error: jest.fn()
  }
}));

describe('useGracefulErrorHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should handle errors without immediate visual disruption', async () => {
    const { result } = renderHook(() => 
      useGracefulErrorHandling({
        errorDisplayDelay: 500
      })
    );

    const testError = new Error('Test error');

    act(() => {
      result.current.handleError(testError);
    });

    // Error should be set but UI should not show immediately
    expect(result.current.error).toBe('Test error');
    expect(result.current.showErrorUI).toBe(false);

    // Fast-forward past the delay
    act(() => {
      jest.advanceTimersByTime(500);
    });

    // Now error UI should be visible
    expect(result.current.showErrorUI).toBe(true);
  });

  it('should show toast notifications for errors', () => {
    const { result } = renderHook(() => 
      useGracefulErrorHandling({ showToasts: true })
    );

    const testError = new Error('Test error');

    act(() => {
      result.current.handleError(testError);
    });

    expect(toast.error).toHaveBeenCalledWith('Test error', {
      duration: 4000,
      position: 'top-right'
    });
  });

  it('should not show toast for silent errors', () => {
    const { result } = renderHook(() => 
      useGracefulErrorHandling({ showToasts: true })
    );

    const testError = new Error('Test error');

    act(() => {
      result.current.handleError(testError, { silent: true });
    });

    expect(toast.error).not.toHaveBeenCalled();
  });

  it('should auto-retry failed operations', async () => {
    const retryCallback = jest.fn()
      .mockRejectedValueOnce(new Error('First attempt failed'))
      .mockResolvedValueOnce('Success');

    const { result } = renderHook(() => 
      useGracefulErrorHandling({
        autoRetry: true,
        maxRetries: 2,
        retryDelay: 100
      })
    );

    act(() => {
      result.current.handleError(new Error('Initial error'), {
        retryCallback
      });
    });

    expect(result.current.isRetrying).toBe(true);
    expect(result.current.retryCount).toBe(1);

    // Fast-forward past retry delay
    act(() => {
      jest.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(retryCallback).toHaveBeenCalledTimes(1);
    });

    // Should retry again after first failure
    act(() => {
      jest.advanceTimersByTime(200); // Second retry has longer delay
    });

    await waitFor(() => {
      expect(retryCallback).toHaveBeenCalledTimes(2);
      expect(result.current.error).toBe(null);
      expect(result.current.isRetrying).toBe(false);
    });
  });

  it('should stop retrying after max attempts', async () => {
    const retryCallback = jest.fn().mockRejectedValue(new Error('Always fails'));

    const { result } = renderHook(() => 
      useGracefulErrorHandling({
        autoRetry: true,
        maxRetries: 2,
        retryDelay: 100
      })
    );

    act(() => {
      result.current.handleError(new Error('Initial error'), {
        retryCallback
      });
    });

    // Fast-forward through all retry attempts
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(retryCallback).toHaveBeenCalledTimes(2);
      expect(result.current.retryCount).toBe(2);
    });

    // Should not retry beyond max attempts
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(retryCallback).toHaveBeenCalledTimes(2);
  });

  it('should clear error state', () => {
    const { result } = renderHook(() => useGracefulErrorHandling());

    act(() => {
      result.current.handleError(new Error('Test error'));
    });

    expect(result.current.error).toBe('Test error');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBe(null);
    expect(result.current.showErrorUI).toBe(false);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.retryCount).toBe(0);
  });

  it('should handle manual retry', async () => {
    const retryCallback = jest.fn().mockResolvedValue('Success');

    const { result } = renderHook(() => useGracefulErrorHandling());

    act(() => {
      result.current.handleError(new Error('Test error'));
    });

    expect(result.current.error).toBe('Test error');

    act(() => {
      result.current.retry(retryCallback);
    });

    expect(result.current.isRetrying).toBe(true);

    await waitFor(() => {
      expect(retryCallback).toHaveBeenCalled();
      expect(result.current.error).toBe(null);
      expect(result.current.isRetrying).toBe(false);
    });
  });
});

describe('useNetworkAwareErrorHandling', () => {
  const mockAddEventListener = jest.fn();
  const mockRemoveEventListener = jest.fn();

  beforeEach(() => {
    Object.defineProperty(window, 'addEventListener', {
      value: mockAddEventListener,
      writable: true
    });
    Object.defineProperty(window, 'removeEventListener', {
      value: mockRemoveEventListener,
      writable: true
    });
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true
    });
  });

  it('should detect online/offline status', () => {
    const { result } = renderHook(() => useNetworkAwareErrorHandling());

    expect(result.current.isOnline).toBe(true);
    expect(result.current.networkError).toBe(null);

    // Simulate going offline
    Object.defineProperty(navigator, 'onLine', { value: false });
    
    // Trigger offline event
    const offlineHandler = mockAddEventListener.mock.calls.find(
      call => call[0] === 'offline'
    )[1];
    
    act(() => {
      offlineHandler();
    });

    expect(result.current.isOnline).toBe(false);
    expect(result.current.networkError).toBe(
      'You are currently offline. Some features may not be available.'
    );
  });

  it('should handle network errors appropriately', () => {
    const { result } = renderHook(() => useNetworkAwareErrorHandling());

    // Test offline error
    Object.defineProperty(navigator, 'onLine', { value: false });
    act(() => {
      const offlineHandler = mockAddEventListener.mock.calls.find(
        call => call[0] === 'offline'
      )[1];
      offlineHandler();
    });

    const offlineError = new Error('fetch failed');
    const offlineResult = result.current.handleNetworkError(offlineError);

    expect(offlineResult.message).toBe(
      'Unable to connect. Please check your internet connection.'
    );
    expect(offlineResult.isNetworkError).toBe(true);
    expect(offlineResult.canRetry).toBe(false);

    // Test network error while online
    Object.defineProperty(navigator, 'onLine', { value: true });
    act(() => {
      const onlineHandler = mockAddEventListener.mock.calls.find(
        call => call[0] === 'online'
      )[1];
      onlineHandler();
    });

    const networkError = new Error('network timeout');
    const networkResult = result.current.handleNetworkError(networkError);

    expect(networkResult.message).toBe('Network error. Please try again.');
    expect(networkResult.isNetworkError).toBe(true);
    expect(networkResult.canRetry).toBe(true);

    // Test non-network error
    const regularError = new Error('validation failed');
    const regularResult = result.current.handleNetworkError(regularError);

    expect(regularResult.message).toBe('validation failed');
    expect(regularResult.isNetworkError).toBe(false);
    expect(regularResult.canRetry).toBe(true);
  });
});

describe('useComponentErrorBoundary', () => {
  beforeEach(() => {
    // Mock console.error to avoid noise in tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  it('should capture and handle component errors', () => {
    const { result } = renderHook(() => 
      useComponentErrorBoundary('TestComponent')
    );

    expect(result.current.hasError).toBe(false);
    expect(result.current.errorInfo).toBe(null);

    const testError = new Error('Component crashed');
    const errorInfo = {
      componentStack: 'at TestComponent'
    };

    act(() => {
      result.current.captureError(testError, errorInfo);
    });

    expect(result.current.hasError).toBe(true);
    expect(result.current.errorInfo).toEqual({
      error: 'Component crashed',
      componentStack: 'at TestComponent',
      timestamp: expect.any(String)
    });

    expect(console.error).toHaveBeenCalledWith(
      'Error in TestComponent:',
      testError,
      errorInfo
    );
  });

  it('should reset error state', () => {
    const { result } = renderHook(() => 
      useComponentErrorBoundary('TestComponent')
    );

    const testError = new Error('Component crashed');

    act(() => {
      result.current.captureError(testError, {});
    });

    expect(result.current.hasError).toBe(true);

    act(() => {
      result.current.resetError();
    });

    expect(result.current.hasError).toBe(false);
    expect(result.current.errorInfo).toBe(null);
  });

  it('should report errors to monitoring service if available', () => {
    const mockReportError = jest.fn();
    window.reportError = mockReportError;

    const { result } = renderHook(() => 
      useComponentErrorBoundary('TestComponent')
    );

    const testError = new Error('Component crashed');
    const errorInfo = { componentStack: 'at TestComponent' };

    act(() => {
      result.current.captureError(testError, errorInfo);
    });

    expect(mockReportError).toHaveBeenCalledWith(testError, {
      component: 'TestComponent',
      componentStack: 'at TestComponent'
    });

    delete window.reportError;
  });
});