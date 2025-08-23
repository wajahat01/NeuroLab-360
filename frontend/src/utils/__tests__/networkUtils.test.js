import { 
  fetchWithRetry, 
  ApiClient, 
  NetworkError, 
  RetryableError,
  getErrorMessage,
  NetworkMonitor
} from '../networkUtils';

// Mock fetch
global.fetch = jest.fn();

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true
});

describe('NetworkUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    navigator.onLine = true;
  });

  describe('NetworkError', () => {
    it('creates error with status and response', () => {
      const response = { status: 404 };
      const error = new NetworkError('Not found', 404, response);
      
      expect(error.message).toBe('Not found');
      expect(error.status).toBe(404);
      expect(error.response).toBe(response);
      expect(error.name).toBe('NetworkError');
    });
  });

  describe('RetryableError', () => {
    it('creates retryable error with retry after', () => {
      const error = new RetryableError('Server busy', 503, null, 1000);
      
      expect(error.message).toBe('Server busy');
      expect(error.status).toBe(503);
      expect(error.retryAfter).toBe(1000);
      expect(error.name).toBe('RetryableError');
    });
  });

  describe('fetchWithRetry', () => {
    it('returns response on successful request', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'test' })
      };
      fetch.mockResolvedValueOnce(mockResponse);

      const response = await fetchWithRetry('http://test.com');
      
      expect(fetch).toHaveBeenCalledWith('http://test.com', expect.any(Object));
      expect(response).toBe(mockResponse);
    });

    it('throws NetworkError on HTTP error', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: jest.fn().mockResolvedValue({ message: 'Resource not found' })
      };
      fetch.mockResolvedValueOnce(mockResponse);

      await expect(fetchWithRetry('http://test.com')).rejects.toThrow(NetworkError);
    });

    it('retries on retryable errors', async () => {
      const mockErrorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: jest.fn().mockResolvedValue({})
      };
      const mockSuccessResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'success' })
      };

      fetch
        .mockResolvedValueOnce(mockErrorResponse)
        .mockResolvedValueOnce(mockSuccessResponse);

      const response = await fetchWithRetry('http://test.com', {}, { maxRetries: 1, baseDelay: 10 });
      
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(response).toBe(mockSuccessResponse);
    });

    it('does not retry on non-retryable errors', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: jest.fn().mockResolvedValue({ message: 'Invalid input' })
      };
      fetch.mockResolvedValueOnce(mockResponse);

      await expect(fetchWithRetry('http://test.com')).rejects.toThrow(NetworkError);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('handles network errors with retry', async () => {
      const networkError = new Error('Network error');
      networkError.name = 'NetworkError';
      
      const mockSuccessResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: 'success' })
      };

      fetch
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockSuccessResponse);

      const response = await fetchWithRetry('http://test.com', {}, { maxRetries: 1, baseDelay: 10 });
      
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(response).toBe(mockSuccessResponse);
    });

    it('respects timeout option', async () => {
      jest.useFakeTimers();
      
      fetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const promise = fetchWithRetry('http://test.com', { timeout: 1000 });
      
      jest.advanceTimersByTime(1000);
      
      await expect(promise).rejects.toThrow();
      
      jest.useRealTimers();
    });
  });

  describe('ApiClient', () => {
    let apiClient;

    beforeEach(() => {
      apiClient = new ApiClient('http://api.test.com', {
        headers: { 'Authorization': 'Bearer token' }
      });
    });

    it('makes GET request', async () => {
      const mockResponse = {
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue({ data: 'test' })
      };
      fetch.mockResolvedValueOnce(mockResponse);

      const result = await apiClient.get('/users');
      
      expect(fetch).toHaveBeenCalledWith(
        'http://api.test.com/users',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer token'
          })
        })
      );
      expect(result).toEqual({ data: 'test' });
    });

    it('makes POST request with data', async () => {
      const mockResponse = {
        ok: true,
        headers: { get: jest.fn().mockReturnValue('application/json') },
        json: jest.fn().mockResolvedValue({ id: 1 })
      };
      fetch.mockResolvedValueOnce(mockResponse);

      const postData = { name: 'John' };
      const result = await apiClient.post('/users', postData);
      
      expect(fetch).toHaveBeenCalledWith(
        'http://api.test.com/users',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(postData),
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result).toEqual({ id: 1 });
    });

    it('handles text responses', async () => {
      const mockResponse = {
        ok: true,
        headers: { get: jest.fn().mockReturnValue('text/plain') },
        text: jest.fn().mockResolvedValue('Plain text response')
      };
      fetch.mockResolvedValueOnce(mockResponse);

      const result = await apiClient.get('/status');
      
      expect(result).toBe('Plain text response');
    });

    it('enhances errors with context', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: jest.fn().mockResolvedValue({})
      };
      fetch.mockResolvedValueOnce(mockResponse);

      try {
        await apiClient.get('/users/999');
      } catch (error) {
        expect(error.endpoint).toBe('/users/999');
        expect(error.method).toBe('GET');
      }
    });
  });

  describe('NetworkMonitor', () => {
    let monitor;

    beforeEach(() => {
      monitor = new NetworkMonitor();
    });

    afterEach(() => {
      monitor.destroy();
    });

    it('initializes with current online status', () => {
      expect(monitor.isOnline).toBe(navigator.onLine);
    });

    it('notifies listeners on online event', () => {
      const listener = jest.fn();
      monitor.addListener(listener);

      // Simulate going online
      navigator.onLine = true;
      window.dispatchEvent(new Event('online'));

      expect(listener).toHaveBeenCalledWith('online');
      expect(monitor.isOnline).toBe(true);
    });

    it('notifies listeners on offline event', () => {
      const listener = jest.fn();
      monitor.addListener(listener);

      // Simulate going offline
      navigator.onLine = false;
      window.dispatchEvent(new Event('offline'));

      expect(listener).toHaveBeenCalledWith('offline');
      expect(monitor.isOnline).toBe(false);
    });

    it('removes listeners correctly', () => {
      const listener = jest.fn();
      const unsubscribe = monitor.addListener(listener);

      unsubscribe();

      // Simulate event - listener should not be called
      window.dispatchEvent(new Event('online'));
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getErrorMessage', () => {
    it('returns specific message for HTTP status codes', () => {
      const error400 = new NetworkError('Bad request', 400);
      expect(getErrorMessage(error400)).toBe('Invalid request. Please check your input and try again.');

      const error401 = new NetworkError('Unauthorized', 401);
      expect(getErrorMessage(error401)).toBe('Authentication required. Please log in again.');

      const error404 = new NetworkError('Not found', 404);
      expect(getErrorMessage(error404)).toBe('The requested resource was not found.');

      const error500 = new NetworkError('Server error', 500);
      expect(getErrorMessage(error500)).toBe('Server error. Please try again later.');
    });

    it('returns message for AbortError', () => {
      const error = new Error('Request aborted');
      error.name = 'AbortError';
      expect(getErrorMessage(error)).toBe('Request was cancelled or timed out.');
    });

    it('returns offline message when not online', () => {
      navigator.onLine = false;
      const error = new Error('Network error');
      expect(getErrorMessage(error)).toBe('No internet connection. Please check your network and try again.');
    });

    it('returns generic message for unknown errors', () => {
      const error = new Error('Unknown error');
      expect(getErrorMessage(error)).toBe('Unknown error');
    });

    it('returns default message for errors without message', () => {
      const error = new Error();
      expect(getErrorMessage(error)).toBe('An unexpected error occurred.');
    });
  });
});