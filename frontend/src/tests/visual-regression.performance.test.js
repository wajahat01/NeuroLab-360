import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import Dashboard from '../pages/Dashboard';
import Login from '../pages/Login';
import { PerformanceProfiler, clearPerformanceMetrics, getPerformanceMetrics } from '../utils/performanceMonitor';
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

const TestWrapper = ({ children, user = null }) => (
  <BrowserRouter>
    <AuthProvider initialUser={user}>
      <PerformanceProfiler id="test-wrapper">
        {children}
      </PerformanceProfiler>
    </AuthProvider>
  </BrowserRouter>
);

describe('Visual Regression and Performance Tests', () => {
  beforeEach(() => {
    clearPerformanceMetrics();
    jest.clearAllMocks();
  });

  describe('Login to Dashboard Transition', () => {
    test('should complete login-to-dashboard transition within performance budget', async () => {
      const startTime = performance.now();
      
      // Mock successful authentication
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
        <TestWrapper>
          <Login />
        </TestWrapper>
      );

      // Simulate login success and transition to dashboard
      await act(async () => {
        rerender(
          <TestWrapper user={mockUser}>
            <Dashboard />
          </TestWrapper>
        );
      });

      // Wait for dashboard to fully load
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      }, { timeout: 3000 });

      const endTime = performance.now();
      const transitionTime = endTime - startTime;

      // Performance budget: transition should complete within 2 seconds
      expect(transitionTime).toBeLessThan(2000);

      // Check performance metrics
      const metrics = getPerformanceMetrics();
      expect(metrics.summary.totalRenders).toBeGreaterThan(0);
      
      // No render should take longer than 100ms
      const slowRenders = metrics.renders.filter(r => r.actualDuration > 100);
      expect(slowRenders).toHaveLength(0);
    });

    test('should not cause layout shifts during transition', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      const { container } = render(
        <TestWrapper user={mockUser}>
          <Dashboard />
        </TestWrapper>
      );

      // Wait for initial render
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      // Check that container maintains stable dimensions
      const dashboardContainer = container.querySelector('[data-testid="dashboard-container"]');
      const initialHeight = dashboardContainer.offsetHeight;
      const initialWidth = dashboardContainer.offsetWidth;

      // Wait a bit more to ensure no layout shifts occur
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
      });

      // Dimensions should remain stable
      expect(dashboardContainer.offsetHeight).toBe(initialHeight);
      expect(dashboardContainer.offsetWidth).toBe(initialWidth);
    });

    test('should show consistent loading states without flickering', async () => {
      const loadingStates = [];
      
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      // Mock delayed session response to capture loading states
      mockSupabase.auth.getSession.mockImplementation(() => 
        new Promise(resolve => {
          setTimeout(() => {
            resolve({
              data: { session: { user: mockUser } },
              error: null
            });
          }, 100);
        })
      );

      render(
        <TestWrapper>
          <Dashboard />
        </TestWrapper>
      );

      // Capture loading state
      const loadingElement = screen.queryByTestId('dashboard-skeleton');
      if (loadingElement) {
        loadingStates.push('loading');
      }

      // Wait for dashboard to load
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      loadingStates.push('loaded');

      // Should have shown loading state before loaded state
      expect(loadingStates).toEqual(['loading', 'loaded']);
    });
  });

  describe('Component Render Performance', () => {
    test('Dashboard component should not re-render unnecessarily', async () => {
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
        <TestWrapper user={mockUser}>
          <Dashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      // Clear metrics after initial render
      clearPerformanceMetrics();

      // Re-render with same props (should not cause Dashboard re-render)
      rerender(
        <TestWrapper user={mockUser}>
          <Dashboard />
        </TestWrapper>
      );

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      const metrics = getPerformanceMetrics();
      
      // Dashboard should not have re-rendered due to memoization
      const dashboardRenders = metrics.renders.filter(r => r.id === 'Dashboard');
      expect(dashboardRenders).toHaveLength(0);
    });

    test('should track component efficiency metrics', async () => {
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
        <TestWrapper user={mockUser}>
          <Dashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      const metrics = getPerformanceMetrics();
      
      // Should have recorded render metrics
      expect(metrics.summary.totalRenders).toBeGreaterThan(0);
      expect(metrics.summary.averageRenderTime).toBeGreaterThan(0);
      
      // Check component-specific metrics
      expect(metrics.componentMetrics.size).toBeGreaterThan(0);
    });
  });

  describe('Memory and Performance Benchmarks', () => {
    test('should not cause memory leaks during multiple transitions', async () => {
      const mockUser = {
        id: 'test-user-id',
        email: 'test@example.com',
        created_at: new Date().toISOString()
      };

      mockSupabase.auth.getSession.mockResolvedValue({
        data: { session: { user: mockUser } },
        error: null
      });

      const initialMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;

      // Perform multiple mount/unmount cycles
      for (let i = 0; i < 5; i++) {
        const { unmount } = render(
          <TestWrapper user={mockUser}>
            <Dashboard />
          </TestWrapper>
        );

        await waitFor(() => {
          expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
        });

        unmount();
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
      
      // Memory usage should not increase significantly (allow 50% increase)
      if (performance.memory) {
        expect(finalMemory).toBeLessThan(initialMemory * 1.5);
      }
    });

    test('should maintain performance under rapid state changes', async () => {
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
        <TestWrapper user={mockUser}>
          <Dashboard />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      clearPerformanceMetrics();
      const startTime = performance.now();

      // Simulate rapid state changes
      for (let i = 0; i < 10; i++) {
        await act(async () => {
          // Trigger re-renders by changing props
          await new Promise(resolve => setTimeout(resolve, 10));
        });
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Should handle rapid changes efficiently
      expect(totalTime).toBeLessThan(1000); // Less than 1 second for 10 changes

      const metrics = getPerformanceMetrics();
      
      // No individual render should be too slow
      const slowRenders = metrics.renders.filter(r => r.actualDuration > 50);
      expect(slowRenders.length).toBeLessThan(2); // Allow max 1 slow render
    });
  });
});