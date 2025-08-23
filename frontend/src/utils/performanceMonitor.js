import { Profiler } from 'react';

/**
 * Performance monitoring utility for React components
 * Integrates with React DevTools Profiler to track render cycles
 */

// Store performance metrics
const performanceMetrics = {
  renders: [],
  transitions: [],
  componentMetrics: new Map()
};

/**
 * Callback function for React Profiler
 * @param {string} id - Component identifier
 * @param {string} phase - 'mount' or 'update'
 * @param {number} actualDuration - Time spent rendering
 * @param {number} baseDuration - Estimated time without memoization
 * @param {number} startTime - When rendering started
 * @param {number} commitTime - When changes were committed
 */
export const onRenderCallback = (id, phase, actualDuration, baseDuration, startTime, commitTime) => {
  const metric = {
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
    timestamp: Date.now(),
    efficiency: baseDuration > 0 ? (baseDuration - actualDuration) / baseDuration : 0
  };

  // Store the metric
  performanceMetrics.renders.push(metric);

  // Update component-specific metrics
  if (!performanceMetrics.componentMetrics.has(id)) {
    performanceMetrics.componentMetrics.set(id, {
      totalRenders: 0,
      totalDuration: 0,
      averageDuration: 0,
      mountTime: null,
      updateTimes: []
    });
  }

  const componentMetric = performanceMetrics.componentMetrics.get(id);
  componentMetric.totalRenders++;
  componentMetric.totalDuration += actualDuration;
  componentMetric.averageDuration = componentMetric.totalDuration / componentMetric.totalRenders;

  if (phase === 'mount') {
    componentMetric.mountTime = actualDuration;
  } else {
    componentMetric.updateTimes.push(actualDuration);
  }

  // Log performance issues in development
  if (process.env.NODE_ENV === 'development') {
    if (actualDuration > 16) { // More than one frame at 60fps
      console.warn(`Slow render detected in ${id}: ${actualDuration.toFixed(2)}ms`);
    }
    
    if (phase === 'update' && actualDuration > baseDuration * 1.5) {
      console.warn(`Inefficient update in ${id}: actual ${actualDuration.toFixed(2)}ms vs base ${baseDuration.toFixed(2)}ms`);
    }
  }
};

/**
 * Track login-to-dashboard transition timing
 */
export const trackTransition = (transitionName, startTime = Date.now()) => {
  return {
    end: (metadata = {}) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const transition = {
        name: transitionName,
        startTime,
        endTime,
        duration,
        metadata,
        timestamp: Date.now()
      };
      
      performanceMetrics.transitions.push(transition);
      
      // Log slow transitions
      if (process.env.NODE_ENV === 'development' && duration > 1000) {
        console.warn(`Slow transition detected: ${transitionName} took ${duration}ms`);
      }
      
      return transition;
    }
  };
};

/**
 * Get performance metrics for analysis
 */
export const getPerformanceMetrics = () => {
  return {
    ...performanceMetrics,
    summary: {
      totalRenders: performanceMetrics.renders.length,
      averageRenderTime: performanceMetrics.renders.length > 0 
        ? performanceMetrics.renders.reduce((sum, r) => sum + r.actualDuration, 0) / performanceMetrics.renders.length 
        : 0,
      slowRenders: performanceMetrics.renders.filter(r => r.actualDuration > 16).length,
      totalTransitions: performanceMetrics.transitions.length,
      averageTransitionTime: performanceMetrics.transitions.length > 0
        ? performanceMetrics.transitions.reduce((sum, t) => sum + t.duration, 0) / performanceMetrics.transitions.length
        : 0
    }
  };
};

/**
 * Clear performance metrics (useful for testing)
 */
export const clearPerformanceMetrics = () => {
  performanceMetrics.renders.length = 0;
  performanceMetrics.transitions.length = 0;
  performanceMetrics.componentMetrics.clear();
};

/**
 * Performance Profiler wrapper component
 */
export const PerformanceProfiler = ({ id, children, onRender = onRenderCallback }) => {
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
};

/**
 * Hook to measure component performance
 */
export const usePerformanceTracking = (componentName) => {
  const startTransition = (transitionName) => {
    return trackTransition(`${componentName}-${transitionName}`);
  };

  const logRender = (phase, duration) => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`${componentName} ${phase}: ${duration.toFixed(2)}ms`);
    }
  };

  return { startTransition, logRender };
};