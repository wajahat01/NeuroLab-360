import {
  onRenderCallback,
  trackTransition,
  getPerformanceMetrics,
  clearPerformanceMetrics,
  usePerformanceTracking
} from '../performanceMonitor';
import { renderHook } from '@testing-library/react';

describe('Performance Monitor', () => {
  beforeEach(() => {
    clearPerformanceMetrics();
    // Mock console methods
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onRenderCallback', () => {
    test('should record render metrics', () => {
      onRenderCallback('TestComponent', 'mount', 10, 15, 100, 110);
      
      const metrics = getPerformanceMetrics();
      
      expect(metrics.renders).toHaveLength(1);
      expect(metrics.renders[0]).toMatchObject({
        id: 'TestComponent',
        phase: 'mount',
        actualDuration: 10,
        baseDuration: 15,
        startTime: 100,
        commitTime: 110
      });
    });

    test('should calculate efficiency correctly', () => {
      onRenderCallback('TestComponent', 'mount', 10, 20, 100, 110);
      
      const metrics = getPerformanceMetrics();
      
      expect(metrics.renders[0].efficiency).toBe(0.5); // (20-10)/20 = 0.5
    });

    test('should track component-specific metrics', () => {
      onRenderCallback('TestComponent', 'mount', 10, 15, 100, 110);
      onRenderCallback('TestComponent', 'update', 5, 8, 200, 205);
      
      const metrics = getPerformanceMetrics();
      const componentMetric = metrics.componentMetrics.get('TestComponent');
      
      expect(componentMetric.totalRenders).toBe(2);
      expect(componentMetric.totalDuration).toBe(15);
      expect(componentMetric.averageDuration).toBe(7.5);
      expect(componentMetric.mountTime).toBe(10);
      expect(componentMetric.updateTimes).toEqual([5]);
    });

    test('should warn about slow renders in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      onRenderCallback('SlowComponent', 'mount', 20, 15, 100, 120);
      
      expect(console.warn).toHaveBeenCalledWith(
        'Slow render detected in SlowComponent: 20.00ms'
      );
      
      process.env.NODE_ENV = originalEnv;
    });

    test('should warn about inefficient updates in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      onRenderCallback('InefficientComponent', 'update', 30, 10, 100, 130);
      
      expect(console.warn).toHaveBeenCalledWith(
        'Inefficient update in InefficientComponent: actual 30.00ms vs base 10.00ms'
      );
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('trackTransition', () => {
    test('should track transition timing', () => {
      const startTime = Date.now();
      const tracker = trackTransition('test-transition', startTime);
      
      // Simulate some delay
      const endTime = startTime + 100;
      jest.spyOn(Date, 'now').mockReturnValue(endTime);
      
      const result = tracker.end({ success: true });
      
      expect(result.name).toBe('test-transition');
      expect(result.startTime).toBe(startTime);
      expect(result.endTime).toBe(endTime);
      expect(result.duration).toBe(100);
      expect(result.metadata.success).toBe(true);
      
      const metrics = getPerformanceMetrics();
      expect(metrics.transitions).toHaveLength(1);
      expect(metrics.transitions[0]).toEqual(result);
    });

    test('should warn about slow transitions in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const startTime = Date.now();
      const tracker = trackTransition('slow-transition', startTime);
      
      // Simulate slow transition (>1000ms)
      const endTime = startTime + 1500;
      jest.spyOn(Date, 'now').mockReturnValue(endTime);
      
      tracker.end();
      
      expect(console.warn).toHaveBeenCalledWith(
        'Slow transition detected: slow-transition took 1500ms'
      );
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('getPerformanceMetrics', () => {
    test('should return comprehensive metrics summary', () => {
      // Add some test data
      onRenderCallback('Component1', 'mount', 10, 15, 100, 110);
      onRenderCallback('Component2', 'mount', 20, 25, 200, 220);
      
      const tracker = trackTransition('test-transition');
      tracker.end();
      
      const metrics = getPerformanceMetrics();
      
      expect(metrics.summary.totalRenders).toBe(2);
      expect(metrics.summary.averageRenderTime).toBe(15); // (10+20)/2
      expect(metrics.summary.slowRenders).toBe(1); // 20ms > 16ms
      expect(metrics.summary.totalTransitions).toBe(1);
      expect(metrics.componentMetrics.size).toBe(2);
    });

    test('should handle empty metrics', () => {
      const metrics = getPerformanceMetrics();
      
      expect(metrics.summary.totalRenders).toBe(0);
      expect(metrics.summary.averageRenderTime).toBe(0);
      expect(metrics.summary.slowRenders).toBe(0);
      expect(metrics.summary.totalTransitions).toBe(0);
      expect(metrics.summary.averageTransitionTime).toBe(0);
    });
  });

  describe('clearPerformanceMetrics', () => {
    test('should clear all metrics', () => {
      // Add some test data
      onRenderCallback('TestComponent', 'mount', 10, 15, 100, 110);
      trackTransition('test-transition').end();
      
      let metrics = getPerformanceMetrics();
      expect(metrics.renders).toHaveLength(1);
      expect(metrics.transitions).toHaveLength(1);
      expect(metrics.componentMetrics.size).toBe(1);
      
      clearPerformanceMetrics();
      
      metrics = getPerformanceMetrics();
      expect(metrics.renders).toHaveLength(0);
      expect(metrics.transitions).toHaveLength(0);
      expect(metrics.componentMetrics.size).toBe(0);
    });
  });

  describe('usePerformanceTracking', () => {
    test('should provide transition tracking functionality', () => {
      const { result } = renderHook(() => usePerformanceTracking('TestComponent'));
      
      expect(result.current.startTransition).toBeInstanceOf(Function);
      expect(result.current.logRender).toBeInstanceOf(Function);
    });

    test('should create component-specific transitions', () => {
      const { result } = renderHook(() => usePerformanceTracking('TestComponent'));
      
      const tracker = result.current.startTransition('test-action');
      tracker.end();
      
      const metrics = getPerformanceMetrics();
      expect(metrics.transitions[0].name).toBe('TestComponent-test-action');
    });

    test('should log renders in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const { result } = renderHook(() => usePerformanceTracking('TestComponent'));
      
      result.current.logRender('mount', 15.5);
      
      expect(console.log).toHaveBeenCalledWith('TestComponent mount: 15.50ms');
      
      process.env.NODE_ENV = originalEnv;
    });
  });
});