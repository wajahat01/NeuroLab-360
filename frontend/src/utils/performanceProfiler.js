/**
 * React DevTools Profiler Integration
 * Monitors component render cycles and performance metrics
 */

import React, { Profiler } from 'react';

// Performance metrics storage
let performanceData = {
  renders: [],
  componentMetrics: new Map(),
  transitions: [],
  summary: {
    totalRenders: 0,
    averageRenderTime: 0,
    slowRenders: 0,
    totalTime: 0
  }
};

// Performance thresholds
const PERFORMANCE_THRESHOLDS = {
  SLOW_RENDER: 50, // 50ms - more lenient for development
  VERY_SLOW_RENDER: 100, // 100ms
  COMPONENT_MOUNT_THRESHOLD: 100, // 100ms
  TRANSITION_THRESHOLD: 2000 // 2 seconds
};

/**
 * Profiler callback to capture render performance data
 */
export const onRenderCallback = (id, phase, actualDuration, baseDuration, startTime, commitTime, interactions) => {
  const renderData = {
    id,
    phase,
    actualDuration,
    baseDuration,
    startTime,
    commitTime,
    interactions: interactions ? Array.from(interactions) : [],
    timestamp: Date.now(),
    isSlow: actualDuration > PERFORMANCE_THRESHOLDS.SLOW_RENDER,
    isVerySlow: actualDuration > PERFORMANCE_THRESHOLDS.VERY_SLOW_RENDER
  };

  // Store render data
  performanceData.renders.push(renderData);

  // Update component-specific metrics
  updateComponentMetrics(id, renderData);

  // Update summary statistics
  updateSummaryMetrics(renderData);

  // Log slow renders in development
  if (process.env.NODE_ENV === 'development' && renderData.isSlow) {
    console.warn(`Slow render detected: ${id} took ${actualDuration.toFixed(2)}ms (${phase})`);
  }

  // Log very slow renders
  if (renderData.isVerySlow) {
    console.error(`Very slow render: ${id} took ${actualDuration.toFixed(2)}ms (${phase})`);
  }
};

/**
 * Update component-specific performance metrics
 */
function updateComponentMetrics(componentId, renderData) {
  if (!performanceData.componentMetrics.has(componentId)) {
    performanceData.componentMetrics.set(componentId, {
      totalRenders: 0,
      totalDuration: 0,
      averageDuration: 0,
      slowRenders: 0,
      mountTime: null,
      updateTimes: [],
      phases: {
        mount: 0,
        update: 0
      }
    });
  }

  const metrics = performanceData.componentMetrics.get(componentId);
  
  metrics.totalRenders++;
  metrics.totalDuration += renderData.actualDuration;
  metrics.averageDuration = metrics.totalDuration / metrics.totalRenders;
  
  if (renderData.isSlow) {
    metrics.slowRenders++;
  }

  // Track mount vs update performance
  if (renderData.phase === 'mount') {
    metrics.phases.mount++;
    if (!metrics.mountTime || renderData.actualDuration > metrics.mountTime) {
      metrics.mountTime = renderData.actualDuration;
    }
  } else if (renderData.phase === 'update') {
    metrics.phases.update++;
    metrics.updateTimes.push(renderData.actualDuration);
  }

  performanceData.componentMetrics.set(componentId, metrics);
}

/**
 * Update summary performance metrics
 */
function updateSummaryMetrics(renderData) {
  performanceData.summary.totalRenders++;
  performanceData.summary.totalTime += renderData.actualDuration;
  performanceData.summary.averageRenderTime = 
    performanceData.summary.totalTime / performanceData.summary.totalRenders;
  
  if (renderData.isSlow) {
    performanceData.summary.slowRenders++;
  }
}

/**
 * Performance Profiler HOC
 */
export const withPerformanceProfiler = (WrappedComponent, componentName) => {
  const ProfiledComponent = React.forwardRef((props, ref) => (
    <Profiler id={componentName || WrappedComponent.name} onRender={onRenderCallback}>
      <WrappedComponent {...props} ref={ref} />
    </Profiler>
  ));

  ProfiledComponent.displayName = `withPerformanceProfiler(${componentName || WrappedComponent.name})`;
  
  return ProfiledComponent;
};

/**
 * Performance Profiler component wrapper
 */
export const PerformanceProfiler = ({ id, children, onRender = onRenderCallback }) => (
  <Profiler id={id} onRender={onRender}>
    {children}
  </Profiler>
);

/**
 * Login to Dashboard transition tracker
 */
export class LoginTransitionTracker {
  constructor(type) {
    this.type = type;
    this.startTime = performance.now();
    this.markers = [];
    this.metadata = {};
  }

  static startLoginToDashboard() {
    return new LoginTransitionTracker('login-to-dashboard');
  }

  static startAuthCheck() {
    return new LoginTransitionTracker('auth-check');
  }

  static startDashboardLoad() {
    return new LoginTransitionTracker('dashboard-load');
  }

  addMarker(name, data = {}) {
    this.markers.push({
      name,
      timestamp: performance.now(),
      data
    });
    return this;
  }

  setMetadata(key, value) {
    this.metadata[key] = value;
    return this;
  }

  end(additionalData = {}) {
    const endTime = performance.now();
    const duration = endTime - this.startTime;

    const transition = {
      type: this.type,
      startTime: this.startTime,
      endTime,
      duration,
      markers: this.markers,
      metadata: this.metadata,
      ...additionalData,
      timestamp: new Date().toISOString()
    };

    // Store transition data
    performanceData.transitions.push(transition);

    // Log slow transitions
    if (duration > PERFORMANCE_THRESHOLDS.TRANSITION_THRESHOLD) {
      console.warn(`Slow transition detected: ${this.type} took ${duration.toFixed(2)}ms`);
    }

    return transition;
  }
}

