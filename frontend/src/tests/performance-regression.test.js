/**
 * Performance Regression Tests
 * 
 * These tests establish performance baselines and detect regressions
 * in component rendering and application flow performance.
 */

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import App from '../App';
import Dashboard from '../pages/Dashboard';
import Login from '../pages/Login';
import { 
  PerformanceProfiler, 
  LoginTransitionTracker, 
  PerformanceMonitor,
  getPerformanceMetrics,
  clearPerformanceMetrics,
  generatePerformanceReport
} from '../utils/performanceProfiler';

// Mock Supabase
jest.mock('../lib/supabase', () => ({
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
      })),
      order: jest.fn(() => ({
        limit: jest.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    }))
  }))
}));

// Performance regression thresholds
const REGRESSION_THRESHOLDS = {
  LOGIN_TO_DASHBOARD: {
    baseline: 2000, // 2 seconds baseline
    regression: 1.2 // 20% regression threshold
  },
  COMPONENT_RENDER: {
    baseline: 16, // 16ms baseline (60fps)
    regression: 1.5 // 50% regression threshold
  },
  AUTH_CHECK: {
    baseline: 500, // 500ms baseline
    regression: 1.3 // 30% regression threshold
  },
  DASHBOARD_LOAD: {
    baseline: 1000, // 1 second baseline
    regression: 1.2 // 20% regression threshold
  }
};

const TestWrapper = ({ children }) => (
  <BrowserRouter>
    <AuthProvider>
      {children}
    </AuthProvider>
  </BrowserRouter>
);

