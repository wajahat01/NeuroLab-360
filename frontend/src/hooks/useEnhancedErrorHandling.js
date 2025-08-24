import { useState, useCallback, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';

/**
 * Enhanced error handling hook that prevents visual disruptions
 * Provides graceful error handling with retry mechanisms and user-friendly messages
 */
export const useEnhancedErrorHandling = (options = {}) => {
  const {
    showToasts = true,
    errorDisplayDelay = 500,
    autoRetry = false,
    maxRetries = 2,
    retryDelay = 1000,
    onError,
    onRetry,
    onMaxRetriesReached
  } = options;

  const [state, setState] = useState({
    error: null,
    isRetrying: false,
    retryCount: 0,
    showErrorUI: false,
    lastError: null
  });

  const retryTimeoutRef = useRef(null);
  const errorDisplayTimeoutRef = useRef(null);
  const mountedRef = useRef(true);

  // Safe state update function
  const updateState = useCallback((updates) => {
    if (!mountedRef.current) return;
    setState(prevState => ({ ...prevState, ...updates }));
  }, []);

  // Handle error with enhanced logic
  const handleError = useCallback((error, context = {}) => {
    const {
      retryCallback,
      silent = false,
      immediate = false,
      userMessage
    } = context;

    console.error('Enhanced error handler:', error);

    // Clear any existing timeouts
    if (errorDisplayTimeoutRef.current) {
      clearTimeout(errorDisplayTimeoutRef.current);
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    const errorMessage = userMessage || error.message || 'An unexpected error occurred';

    // Update error state
    updateState({
      error: errorMessage,
      lastError: error,
      showErrorUI: immediate
    });

    // Show toast notification if enabled and not silent
    if (showToasts && !silent) {
      // Don't show toast for network errors if we're retrying
      if (!autoRetry || state.retryCount >= maxRetries) {
        toast.error(errorMessage);
      }
    }

    // Delayed error UI display to prevent flickering
    if (!immediate && errorDisplayDelay > 0) {
      errorDisplayTimeoutRef.current = setTimeout(() => {
        updateState({ showErrorUI: true });
      }, errorDisplayDelay);
    }

    // Auto-retry logic
    if (autoRetry && retryCallback && state.retryCount < maxRetries) {
      updateState({ 
        isRetrying: true,
        retryCount: state.retryCount + 1
      });

      const delay = retryDelay * Math.pow(2, state.retryCount); // Exponential backoff
      
      retryTimeoutRef.current = setTimeout(async () => {
        try {
          await retryCallback();
          // Success - clear error state
          clearError();
          
          if (onRetry) {
            onRetry(state.retryCount + 1);
          }
        } catch (retryError) {
          // Retry failed
          updateState({ isRetrying: false });
          
          if (state.retryCount + 1 >= maxRetries) {
            if (onMaxRetriesReached) {
              onMaxRetriesReached(retryError);
            }
            if (showToasts) {
              toast.error('Maximum retry attempts reached');
            }
          } else {
            // Try again
            handleError(retryError, context);
          }
        }
      }, delay);
    }

    // Call custom error handler
    if (onError) {
      onError(error, context);
    }
  }, [
    showToasts,
    autoRetry,
    maxRetries,
    retryDelay,
    errorDisplayDelay,
    state.retryCount,
    updateState,
    onError,
    onRetry,
    onMaxRetriesReached
  ]);

  // Manual retry function
  const retry = useCallback(async (retryCallback) => {
    if (!retryCallback) {
      console.warn('No retry callback provided');
      return;
    }

    updateState({ 
      isRetrying: true,
      error: null,
      showErrorUI: false
    });

    try {
      await retryCallback();
      clearError();
      
      if (onRetry) {
        onRetry(state.retryCount + 1);
      }
    } catch (error) {
      updateState({ isRetrying: false });
      handleError(error, { 
        retryCallback, 
        userMessage: 'Retry failed. Please try again.' 
      });
    }
  }, [updateState, handleError, onRetry, state.retryCount, clearError]);

  // Clear error state
  const clearError = useCallback(() => {
    // Clear timeouts
    if (errorDisplayTimeoutRef.current) {
      clearTimeout(errorDisplayTimeoutRef.current);
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    updateState({
      error: null,
      isRetrying: false,
      retryCount: 0,
      showErrorUI: false,
      lastError: null
    });
  }, [updateState]);

  // Get user-friendly error message
  const getUserFriendlyMessage = useCallback((error) => {
    if (!error) return null;

    const message = error.message || error;

    // Network errors
    if (message.includes('fetch') || message.includes('network')) {
      return 'Network connection issue. Please check your internet connection.';
    }

    // Authentication errors
    if (message.includes('auth') || message.includes('token') || message.includes('unauthorized')) {
      return 'Authentication expired. Please log in again.';
    }

    // Server errors
    if (message.includes('500') || message.includes('server')) {
      return 'Server error. Please try again in a moment.';
    }

    // Offline errors
    if (message.includes('offline')) {
      return 'You are currently offline. Changes will sync when connection is restored.';
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid')) {
      return 'Please check your input and try again.';
    }

    // Default to original message if it's user-friendly
    if (message.length < 100 && !message.includes('Error:')) {
      return message;
    }

    return 'Something went wrong. Please try again.';
  }, []);

  // Check if error should be displayed
  const shouldShowError = useCallback((error) => {
    if (!error) return false;

    // Don't show error UI for certain types of errors
    const message = error.message || error;
    
    // Don't show UI for offline errors (show toast only)
    if (message.includes('offline')) {
      return false;
    }

    // Don't show UI for authentication errors (redirect instead)
    if (message.includes('unauthorized') || message.includes('token')) {
      return false;
    }

    return true;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (errorDisplayTimeoutRef.current) {
        clearTimeout(errorDisplayTimeoutRef.current);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return {
    error: state.error,
    isRetrying: state.isRetrying,
    retryCount: state.retryCount,
    showErrorUI: state.showErrorUI && shouldShowError(state.lastError),
    lastError: state.lastError,
    handleError,
    retry,
    clearError,
    getUserFriendlyMessage: (error) => getUserFriendlyMessage(error || state.lastError),
    shouldShowError
  };
};

/**
 * Hook for handling API errors specifically
 */
export const useApiErrorHandling = (options = {}) => {
  const {
    endpoint,
    operation = 'fetch',
    ...enhancedOptions
  } = options;

  const errorHandler = useEnhancedErrorHandling({
    showToasts: true,
    retainDataOnError: true,
    errorDisplayDelay: 500,
    autoRetry: operation === 'fetch', // Only auto-retry for fetch operations
    maxRetries: 2,
    ...enhancedOptions
  });

  // Handle API-specific errors
  const handleApiError = useCallback((error, context = {}) => {
    let userMessage = null;
    let shouldRetry = false;

    // Parse API error response
    if (error.response) {
      const status = error.response.status;
      
      switch (status) {
        case 400:
          userMessage = 'Invalid request. Please check your input.';
          break;
        case 401:
          userMessage = 'Authentication required. Please log in again.';
          break;
        case 403:
          userMessage = 'Access denied. You don\'t have permission for this action.';
          break;
        case 404:
          userMessage = `${endpoint ? 'Resource' : 'Page'} not found.`;
          break;
        case 409:
          userMessage = 'Conflict detected. The resource may have been modified.';
          break;
        case 429:
          userMessage = 'Too many requests. Please wait a moment and try again.';
          shouldRetry = true;
          break;
        case 500:
        case 502:
        case 503:
        case 504:
          userMessage = 'Server error. Please try again in a moment.';
          shouldRetry = true;
          break;
        default:
          userMessage = `Request failed with status ${status}`;
      }
    } else if (error.name === 'AbortError') {
      // Don't show error for aborted requests
      return;
    } else if (error.message?.includes('fetch')) {
      userMessage = 'Network error. Please check your connection.';
      shouldRetry = true;
    }

    errorHandler.handleError(error, {
      ...context,
      userMessage,
      retryCallback: shouldRetry ? context.retryCallback : undefined
    });
  }, [errorHandler, endpoint]);

  return {
    ...errorHandler,
    handleApiError
  };
};