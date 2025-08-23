import { renderHook, act, waitFor } from '@testing-library/react';
import { useEnhancedCache, useCachePreloader, enhancedCache } from '../useEnhancedCache';
import { useAuth } from '../../contexts/AuthContext';

// Mock dependencies
jest.mock('../../contexts/AuthContext');

describe('EnhancedCache', () => {
  beforeEach(() => {
    enhancedCache.clear();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should store and retrieve data with TTL', () => {
    const testData = { id: 1, name: 'Test' };
    const key = 'test-key';

    enhancedCache.set(key, testData, { ttl: 1000 });

    expect(enhancedCache.get(key)).toEqual(testData);
    expect(enhancedCache.has(key)).toBe(true);

    // Fast-forward past TTL
    act(() => {
      jest.advanceTimersByTime(1001);
    });

    expect(enhancedCache.get(key)).toBe(null);
    expect(enhancedCache.has(key)).toBe(false);
  });

  it('should handle cache dependencies', () => {
    const data1 = { id: 1, name: 'Data 1' };
    const data2 = { id: 2, name: 'Data 2' };

    enhancedCache.set('key1', data1, { dependencies: ['user-123'] });
    enhancedCache.set('key2', data2, { dependencies: ['user-123'] });

    expect(enhancedCache.has('key1')).toBe(true);
    expect(enhancedCache.has('key2')).toBe(true);

    // Invalidate by dependency
    enhancedCache.invalidateByDependency('user-123');

    expect(enhancedCache.has('key1')).toBe(false);
    expect(enhancedCache.has('key2')).toBe(false);
  });

  it('should handle cache tags', () => {
    const data1 = { id: 1, name: 'Data 1' };
    const data2 = { id: 2, name: 'Data 2' };
    const data3 = { id: 3, name: 'Data 3' };

    enhancedCache.set('key1', data1, { tags: ['experiments'] });
    enhancedCache.set('key2', data2, { tags: ['experiments'] });
    enhancedCache.set('key3', data3, { tags: ['dashboard'] });

    expect(enhancedCache.has('key1')).toBe(true);
    expect(enhancedCache.has('key2')).toBe(true);
    expect(enhancedCache.has('key3')).toBe(true);

    // Invalidate by tag
    enhancedCache.invalidateByTag('experiments');

    expect(enhancedCache.has('key1')).toBe(false);
    expect(enhancedCache.has('key2')).toBe(false);
    expect(enhancedCache.has('key3')).toBe(true);
  });

  it('should notify subscribers of cache changes', () => {
    const subscriber1 = jest.fn();
    const subscriber2 = jest.fn();
    const key = 'test-key';
    const testData = { id: 1, name: 'Test' };

    const unsubscribe1 = enhancedCache.subscribe(key, subscriber1);
    const unsubscribe2 = enhancedCache.subscribe(key, subscriber2);

    enhancedCache.set(key, testData);

    expect(subscriber1).toHaveBeenCalledWith(testData);
    expect(subscriber2).toHaveBeenCalledWith(testData);

    // Unsubscribe one subscriber
    unsubscribe1();

    enhancedCache.set(key, { ...testData, updated: true });

    expect(subscriber1).toHaveBeenCalledTimes(1); // Not called again
    expect(subscriber2).toHaveBeenCalledTimes(2); // Called again
  });

  it('should track access patterns and provide statistics', () => {
    const data1 = { id: 1, name: 'Data 1' };
    const data2 = { id: 2, name: 'Data 2' };

    enhancedCache.set('key1', data1, { priority: 'high' });
    enhancedCache.set('key2', data2, { priority: 'low' });

    // Access data to update statistics
    enhancedCache.get('key1');
    enhancedCache.get('key1');
    enhancedCache.get('key2');

    const stats = enhancedCache.getStats();

    expect(stats.totalEntries).toBe(2);
    expect(stats.entriesByPriority.high).toBe(1);
    expect(stats.entriesByPriority.low).toBe(1);
    expect(stats.hitRate).toBeGreaterThan(0);
  });

  it('should cleanup expired entries', () => {
    const data1 = { id: 1, name: 'Data 1' };
    const data2 = { id: 2, name: 'Data 2' };

    enhancedCache.set('key1', data1, { ttl: 500 });
    enhancedCache.set('key2', data2, { ttl: 1500 });

    expect(enhancedCache.getStats().totalEntries).toBe(2);

    // Fast-forward to expire first entry
    act(() => {
      jest.advanceTimersByTime(600);
    });

    const cleanedCount = enhancedCache.cleanup();

    expect(cleanedCount).toBe(1);
    expect(enhancedCache.has('key1')).toBe(false);
    expect(enhancedCache.has('key2')).toBe(true);
  });
});

