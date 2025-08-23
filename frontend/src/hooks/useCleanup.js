import { useEffect, useRef, useCallback } from 'react';

// Hook for managing cleanup operations and preventing memory leaks
export const useCleanup = () => {
  const cleanupFunctionsRef = useRef(new Set());
  const timeoutsRef = useRef(new Set());
  const intervalsRef = useRef(new Set());
  const eventListenersRef = useRef(new Map());
  const abortControllersRef = useRef(new Set());

  // Add cleanup function
  const addCleanup = useCallback((cleanupFn) => {
    cleanupFunctionsRef.current.add(cleanupFn);
    
    // Return function to remove this cleanup
    return () => {
      cleanupFunctionsRef.current.delete(cleanupFn);
    };
  }, []);

  // Managed setTimeout
  const setTimeout = useCallback((callback, delay) => {
    const timeoutId = window.setTimeout(() => {
      timeoutsRef.current.delete(timeoutId);
      callback();
    }, delay);
    
    timeoutsRef.current.add(timeoutId);
    return timeoutId;
  }, []);

  // Managed setInterval
  const setInterval = useCallback((callback, delay) => {
    const intervalId = window.setInterval(callback, delay);
    intervalsRef.current.add(intervalId);
    return intervalId;
  }, []);

  // Clear specific timeout
  const clearTimeout = useCallback((timeoutId) => {
    window.clearTimeout(timeoutId);
    timeoutsRef.current.delete(timeoutId);
  }, []);

  // Clear specific interval
  const clearInterval = useCallback((intervalId) => {
    window.clearInterval(intervalId);
    intervalsRef.current.delete(intervalId);
  }, []);

  // Managed event listener
  const addEventListener = useCallback((element, event, handler, options) => {
    element.addEventListener(event, handler, options);
    
    const key = `${element.constructor.name}_${event}_${Date.now()}`;
    eventListenersRef.current.set(key, { element, event, handler, options });
    
    return () => {
      element.removeEventListener(event, handler, options);
      eventListenersRef.current.delete(key);
    };
  }, []);

  // Create managed AbortController
  const createAbortController = useCallback(() => {
    const controller = new AbortController();
    abortControllersRef.current.add(controller);
    
    // Return controller with cleanup function
    return {
      controller,
      cleanup: () => {
        controller.abort();
        abortControllersRef.current.delete(controller);
      }
    };
  }, []);

  // Manual cleanup trigger
  const cleanup = useCallback(() => {
    // Execute all cleanup functions
    cleanupFunctionsRef.current.forEach(fn => {
      try {
        fn();
      } catch (error) {
        console.error('Error in cleanup function:', error);
      }
    });
    cleanupFunctionsRef.current.clear();

    // Clear all timeouts
    timeoutsRef.current.forEach(id => window.clearTimeout(id));
    timeoutsRef.current.clear();

    // Clear all intervals
    intervalsRef.current.forEach(id => window.clearInterval(id));
    intervalsRef.current.clear();

    // Remove all event listeners
    eventListenersRef.current.forEach(({ element, event, handler, options }) => {
      try {
        element.removeEventListener(event, handler, options);
      } catch (error) {
        console.error('Error removing event listener:', error);
      }
    });
    eventListenersRef.current.clear();

    // Abort all controllers
    abortControllersRef.current.forEach(controller => {
      try {
        controller.abort();
      } catch (error) {
        console.error('Error aborting controller:', error);
      }
    });
    abortControllersRef.current.clear();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    addCleanup,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    addEventListener,
    createAbortController,
    cleanup
  };
};

// Hook for managing async operations with cleanup
export const useAsyncOperation = () => {
  const { addCleanup, createAbortController } = useCleanup();
  const pendingOperationsRef = useRef(new Map());

  const executeAsync = useCallback(async (
    operation,
    options = {}
  ) => {
    const {
      onSuccess,
      onError,
      onFinally,
      timeout = 30000,
      retries = 0,
      retryDelay = 1000
    } = options;

    const operationId = `async_${Date.now()}_${Math.random()}`;
    const { controller, cleanup: abortCleanup } = createAbortController();

    // Set up timeout
    const timeoutId = setTimeout(() => {
      controller.abort();
      pendingOperationsRef.current.delete(operationId);
    }, timeout);

    // Store operation info
    pendingOperationsRef.current.set(operationId, {
      controller,
      timeoutId,
      cleanup: abortCleanup
    });

    const executeWithRetry = async (attempt = 0) => {
      try {
        const result = await operation(controller.signal);
        
        // Clear timeout and cleanup
        clearTimeout(timeoutId);
        abortCleanup();
        pendingOperationsRef.current.delete(operationId);

        if (onSuccess) {
          onSuccess(result);
        }

        return result;
      } catch (error) {
        if (error.name === 'AbortError') {
          // Operation was cancelled
          return;
        }

        if (attempt < retries) {
          // Retry after delay
          await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
          return executeWithRetry(attempt + 1);
        }

        // Clear timeout and cleanup
        clearTimeout(timeoutId);
        abortCleanup();
        pendingOperationsRef.current.delete(operationId);

        if (onError) {
          onError(error);
        }

        throw error;
      } finally {
        if (onFinally) {
          onFinally();
        }
      }
    };

    return executeWithRetry();
  }, [createAbortController]);

  // Cancel specific operation
  const cancelOperation = useCallback((operationId) => {
    const operation = pendingOperationsRef.current.get(operationId);
    if (operation) {
      operation.cleanup();
      pendingOperationsRef.current.delete(operationId);
    }
  }, []);

  // Cancel all pending operations
  const cancelAllOperations = useCallback(() => {
    pendingOperationsRef.current.forEach((operation, operationId) => {
      operation.cleanup();
    });
    pendingOperationsRef.current.clear();
  }, []);

  // Add cleanup for pending operations
  addCleanup(cancelAllOperations);

  return {
    executeAsync,
    cancelOperation,
    cancelAllOperations,
    pendingOperations: Array.from(pendingOperationsRef.current.keys())
  };
};

// Hook for managing component lifecycle and preventing updates after unmount
export const useIsMounted = () => {
  const isMountedRef = useRef(true);
  const { addCleanup } = useCleanup();

  // Set mounted to false on cleanup
  addCleanup(() => {
    isMountedRef.current = false;
  });

  const isMounted = useCallback(() => isMountedRef.current, []);

  // Safe state setter that checks if component is mounted
  const safeSetState = useCallback((setter) => {
    return (...args) => {
      if (isMountedRef.current) {
        setter(...args);
      }
    };
  }, []);

  return {
    isMounted,
    safeSetState
  };
};

// Hook for debouncing with cleanup
export const useDebounce = (callback, delay) => {
  const { setTimeout, clearTimeout } = useCleanup();
  const timeoutRef = useRef(null);

  const debouncedCallback = useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay, setTimeout, clearTimeout]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, [clearTimeout]);

  return [debouncedCallback, cancel];
};

// Hook for throttling with cleanup
export const useThrottle = (callback, delay) => {
  const { setTimeout } = useCleanup();
  const lastCallRef = useRef(0);
  const timeoutRef = useRef(null);

  const throttledCallback = useCallback((...args) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallRef.current;

    if (timeSinceLastCall >= delay) {
      lastCallRef.current = now;
      callback(...args);
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        lastCallRef.current = Date.now();
        callback(...args);
      }, delay - timeSinceLastCall);
    }
  }, [callback, delay, setTimeout]);

  return throttledCallback;
};