describe('Performance Regression Tests', () => {
  beforeEach(() => {
    clearPerformanceMetrics();
    jest.clearAllMocks();
    
    // Mock successful responses by default
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        total_experiments: 5,
        experiments_by_type: { heart_rate: 2, reaction_time: 3 },
        experiments_by_status: { completed: 4, running: 1 },
        recent_activity: { completion_rate: 80 },
        average_metrics: { heart_rate: 75, reaction_time: 250 },
        last_updated: new Date().toISOString(),
        experiments: []
      })
    });
  });

  describe('Login Flow Performance Regression', () => {
    test('login to dashboard transition should not regress', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      // Mock authentication flow
      const mockSupabase = require('../lib/supabase');
      mockSupabase.auth.getSession
        .mockResolvedValueOnce({ data: { session: null }, error: null })
        .mockResolvedValueOnce({ data: { session: { user: mockUser } }, error: null });

      mockSupabase.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: { user: mockUser } },
        error: null
      });

      const transitionTracker = LoginTransitionTracker.startLoginToDashboard();

      const { container } = render(
        <PerformanceProfiler id="login-flow-regression">
          <TestWrapper>
            <App />
          </TestWrapper>
        </PerformanceProfiler>
      );

      // Should start at login page
      await waitFor(() => {
        expect(screen.getByTestId('login-form')).toBeInTheDocument();
      });

      transitionTracker.addMarker('login-form-rendered');

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

      transitionTracker.addMarker('login-submitted');

      // Wait for dashboard to appear
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      }, { timeout: REGRESSION_THRESHOLDS.LOGIN_TO_DASHBOARD.baseline * 2 });

      const loginEndTime = performance.now();
      const totalTransitionTime = loginEndTime - loginStartTime;

      transitionTracker.addMarker('dashboard-rendered');
      const transition = transitionTracker.end({
        totalTime: totalTransitionTime,
        testType: 'regression'
      });

      // Performance regression check
      const regressionThreshold = REGRESSION_THRESHOLDS.LOGIN_TO_DASHBOARD.baseline * 
                                 REGRESSION_THRESHOLDS.LOGIN_TO_DASHBOARD.regression;

      expect(totalTransitionTime).toBeLessThan(regressionThreshold);
      expect(transition.duration).toBeLessThan(regressionThreshold);

      // Generate performance report
      const report = generatePerformanceReport();
      
      console.log('Login Flow Performance Report:', {
        transitionTime: totalTransitionTime,
        baseline: REGRESSION_THRESHOLDS.LOGIN_TO_DASHBOARD.baseline,
        threshold: regressionThreshold,
        passed: totalTransitionTime < regressionThreshold,
        renderMetrics: report.summary,
        recommendations: report.recommendations
      });

      // Verify no performance regressions in rendering
      const slowRenders = report.slowRenders.length;
      expect(slowRenders).toBeLessThanOrEqual(2); // Allow max 2 slow renders
    });

    test('authentication check should not regress', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      const mockSupabase = require('../lib/supabase');
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      const authTracker = LoginTransitionTracker.startAuthCheck();

      render(
        <PerformanceProfiler id="auth-check-regression">
          <TestWrapper>
            <App />
          </TestWrapper>
        </PerformanceProfiler>
      );

      // Wait for auth check to complete
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      const authTransition = authTracker.end();

      const regressionThreshold = REGRESSION_THRESHOLDS.AUTH_CHECK.baseline * 
                                 REGRESSION_THRESHOLDS.AUTH_CHECK.regression;

      expect(authTransition.duration).toBeLessThan(regressionThreshold);

      console.log('Auth Check Performance:', {
        duration: authTransition.duration,
        baseline: REGRESSION_THRESHOLDS.AUTH_CHECK.baseline,
        threshold: regressionThreshold,
        passed: authTransition.duration < regressionThreshold
      });
    });
  });

  describe('Component Rendering Performance Regression', () => {
    test('dashboard components should not have rendering regressions', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      const mockSupabase = require('../lib/supabase');
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      render(
        <PerformanceProfiler id="dashboard-render-regression">
          <TestWrapper>
            <Dashboard />
          </TestWrapper>
        </PerformanceProfiler>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      const metrics = getPerformanceMetrics();
      const report = generatePerformanceReport();

      // Check component-specific performance
      report.componentBreakdown.forEach((component) => {
        const regressionThreshold = REGRESSION_THRESHOLDS.COMPONENT_RENDER.baseline * 
                                   REGRESSION_THRESHOLDS.COMPONENT_RENDER.regression;

        expect(component.averageDuration).toBeLessThan(regressionThreshold);

        console.log(`Component ${component.componentId} Performance:`, {
          averageDuration: component.averageDuration,
          baseline: REGRESSION_THRESHOLDS.COMPONENT_RENDER.baseline,
          threshold: regressionThreshold,
          score: component.performanceScore,
          passed: component.averageDuration < regressionThreshold
        });
      });

      // Overall rendering performance should not regress
      const overallRegressionThreshold = REGRESSION_THRESHOLDS.COMPONENT_RENDER.baseline * 
                                        REGRESSION_THRESHOLDS.COMPONENT_RENDER.regression;

      expect(metrics.summary.averageRenderTime).toBeLessThan(overallRegressionThreshold);
    });

    test('rapid re-renders should not cause performance regression', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      const mockSupabase = require('../lib/supabase');
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      const { rerender } = render(
        <PerformanceProfiler id="rapid-render-regression">
          <TestWrapper>
            <Dashboard />
          </TestWrapper>
        </PerformanceProfiler>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      clearPerformanceMetrics();
      const startTime = performance.now();

      // Simulate rapid re-renders
      for (let i = 0; i < 20; i++) {
        await act(async () => {
          rerender(
            <PerformanceProfiler id={`rapid-render-regression-${i}`}>
              <TestWrapper>
                <Dashboard key={i} />
              </TestWrapper>
            </PerformanceProfiler>
          );
        });
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      const metrics = getPerformanceMetrics();
      const averageRenderTime = totalTime / 20; // Average per re-render

      const regressionThreshold = REGRESSION_THRESHOLDS.COMPONENT_RENDER.baseline * 
                                 REGRESSION_THRESHOLDS.COMPONENT_RENDER.regression * 2; // Allow 2x for rapid renders

      expect(averageRenderTime).toBeLessThan(regressionThreshold);

      console.log('Rapid Re-render Performance:', {
        totalTime,
        averageRenderTime,
        renderCount: metrics.summary.totalRenders,
        threshold: regressionThreshold,
        passed: averageRenderTime < regressionThreshold
      });
    });
  });

  describe('Memory Performance Regression', () => {
    test('should not have memory leaks during navigation cycles', async () => {
      if (!performance.memory) {
        console.warn('Memory measurement not available in this environment');
        return;
      }

      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      const mockSupabase = require('../lib/supabase');
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      const initialMemory = performance.memory.usedJSHeapSize;
      const memoryMeasurements = [];

      // Perform multiple navigation cycles
      for (let i = 0; i < 10; i++) {
        const { unmount } = render(
          <PerformanceProfiler id={`memory-test-${i}`}>
            <TestWrapper>
              <App />
            </TestWrapper>
          </PerformanceProfiler>
        );

        await waitFor(() => {
          expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
        });

        memoryMeasurements.push(performance.memory.usedJSHeapSize);

        unmount();

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      const finalMemory = performance.memory.usedJSHeapSize;
      const memoryIncrease = (finalMemory - initialMemory) / initialMemory;

      // Memory increase should be reasonable (< 30% regression)
      const memoryRegressionThreshold = 0.3;
      expect(memoryIncrease).toBeLessThan(memoryRegressionThreshold);

      console.log('Memory Performance:', {
        initialMemory: Math.round(initialMemory / 1024 / 1024) + 'MB',
        finalMemory: Math.round(finalMemory / 1024 / 1024) + 'MB',
        increase: Math.round(memoryIncrease * 100) + '%',
        threshold: Math.round(memoryRegressionThreshold * 100) + '%',
        passed: memoryIncrease < memoryRegressionThreshold,
        measurements: memoryMeasurements.map(m => Math.round(m / 1024 / 1024) + 'MB')
      });
    });
  });

  describe('Performance Monitoring Integration', () => {
    test('should collect comprehensive performance metrics', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      const mockSupabase = require('../lib/supabase');
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      const operation = PerformanceMonitor.startOperation('comprehensive-test');

      render(
        <PerformanceProfiler id="comprehensive-monitoring">
          <TestWrapper>
            <App />
          </TestWrapper>
        </PerformanceProfiler>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      const operationResult = operation.end({ testType: 'comprehensive' });
      const report = generatePerformanceReport();

      // Verify comprehensive metrics collection
      expect(report.summary.totalRenders).toBeGreaterThan(0);
      expect(report.componentBreakdown.length).toBeGreaterThan(0);
      expect(operationResult.duration).toBeGreaterThan(0);

      // Performance score should be reasonable
      const averageScore = report.componentBreakdown.reduce((sum, comp) => sum + comp.performanceScore, 0) / 
                          report.componentBreakdown.length;
      expect(averageScore).toBeGreaterThan(70); // Minimum acceptable score

      console.log('Comprehensive Performance Report:', {
        operationDuration: operationResult.duration,
        renderMetrics: report.summary,
        componentCount: report.componentBreakdown.length,
        averageScore,
        recommendations: report.recommendations.length,
        slowRenders: report.slowRenders.length
      });
    });

    test('should detect and report performance regressions', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      const mockSupabase = require('../lib/supabase');
      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      // Simulate a performance test run
      const testRun = {
        timestamp: new Date().toISOString(),
        testType: 'regression-detection',
        metrics: {}
      };

      const transitionTracker = LoginTransitionTracker.startLoginToDashboard();

      render(
        <PerformanceProfiler id="regression-detection">
          <TestWrapper>
            <App />
          </TestWrapper>
        </PerformanceProfiler>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      const transition = transitionTracker.end();
      const report = generatePerformanceReport();

      // Collect test metrics
      testRun.metrics = {
        transitionTime: transition.duration,
        averageRenderTime: report.summary.averageRenderTime,
        slowRenders: report.slowRenders.length,
        componentScores: report.componentBreakdown.map(c => c.performanceScore)
      };

      // Check for regressions against thresholds
      const regressions = [];

      if (transition.duration > REGRESSION_THRESHOLDS.LOGIN_TO_DASHBOARD.baseline * REGRESSION_THRESHOLDS.LOGIN_TO_DASHBOARD.regression) {
        regressions.push({
          type: 'transition',
          metric: 'login-to-dashboard',
          actual: transition.duration,
          threshold: REGRESSION_THRESHOLDS.LOGIN_TO_DASHBOARD.baseline * REGRESSION_THRESHOLDS.LOGIN_TO_DASHBOARD.regression
        });
      }

      if (report.summary.averageRenderTime > REGRESSION_THRESHOLDS.COMPONENT_RENDER.baseline * REGRESSION_THRESHOLDS.COMPONENT_RENDER.regression) {
        regressions.push({
          type: 'rendering',
          metric: 'average-render-time',
          actual: report.summary.averageRenderTime,
          threshold: REGRESSION_THRESHOLDS.COMPONENT_RENDER.baseline * REGRESSION_THRESHOLDS.COMPONENT_RENDER.regression
        });
      }

      // Should not have any regressions
      expect(regressions).toHaveLength(0);

      console.log('Regression Detection Report:', {
        testRun,
        regressions,
        passed: regressions.length === 0,
        thresholds: REGRESSION_THRESHOLDS
      });
    });
  });
});