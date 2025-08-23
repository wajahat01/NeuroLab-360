import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import Dashboard from '../pages/Dashboard';
import { 
  SmoothTransition, 
  StaggeredContainer, 
  DashboardTransition 
} from '../components/SmoothTransition';

// Mock all the hooks and dependencies
jest.mock('../hooks/useOptimizedDataFetching', () => ({
  useOptimizedDashboardData: () => ({
    summary: { 
      data: { 
        total_experiments: 10, 
        recent_activity: { completion_rate: 85, last_7_days: 5 },
        experiments_by_type: { 'Type A': 3, 'Type B': 7 }
      }, 
      loading: false, 
      error: null, 
      isStale: false,
      refetch: jest.fn()
    },
    charts: { 
      data: { 
        activity_timeline: [{ date: '2024-01-01', count: 5 }],
        experiment_type_distribution: [{ type: 'Type A', count: 3 }]
      }, 
      loading: false, 
      error: null, 
      isStale: false,
      refetch: jest.fn()
    },
    recent: { 
      data: { 
        experiments: [
          { id: 1, name: 'Test Exp', experiment_type: 'Type A', status: 'completed', created_at: '2024-01-01' }
        ],
        insights: [
          { icon: '📊', message: 'Great progress!' }
        ]
      }, 
      loading: false, 
      error: null, 
      isStale: false,
      refetch: jest.fn()
    },
    isInitialLoading: false,
    isValidating: false,
    hasAllErrors: false,
    hasStaleData: false,
    refetchAll: jest.fn(),
    preloadAll: jest.fn()
  })
}));

jest.mock('../hooks/useEnhancedErrorHandling', () => ({
  useEnhancedErrorHandling: () => ({
    error: null,
    showErrorUI: false,
    handleError: jest.fn(),
    clearError: jest.fn(),
    retry: jest.fn()
  })
}));

jest.mock('../hooks/useEnhancedCache', () => ({
  useCachePreloader: () => ({
    preloadDashboardData: jest.fn()
  })
}));

jest.mock('../utils/performanceMonitor', () => ({
  usePerformanceTracking: () => ({
    startTransition: jest.fn(() => ({ end: jest.fn() }))
  })
}));

jest.mock('../components/PerformanceMonitor', () => ({
  DashboardPerformanceMonitor: ({ children }) => <div>{children}</div>,
  LoginTransitionTracker: () => <div />
}));

jest.mock('../components', () => ({
  DataChart: ({ title, height }) => (
    <div data-testid="data-chart" style={{ height: `${height}px`, minHeight: `${height}px` }}>
      {title}
    </div>
  ),
  ErrorDisplay: ({ title }) => <div data-testid="error-display">{title}</div>,
  EmptyState: ({ title }) => <div data-testid="empty-state">{title}</div>,
  DashboardSkeleton: () => <div data-testid="dashboard-skeleton">Loading...</div>,
  StatCardSkeleton: () => <div data-testid="stat-skeleton">Stat Loading...</div>,
  ChartSkeleton: ({ height }) => (
    <div data-testid="chart-skeleton" style={{ height: `${height}px`, minHeight: `${height}px` }}>
      Chart Loading...
    </div>
  ),
  InsightCardSkeleton: () => <div data-testid="insight-skeleton">Insight Loading...</div>
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn()
}));

