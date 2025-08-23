import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';

/**
 * Hook for graceful error handling that prevents visual disruptions
 * Manages error states without causing flickering or layout shifts
 */
export const useGracefulErrorHandling = (options = {}) => {
  const {
    showToasts = true,
    retainDataOnError = true,
    errorDisplayDelay = 500, // Delay before showing error UI
    autoRetry = true,
    maxRetries = 3,
    retryDelay = 1000
  } = options;

  const [errorState, setErrorState] = useState({
    error: null,
    isRetrying: false,
    retryCount: 0,
    showErrorUI: false
  });

  const errorTimeoutRef = useRef(null);
  const retryTimeoutRef = useRef(null);

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Handle error with graceful degradation
  const handleError = useCallback((error, context = {}) => {
    const { 
      silent = false, 
      retryCallback = null,
      fallbackData = null 
    } = context;

    console.error('Graceful error handling:', error);

    // Clear any existing error timeout
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }

    // Show toast notification if enabled and not silent
    if (showToasts && !silent) {
      toast.error(error.message || 'An error occurred', {
        duration: 4000,
        position: 'top-right'
      });
    }

    // Update error state
    setErrorState(prevState => ({
      ...prevState,
      error: error.message || 'An error occurred',
      showErrorUI: false // Don't show immediately to prevent flickering
    }));

    // Delay showing error UI to prevent flickering on quick recoveries
    errorTimeoutRef.current = setTimeout(() => {
      setErrorState(prevState => ({
        ...prevState,
        showErrorUI: true
      }));
    }, errorDisplayDelay);

    // Auto-retry logic
    if (autoRetry && retryCallback && errorState.retryCount < maxRetries) {
      setErrorState(prevState => ({
        ...prevState,
        isRetrying: true,
        retryCount: prevState.retryCount + 1
      }));

      retryTimeoutRef.current = setTimeout(() => {
        retryCallback()
          .then(() => {
            // Success - clear error state
            clearError();
          })
          .catch((retryError) => {
            // Retry failed - handle recursively
            handleError(retryError, { ...context, silent: true });
          });
      }, retryDelay * errorState.retryCount);
    }

    return fallbackData;
  }, [
    showToasts,
    errorDisplayDelay,
    autoRetry,
    maxRetries,
    retryDelay,
    errorState.retryCount
  ]);

  // Clear error state
  const clearError = useCallback(() => {
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    setErrorState({
      error: null,
      isRetrying: false,
      retryCount: 0,
      showErrorUI: false
    });
  }, []);

  // Manual retry function
  const retry = useCallback((retryCallback) => {
    if (!retryCallback) return;

    setErrorState(prevState => ({
      ...prevState,
      isRetrying: true
    }));

    retryCallback()
      .then(() => {
        clearError();
      })
      .catch((error) => {
        handleError(error, { silent: false });
      });
  }, [handleError, clearError]);

  return {
    error: errorState.error,
    isRetrying: errorState.isRetrying,
    showErrorUI: errorState.showErrorUI,
    retryCount: errorState.retryCount,
    handleError,
    clearError,
    retry
  };
};

/**
 * Hook for network-aware error handling
 */
export const useNetworkAwareErrorHandling = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [networkError, setNetworkError] = useState(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setNetworkError(null);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setNetworkError('You are currently offline. Some features may not be available.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleNetworkError = useCallback((error) => {
    if (!isOnline) {
      return {
        message: 'Unable to connect. Please check your internet connection.',
        isNetworkError: true,
        canRetry: false
      };
    }

    if (error.message.includes('fetch') || error.message.includes('network')) {
      return {
        message: 'Network error. Please try again.',
        isNetworkError: true,
        canRetry: true
      };
    }

    return {
      message: error.message,
      isNetworkError: false,
      canRetry: true
    };
  }, [isOnline]);

  return {
    isOnline,
    networkError,
    handleNetworkError
  };
};

/**
 * Hook for component-level error boundaries
 */
export const useComponentErrorBoundary = (componentName) => {
  const [hasError, setHasError] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);

  const resetError = useCallback(() => {
    setHasError(false);
    setErrorInfo(null);
  }, []);

  const captureError = useCallback((error, errorInfo) => {
    console.error(`Error in ${componentName}:`, error, errorInfo);
    
    setHasError(true);
    setErrorInfo({
      error: error.message,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString()
    });

    // Report error to monitoring service if available
    if (window.reportError) {
      window.reportError(error, {
        component: componentName,
        ...errorInfo
      });
    }
  }, [componentName]);

  return {
    hasError,
    errorInfo,
    resetError,
    captureError
  };
};