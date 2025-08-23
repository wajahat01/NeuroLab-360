import { renderHook, act, waitFor } from '@testing-library/react';
import { useDataSync, useEndpointSync, useConflictResolution } from '../useDataSync';

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

// Mock fetch
global.fetch = jest.fn();

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  value: true
});

describe('useDataSync', () => {
  beforeEach(() => {
    fetch.mockClear();
    mockGetAuthHeaders.mockClear();
    navigator.onLine = true;
  });

  it('should register and execute sync callbacks', async () => {
    const syncCallback = jest.fn().mockResolvedValue();
    
    const { result } = renderHook(() =>
      useDataSync({ syncInterval: 100 })
    );

    expect(result.current.syncStatus).toBe('idle');

    // Register sync callback
    let unregister;
    act(() => {
      unregister = result.current.registerSyncCallback(syncCallback);
    });

    // Trigger manual sync
    act(() => {
      result.current.triggerSync();
    });

    await waitFor(() => {
      expect(result.current.syncStatus).toBe('idle');
    });

    expect(syncCallback).toHaveBeenCalled();
    expect(result.current.lastSyncTime).toBeTruthy();

    // Unregister callback
    act(() => {
      unregister();
    });
  });

  it('should handle sync errors', async () => {
    const syncCallback = jest.fn().mockRejectedValue(new Error('Sync failed'));
    const onSyncError = jest.fn();
    
    const { result } = renderHook(() =>
      useDataSync({ onSyncError })
    );

    // Register failing sync callback
    act(() => {
      result.current.registerSyncCallback(syncCallback);
    });

    // Trigger sync
    act(() => {
      result.current.triggerSync();
    });

    await waitFor(() => {
      expect(result.current.syncStatus).toBe('error');
    });

    expect(onSyncError).toHaveBeenCalled();
  });

  it('should track online/offline status', () => {
    const { result } = renderHook(() =>
      useDataSync({ enableOnlineSync: true })
    );

    expect(result.current.isOnline).toBe(true);

    // Simulate going offline
    act(() => {
      navigator.onLine = false;
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.isOnline).toBe(false);

    // Simulate coming back online
    act(() => {
      navigator.onLine = true;
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(true);
  });

  it('should manage pending changes for offline sync', () => {
    const { result } = renderHook(() =>
      useDataSync()
    );

    expect(result.current.pendingChanges).toBe(0);

    // Add pending change
    const change = {
      type: 'create',
      data: { name: 'Test' },
      callback: jest.fn()
    };

    act(() => {
      result.current.addPendingChange(change);
    });

    expect(result.current.pendingChanges).toBe(1);

    // Remove pending change (would be called after successful sync)
    act(() => {
      result.current.removePendingChange(change.id);
    });

    expect(result.current.pendingChanges).toBe(0);
  });

  it('should sync on visibility change', () => {
    const syncCallback = jest.fn().mockResolvedValue();
    
    const { result } = renderHook(() =>
      useDataSync({ enableVisibilitySync: true })
    );

    // Register sync callback
    act(() => {
      result.current.registerSyncCallback(syncCallback);
    });

    // Simulate page becoming visible
    Object.defineProperty(document, 'hidden', {
      writable: true,
      value: false
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(syncCallback).toHaveBeenCalled();
  });
});

describe('useEndpointSync', () => {
  beforeEach(() => {
    fetch.mockClear();
    mockGetAuthHeaders.mockClear();
  });

  it('should sync endpoint data', async () => {
    const mockData = { id: 1, name: 'Test Data' };
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    });

    const { result } = renderHook(() =>
      useEndpointSync('/api/test', { syncOnMount: true })
    );

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBe(null);
    expect(fetch).toHaveBeenCalledWith('/api/test', {
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json'
      }
    });
  });

  it('should handle sync errors', async () => {
    const error = new Error('Network error');
    fetch.mockRejectedValueOnce(error);

    const { result } = renderHook(() =>
      useEndpointSync('/api/test', { syncOnMount: true })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(error.message);
    expect(result.current.data).toBe(null);
  });

  it('should support manual sync', async () => {
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
      useEndpointSync('/api/test', { syncOnMount: true })
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData1);
    });

    // Manual sync
    act(() => {
      result.current.sync();
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockData2);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('useConflictResolution', () => {
  it('should add and resolve conflicts manually', () => {
    const onConflict = jest.fn();
    
    const { result } = renderHook(() =>
      useConflictResolution({ strategy: 'manual', onConflict })
    );

    expect(result.current.conflicts).toHaveLength(0);

    // Add conflict
    const conflict = {
      serverData: { id: 1, name: 'Server Version' },
      clientData: { id: 1, name: 'Client Version' }
    };

    act(() => {
      result.current.addConflict(conflict);
    });

    expect(result.current.conflicts).toHaveLength(1);
    expect(onConflict).toHaveBeenCalled();

    const conflictId = result.current.conflicts[0].id;

    // Resolve conflict
    const resolution = { data: { id: 1, name: 'Resolved Version' } };
    act(() => {
      result.current.resolveConflict(conflictId, resolution);
    });

    expect(result.current.conflicts).toHaveLength(0);
  });

  it('should auto-resolve with server-wins strategy', async () => {
    const { result } = renderHook(() =>
      useConflictResolution({ strategy: 'server-wins' })
    );

    const conflict = {
      serverData: { id: 1, name: 'Server Version' },
      clientData: { id: 1, name: 'Client Version' }
    };

    act(() => {
      result.current.addConflict(conflict);
    });

    expect(result.current.conflicts).toHaveLength(1);

    // Should auto-resolve after a short delay
    await waitFor(() => {
      expect(result.current.conflicts).toHaveLength(0);
    }, { timeout: 200 });
  });

  it('should auto-resolve with client-wins strategy', async () => {
    const { result } = renderHook(() =>
      useConflictResolution({ strategy: 'client-wins' })
    );

    const conflict = {
      serverData: { id: 1, name: 'Server Version' },
      clientData: { id: 1, name: 'Client Version' }
    };

    act(() => {
      result.current.addConflict(conflict);
    });

    expect(result.current.conflicts).toHaveLength(1);

    // Should auto-resolve after a short delay
    await waitFor(() => {
      expect(result.current.conflicts).toHaveLength(0);
    }, { timeout: 200 });
  });

  it('should auto-resolve with merge strategy', async () => {
    const { result } = renderHook(() =>
      useConflictResolution({ strategy: 'merge' })
    );

    const conflict = {
      serverData: { id: 1, name: 'Server Version', serverField: 'server' },
      clientData: { id: 1, name: 'Client Version', clientField: 'client' }
    };

    act(() => {
      result.current.addConflict(conflict);
    });

    expect(result.current.conflicts).toHaveLength(1);

    // Should auto-resolve after a short delay
    await waitFor(() => {
      expect(result.current.conflicts).toHaveLength(0);
    }, { timeout: 200 });
  });
});