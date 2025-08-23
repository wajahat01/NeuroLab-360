/**
 * Basic Performance Profiler Tests
 * 
 * Simple tests to verify the performance profiler is working correctly
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { 
  PerformanceProfiler, 
  LoginTransitionTracker,
  getPerformanceMetrics,
  clearPerformanceMetrics,
  generatePerformanceReport
} from '../utils/performanceProfiler';

// Simple test component
const TestComponent = ({ children }) => (
  <div data-testid="test-component">{children}</div>
);

describe('Performance Profiler Basic Tests', () => {
  beforeEach(() => {
    clearPerformanceMetrics();
  });

  test('should render component with profiler', () => {
    render(
      <PerformanceProfiler id="test-profiler">
        <TestComponent>Test Content</TestComponent>
      </PerformanceProfiler>
    );

    expect(screen.getByTestId('test-component')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  test('should collect performance metrics', () => {
    render(
      <PerformanceProfiler id="test-profiler">
        <TestComponent>Test Content</TestComponent>
      </PerformanceProfiler>
    );

    const metrics = getPerformanceMetrics();
    
    // Should have collected some render data
    expect(metrics.summary.totalRenders).toBeGreaterThan(0);
    expect(metrics.renders.length).toBeGreaterThan(0);
  });

  test('should track transitions', () => {
    const tracker = LoginTransitionTracker.startLoginToDashboard();
    
    // Add some markers
    tracker.addMarker('test-marker-1');
    tracker.addMarker('test-marker-2', { data: 'test' });
    
    const transition = tracker.end({ testData: 'complete' });
    
    expect(transition.type).toBe('login-to-dashboard');
    expect(transition.duration).toBeGreaterThan(0);
    expect(transition.markers).toHaveLength(2);
    expect(transition.markers[0].name).toBe('test-marker-1');
    expect(transition.markers[1].data).toEqual({ data: 'test' });
  });

  test('should generate performance report', () => {
    render(
      <PerformanceProfiler id="test-profiler">
        <TestComponent>Test Content</TestComponent>
      </PerformanceProfiler>
    );

    const report = generatePerformanceReport();
    
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('summary');
    expect(report).toHaveProperty('componentBreakdown');
    expect(report).toHaveProperty('recommendations');
    
    expect(report.summary.totalRenders).toBeGreaterThan(0);
  });

  test('should clear metrics', () => {
    render(
      <PerformanceProfiler id="test-profiler">
        <TestComponent>Test Content</TestComponent>
      </PerformanceProfiler>
    );

    let metrics = getPerformanceMetrics();
    expect(metrics.summary.totalRenders).toBeGreaterThan(0);

    clearPerformanceMetrics();
    
    metrics = getPerformanceMetrics();
    expect(metrics.summary.totalRenders).toBe(0);
    expect(metrics.renders).toHaveLength(0);
  });

  test('should handle multiple profilers', () => {
    render(
      <div>
        <PerformanceProfiler id="profiler-1">
          <TestComponent>Content 1</TestComponent>
        </PerformanceProfiler>
        <PerformanceProfiler id="profiler-2">
          <TestComponent>Content 2</TestComponent>
        </PerformanceProfiler>
      </div>
    );

    const metrics = getPerformanceMetrics();
    
    // Should have metrics for both profilers
    expect(metrics.componentMetrics.has('profiler-1')).toBe(true);
    expect(metrics.componentMetrics.has('profiler-2')).toBe(true);
  });
});