/**
 * Performance monitoring utilities
 */
export const PerformanceMonitor = {
  /**
   * Start monitoring a specific operation
   */
  startOperation(name) {
    const startTime = performance.now();
    
    return {
      end: (metadata = {}) => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        const operation = {
          name,
          startTime,
          endTime,
          duration,
          metadata,
          timestamp: new Date().toISOString()
        };

        // Store operation data
        if (!performanceData.operations) {
          performanceData.operations = [];
        }
        performanceData.operations.push(operation);

        return operation;
      }
    };
  },

  /**
   * Measure function execution time
   */
  measureFunction(fn, name) {
    return async (...args) => {
      const operation = this.startOperation(name || fn.name);
      
      try {
        const result = await fn(...args);
        operation.end({ success: true });
        return result;
      } catch (error) {
        operation.end({ success: false, error: error.message });
        throw error;
      }
    };
  },

  /**
   * Create a performance observer for Web Vitals
   */
  observeWebVitals() {
    if (typeof PerformanceObserver === 'undefined') {
      console.warn('PerformanceObserver not supported');
      return null;
    }

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      
      entries.forEach((entry) => {
        if (entry.entryType === 'largest-contentful-paint') {
          console.log('LCP:', entry.startTime);
        } else if (entry.entryType === 'first-input') {
          console.log('FID:', entry.processingStart - entry.startTime);
        } else if (entry.entryType === 'layout-shift') {
          if (!entry.hadRecentInput) {
            console.log('CLS:', entry.value);
          }
        }
      });
    });

    try {
      observer.observe({ entryTypes: ['largest-contentful-paint', 'first-input', 'layout-shift'] });
      return observer;
    } catch (error) {
      console.warn('Failed to observe web vitals:', error);
      return null;
    }
  }
};

/**
 * Get current performance metrics
 */
export const getPerformanceMetrics = () => {
  return {
    ...performanceData,
    componentMetrics: new Map(performanceData.componentMetrics)
  };
};

/**
 * Clear performance metrics
 */
export const clearPerformanceMetrics = () => {
  performanceData = {
    renders: [],
    componentMetrics: new Map(),
    transitions: [],
    summary: {
      totalRenders: 0,
      averageRenderTime: 0,
      slowRenders: 0,
      totalTime: 0
    }
  };
};

/**
 * Generate performance report
 */
export const generatePerformanceReport = () => {
  const metrics = getPerformanceMetrics();
  
  const report = {
    timestamp: new Date().toISOString(),
    summary: metrics.summary,
    componentBreakdown: Array.from(metrics.componentMetrics.entries()).map(([id, metric]) => ({
      componentId: id,
      ...metric,
      performanceScore: calculatePerformanceScore(metric)
    })),
    transitions: metrics.transitions,
    slowRenders: metrics.renders.filter(r => r.isSlow),
    recommendations: generateRecommendations(metrics)
  };

  return report;
};

/**
 * Calculate performance score for a component
 */
function calculatePerformanceScore(metric) {
  let score = 100;
  
  // Penalize slow average render time
  if (metric.averageDuration > PERFORMANCE_THRESHOLDS.SLOW_RENDER) {
    score -= 20;
  }
  
  // Penalize high percentage of slow renders
  const slowRenderPercentage = (metric.slowRenders / metric.totalRenders) * 100;
  if (slowRenderPercentage > 10) {
    score -= 30;
  }
  
  // Penalize slow mount time
  if (metric.mountTime > PERFORMANCE_THRESHOLDS.COMPONENT_MOUNT_THRESHOLD) {
    score -= 25;
  }
  
  return Math.max(0, score);
}

/**
 * Generate performance recommendations
 */
function generateRecommendations(metrics) {
  const recommendations = [];
  
  // Check overall render performance
  if (metrics.summary.averageRenderTime > PERFORMANCE_THRESHOLDS.SLOW_RENDER) {
    recommendations.push({
      type: 'performance',
      severity: 'high',
      message: 'Average render time is above 16ms threshold',
      suggestion: 'Consider using React.memo, useMemo, or useCallback to optimize renders'
    });
  }
  
  // Check for components with poor performance
  metrics.componentMetrics.forEach((metric, componentId) => {
    const score = calculatePerformanceScore(metric);
    
    if (score < 70) {
      recommendations.push({
        type: 'component',
        severity: score < 50 ? 'high' : 'medium',
        componentId,
        message: `Component ${componentId} has poor performance (score: ${score})`,
        suggestion: 'Review component implementation for optimization opportunities'
      });
    }
  });
  
  // Check transition performance
  const slowTransitions = metrics.transitions.filter(t => t.duration > PERFORMANCE_THRESHOLDS.TRANSITION_THRESHOLD);
  if (slowTransitions.length > 0) {
    recommendations.push({
      type: 'transition',
      severity: 'medium',
      message: `${slowTransitions.length} slow transitions detected`,
      suggestion: 'Optimize authentication flow and component loading'
    });
  }
  
  return recommendations;
};

export default {
  withPerformanceProfiler,
  PerformanceProfiler,
  LoginTransitionTracker,
  PerformanceMonitor,
  getPerformanceMetrics,
  clearPerformanceMetrics,
  generatePerformanceReport,
  onRenderCallback
};