describe('useEnhancedCache', () => {
  beforeEach(() => {
    enhancedCache.clear();
  });

  it('should provide cache operations', () => {
    const { result } = renderHook(() => 
      useEnhancedCache('test-key', {
        ttl: 1000,
        tags: ['test'],
        priority: 'high'
      })
    );

    const testData = { id: 1, name: 'Test' };

    act(() => {
      result.current.setCache(testData);
    });

    expect(result.current.cachedData).toEqual(testData);
    expect(result.current.hasCache()).toBe(true);
    expect(result.current.getCache()).toEqual(testData);
  });

  it('should react to cache changes', () => {
    const { result } = renderHook(() => 
      useEnhancedCache('test-key')
    );

    expect(result.current.cachedData).toBe(null);

    const testData = { id: 1, name: 'Test' };

    act(() => {
      enhancedCache.set('test-key', testData);
    });

    expect(result.current.cachedData).toEqual(testData);
  });

  it('should handle cache invalidation', () => {
    const { result } = renderHook(() => 
      useEnhancedCache('test-key', {
        dependencies: ['user-123'],
        tags: ['experiments']
      })
    );

    const testData = { id: 1, name: 'Test' };

    act(() => {
      result.current.setCache(testData);
    });

    expect(result.current.cachedData).toEqual(testData);

    // Invalidate by dependency
    act(() => {
      result.current.invalidateByDependency('user-123');
    });

    expect(result.current.cachedData).toBe(null);

    // Set data again
    act(() => {
      result.current.setCache(testData);
    });

    // Invalidate by tag
    act(() => {
      result.current.invalidateByTag('experiments');
    });

    expect(result.current.cachedData).toBe(null);
  });

  it('should provide cache statistics', () => {
    const { result } = renderHook(() => 
      useEnhancedCache('test-key')
    );

    act(() => {
      result.current.setCache({ id: 1, name: 'Test' });
    });

    act(() => {
      result.current.getStats();
    });

    expect(result.current.cacheStats).toBeDefined();
    expect(result.current.cacheStats.totalEntries).toBeGreaterThan(0);
  });

  it('should call onCacheHit and onCacheMiss callbacks', () => {
    const onCacheHit = jest.fn();
    const onCacheMiss = jest.fn();

    const { result } = renderHook(() => 
      useEnhancedCache('test-key', {
        onCacheHit,
        onCacheMiss
      })
    );

    // Cache miss
    act(() => {
      result.current.getCache();
    });

    expect(onCacheMiss).toHaveBeenCalled();

    // Set cache data
    const testData = { id: 1, name: 'Test' };
    act(() => {
      result.current.setCache(testData);
    });

    expect(onCacheHit).toHaveBeenCalledWith(testData);
  });
});

describe('useCachePreloader', () => {
  const mockUser = {
    id: 'user-123',
    getAuthHeaders: jest.fn().mockResolvedValue({
      'Authorization': 'Bearer token'
    })
  };

  beforeEach(() => {
    useAuth.mockReturnValue({ user: mockUser });
    enhancedCache.clear();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should preload data into cache', async () => {
    const mockData = { id: 1, name: 'Preloaded Data' };

    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData)
    });

    const { result } = renderHook(() => useCachePreloader());

    act(() => {
      result.current.addToPreloadQueue('/api/test', { ttl: 1000 });
    });

    await act(async () => {
      await result.current.processPreloadQueue();
    });

    expect(fetch).toHaveBeenCalledWith('/api/test', {
      headers: { 'Authorization': 'Bearer token' }
    });

    const cacheKey = '/api/test:user-123';
    expect(enhancedCache.has(cacheKey)).toBe(true);
    expect(enhancedCache.get(cacheKey)).toEqual(mockData);
  });

  it('should skip preloading if data is already cached', async () => {
    const cacheKey = '/api/test:user-123';
    enhancedCache.set(cacheKey, { cached: true });

    const { result } = renderHook(() => useCachePreloader());

    act(() => {
      result.current.addToPreloadQueue('/api/test');
    });

    await act(async () => {
      await result.current.processPreloadQueue();
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('should handle preload failures gracefully', async () => {
    fetch.mockRejectedValueOnce(new Error('Network error'));

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useCachePreloader());

    act(() => {
      result.current.addToPreloadQueue('/api/test');
    });

    await act(async () => {
      await result.current.processPreloadQueue();
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to preload /api/test:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it('should preload dashboard data', async () => {
    const summaryData = { total_experiments: 10 };
    const chartsData = { activity_timeline: [] };
    const recentData = { experiments: [] };
    const experimentsData = { experiments: [] };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(summaryData)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(chartsData)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(recentData)
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(experimentsData)
      });

    const { result } = renderHook(() => useCachePreloader());

    await act(async () => {
      result.current.preloadDashboardData();
      // Wait for the timeout in preloadDashboardData
      await new Promise(resolve => setTimeout(resolve, 1100));
    });

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch).toHaveBeenCalledWith('/api/dashboard/summary', expect.any(Object));
    expect(fetch).toHaveBeenCalledWith('/api/dashboard/charts', expect.any(Object));
    expect(fetch).toHaveBeenCalledWith('/api/dashboard/recent', expect.any(Object));
    expect(fetch).toHaveBeenCalledWith('/api/experiments', expect.any(Object));
  });

  it('should prevent concurrent preloading', async () => {
    const { result } = renderHook(() => useCachePreloader());

    act(() => {
      result.current.addToPreloadQueue('/api/test1');
      result.current.addToPreloadQueue('/api/test2');
    });

    // Start two preload processes simultaneously
    const promise1 = act(async () => {
      await result.current.processPreloadQueue();
    });

    const promise2 = act(async () => {
      await result.current.processPreloadQueue();
    });

    await Promise.all([promise1, promise2]);

    // Should only process queue once
    expect(fetch).toHaveBeenCalledTimes(2); // Not 4
  });
});