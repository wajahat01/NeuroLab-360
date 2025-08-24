/**
 * API Configuration for NeuroLab 360
 * Centralizes all API endpoints and configuration
 */

// Base URLs
export const API_CONFIG = {
  // Supabase REST API (Primary)
  SUPABASE_URL: process.env.REACT_APP_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.REACT_APP_SUPABASE_ANON_KEY,
  SUPABASE_REST_URL: `${process.env.REACT_APP_SUPABASE_URL}/rest/v1`,
  
  // Backend API (Flask) - Fallback
  BACKEND_URL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  
  // Environment
  ENVIRONMENT: process.env.REACT_APP_ENVIRONMENT || 'development',
  
  // Request timeouts
  TIMEOUT: 30000, // 30 seconds
  
  // Retry configuration
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
};

// Supabase Table Endpoints (Direct REST API)
export const SUPABASE_TABLES = {
  EXPERIMENTS: 'experiments',
  USERS: 'users', 
  EXPERIMENT_RESULTS: 'experiment_results',
  USER_SESSIONS: 'user_sessions',
  DASHBOARD_METRICS: 'dashboard_metrics',
};

// API Endpoints (Legacy Flask - for reference)
export const ENDPOINTS = {
  // Authentication (handled by Supabase Auth)
  AUTH: {
    LOGIN: '/auth/v1/token?grant_type=password',
    LOGOUT: '/auth/v1/logout',
    REFRESH: '/auth/v1/token?grant_type=refresh_token',
    USER: '/auth/v1/user',
  },
  
  // Dashboard (Direct Supabase queries)
  DASHBOARD: {
    EXPERIMENTS: `/rest/v1/${SUPABASE_TABLES.EXPERIMENTS}`,
    RESULTS: `/rest/v1/${SUPABASE_TABLES.EXPERIMENT_RESULTS}`,
    METRICS: `/rest/v1/${SUPABASE_TABLES.DASHBOARD_METRICS}`,
  },
  
  // Experiments (Direct Supabase CRUD)
  EXPERIMENTS: {
    TABLE: `/rest/v1/${SUPABASE_TABLES.EXPERIMENTS}`,
    BY_ID: (id) => `/rest/v1/${SUPABASE_TABLES.EXPERIMENTS}?id=eq.${id}`,
    BY_USER: (userId) => `/rest/v1/${SUPABASE_TABLES.EXPERIMENTS}?user_id=eq.${userId}`,
    RESULTS: (id) => `/rest/v1/${SUPABASE_TABLES.EXPERIMENT_RESULTS}?experiment_id=eq.${id}`,
  },
  
  // Users (Direct Supabase queries)
  USERS: {
    TABLE: `/rest/v1/${SUPABASE_TABLES.USERS}`,
    BY_ID: (id) => `/rest/v1/${SUPABASE_TABLES.USERS}?id=eq.${id}`,
  },
};

// Supabase Direct Endpoints (for direct database access)
export const SUPABASE_ENDPOINTS = {
  // Tables
  EXPERIMENTS: 'experiments',
  USERS: 'users',
  EXPERIMENT_RESULTS: 'experiment_results',
  USER_SESSIONS: 'user_sessions',
  
  // Storage buckets
  STORAGE: {
    EXPERIMENT_DATA: 'experiment-data',
    USER_UPLOADS: 'user-uploads',
    REPORTS: 'reports',
  },
  
  // Real-time channels
  REALTIME: {
    EXPERIMENTS: 'experiments',
    DASHBOARD: 'dashboard',
  },
};

// Helper functions for Supabase REST API
export const buildSupabaseUrl = (endpoint, filters = {}, options = {}) => {
  let url = `${API_CONFIG.SUPABASE_REST_URL}${endpoint}`;
  
  const params = new URLSearchParams();
  
  // Add filters
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  });
  
  // Add options (select, order, limit, etc.)
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  });
  
  if (params.toString()) {
    url += `?${params.toString()}`;
  }
  
  return url;
};

// Legacy function for Flask backend (kept for compatibility)
export const buildUrl = (endpoint, params = {}) => {
  let url = `${API_CONFIG.BACKEND_URL}${endpoint}`;
  
  if (Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }
  
  return url;
};

// Supabase headers (Primary)
export const getSupabaseHeaders = (includeAuth = true, method = 'GET') => {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'apikey': API_CONFIG.SUPABASE_ANON_KEY,
  };
  
  // Add Prefer header for POST requests
  if (method === 'POST') {
    headers['Prefer'] = 'return=representation';
  }
  
  if (includeAuth) {
    // Get token from Supabase auth
    const authData = localStorage.getItem('sb-fdkjoykhsdwigwjtxdxa-auth-token');
    if (authData) {
      try {
        const parsed = JSON.parse(authData);
        if (parsed.access_token) {
          headers['Authorization'] = `Bearer ${parsed.access_token}`;
        }
      } catch (e) {
        console.warn('Failed to parse auth token:', e);
      }
    }
  }
  
  return headers;
};

// Legacy headers for Flask backend (kept for compatibility)
export const getDefaultHeaders = (includeAuth = true) => {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  
  if (includeAuth) {
    const authData = localStorage.getItem('sb-fdkjoykhsdwigwjtxdxa-auth-token');
    if (authData) {
      try {
        const parsed = JSON.parse(authData);
        if (parsed.access_token) {
          headers['Authorization'] = `Bearer ${parsed.access_token}`;
        }
      } catch (e) {
        console.warn('Failed to parse auth token:', e);
      }
    }
  }
  
  return headers;
};

export default API_CONFIG;