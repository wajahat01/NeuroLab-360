// Local storage utilities with error handling and type safety
import React from 'react';

const STORAGE_PREFIX = 'neurolab_';
const STORAGE_VERSION = '1.0';

// Storage keys
export const STORAGE_KEYS = {
  USER_PREFERENCES: 'user_preferences',
  DASHBOARD_SETTINGS: 'dashboard_settings',
  EXPERIMENT_FILTERS: 'experiment_filters',
  UI_STATE: 'ui_state',
  CACHE_METADATA: 'cache_metadata'
};

// Default values for different storage types
const DEFAULT_VALUES = {
  [STORAGE_KEYS.USER_PREFERENCES]: {
    theme: 'light',
    language: 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    notifications: {
      experimentComplete: true,
      systemUpdates: true,
      errors: true
    }
  },
  [STORAGE_KEYS.DASHBOARD_SETTINGS]: {
    defaultPeriod: '30d',
    chartTypes: ['line', 'bar'],
    autoRefresh: false,
    refreshInterval: 30000,
    compactView: false
  },
  [STORAGE_KEYS.EXPERIMENT_FILTERS]: {
    experiment_type: '',
    status: '',
    search: '',
    sortBy: 'created_at',
    sortOrder: 'desc',
    pageSize: 10
  },
  [STORAGE_KEYS.UI_STATE]: {
    sidebarCollapsed: false,
    activeTab: 'dashboard',
    lastVisitedPage: '/dashboard'
  },
  [STORAGE_KEYS.CACHE_METADATA]: {
    version: STORAGE_VERSION,
    lastCleared: Date.now()
  }
};

// Check if localStorage is available
const isLocalStorageAvailable = () => {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    console.warn('localStorage is not available:', e);
    return false;
  }
};

// Generate storage key with prefix
const getStorageKey = (key) => `${STORAGE_PREFIX}${key}`;

// Safe JSON parse with fallback
const safeJsonParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch (e) {
    console.warn('Failed to parse JSON from localStorage:', e);
    return fallback;
  }
};

// Safe JSON stringify
const safeJsonStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch (e) {
    console.warn('Failed to stringify value for localStorage:', e);
    return null;
  }
};

// Get item from localStorage
export const getStorageItem = (key, defaultValue = null) => {
  if (!isLocalStorageAvailable()) {
    return defaultValue || DEFAULT_VALUES[key] || null;
  }

  try {
    const storageKey = getStorageKey(key);
    const item = localStorage.getItem(storageKey);
    
    if (item === null) {
      return defaultValue || DEFAULT_VALUES[key] || null;
    }

    const parsedItem = safeJsonParse(item);
    
    // Merge with default values if it's an object
    if (parsedItem && typeof parsedItem === 'object' && DEFAULT_VALUES[key]) {
      return { ...DEFAULT_VALUES[key], ...parsedItem };
    }
    
    return parsedItem;
  } catch (e) {
    console.error('Error getting item from localStorage:', e);
    return defaultValue || DEFAULT_VALUES[key] || null;
  }
};

// Set item in localStorage
export const setStorageItem = (key, value) => {
  if (!isLocalStorageAvailable()) {
    console.warn('localStorage not available, cannot save:', key);
    return false;
  }

  try {
    const storageKey = getStorageKey(key);
    const stringValue = safeJsonStringify(value);
    
    if (stringValue === null) {
      return false;
    }
    
    localStorage.setItem(storageKey, stringValue);
    
    // Dispatch custom event for cross-tab synchronization
    window.dispatchEvent(new CustomEvent('localStorageChange', {
      detail: { key, value }
    }));
    
    return true;
  } catch (e) {
    console.error('Error setting item in localStorage:', e);
    return false;
  }
};

// Remove item from localStorage
export const removeStorageItem = (key) => {
  if (!isLocalStorageAvailable()) {
    return false;
  }

  try {
    const storageKey = getStorageKey(key);
    localStorage.removeItem(storageKey);
    
    // Dispatch custom event for cross-tab synchronization
    window.dispatchEvent(new CustomEvent('localStorageChange', {
      detail: { key, value: null }
    }));
    
    return true;
  } catch (e) {
    console.error('Error removing item from localStorage:', e);
    return false;
  }
};

// Clear all app-specific localStorage items
export const clearAppStorage = () => {
  if (!isLocalStorageAvailable()) {
    return false;
  }

  try {
    const keys = Object.keys(localStorage);
    const appKeys = keys.filter(key => key.startsWith(STORAGE_PREFIX));
    
    appKeys.forEach(key => {
      localStorage.removeItem(key);
    });
    
    // Update cache metadata
    setStorageItem(STORAGE_KEYS.CACHE_METADATA, {
      version: STORAGE_VERSION,
      lastCleared: Date.now()
    });
    
    return true;
  } catch (e) {
    console.error('Error clearing app storage:', e);
    return false;
  }
};

// Get storage usage information
export const getStorageInfo = () => {
  if (!isLocalStorageAvailable()) {
    return { available: false };
  }

  try {
    const keys = Object.keys(localStorage);
    const appKeys = keys.filter(key => key.startsWith(STORAGE_PREFIX));
    
    let totalSize = 0;
    const items = {};
    
    appKeys.forEach(key => {
      const value = localStorage.getItem(key);
      const size = new Blob([value]).size;
      totalSize += size;
      
      const cleanKey = key.replace(STORAGE_PREFIX, '');
      items[cleanKey] = {
        size,
        lastModified: Date.now() // This is approximate
      };
    });
    
    return {
      available: true,
      totalSize,
      itemCount: appKeys.length,
      items
    };
  } catch (e) {
    console.error('Error getting storage info:', e);
    return { available: false, error: e.message };
  }
};

// Hook for localStorage with reactive updates
export const useLocalStorage = (key, defaultValue = null) => {
  const [value, setValue] = React.useState(() => 
    getStorageItem(key, defaultValue)
  );

  const setStoredValue = React.useCallback((newValue) => {
    try {
      // Allow value to be a function so we have the same API as useState
      const valueToStore = newValue instanceof Function ? newValue(value) : newValue;
      
      setValue(valueToStore);
      setStorageItem(key, valueToStore);
    } catch (e) {
      console.error('Error in useLocalStorage setter:', e);
    }
  }, [key, value]);

  // Listen for changes from other tabs/windows
  React.useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.detail?.key === key) {
        setValue(e.detail.value || getStorageItem(key, defaultValue));
      }
    };

    const handleNativeStorageChange = (e) => {
      if (e.key === getStorageKey(key)) {
        setValue(safeJsonParse(e.newValue, defaultValue));
      }
    };

    window.addEventListener('localStorageChange', handleStorageChange);
    window.addEventListener('storage', handleNativeStorageChange);

    return () => {
      window.removeEventListener('localStorageChange', handleStorageChange);
      window.removeEventListener('storage', handleNativeStorageChange);
    };
  }, [key, defaultValue]);

  return [value, setStoredValue];
};

// Migrate storage if version changes
export const migrateStorage = () => {
  const metadata = getStorageItem(STORAGE_KEYS.CACHE_METADATA);
  
  if (!metadata || metadata.version !== STORAGE_VERSION) {
    console.log('Storage version mismatch, clearing old data');
    clearAppStorage();
  }
};