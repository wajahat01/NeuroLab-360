/**
 * API Configuration for NeuroLab 360
 * Centralizes all API endpoints and configuration
 */

// Base URLs
export const API_CONFIG = {
  // Backend API (Flask)
  BACKEND_URL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  
  // Supabase Configuration
  SUPABASE_URL: process.env.REACT_APP_SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.REACT_APP_SUPABASE_ANON_KEY,
  
  // Environment
  ENVIRONMENT: process.env.REACT_APP_ENVIRONMENT || 'development',
  
  // Request timeouts
  TIMEOUT: 30000, // 30 seconds
  
  // Retry configuration
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
};

// API Endpoints
export const ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    PROFILE: '/auth/profile',
  },
  
  // Dashboard
  DASHBOARD: {
    SUMMARY: '/dashboard/summary',
    CHARTS: '/dashboard/charts',
    RECENT: '/dashboard/recent',
    HEALTH: '/dashboard/health',
  },
  
  // Experiments
  EXPERIMENTS: {
    LIST: '/experiments',
    CREATE: '/experiments',
    GET: (id) => `/experiments/${id}`,
    UPDATE: (id) => `/experiments/${id}`,
    DELETE: (id) => `/experiments/${id}`,
    RESULTS: (id) => `/experiments/${id}/results`,
  },
  
  // Users
  USERS: {
    LIST: '/users',
    GET: (id) => `/users/${id}`,
    UPDATE: (id) => `/users/${id}`,
    DELETE: (id) => `/users/${id}`,
  },
  
  // Health Check
  HEALTH: '/health',
  
  // API Info
  INFO: '/api',
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

// Helper functions
export const buildUrl = (endpoint, params = {}) => {
  let url = `${API_CONFIG.BACKEND_URL}${endpoint}`;
  
  if (Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }
  
  return url;
};

export const buildSupabaseUrl = (table, params = {}) => {
  let url = `${API_CONFIG.SUPABASE_URL}/rest/v1/${table}`;
  
  if (Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }
  
  return url;
};

// Default headers for API requests
export const getDefaultHeaders = (includeAuth = true) => {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  
  if (includeAuth) {
    const token = localStorage.getItem('supabase.auth.token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  return headers;
};

// Supabase headers
export const getSupabaseHeaders = (includeAuth = true) => {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'apikey': API_CONFIG.SUPABASE_ANON_KEY,
  };
  
  if (includeAuth) {
    const token = localStorage.getItem('supabase.auth.token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  return headers;
};

export default API_CONFIG;