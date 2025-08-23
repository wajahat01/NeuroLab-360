import React from 'react';
import { render, screen } from '@testing-library/react';
import { DashboardSkeleton } from '../LoadingSkeleton';

describe('Layout Stability Tests', () => {

  describe('DashboardSkeleton Layout Stability', () => {
    test('should render skeleton with stable layout classes', () => {
      const { container } = render(<DashboardSkeleton />);

      // Check main container has stable layout classes
      const dashboardContent = container.querySelector('.dashboard-content');
      expect(dashboardContent).toBeInTheDocument();
      expect(dashboardContent).toHaveClass('prevent-layout-shift');

      // Check all grid sections are present
      expect(container.querySelector('.dashboard-stats-grid')).toBeInTheDocument();
      expect(container.querySelector('.dashboard-period-selector')).toBeInTheDocument();
      expect(container.querySelector('.dashboard-charts-grid')).toBeInTheDocument();
      expect(container.querySelector('.dashboard-performance-chart')).toBeInTheDocument();
      expect(container.querySelector('.dashboard-bottom-grid')).toBeInTheDocument();
    });

    test('should render skeleton stat cards with correct structure', () => {
      const { container } = render(<DashboardSkeleton />);

      const statCards = container.querySelectorAll('.dashboard-stat-card');
      expect(statCards).toHaveLength(4);

      statCards.forEach(card => {
        expect(card).toHaveClass('animate-pulse');
        expect(card).toHaveClass('dashboard-stat-card');
      });
    });

    test('should render skeleton chart cards with correct structure', () => {
      const { container } = render(<DashboardSkeleton />);

      const chartCards = container.querySelectorAll('.dashboard-chart-card');
      expect(chartCards.length).toBeGreaterThan(0);

      chartCards.forEach(card => {
        expect(card).toHaveClass('animate-pulse');
        expect(card).toHaveClass('dashboard-chart-card');
      });
    });

    test('should render skeleton with stable dimensions class', () => {
      const { container } = render(<DashboardSkeleton />);

      const stableDimensionElements = container.querySelectorAll('.stable-dimensions');
      expect(stableDimensionElements.length).toBeGreaterThan(0);

      stableDimensionElements.forEach(element => {
        expect(element).toHaveClass('stable-dimensions');
      });
    });

    test('should have proper grid layout structure', () => {
      const { container } = render(<DashboardSkeleton />);

      // Verify the main layout structure exists
      expect(container.querySelector('.dashboard-content')).toBeInTheDocument();
      expect(container.querySelector('.dashboard-stats-grid')).toBeInTheDocument();
      expect(container.querySelector('.dashboard-charts-grid')).toBeInTheDocument();
      expect(container.querySelector('.dashboard-bottom-grid')).toBeInTheDocument();
    });
  });
});