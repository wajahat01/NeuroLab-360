import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiCache } from './useApiCache';

// Data synchronization hook for real-time updates
export const useDataSync = (options = {}) => {
  const {
    syncInterval = 30000, // 30 seconds default
    enableVisibilitySync = true,
    enableOnlineSync = true,
    onSyncSuccess,
    onSyncError
  } = options;

  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [syncStatus, setSyncStatus] = useState('idle'); // idle, syncing, error
  const [pendingChanges, setPendingChanges] = useState([]);

  const { user } = useAuth();
  const syncIntervalRef = useRef(null);
  const syncCallbacksRef = useRef(new Set());

  // Register sync callback
  const registerSyncCallback = useCallback((callback) => {
    syncCallbacksRef.current.add(callback);
    
    return () => {
      syncCallbacksRef.current.delete(callback);
    };
  }, []);

  // Execute all registered sync callbacks
  const executeSyncCallbacks = useCallback(async () => {
    if (!user || syncCallbacksRef.current.size === 0) return;

    setSyncStatus('syncing');
    
    try {
      const syncPromises = Array.from(syncCallbacksRef.current).map(callback => 
        callback()
      );
      
      await Promise.allSettled(syncPromises);
      
      setLastSyncTime(Date.now());
      setSyncStatus('idle');
      
      if (onSyncSuccess) {
        onSyncSuccess();
      }
    } catch (error) {
      console.error('Sync error:', error);
      setSyncStatus('error');
      
      if (onSyncError) {
        onSyncError(error);
      }
    }
  }, [user, onSyncSuccess, onSyncError]);

  // Manual sync trigger
  const triggerSync = useCallback(() => {
    executeSyncCallbacks();
  }, [executeSyncCallbacks]);

  // Add pending change for offline sync
  const addPendingChange = useCallback((change) => {
    setPendingChanges(prev => [...prev, {
      ...change,
      timestamp: Date.now(),
      id: `change_${Date.now()}_${Math.random()}`
    }]);
  }, []);

  // Remove pending change
  const removePendingChange = useCallback((changeId) => {
    setPendingChanges(prev => prev.filter(change => change.id !== changeId));
  }, []);

  // Process pending changes when coming back online
  const processPendingChanges = useCallback(async () => {
    if (pendingChanges.length === 0) return;

    console.log(`Processing ${pendingChanges.length} pending changes`);
    
    for (const change of pendingChanges) {
      try {
        if (change.callback) {
          await change.callback();
        }
        removePendingChange(change.id);
      } catch (error) {
        console.error('Failed to process pending change:', error);
        // Keep the change in pending list for retry
      }
    }
  }, [pendingChanges, removePendingChange]);

  // Set up sync interval
  useEffect(() => {
    if (!user || syncInterval <= 0) return;

    syncIntervalRef.current = setInterval(() => {
      if (isOnline) {
        executeSyncCallbacks();
      }
    }, syncInterval);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [user, syncInterval, isOnline, executeSyncCallbacks]);

  // Handle online/offline events
  useEffect(() => {
    if (!enableOnlineSync) return;

    const handleOnline = () => {
      setIsOnline(true);
      // Process pending changes and sync
      processPendingChanges();
      executeSyncCallbacks();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [enableOnlineSync, processPendingChanges, executeSyncCallbacks]);

  // Handle visibility change events
  useEffect(() => {
    if (!enableVisibilitySync) return;

    const handleVisibilityChange = () => {
      if (!document.hidden && isOnline) {
        // Page became visible, sync data
        executeSyncCallbacks();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enableVisibilitySync, isOnline, executeSyncCallbacks]);

  return {
    isOnline,
    lastSyncTime,
    syncStatus,
    pendingChanges: pendingChanges.length,
    registerSyncCallback,
    triggerSync,
    addPendingChange,
    removePendingChange
  };
};

// Hook for syncing specific data endpoints
export const useEndpointSync = (endpoint, options = {}) => {
  const {
    syncOnMount = true,
    syncOnFocus = true,
    syncOnReconnect = true,
    ...syncOptions
  } = options;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const { user, getAuthHeaders } = useAuth();
  const { registerSyncCallback, isOnline } = useDataSync(syncOptions);

  // Sync function for this endpoint
  const syncEndpoint = useCallback(async () => {
    if (!user || !endpoint) return;

    try {
      setLoading(true);
      setError(null);

      const headers = await getAuthHeaders();
      const response = await fetch(endpoint, { headers });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);

      // Update cache
      apiCache.set(`GET:${endpoint}:${user.id}`, result);

      return result;
    } catch (err) {
      console.error(`Sync error for ${endpoint}:`, err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [endpoint, user, getAuthHeaders]);

  // Register sync callback
  useEffect(() => {
    return registerSyncCallback(syncEndpoint);
  }, [registerSyncCallback, syncEndpoint]);

  // Initial sync on mount
  useEffect(() => {
    if (syncOnMount && user && isOnline) {
      syncEndpoint();
    }
  }, [syncOnMount, user, isOnline, syncEndpoint]);

  // Sync on window focus
  useEffect(() => {
    if (!syncOnFocus) return;

    const handleFocus = () => {
      if (isOnline) {
        syncEndpoint();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [syncOnFocus, isOnline, syncEndpoint]);

  return {
    data,
    loading,
    error,
    sync: syncEndpoint
  };
};

// Hook for conflict resolution in data synchronization
export const useConflictResolution = (options = {}) => {
  const {
    strategy = 'server-wins', // server-wins, client-wins, merge, manual
    onConflict
  } = options;

  const [conflicts, setConflicts] = useState([]);

  const resolveConflict = useCallback((conflictId, resolution) => {
    setConflicts(prev => prev.filter(c => c.id !== conflictId));
    
    if (resolution.callback) {
      resolution.callback(resolution.data);
    }
  }, []);

  const addConflict = useCallback((conflict) => {
    const conflictWithId = {
      ...conflict,
      id: `conflict_${Date.now()}_${Math.random()}`,
      timestamp: Date.now()
    };

    setConflicts(prev => [...prev, conflictWithId]);

    // Auto-resolve based on strategy
    if (strategy !== 'manual') {
      setTimeout(() => {
        let resolution;
        
        switch (strategy) {
          case 'server-wins':
            resolution = { data: conflict.serverData };
            break;
          case 'client-wins':
            resolution = { data: conflict.clientData };
            break;
          case 'merge':
            resolution = { 
              data: { ...conflict.serverData, ...conflict.clientData }
            };
            break;
          default:
            return;
        }
        
        resolveConflict(conflictWithId.id, resolution);
      }, 100);
    }

    if (onConflict) {
      onConflict(conflictWithId);
    }
  }, [strategy, onConflict, resolveConflict]);

  return {
    conflicts,
    addConflict,
    resolveConflict
  };
};