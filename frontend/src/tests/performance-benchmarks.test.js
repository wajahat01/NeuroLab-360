import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import App from '../App';
import { 
  clearPerformanceMetrics, 
  getPerformanceMetrics, 
  LoginTransitionTracker 
} from '../utils/performanceMonitor';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase
jest.mock('@supabase/supabase-js');
jest.mock('../lib/supabase');

const mockSupabase = {
  auth: {
    getSession: jest.fn(),
    onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
    signInWithPassword: jest.fn(),
    signOut: jest.fn()
  },
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(() => Promise.resolve({ data: null, error: null }))
      }))
    }))
  }))
};

createClient.mockReturnValue(mockSupabase);

// Performance benchmarks configuration
const PERFORMANCE_BUDGETS = {
  LOGIN_TO_DASHBOARD_MAX_TIME: 2000, // 2 seconds
  COMPONENT_RENDER_MAX_TIME: 16, // 16ms (60fps)
  AUTH_CHECK_MAX_TIME: 500, // 500ms
  DASHBOARD_LOAD_MAX_TIME: 1000, // 1 second
  MAX_SLOW_RENDERS: 2, // Maximum number of renders > 16ms
  MEMORY_LEAK_THRESHOLD: 1.5 // 50% memory increase threshold
};

describe('Performance Benchmarks', () => {
  beforeEach(() => {
    clearPerformanceMetrics();
    jest.clearAllMocks();
  });

  describe('Login to Dashboard Transition Benchmarks', () => {
    test('complete login flow should meet performance budget', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      // Mock authentication flow
      mockSupabase.auth.getSession
        .mockResolvedValueOnce({ data: { session: null }, error: null }) // Initial load - no session
        .mockResolvedValueOnce({ data: { session: { user: mockUser } }, error: null }); // After login

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { user: mockUser } },
        error: null
      });

      const transitionTracker = LoginTransitionTracker.startLoginToDashboard();

      render(
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      );

      // Should start at login page
      await waitFor(() => {
        expect(screen.getByTestId('login-form')).toBeInTheDocument();
      });

      const loginStartTime = performance.now();

      // Perform login
      const emailInput = screen.getByLabelText(/email/i);
      const passwordInput = screen.getByLabelText(/password/i);
      const loginButton = screen.getByRole('button', { name: /sign in/i });

      await act(async () => {
        fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
        fireEvent.change(passwordInput, { target: { value: 'password123' } });
        fireEvent.click(loginButton);
      });

      // Wait for dashboard to appear
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      }, { timeout: PERFORMANCE_BUDGETS.LOGIN_TO_DASHBOARD_MAX_TIME });

      const loginEndTime = performance.now();
      const totalTransitionTime = loginEndTime - loginStartTime;

      // End transition tracking
      const transition = transitionTracker.end({
        totalTime: totalTransitionTime,
        userAgent: navigator.userAgent
      });

      // Performance assertions
      expect(totalTransitionTime).toBeLessThan(PERFORMANCE_BUDGETS.LOGIN_TO_DASHBOARD_MAX_TIME);
      expect(transition.duration).toBeLessThan(PERFORMANCE_BUDGETS.LOGIN_TO_DASHBOARD_MAX_TIME);

      // Check render performance
      const metrics = getPerformanceMetrics();
      const slowRenders = metrics.renders.filter(r => r.actualDuration > PERFORMANCE_BUDGETS.COMPONENT_RENDER_MAX_TIME);
      expect(slowRenders.length).toBeLessThanOrEqual(PERFORMANCE_BUDGETS.MAX_SLOW_RENDERS);

      console.log('Login to Dashboard Performance:', {
        totalTime: totalTransitionTime,
        renderCount: metrics.summary.totalRenders,
        averageRenderTime: metrics.summary.averageRenderTime,
        slowRenders: slowRenders.length
      });
    });

    test('authentication check should be fast', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      const authTracker = LoginTransitionTracker.startAuthCheck();

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      render(
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      );

      // Wait for auth check to complete
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      const authTransition = authTracker.end();

      expect(authTransition.duration).toBeLessThan(PERFORMANCE_BUDGETS.AUTH_CHECK_MAX_TIME);

      console.log('Auth Check Performance:', {
        duration: authTransition.duration
      });
    });

    test('dashboard initial load should be fast', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      const dashboardTracker = LoginTransitionTracker.startDashboardLoad();

      render(
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      );

      // Wait for dashboard to fully load
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      const dashboardTransition = dashboardTracker.end();

      expect(dashboardTransition.duration).toBeLessThan(PERFORMANCE_BUDGETS.DASHBOARD_LOAD_MAX_TIME);

      console.log('Dashboard Load Performance:', {
        duration: dashboardTransition.duration
      });
    });
  });

  describe('Component Performance Benchmarks', () => {
    test('dashboard components should render efficiently', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      render(
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      const metrics = getPerformanceMetrics();

      // Check individual component performance
      metrics.componentMetrics.forEach((componentMetric, componentId) => {
        expect(componentMetric.averageDuration).toBeLessThan(PERFORMANCE_BUDGETS.COMPONENT_RENDER_MAX_TIME * 2);
        
        if (componentMetric.mountTime) {
          expect(componentMetric.mountTime).toBeLessThan(PERFORMANCE_BUDGETS.COMPONENT_RENDER_MAX_TIME * 5);
        }

        console.log(`Component ${componentId} Performance:`, {
          totalRenders: componentMetric.totalRenders,
          averageDuration: componentMetric.averageDuration,
          mountTime: componentMetric.mountTime
        });
      });
    });

    test('should handle rapid re-renders efficiently', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      const { rerender } = render(
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      clearPerformanceMetrics();
      const startTime = performance.now();

      // Simulate rapid re-renders
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          rerender(
            <BrowserRouter>
              <AuthProvider key={i}>
                <App />
              </AuthProvider>
            </BrowserRouter>
          );
        });
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(totalTime).toBeLessThan(1000); // Should handle 10 re-renders in under 1 second

      const metrics = getPerformanceMetrics();
      const slowRenders = metrics.renders.filter(r => r.actualDuration > PERFORMANCE_BUDGETS.COMPONENT_RENDER_MAX_TIME);
      
      expect(slowRenders.length).toBeLessThanOrEqual(PERFORMANCE_BUDGETS.MAX_SLOW_RENDERS);

      console.log('Rapid Re-render Performance:', {
        totalTime,
        renderCount: metrics.summary.totalRenders,
        slowRenders: slowRenders.length
      });
    });
  });

  describe('Memory Performance Benchmarks', () => {
    test('should not leak memory during navigation cycles', async () => {
      if (!performance.memory) {
        console.warn('Memory measurement not available in this environment');
        return;
      }

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      const initialMemory = performance.memory.usedJSHeapSize;

      // Perform multiple navigation cycles
      for (let i = 0; i < 5; i++) {
        const { unmount } = render(
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        );

        await waitFor(() => {
          expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
        });

        unmount();

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = performance.memory.usedJSHeapSize;
      const memoryIncrease = finalMemory / initialMemory;

      expect(memoryIncrease).toBeLessThan(PERFORMANCE_BUDGETS.MEMORY_LEAK_THRESHOLD);

      console.log('Memory Performance:', {
        initialMemory: Math.round(initialMemory / 1024 / 1024) + 'MB',
        finalMemory: Math.round(finalMemory / 1024 / 1024) + 'MB',
        increase: Math.round((memoryIncrease - 1) * 100) + '%'
      });
    });
  });

  describe('Performance Regression Detection', () => {
    test('should detect performance regressions', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      const startTime = performance.now();

      render(
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const loadTime = endTime - startTime;

      const metrics = getPerformanceMetrics();

      // Create performance report
      const performanceReport = {
        timestamp: new Date().toISOString(),
        loadTime,
        renderMetrics: {
          totalRenders: metrics.summary.totalRenders,
          averageRenderTime: metrics.summary.averageRenderTime,
          slowRenders: metrics.summary.slowRenders
        },
        componentMetrics: Array.from(metrics.componentMetrics.entries()).map(([id, metric]) => ({
          id,
          ...metric
        })),
        budgetCompliance: {
          loadTimeCompliant: loadTime < PERFORMANCE_BUDGETS.LOGIN_TO_DASHBOARD_MAX_TIME,
          renderTimeCompliant: metrics.summary.averageRenderTime < PERFORMANCE_BUDGETS.COMPONENT_RENDER_MAX_TIME,
          slowRenderCompliant: metrics.summary.slowRenders <= PERFORMANCE_BUDGETS.MAX_SLOW_RENDERS
        }
      };

      // All budget compliance checks should pass
      expect(performanceReport.budgetCompliance.loadTimeCompliant).toBe(true);
      expect(performanceReport.budgetCompliance.renderTimeCompliant).toBe(true);
      expect(performanceReport.budgetCompliance.slowRenderCompliant).toBe(true);

      console.log('Performance Report:', JSON.stringify(performanceReport, null, 2));
    });
  });
});