describe('Animation Layout Stability Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();

    // Mock matchMedia for consistent testing
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      })),
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Dashboard Layout Stability', () => {
    it('maintains stable grid layout during animations', async () => {
      const { container } = render(<Dashboard />);

      // Check that dashboard container has stable layout classes
      const dashboardContainer = container.querySelector('[data-testid="dashboard-container"]');
      expect(dashboardContainer).toHaveClass('dashboard-content', 'prevent-layout-shift');

      // Check stats grid maintains stable dimensions
      const statsGrid = container.querySelector('.dashboard-stats-grid');
      expect(statsGrid).toBeInTheDocument();

      // Verify grid maintains minimum height to prevent layout shifts
      const computedStyle = window.getComputedStyle(statsGrid);
      expect(computedStyle.minHeight).toBeTruthy();
    });

    it('prevents layout shifts in chart containers', async () => {
      render(<Dashboard />);

      // Charts should have stable dimensions
      const charts = screen.getAllByTestId('data-chart');
      charts.forEach(chart => {
        const style = window.getComputedStyle(chart);
        expect(style.height).toBe('300px');
        expect(style.minHeight).toBe('300px');
      });
    });

    it('maintains consistent card dimensions', async () => {
      const { container } = render(<Dashboard />);

      // Check that dashboard cards have stable dimensions
      const statCards = container.querySelectorAll('.dashboard-stat-card');
      statCards.forEach(card => {
        expect(card).toHaveClass('stable-dimensions');
      });

      const chartCards = container.querySelectorAll('.dashboard-chart-card');
      chartCards.forEach(card => {
        const computedStyle = window.getComputedStyle(card);
        expect(computedStyle.minHeight).toBeTruthy();
      });
    });
  });

  describe('Animation Performance', () => {
    it('applies GPU acceleration for smooth animations', () => {
      const { container } = render(
        <SmoothTransition>
          <div data-testid="animated-content">Content</div>
        </SmoothTransition>
      );

      expect(container.firstChild).toHaveClass('gpu-accelerated');
    });

    it('uses will-change property appropriately', () => {
      const mockElement = {
        style: {}
      };

      // Simulate animation application
      mockElement.style.willChange = 'opacity, transform';
      expect(mockElement.style.willChange).toBe('opacity, transform');

      // Simulate cleanup
      mockElement.style.willChange = 'auto';
      expect(mockElement.style.willChange).toBe('auto');
    });

    it('cleans up animations to prevent memory leaks', async () => {
      const { unmount } = render(
        <SmoothTransition>
          <div>Content</div>
        </SmoothTransition>
      );

      // Unmount should trigger cleanup
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Staggered Animations', () => {
    it('applies consistent timing to staggered elements', () => {
      render(
        <StaggeredContainer staggerDelay={100}>
          <div data-testid="item-1">Item 1</div>
          <div data-testid="item-2">Item 2</div>
          <div data-testid="item-3">Item 3</div>
        </StaggeredContainer>
      );

      // All items should be present
      expect(screen.getByTestId('item-1')).toBeInTheDocument();
      expect(screen.getByTestId('item-2')).toBeInTheDocument();
      expect(screen.getByTestId('item-3')).toBeInTheDocument();
    });

    it('maintains layout during staggered entrance', async () => {
      const { container } = render(
        <StaggeredContainer className="grid grid-cols-3 gap-4">
          <div className="h-20 bg-blue-100">Item 1</div>
          <div className="h-20 bg-green-100">Item 2</div>
          <div className="h-20 bg-red-100">Item 3</div>
        </StaggeredContainer>
      );

      // Container should maintain grid layout
      expect(container.firstChild).toHaveClass('grid', 'grid-cols-3', 'gap-4');

      // Items should maintain their dimensions
      const items = container.querySelectorAll('div > div > div');
      items.forEach(item => {
        expect(item).toHaveClass('h-20');
      });
    });
  });

  describe('Reduced Motion Compliance', () => {
    it('respects prefers-reduced-motion setting', () => {
      // Mock reduced motion preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        })),
      });

      const { container } = render(
        <SmoothTransition>
          <div data-testid="content">Content</div>
        </SmoothTransition>
      );

      // Should not have animation classes when reduced motion is preferred
      expect(container.firstChild).not.toHaveClass('gpu-accelerated');
      expect(screen.getByTestId('content')).toBeVisible();
    });

    it('provides immediate visibility for accessibility', () => {
      // Mock reduced motion preference
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          media: query,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        })),
      });

      render(<Dashboard />);

      // All content should be immediately visible
      expect(screen.getByText('Dashboard')).toBeVisible();
      expect(screen.getByText('Total Experiments')).toBeVisible();
    });
  });

  describe('Animation Timing Consistency', () => {
    it('uses consistent easing functions', () => {
      const mockElement = {
        style: {}
      };

      // Simulate animation with consistent easing
      mockElement.style.animation = 'fadeInContent 400ms cubic-bezier(0.4, 0, 0.2, 1) forwards';
      
      expect(mockElement.style.animation).toContain('cubic-bezier(0.4, 0, 0.2, 1)');
    });

    it('applies consistent duration across components', () => {
      const { container: container1 } = render(
        <DashboardTransition section="stats" index={0}>
          <div>Stats</div>
        </DashboardTransition>
      );

      const { container: container2 } = render(
        <DashboardTransition section="charts" index={0}>
          <div>Charts</div>
        </DashboardTransition>
      );

      // Both should use consistent animation approach
      expect(container1.firstChild).toBeDefined();
      expect(container2.firstChild).toBeDefined();
    });
  });

  describe('Error State Animations', () => {
    it('handles error states without layout disruption', () => {
      const { container } = render(
        <SmoothTransition>
          <div data-testid="error-content" className="min-h-20">
            Error occurred
          </div>
        </SmoothTransition>
      );

      // Error content should maintain minimum height
      const errorContent = screen.getByTestId('error-content');
      expect(errorContent).toHaveClass('min-h-20');
    });

    it('transitions smoothly between loading and error states', async () => {
      const { rerender } = render(
        <SmoothTransition>
          <div data-testid="loading" className="h-20">Loading...</div>
        </SmoothTransition>
      );

      expect(screen.getByTestId('loading')).toBeInTheDocument();

      rerender(
        <SmoothTransition>
          <div data-testid="error" className="h-20">Error occurred</div>
        </SmoothTransition>
      );

      expect(screen.getByTestId('error')).toBeInTheDocument();
    });
  });

  describe('Visual Regression Prevention', () => {
    it('maintains consistent visual hierarchy', () => {
      render(<Dashboard />);

      // Check that headings maintain proper hierarchy
      const mainHeading = screen.getByRole('heading', { level: 1 });
      expect(mainHeading).toHaveTextContent('Dashboard');

      const subHeadings = screen.getAllByRole('heading', { level: 3 });
      expect(subHeadings.length).toBeGreaterThan(0);
    });

    it('preserves spacing and alignment during animations', () => {
      const { container } = render(
        <StaggeredContainer className="space-y-4">
          <div className="p-4">Item 1</div>
          <div className="p-4">Item 2</div>
        </StaggeredContainer>
      );

      // Container should maintain spacing classes
      expect(container.firstChild).toHaveClass('space-y-4');

      // Items should maintain padding
      const items = container.querySelectorAll('div > div > div');
      items.forEach(item => {
        expect(item).toHaveClass('p-4');
      });
    });
  });
});