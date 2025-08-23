import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
  clearAppStorage,
  getStorageInfo,
  STORAGE_KEYS
} from '../localStorage';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock window events
const mockDispatchEvent = jest.fn();
Object.defineProperty(window, 'dispatchEvent', {
  value: mockDispatchEvent
});

describe('localStorage utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  describe('getStorageItem', () => {
    it('should return default value when item does not exist', () => {
      const result = getStorageItem(STORAGE_KEYS.USER_PREFERENCES);
      
      expect(localStorageMock.getItem).toHaveBeenCalledWith('neurolab_user_preferences');
      expect(result).toEqual({
        theme: 'light',
        language: 'en',
        timezone: expect.any(String),
        notifications: {
          experimentComplete: true,
          systemUpdates: true,
          errors: true
        }
      });
    });

    it('should return parsed JSON data when item exists', () => {
      const testData = { theme: 'dark', language: 'es' };
      localStorageMock.getItem.mockReturnValue(JSON.stringify(testData));

      const result = getStorageItem(STORAGE_KEYS.USER_PREFERENCES);
      
      expect(result).toEqual({
        theme: 'dark',
        language: 'es',
        timezone: expect.any(String),
        notifications: {
          experimentComplete: true,
          systemUpdates: true,
          errors: true
        }
      });
    });

    it('should return fallback value when JSON parsing fails', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');
      
      const result = getStorageItem(STORAGE_KEYS.USER_PREFERENCES, { fallback: true });
      
      expect(result).toEqual({ fallback: true });
    });

    it('should return custom default value when provided', () => {
      const customDefault = { custom: 'value' };
      
      const result = getStorageItem('non_existent_key', customDefault);
      
      expect(result).toEqual(customDefault);
    });
  });

  describe('setStorageItem', () => {
    it('should store item and dispatch event', () => {
      const testData = { theme: 'dark' };
      
      const result = setStorageItem(STORAGE_KEYS.USER_PREFERENCES, testData);
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'neurolab_user_preferences',
        JSON.stringify(testData)
      );
      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'localStorageChange',
          detail: {
            key: STORAGE_KEYS.USER_PREFERENCES,
            value: testData
          }
        })
      );
      expect(result).toBe(true);
    });

    it('should handle storage errors gracefully', () => {
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage full');
      });
      
      const result = setStorageItem(STORAGE_KEYS.USER_PREFERENCES, { test: 'data' });
      
      expect(result).toBe(false);
    });

    it('should handle JSON stringify errors', () => {
      const circularRef = {};
      circularRef.self = circularRef;
      
      const result = setStorageItem(STORAGE_KEYS.USER_PREFERENCES, circularRef);
      
      expect(result).toBe(false);
    });
  });

  describe('removeStorageItem', () => {
    it('should remove item and dispatch event', () => {
      const result = removeStorageItem(STORAGE_KEYS.USER_PREFERENCES);
      
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('neurolab_user_preferences');
      expect(mockDispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'localStorageChange',
          detail: {
            key: STORAGE_KEYS.USER_PREFERENCES,
            value: null
          }
        })
      );
      expect(result).toBe(true);
    });

    it('should handle removal errors gracefully', () => {
      localStorageMock.removeItem.mockImplementation(() => {
        throw new Error('Removal failed');
      });
      
      const result = removeStorageItem(STORAGE_KEYS.USER_PREFERENCES);
      
      expect(result).toBe(false);
    });
  });

  describe('clearAppStorage', () => {
    it('should clear all app-specific storage items', () => {
      // Mock Object.keys to return some test keys
      const mockKeys = [
        'neurolab_user_preferences',
        'neurolab_dashboard_settings',
        'other_app_data',
        'neurolab_experiment_filters'
      ];
      
      Object.defineProperty(localStorageMock, 'keys', {
        value: mockKeys,
        configurable: true
      });
      
      // Mock Object.keys for localStorage
      const originalKeys = Object.keys;
      Object.keys = jest.fn().mockReturnValue(mockKeys);
      
      const result = clearAppStorage();
      
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('neurolab_user_preferences');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('neurolab_dashboard_settings');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('neurolab_experiment_filters');
      expect(localStorageMock.removeItem).not.toHaveBeenCalledWith('other_app_data');
      expect(result).toBe(true);
      
      // Restore Object.keys
      Object.keys = originalKeys;
    });

    it('should handle clear errors gracefully', () => {
      Object.keys = jest.fn().mockImplementation(() => {
        throw new Error('Keys access failed');
      });
      
      const result = clearAppStorage();
      
      expect(result).toBe(false);
    });
  });

  describe('getStorageInfo', () => {
    it('should return storage information', () => {
      const mockKeys = [
        'neurolab_user_preferences',
        'neurolab_dashboard_settings',
        'other_app_data'
      ];
      
      Object.keys = jest.fn().mockReturnValue(mockKeys);
      
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'neurolab_user_preferences') return '{"theme":"dark"}';
        if (key === 'neurolab_dashboard_settings') return '{"autoRefresh":true}';
        return null;
      });
      
      // Mock Blob constructor
      global.Blob = jest.fn().mockImplementation((content) => ({
        size: content[0].length
      }));
      
      const result = getStorageInfo();
      
      expect(result.available).toBe(true);
      expect(result.itemCount).toBe(2);
      expect(result.totalSize).toBeGreaterThan(0);
      expect(result.items).toHaveProperty('user_preferences');
      expect(result.items).toHaveProperty('dashboard_settings');
      expect(result.items).not.toHaveProperty('other_app_data');
    });

    it('should handle storage info errors gracefully', () => {
      Object.keys = jest.fn().mockImplementation(() => {
        throw new Error('Keys access failed');
      });
      
      const result = getStorageInfo();
      
      expect(result.available).toBe(false);
      expect(result.error).toBe('Keys access failed');
    });
  });

  describe('localStorage availability', () => {
    it('should handle localStorage not being available', () => {
      // Mock localStorage to throw error
      const originalLocalStorage = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: {
          setItem: () => { throw new Error('localStorage not available'); },
          getItem: () => { throw new Error('localStorage not available'); },
          removeItem: () => { throw new Error('localStorage not available'); }
        },
        configurable: true
      });
      
      const result = getStorageItem(STORAGE_KEYS.USER_PREFERENCES);
      
      // Should return default value when localStorage is not available
      expect(result).toEqual({
        theme: 'light',
        language: 'en',
        timezone: expect.any(String),
        notifications: {
          experimentComplete: true,
          systemUpdates: true,
          errors: true
        }
      });
      
      // Restore localStorage
      Object.defineProperty(window, 'localStorage', {
        value: originalLocalStorage,
        configurable: true
      });
    });
  });
});