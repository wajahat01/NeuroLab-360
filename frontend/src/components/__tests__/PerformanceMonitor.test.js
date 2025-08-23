import React from 'react';
import { render, screen } from '@testing-library/react';
import { 
  AppPerformanceMonitor,
  DashboardPerformanceMonitor,
  LoginTransitionTracker,
  withPerformanceMonitoring
} from '../PerformanceMonitor';
import { PerformanceProfiler } from '../../utils/performanceProfiler';
import { clearPerformanceMetrics, getPerformanceMetrics } from '../../utils/performanceMonitor';

// Mock the performance monitoring utilities
jest.mock('../../utils/performanceMonitor', () => ({
  ...jest.requireActual('../../utils/performanceMonitor'),
  onRenderCallback: jest.fn(),
  trackTransition: jest.fn(() => ({
    end: jest.fn(() => ({ name: 'test', duration: 100 }))
  })),
  clearPerformanceMetrics: jest.fn(),
  getPerformanceMetrics: jest.fn(() => ({
    renders: [],
    transitions: [],
    componentMetrics: new Map()
  }))
}));

const TestComponent = ({ children }) => (
  <div data-testid="test-component">{children}</div>
);

describe('PerformanceMonitor Components', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PerformanceProfiler', () => {
    test('should render children with profiler wrapper', () => {
      render(
        <PerformanceProfiler id="test-profiler">
          <TestComponent>Test Content</TestComponent>
        </PerformanceProfiler>
      );

      expect(screen.getByTestId('test-component')).toBeInTheDocument();
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    test('should use custom onRender callback when provided', () => {
      const customOnRender = jest.fn();
      
      render(
        <PerformanceProfiler id="test-profiler" onRender={customOnRender}>
          <TestComponent>Test Content</TestComponent>
        </PerformanceProfiler>
      );

      // The custom callback should be used instead of the default
      expect(screen.getByTestId('test-component')).toBeInTheDocument();
    });
  });

  describe('AppPerformanceMonitor', () => {
    test('should wrap children in performance profiler', () => {
      render(
        <AppPerformanceMonitor>
          <TestComponent>App Content</TestComponent>
        </AppPerformanceMonitor>
      );

      expect(screen.getByTestId('test-component')).toBeInTheDocument();
      expect(screen.getByText('App Content')).toBeInTheDocument();
    });
  });

  describe('DashboardPerformanceMonitor', () => {
    test('should wrap children in dashboard-specific profiler', () => {
      render(
        <DashboardPerformanceMonitor>
          <TestComponent>Dashboard Content</TestComponent>
        </DashboardPerformanceMonitor>
      );

      expect(screen.getByTestId('test-component')).toBeInTheDocument();
      expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
    });
  });

  describe('LoginTransitionTracker', () => {
    test('should provide transition tracking methods', () => {
      expect(LoginTransitionTracker.startLoginToDashboard).toBeInstanceOf(Function);
      expect(LoginTransitionTracker.startAuthCheck).toBeInstanceOf(Function);
      expect(LoginTransitionTracker.startDashboardLoad).toBeInstanceOf(Function);
    });

    test('should track login to dashboard transition', () => {
      const { trackTransition } = require('../../utils/performanceMonitor');
      
      LoginTransitionTracker.startLoginToDashboard();
      
      expect(trackTransition).toHaveBeenCalledWith('login-to-dashboard');
    });

    test('should track auth check transition', () => {
      const { trackTransition } = require('../../utils/performanceMonitor');
      
      LoginTransitionTracker.startAuthCheck();
      
      expect(trackTransition).toHaveBeenCalledWith('auth-check');
    });

    test('should track dashboard load transition', () => {
      const { trackTransition } = require('../../utils/performanceMonitor');
      
      LoginTransitionTracker.startDashboardLoad();
      
      expect(trackTransition).toHaveBeenCalledWith('dashboard-load');
    });
  });

  describe('withPerformanceMonitoring HOC', () => {
    test('should wrap component with performance monitoring', () => {
      const MonitoredComponent = withPerformanceMonitoring(TestComponent, 'TestComponent');
      
      render(
        <MonitoredComponent>HOC Content</MonitoredComponent>
      );

      expect(screen.getByTestId('test-component')).toBeInTheDocument();
      expect(screen.getByText('HOC Content')).toBeInTheDocument();
    });

    test('should set correct display name', () => {
      const MonitoredComponent = withPerformanceMonitoring(TestComponent, 'TestComponent');
      
      expect(MonitoredComponent.displayName).toBe('withPerformanceMonitoring(TestComponent)');
    });

    test('should forward refs correctly', () => {
      const RefTestComponent = React.forwardRef((props, ref) => (
        <div ref={ref} data-testid="ref-component" {...props} />
      ));
      
      const MonitoredComponent = withPerformanceMonitoring(RefTestComponent, 'RefTestComponent');
      const ref = React.createRef();
      
      render(<MonitoredComponent ref={ref}>Ref Content</MonitoredComponent>);
      
      expect(ref.current).toBeInstanceOf(HTMLDivElement);
      expect(screen.getByTestId('ref-component')).toBeInTheDocument();
    });
  });

  describe('Performance Monitoring Integration', () => {
    test('should not interfere with normal component rendering', () => {
      const ComplexComponent = () => {
        const [count, setCount] = React.useState(0);
        
        return (
          <div>
            <span data-testid="count">{count}</span>
            <button 
              data-testid="increment" 
              onClick={() => setCount(c => c + 1)}
            >
              Increment
            </button>
          </div>
        );
      };

      const MonitoredComplexComponent = withPerformanceMonitoring(ComplexComponent, 'ComplexComponent');
      
      render(
        <AppPerformanceMonitor>
          <MonitoredComplexComponent />
        </AppPerformanceMonitor>
      );

      expect(screen.getByTestId('count')).toHaveTextContent('0');
      
      // Component should function normally
      screen.getByTestId('increment').click();
      expect(screen.getByTestId('count')).toHaveTextContent('1');
    });

    test('should handle component errors gracefully', () => {
      const ErrorComponent = () => {
        throw new Error('Test error');
      };

      const MonitoredErrorComponent = withPerformanceMonitoring(ErrorComponent, 'ErrorComponent');
      
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();
      
      expect(() => {
        render(
          <AppPerformanceMonitor>
            <MonitoredErrorComponent />
          </AppPerformanceMonitor>
        );
      }).toThrow('Test error');
      
      console.error = originalError;
    });
  });
});