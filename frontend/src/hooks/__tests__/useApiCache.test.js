import { renderHook, act, waitFor } from '@testing-library/react';
import { useApiCache, useClearCache, apiCache } from '../useApiCache';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock fetch
global.fetch = jest.fn();

// Mock AuthContext
const mockUser = { id: 'test-user-id' };
const mockGetAuthHeaders = jest.fn().mockResolvedValue({
  'Authorization': 'Bearer test-token',
  'Content-Type': 'application/json'
});

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    getAuthHeaders: mockGetAuthHeaders
  })
}));

describe('useApiCache', () => {
  beforeEach(() => {
    fetch.mockClear();
    mockGetAuthHeaders.mockClear();
    apiCache.clear();
  });

  it('should fetch data and cache it', async () => {
    const mockData = { id: 1, name: 'Test Data' };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    });

    const { result } = renderHook(() =>
      useApiCache('/api/test', { enabled: true })
    );

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe(null);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBe(null);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should return cached data on subsequent calls', async () => {
    const mockData = { id: 1, name: 'Test Data' };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    });

    // First call
    const { result: result1 } = renderHook(() =>
      useApiCache('/api/test', { enabled: true })
    );

    await waitFor(() => {
      expect(result1.current.loading).toBe(false);
    });

    // Second call with same URL
    const { result: result2 } = renderHook(() =>
      useApiCache('/api/test', { enabled: true })
    );

    // Should return cached data immediately
    expect(result2.current.data).toEqual(mockData);
    expect(result2.current.loading).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1); // Only called once
  });

  it('should handle stale-while-revalidate', async () => {
    const mockData1 = { id: 1, name: 'Old Data' };
    const mockData2 = { id: 1, name: 'New Data' };

    // First request
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData1
    });

    const { result } = renderHook(() =>
      useApiCache('/api/test', { enabled: true }, [], {
        staleWhileRevalidate: true
      })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData1);

    // Second request should return stale data immediately
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData2
    });

    const { result: result2 } = renderHook(() =>
      useApiCache('/api/test', { enabled: true }, [], {
        staleWhileRevalidate: true
      })
    );

    // Should show stale data immediately
    expect(result2.current.data).toEqual(mockData1);
    expect(result2.current.isStale).toBe(true);

    // Wait for background revalidation
    await waitFor(() => {
      expect(result2.current.data).toEqual(mockData2);
    });

    expect(result2.current.isStale).toBe(false);
  });

  it('should handle errors with retry', async () => {
    const mockError = new Error('Network error');
    
    // First two calls fail
    fetch
      .mockRejectedValueOnce(mockError)
      .mockRejectedValueOnce(mockError)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

    const { result } = renderHook(() =>
      useApiCache('/api/test', { 
        enabled: true,
        retry: 2,
        retryDelay: 100
      })
    );

    expect(result.current.loading).toBe(true);

    // Wait for retries and success
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    }, { timeout: 1000 });

    expect(result.current.data).toEqual({ success: true });
    expect(result.current.error).toBe(null);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('should support manual refetch', async () => {
    const mockData1 = { id: 1, name: 'Data 1' };
    const mockData2 = { id: 1, name: 'Data 2' };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockData1
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockData2
      });

    const { result } = renderHook(() =>
      useApiCache('/api/test', { enabled: true })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData1);

    // Manual refetch
    act(() => {
      result.current.refetch(true); // Force refresh
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData2);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should support optimistic updates with mutate', async () => {
    const mockData = { id: 1, name: 'Original' };
    const optimisticData = { id: 1, name: 'Optimistic' };
    const finalData = { id: 1, name: 'Final' };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => finalData
      });

    const { result } = renderHook(() =>
      useApiCache('/api/test', { enabled: true })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);

    // Optimistic update
    act(() => {
      result.current.mutate(optimisticData, true);
    });

    expect(result.current.data).toEqual(optimisticData);

    // Wait for background revalidation
    await waitFor(() => {
      expect(result.current.data).toEqual(finalData);
    });
  });
});

describe('useClearCache', () => {
  it('should clear cache by pattern', () => {
    // Add some test data to cache
    apiCache.set('GET:/api/users:user1', { name: 'User 1' });
    apiCache.set('GET:/api/posts:user1', { title: 'Post 1' });
    apiCache.set('GET:/api/comments:user1', { text: 'Comment 1' });

    const { result } = renderHook(() => useClearCache());

    // Clear posts cache
    act(() => {
      result.current('/api/posts');
    });

    expect(apiCache.has('GET:/api/users:user1')).toBe(true);
    expect(apiCache.has('GET:/api/posts:user1')).toBe(false);
    expect(apiCache.has('GET:/api/comments:user1')).toBe(true);
  });

  it('should clear all cache when no pattern provided', () => {
    // Add some test data to cache
    apiCache.set('GET:/api/users:user1', { name: 'User 1' });
    apiCache.set('GET:/api/posts:user1', { title: 'Post 1' });

    const { result } = renderHook(() => useClearCache());

    // Clear all cache
    act(() => {
      result.current();
    });

    expect(apiCache.has('GET:/api/users:user1')).toBe(false);
    expect(apiCache.has('GET:/api/posts:user1')).toBe(false);
  });
});