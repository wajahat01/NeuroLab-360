/**
 * Test fixtures and mock data for NeuroLab 360 frontend tests
 */

import { format, subDays, subHours } from 'date-fns';

// Mock user data
export const mockUser = {
  id: 'test-user-123',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00Z',
  user_metadata: {
    name: 'Test User'
  }
};

// Mock authentication session
export const mockSession = {
  access_token: 'mock-jwt-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: mockUser
};

// Mock experiment types configuration
export const mockExperimentTypes = {
  heart_rate: {
    name: 'Heart Rate Monitoring',
    description: 'Monitor heart rate variability and patterns',
    parameters: {
      duration_minutes: { type: 'number', min: 1, max: 60, default: 5 },
      baseline_bpm: { type: 'number', min: 40, max: 200, default: 75 }
    },
    units: 'bpm'
  },
  reaction_time: {
    name: 'Reaction Time Test',
    description: 'Measure response time to visual/audio stimuli',
    parameters: {
      trials: { type: 'number', min: 5, max: 100, default: 20 },
      stimulus_type: { type: 'select', options: ['visual', 'audio', 'both'], default: 'visual' }
    },
    units: 'ms'
  },
  memory: {
    name: 'Memory Assessment',
    description: 'Test short-term and working memory capacity',
    parameters: {
      test_type: { type: 'select', options: ['visual', 'verbal', 'spatial'], default: 'visual' },
      items_count: { type: 'number', min: 5, max: 20, default: 10 }
    },
    units: 'accuracy'
  },
  eeg: {
    name: 'EEG Recording',
    description: 'Record and analyze brainwave patterns',
    parameters: {
      duration_minutes: { type: 'number', min: 1, max: 30, default: 10 },
      sampling_rate: { type: 'select', options: [128, 256, 512], default: 256 }
    },
    units: 'μV'
  }
};

