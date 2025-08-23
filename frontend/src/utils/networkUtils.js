// Network error handling utilities with retry mechanisms

export class NetworkError extends Error {
  constructor(message, status, response) {
    super(message);
    this.name = 'NetworkError';
    this.status = status;
    this.response = response;
  }
}

export class RetryableError extends NetworkError {
  constructor(message, status, response, retryAfter) {
    super(message, status, response);
    this.name = 'RetryableError';
    this.retryAfter = retryAfter;
  }
}

// Default retry configuration
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffFactor: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: ['NetworkError', 'TypeError', 'AbortError']
};

// Calculate delay with exponential backoff and jitter
const calculateDelay = (attempt, baseDelay, maxDelay, backoffFactor) => {
  const exponentialDelay = baseDelay * Math.pow(backoffFactor, attempt);
  const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
};

// Check if error is retryable
const isRetryableError = (error, retryableStatuses, retryableErrors) => {
  // Check HTTP status codes
  if (error.status && retryableStatuses.includes(error.status)) {
    return true;
  }
  
  // Check error types
  if (retryableErrors.includes(error.name)) {
    return true;
  }
  
  // Check for network connectivity issues
  if (!navigator.onLine) {
    return true;
  }
  
  return false;
};

// Enhanced fetch with retry logic
export const fetchWithRetry = async (url, options = {}, retryConfig = {}) => {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  const { maxRetries, baseDelay, maxDelay, backoffFactor, retryableStatuses, retryableErrors } = config;
  
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Handle HTTP errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new NetworkError(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          response
        );
        
        // Check if we should retry
        if (attempt < maxRetries && isRetryableError(error, retryableStatuses, retryableErrors)) {
          lastError = error;
          const delay = calculateDelay(attempt, baseDelay, maxDelay, backoffFactor);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw error;
      }
      
      return response;
      
    } catch (error) {
      lastError = error;
      
      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Check if error is retryable
      if (!isRetryableError(error, retryableStatuses, retryableErrors)) {
        throw error;
      }
      
      // Wait before retrying
      const delay = calculateDelay(attempt, baseDelay, maxDelay, backoffFactor);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
};

// API client with error handling
export class ApiClient {
  constructor(baseURL, defaultOptions = {}) {
    this.baseURL = baseURL;
    this.defaultOptions = defaultOptions;
  }
  
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const mergedOptions = {
      ...this.defaultOptions,
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...this.defaultOptions.headers,
        ...options.headers
      }
    };
    
    try {
      const response = await fetchWithRetry(url, mergedOptions);
      
      // Handle empty responses
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return await response.text();
      
    } catch (error) {
      // Enhance error with context
      if (error instanceof NetworkError) {
        error.endpoint = endpoint;
        error.method = mergedOptions.method || 'GET';
      }
      
      throw error;
    }
  }
  
  get(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'GET' });
  }
  
  post(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data)
    });
  }
  
  put(endpoint, data, options = {}) {
    return this.request(endpoint, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }
  
  delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  }
}

// Network status monitoring
export class NetworkMonitor {
  constructor() {
    this.listeners = new Set();
    this.isOnline = navigator.onLine;
    
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }
  
  handleOnline = () => {
    this.isOnline = true;
    this.notifyListeners('online');
  };
  
  handleOffline = () => {
    this.isOnline = false;
    this.notifyListeners('offline');
  };
  
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
  
  notifyListeners(status) {
    this.listeners.forEach(callback => callback(status));
  }
  
  destroy() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    this.listeners.clear();
  }
}

// Hook for network status
export const useNetworkStatus = () => {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  
  React.useEffect(() => {
    const monitor = new NetworkMonitor();
    
    const unsubscribe = monitor.addListener((status) => {
      setIsOnline(status === 'online');
    });
    
    return () => {
      unsubscribe();
      monitor.destroy();
    };
  }, []);
  
  return isOnline;
};

// Error message helpers
export const getErrorMessage = (error) => {
  if (error instanceof NetworkError) {
    switch (error.status) {
      case 400:
        return 'Invalid request. Please check your input and try again.';
      case 401:
        return 'Authentication required. Please log in again.';
      case 403:
        return 'Access denied. You don\'t have permission to perform this action.';
      case 404:
        return 'The requested resource was not found.';
      case 408:
        return 'Request timeout. Please try again.';
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
        return 'Server error. Please try again later.';
      case 502:
      case 503:
      case 504:
        return 'Service temporarily unavailable. Please try again later.';
      default:
        return error.message || 'An unexpected error occurred.';
    }
  }
  
  if (error.name === 'AbortError') {
    return 'Request was cancelled or timed out.';
  }
  
  if (!navigator.onLine) {
    return 'No internet connection. Please check your network and try again.';
  }
  
  return error.message || 'An unexpected error occurred.';
};

export default {
  fetchWithRetry,
  ApiClient,
  NetworkMonitor,
  NetworkError,
  RetryableError,
  getErrorMessage
};