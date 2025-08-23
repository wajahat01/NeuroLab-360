import React, { useEffect } from 'react';
import { 
  PerformanceProfiler, 
  LoginTransitionTracker as TransitionTracker,
  PerformanceMonitor as Monitor,
  generatePerformanceReport
} from '../utils/performanceProfiler';

/**
 * Higher-Order Component for performance monitoring
 */
export const withPerformanceMonitoring = (WrappedComponent, componentName) => {
  const PerformanceMonitoredComponent = React.forwardRef((props, ref) => {
    return (
      <PerformanceProfiler id={componentName}>
        <WrappedComponent {...props} ref={ref} />
      </PerformanceProfiler>
    );
  });

  PerformanceMonitoredComponent.displayName = `withPerformanceMonitoring(${componentName})`;
  
  return PerformanceMonitoredComponent;
};

/**
 * Performance monitoring wrapper for the entire app
 */
export const AppPerformanceMonitor = ({ children }) => {
  useEffect(() => {
    // Initialize Web Vitals monitoring in production
    if (process.env.NODE_ENV === 'production') {
      const observer = Monitor.observeWebVitals();
      
      return () => {
        if (observer) {
          observer.disconnect();
        }
      };
    }
  }, []);

  useEffect(() => {
    // Log performance report periodically in development
    if (process.env.NODE_ENV === 'development') {
      const interval = setInterval(() => {
        const report = generatePerformanceReport();
        if (report.summary.totalRenders > 0) {
          console.log('Performance Report:', report);
        }
      }, 30000); // Every 30 seconds

      return () => clearInterval(interval);
    }
  }, []);

  return (
    <PerformanceProfiler id="App">
      {children}
    </PerformanceProfiler>
  );
};

/**
 * Dashboard-specific performance monitor
 */
export const DashboardPerformanceMonitor = ({ children }) => {
  return (
    <PerformanceProfiler id="Dashboard">
      {children}
    </PerformanceProfiler>
  );
};

/**
 * Login transition tracker
 */
export const LoginTransitionTracker = {
  startLoginToDashboard: () => {
    return TransitionTracker.startLoginToDashboard();
  },
  
  startAuthCheck: () => {
    return TransitionTracker.startAuthCheck();
  },
  
  startDashboardLoad: () => {
    return TransitionTracker.startDashboardLoad();
  }
};

/**
 * Performance monitoring hook for components
 */
export const usePerformanceMonitoring = (componentName) => {
  useEffect(() => {
    const operation = Monitor.startOperation(`${componentName}-mount`);
    
    return () => {
      operation.end({ phase: 'unmount' });
    };
  }, [componentName]);

  const measureOperation = (operationName, fn) => {
    return Monitor.measureFunction(fn, `${componentName}-${operationName}`);
  };

  return { measureOperation };
};