// Generate mock experiment data
export const createMockExperiment = (overrides = {}) => {
  const baseExperiment = {
    id: `exp-${Math.random().toString(36).substr(2, 9)}`,
    user_id: mockUser.id,
    name: 'Test Experiment',
    experiment_type: 'heart_rate',
    status: 'completed',
    parameters: {
      duration_minutes: 5,
      baseline_bpm: 75
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return { ...baseExperiment, ...overrides };
};

// Generate mock experiment results
export const createMockResults = (experimentId, experimentType = 'heart_rate', overrides = {}) => {
  const generators = {
    heart_rate: () => ({
      data_points: Array.from({ length: 300 }, (_, i) => ({
        timestamp: i,
        value: 75 + Math.sin(i / 10) * 5 + (Math.random() - 0.5) * 3,
        metadata: { unit: 'bpm' }
      })),
      metrics: {
        mean: 75.5,
        std_dev: 4.2,
        min: 68.2,
        max: 82.1
      },
      analysis_summary: 'Heart rate remained stable throughout the monitoring period.'
    }),
    
    reaction_time: () => ({
      data_points: Array.from({ length: 20 }, (_, i) => ({
        timestamp: i,
        value: 250 + Math.random() * 100,
        metadata: { 
          unit: 'ms', 
          trial: i + 1, 
          stimulus: 'visual',
          correct: Math.random() > 0.1
        }
      })),
      metrics: {
        mean: 285.5,
        std_dev: 25.3,
        min: 220.1,
        max: 340.8,
        accuracy: 95.0
      },
      analysis_summary: 'Reaction times are within normal range with high accuracy.'
    }),
    
    memory: () => ({
      data_points: Array.from({ length: 10 }, (_, i) => ({
        timestamp: i,
        value: Math.random() > 0.3 ? 1 : 0, // 70% accuracy
        metadata: { 
          test_type: 'visual',
          item_id: i + 1,
          response_time: 1500 + Math.random() * 1000
        }
      })),
      metrics: {
        accuracy: 70.0,
        mean_response_time: 2000,
        correct_responses: 7,
        total_responses: 10
      },
      analysis_summary: 'Memory performance shows good retention with moderate response times.'
    }),
    
    eeg: () => ({
      data_points: Array.from({ length: 600 }, (_, i) => ({
        timestamp: i,
        value: Math.sin(i / 20) * 50 + (Math.random() - 0.5) * 20,
        metadata: {
          unit: 'μV',
          alpha: 8 + Math.random() * 4,
          beta: 15 + Math.random() * 10,
          theta: 4 + Math.random() * 4,
          delta: 1 + Math.random() * 3
        }
      })),
      metrics: {
        alpha_avg: 10.2,
        beta_avg: 20.1,
        theta_avg: 6.1,
        delta_avg: 2.5,
        dominant_frequency: 10.2
      },
      analysis_summary: 'EEG shows normal brainwave patterns with good alpha activity.'
    })
  };

  const baseResults = {
    id: `result-${Math.random().toString(36).substr(2, 9)}`,
    experiment_id: experimentId,
    created_at: new Date().toISOString(),
    ...generators[experimentType]()
  };

  return { ...baseResults, ...overrides };
};

// Mock dashboard data
export const createMockDashboardSummary = (overrides = {}) => {
  const baseSummary = {
    total_experiments: 15,
    experiments_by_type: {
      heart_rate: 6,
      reaction_time: 4,
      memory: 3,
      eeg: 2
    },
    experiments_by_status: {
      completed: 12,
      running: 2,
      pending: 1
    },
    recent_activity: {
      completion_rate: 80,
      experiments_this_week: 5,
      experiments_this_month: 15,
      avg_experiments_per_week: 3.75
    },
    average_metrics: {
      mean: 125.8,
      std_dev: 15.2,
      min: 95.1,
      max: 156.3
    },
    last_updated: new Date().toISOString()
  };

  return { ...baseSummary, ...overrides };
};

export const createMockDashboardCharts = (overrides = {}) => {
  const now = new Date();
  
  const baseCharts = {
    activity_timeline: Array.from({ length: 30 }, (_, i) => ({
      date: format(subDays(now, 29 - i), 'yyyy-MM-dd'),
      count: Math.floor(Math.random() * 3),
      completed: Math.floor(Math.random() * 2)
    })),
    
    experiment_type_distribution: [
      { type: 'heart_rate', count: 6, percentage: 40.0, color: '#ef4444' },
      { type: 'reaction_time', count: 4, percentage: 26.7, color: '#3b82f6' },
      { type: 'memory', count: 3, percentage: 20.0, color: '#10b981' },
      { type: 'eeg', count: 2, percentage: 13.3, color: '#f59e0b' }
    ],
    
    performance_trends: Array.from({ length: 12 }, (_, i) => ({
      date: format(subDays(now, (11 - i) * 7), 'yyyy-MM-dd'),
      value: 120 + Math.sin(i / 2) * 20 + Math.random() * 10,
      experiments_count: Math.floor(Math.random() * 5) + 1
    })),
    
    metric_comparisons: {
      current_period: 125.8,
      previous_period: 118.3,
      change_percentage: 6.3,
      trend: 'up'
    },
    
    period: '30d',
    total_experiments: 15,
    date_range: {
      start: format(subDays(now, 30), 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\''),
      end: format(now, 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\'')
    }
  };

  return { ...baseCharts, ...overrides };
};

// Mock recent experiments data
export const createMockRecentExperiments = (count = 5, overrides = {}) => {
  const experiments = Array.from({ length: count }, (_, i) => {
    const experimentType = ['heart_rate', 'reaction_time', 'memory', 'eeg'][i % 4];
    const experiment = createMockExperiment({
      name: `Recent Experiment ${i + 1}`,
      experiment_type: experimentType,
      created_at: subHours(new Date(), i * 6).toISOString(),
      status: i === 0 ? 'running' : 'completed'
    });

    if (experiment.status === 'completed') {
      experiment.results = createMockResults(experiment.id, experimentType);
    }

    return experiment;
  });

  const baseData = {
    experiments,
    activity_summary: {
      total_recent: count,
      by_type: experiments.reduce((acc, exp) => {
        acc[exp.experiment_type] = (acc[exp.experiment_type] || 0) + 1;
        return acc;
      }, {}),
      by_status: experiments.reduce((acc, exp) => {
        acc[exp.status] = (acc[exp.status] || 0) + 1;
        return acc;
      }, {}),
      completion_rate: Math.round((experiments.filter(e => e.status === 'completed').length / count) * 100)
    },
    insights: [
      {
        type: 'streak',
        message: 'You\'ve completed 3 experiments this week!',
        icon: '🔥',
        priority: 'high'
      },
      {
        type: 'variety',
        message: 'Great job exploring different experiment types.',
        icon: '🌟',
        priority: 'medium'
      }
    ],
    period: {
      days: 7,
      limit: count
    },
    last_updated: new Date().toISOString()
  };

  return { ...baseData, ...overrides };
};

// Error response fixtures
export const mockApiError = (message = 'An error occurred', status = 500) => ({
  error: message,
  status,
  timestamp: new Date().toISOString()
});

export const mockNetworkError = () => ({
  name: 'NetworkError',
  message: 'Failed to fetch',
  code: 'NETWORK_ERROR'
});

// Loading state fixtures
export const mockLoadingState = {
  isLoading: true,
  error: null,
  data: null
};

export const mockErrorState = (error = 'Something went wrong') => ({
  isLoading: false,
  error,
  data: null
});

export const mockSuccessState = (data) => ({
  isLoading: false,
  error: null,
  data
});

// Form validation fixtures
export const mockFormErrors = {
  name: 'Experiment name is required',
  experiment_type: 'Please select an experiment type',
  duration_minutes: 'Duration must be between 1 and 60 minutes',
  baseline_bpm: 'Baseline BPM must be between 40 and 200'
};

// Local storage mock data
export const mockLocalStorageData = {
  'neurolab-user-preferences': JSON.stringify({
    theme: 'light',
    defaultExperimentType: 'heart_rate',
    chartAnimations: true,
    notifications: true
  }),
  'neurolab-experiment-drafts': JSON.stringify([
    {
      id: 'draft-1',
      name: 'Draft Experiment',
      experiment_type: 'heart_rate',
      parameters: { duration_minutes: 3 },
      created_at: new Date().toISOString()
    }
  ])
};

// Export all fixtures as a collection
export const fixtures = {
  user: mockUser,
  session: mockSession,
  experimentTypes: mockExperimentTypes,
  createExperiment: createMockExperiment,
  createResults: createMockResults,
  dashboardSummary: createMockDashboardSummary,
  dashboardCharts: createMockDashboardCharts,
  recentExperiments: createMockRecentExperiments,
  apiError: mockApiError,
  networkError: mockNetworkError,
  loadingState: mockLoadingState,
  errorState: mockErrorState,
  successState: mockSuccessState,
  formErrors: mockFormErrors,
  localStorage: mockLocalStorageData
};

export default fixtures;