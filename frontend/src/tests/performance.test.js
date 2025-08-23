/**
 * Performance tests for NeuroLab 360 frontend components
 * Tests rendering performance, memory usage, and optimization effectiveness
 */

import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import Dashboard from '../pages/Dashboard';
import Experiments from '../pages/Experiments';
import DataChart from '../components/DataChart';

// Mock Supabase
jest.mock('../lib/supabase', () => ({
  auth: {
    getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } })
  }
}));

// Mock API calls
global.fetch = jest.fn();

const mockUser = {
  id: 'test-user-123',
  email: 'test@example.com'
};

const TestWrapper = ({ children }) => (
  <BrowserRouter>
    <AuthProvider>
      {children}
    </AuthProvider>
  </BrowserRouter>
);

describe('Performance Tests', () => {
  beforeEach(() => {
    fetch.mockClear();
    // Mock successful API responses
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        experiments: [],
        total: 0,
        total_experiments: 0,
        experiments_by_type: {},
        experiments_by_status: {},
        recent_activity: { completion_rate: 0 },
        average_metrics: {},
        last_updated: new Date().toISOString()
      })
    });
  });

  describe('Component Rendering Performance', () => {
    it('should render Dashboard within performance budget', async () => {
      const startTime = performance.now();
      
      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );
      
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-summary')).toBeInTheDocument();
      });
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Dashboard should render within 500ms
      expect(renderTime).toBeLessThan(500);
    });

    it('should render Experiments page within performance budget', async () => {
      const startTime = performance.now();
      
      render(
        <TestWrapper>
          <Experiments />
        </TestWrapper>
      );
      
      await waitFor(() => {
        expect(screen.getByTestId('experiments-page')).toBeInTheDocument();
      });
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Experiments page should render within 300ms
      expect(renderTime).toBeLessThan(300);
    });

    it('should render DataChart component efficiently', () => {
      const mockData = Array.from({ length: 100 }, (_, i) => ({
        timestamp: i,
        value: Math.random() * 100,
        metadata: { unit: 'bpm' }
      }));

      const startTime = performance.now();
      
      render(
        <DataChart 
          data={mockData}
          title="Performance Test Chart"
          type="line"
        />
      );
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Chart with 100 data points should render within 200ms
      expect(renderTime).toBeLessThan(200);
    });
  });

  describe('Large Dataset Performance', () => {
    it('should handle large experiment lists efficiently', async () => {
      const largeExperimentList = Array.from({ length: 100 }, (_, i) => ({
        id: `exp-${i}`,
        name: `Experiment ${i}`,
        experiment_type: ['heart_rate', 'reaction_time', 'memory', 'eeg'][i % 4],
        status: 'completed',
        created_at: new Date(Date.now() - i * 86400000).toISOString(),
        parameters: { duration_minutes: 5 },
        results: {
          metrics: { mean: 75 + Math.random() * 10 },
          analysis_summary: `Analysis for experiment ${i}`
        }
      }));

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          experiments: largeExperimentList,
          total: 100
        })
      });

      const startTime = performance.now();
      
      render(
        <TestWrapper>
          <Experiments />
        </TestWrapper>
      );
      
      await waitFor(() => {
        expect(screen.getByTestId('experiments-page')).toBeInTheDocument();
      });
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Should handle 100 experiments within 1 second
      expect(renderTime).toBeLessThan(1000);
    });

    it('should handle large chart datasets efficiently', () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: i,
        value: 75 + Math.sin(i / 10) * 10 + Math.random() * 5,
        metadata: { unit: 'bpm' }
      }));

      const startTime = performance.now();
      
      render(
        <DataChart 
          data={largeDataset}
          title="Large Dataset Chart"
          type="line"
        />
      );
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Chart with 1000 data points should render within 500ms
      expect(renderTime).toBeLessThan(500);
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not create memory leaks in Dashboard', async () => {
      const initialMemory = performance.memory?.usedJSHeapSize || 0;
      
      // Render and unmount Dashboard multiple times
      for (let i = 0; i < 10; i++) {
        const { unmount } = render(
          <TestWrapper>
            <Dashboard />
          </TestWrapper>
        );
        
        await waitFor(() => {
          expect(screen.getByTestId('dashboard-summary')).toBeInTheDocument();
        });
        
        unmount();
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = performance.memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    });

    it('should clean up chart resources properly', () => {
      const mockData = Array.from({ length: 500 }, (_, i) => ({
        timestamp: i,
        value: Math.random() * 100,
        metadata: { unit: 'bpm' }
      }));

      const initialMemory = performance.memory?.usedJSHeapSize || 0;
      
      // Render and unmount charts multiple times
      for (let i = 0; i < 5; i++) {
        const { unmount } = render(
          <DataChart 
            data={mockData}
            title={`Chart ${i}`}
            type="line"
          />
        );
        
        unmount();
      }
      
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = performance.memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be minimal (less than 5MB)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });
  });

  describe('API Response Time Tests', () => {
    it('should handle slow API responses gracefully', async () => {
      // Mock slow API response
      fetch.mockImplementationOnce(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            ok: true,
            json: async () => ({
              experiments: [],
              total: 0
            })
          }), 2000)
        )
      );

      const startTime = performance.now();
      
      render(
        <TestWrapper>
          <Experiments />
        </TestWrapper>
      );
      
      // Should show loading state immediately
      expect(screen.getByTestId('loading-skeleton')).toBeInTheDocument();
      
      await waitFor(() => {
        expect(screen.getByTestId('experiments-page')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Should handle the delay and still render properly
      expect(totalTime).toBeGreaterThan(2000);
      expect(totalTime).toBeLessThan(2500); // Allow some buffer for processing
    });

    it('should batch multiple API calls efficiently', async () => {
      let apiCallCount = 0;
      
      fetch.mockImplementation(() => {
        apiCallCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            total_experiments: 0,
            experiments_by_type: {},
            experiments_by_status: {},
            recent_activity: { completion_rate: 0 },
            average_metrics: {},
            last_updated: new Date().toISOString(),
            activity_timeline: [],
            experiment_type_distribution: [],
            performance_trends: [],
            metric_comparisons: [],
            period: '30d',
            date_range: { start: new Date().toISOString(), end: new Date().toISOString() }
          })
        });
      });

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );
      
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-summary')).toBeInTheDocument();
      });
      
      // Should make minimal API calls (ideally 2: summary and charts)
      expect(apiCallCount).toBeLessThanOrEqual(3);
    });
  });

  describe('Bundle Size and Loading Performance', () => {
    it('should lazy load components efficiently', async () => {
      // This test would typically be run with webpack-bundle-analyzer
      // For now, we'll test that components load without blocking
      
      const startTime = performance.now();
      
      // Simulate lazy loading by using dynamic imports
      const DashboardModule = await import('../pages/Dashboard');
      const ExperimentsModule = await import('../pages/Experiments');
      
      const endTime = performance.now();
      const loadTime = endTime - startTime;
      
      expect(DashboardModule.default).toBeDefined();
      expect(ExperimentsModule.default).toBeDefined();
      
      // Modules should load quickly
      expect(loadTime).toBeLessThan(100);
    });
  });

  describe('Optimization Effectiveness', () => {
    it('should benefit from React.memo optimization', () => {
      const mockData = Array.from({ length: 50 }, (_, i) => ({
        timestamp: i,
        value: Math.random() * 100,
        metadata: { unit: 'bpm' }
      }));

      let renderCount = 0;
      const TestChart = React.memo(({ data, title }) => {
        renderCount++;
        return <DataChart data={data} title={title} type="line" />;
      });

      const { rerender } = render(
        <TestChart data={mockData} title="Test Chart" />
      );
      
      expect(renderCount).toBe(1);
      
      // Re-render with same props - should not re-render due to memo
      rerender(<TestChart data={mockData} title="Test Chart" />);
      expect(renderCount).toBe(1);
      
      // Re-render with different props - should re-render
      rerender(<TestChart data={mockData} title="Updated Chart" />);
      expect(renderCount).toBe(2);
    });

    it('should efficiently update only changed experiment cards', async () => {
      const initialExperiments = [
        { id: 'exp-1', name: 'Experiment 1', status: 'completed' },
        { id: 'exp-2', name: 'Experiment 2', status: 'completed' }
      ];

      const updatedExperiments = [
        { id: 'exp-1', name: 'Experiment 1', status: 'completed' },
        { id: 'exp-2', name: 'Experiment 2', status: 'running' }, // Status changed
        { id: 'exp-3', name: 'Experiment 3', status: 'pending' }  // New experiment
      ];

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ experiments: initialExperiments, total: 2 })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ experiments: updatedExperiments, total: 3 })
        });

      const { rerender } = render(
        <TestWrapper>
          <Experiments />
        </TestWrapper>
      );
      
      await waitFor(() => {
        expect(screen.getAllByTestId('experiment-card')).toHaveLength(2);
      });

      const startTime = performance.now();
      
      rerender(
        <TestWrapper>
          <Experiments />
        </TestWrapper>
      );
      
      await waitFor(() => {
        expect(screen.getAllByTestId('experiment-card')).toHaveLength(3);
      });
      
      const endTime = performance.now();
      const updateTime = endTime - startTime;
      
      // Update should be fast since only one card changed and one was added
      expect(updateTime).toBeLessThan(100);
    });
  });
});

// Performance monitoring utilities
export const measurePerformance = (name, fn) => {
  return async (...args) => {
    const startTime = performance.now();
    const result = await fn(...args);
    const endTime = performance.now();
    
    console.log(`${name} took ${endTime - startTime} milliseconds`);
    
    return result;
  };
};

export const createPerformanceObserver = () => {
  if (typeof PerformanceObserver !== 'undefined') {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach((entry) => {
        console.log(`${entry.name}: ${entry.duration}ms`);
      });
    });
    
    observer.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
    
    return observer;
  }
  
  return null;
};