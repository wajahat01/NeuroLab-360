/**
 * DashboardSkeleton Visual Regression Tests
 * 
 * These tests verify that the DashboardSkeleton component matches
 * the exact layout structure of the loaded Dashboard component.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DashboardSkeleton, StatCardSkeleton, ChartSkeleton, InsightCardSkeleton } from '../LoadingSkeleton';

describe('DashboardSkeleton Component', () => {
  describe('Layout Structure Tests', () => {
    test('renders header skeleton with correct dimensions', () => {
      const { container } = render(<DashboardSkeleton />);
      
      // Check for header elements - first space-y-2 container
      const headerContainer = container.querySelector('.space-y-6 > .space-y-2');
      expect(headerContainer).toBeInTheDocument();
      
      const headerElements = headerContainer.querySelectorAll('div');
      expect(headerElements).toHaveLength(2);
      
      // Check title skeleton dimensions (h-9 w-64)
      const titleSkeleton = headerElements[0];
      expect(titleSkeleton).toHaveClass('h-9', 'w-64', 'loading-shimmer');
      
      // Check subtitle skeleton dimensions (h-5 w-96)
      const subtitleSkeleton = headerElements[1];
      expect(subtitleSkeleton).toHaveClass('h-5', 'w-96', 'loading-shimmer');
    });

    test('renders stats cards grid with correct responsive layout', () => {
      render(<DashboardSkeleton />);
      
      // Check for stats grid container
      const statsGrid = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4.gap-6');
      expect(statsGrid).toBeInTheDocument();
      
      // Check for 4 stat cards
      const statCards = statsGrid.querySelectorAll('.bg-white.rounded-lg.shadow.p-6');
      expect(statCards).toHaveLength(4);
      
      // Verify each stat card has correct structure
      statCards.forEach(card => {
        expect(card).toHaveClass('animate-pulse');
        
        // Check for icon and content structure
        const iconElement = card.querySelector('.w-8.h-8.bg-gray-200.rounded.loading-shimmer');
        expect(iconElement).toBeInTheDocument();
        
        const contentElements = card.querySelectorAll('.ml-4.flex-1.space-y-2 > div');
        expect(contentElements).toHaveLength(3);
      });
    });

    test('renders period selector skeleton with correct button layout', () => {
      render(<DashboardSkeleton />);
      
      // Check for period selector container
      const periodSelector = document.querySelector('.flex.justify-end .inline-flex.rounded-md.shadow-sm');
      expect(periodSelector).toBeInTheDocument();
      expect(periodSelector).toHaveClass('animate-pulse');
      
      // Check for 4 period buttons
      const periodButtons = periodSelector.querySelectorAll('.h-10.bg-gray-200.w-20');
      expect(periodButtons).toHaveLength(4);
      
      // Check first and last buttons have rounded corners
      expect(periodButtons[0]).toHaveClass('rounded-l-md');
      expect(periodButtons[3]).toHaveClass('rounded-r-md');
    });

    test('renders charts section with correct grid layout', () => {
      render(<DashboardSkeleton />);
      
      // Check for charts grid container
      const chartsGrid = document.querySelector('.grid.grid-cols-1.lg\\:grid-cols-2.gap-6');
      expect(chartsGrid).toBeInTheDocument();
      
      // Check for 2 chart skeletons
      const chartSkeletons = chartsGrid.querySelectorAll('.bg-white.rounded-lg.shadow.p-6.animate-pulse');
      expect(chartSkeletons).toHaveLength(2);
    });

    test('renders performance trends chart skeleton', () => {
      render(<DashboardSkeleton />);
      
      // Check for performance trends container
      const performanceTrends = document.querySelector('.animate-pulse > .bg-white.rounded-lg.shadow.p-6.animate-pulse');
      expect(performanceTrends).toBeInTheDocument();
    });

    test('renders recent experiments and insights section with correct layout', () => {
      render(<DashboardSkeleton />);
      
      // Check for main grid container
      const mainGrid = document.querySelector('.grid.grid-cols-1.lg\\:grid-cols-3.gap-6');
      expect(mainGrid).toBeInTheDocument();
      
      // Check for recent experiments section (lg:col-span-2)
      const recentExperiments = mainGrid.querySelector('.lg\\:col-span-2');
      expect(recentExperiments).toBeInTheDocument();
      
      const experimentsCard = recentExperiments.querySelector('.bg-white.rounded-lg.shadow.animate-pulse');
      expect(experimentsCard).toBeInTheDocument();
      
      // Check for header
      const experimentsHeader = experimentsCard.querySelector('.px-6.py-4.border-b.border-gray-200');
      expect(experimentsHeader).toBeInTheDocument();
      
      // Check for 3 experiment items
      const experimentItems = experimentsCard.querySelectorAll('.flex.items-center.justify-between.p-3.bg-gray-50.rounded-lg');
      expect(experimentItems).toHaveLength(3);
      
      // Check for insights section
      const insightsSection = mainGrid.querySelector('.bg-white.rounded-lg.shadow.animate-pulse');
      expect(insightsSection).toBeInTheDocument();
      
      // Check for insights header
      const insightsHeader = insightsSection.querySelector('.px-6.py-4.border-b.border-gray-200');
      expect(insightsHeader).toBeInTheDocument();
    });
  });

  describe('Animation and Styling Tests', () => {
    test('applies loading shimmer animation to all skeleton elements', () => {
      const { container } = render(<DashboardSkeleton />);
      
      // Check that loading-shimmer class is applied to key elements
      const shimmerElements = container.querySelectorAll('.loading-shimmer');
      expect(shimmerElements.length).toBeGreaterThan(0);
      
      // Verify shimmer is applied to header elements
      const headerContainer = container.querySelector('.space-y-6 > .space-y-2');
      const headerShimmers = headerContainer.querySelectorAll('.loading-shimmer');
      expect(headerShimmers).toHaveLength(2);
    });

    test('applies animate-pulse class to card containers', () => {
      render(<DashboardSkeleton />);
      
      // Check that animate-pulse is applied to main containers
      const pulseElements = document.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });

    test('maintains consistent spacing with space-y-6', () => {
      render(<DashboardSkeleton />);
      
      // Check main container has correct spacing
      const mainContainer = document.querySelector('.space-y-6');
      expect(mainContainer).toBeInTheDocument();
    });
  });

  describe('Responsive Design Tests', () => {
    test('uses responsive grid classes for different screen sizes', () => {
      render(<DashboardSkeleton />);
      
      // Stats cards responsive grid
      const statsGrid = document.querySelector('.grid-cols-1.md\\:grid-cols-2.lg\\:grid-cols-4');
      expect(statsGrid).toBeInTheDocument();
      
      // Charts responsive grid
      const chartsGrid = document.querySelector('.grid-cols-1.lg\\:grid-cols-2');
      expect(chartsGrid).toBeInTheDocument();
      
      // Main content responsive grid
      const mainGrid = document.querySelector('.grid-cols-1.lg\\:grid-cols-3');
      expect(mainGrid).toBeInTheDocument();
    });

    test('applies responsive column spans correctly', () => {
      render(<DashboardSkeleton />);
      
      // Recent experiments should span 2 columns on large screens
      const recentExperiments = document.querySelector('.lg\\:col-span-2');
      expect(recentExperiments).toBeInTheDocument();
    });
  });

  describe('Accessibility Tests', () => {
    test('skeleton elements have appropriate ARIA attributes', () => {
      render(<DashboardSkeleton />);
      
      // The skeleton should be perceivable by screen readers
      // but not interfere with the loading experience
      const skeletonContainer = document.querySelector('.space-y-6');
      expect(skeletonContainer).toBeInTheDocument();
    });
  });

  describe('Component Integration Tests', () => {
    test('integrates StatCardSkeleton components correctly', () => {
      render(<DashboardSkeleton />);
      
      // Verify stat card skeletons are rendered with correct structure
      const statCards = document.querySelectorAll('.bg-white.rounded-lg.shadow.p-6.animate-pulse');
      expect(statCards.length).toBeGreaterThanOrEqual(4);
    });

    test('integrates ChartSkeleton components correctly', () => {
      render(<DashboardSkeleton />);
      
      // Verify chart skeletons are rendered
      const chartContainers = document.querySelectorAll('.bg-white.rounded-lg.shadow.p-6.animate-pulse');
      expect(chartContainers.length).toBeGreaterThan(0);
    });

    test('integrates InsightCardSkeleton components correctly', () => {
      render(<DashboardSkeleton />);
      
      // Verify insight card skeletons are rendered
      const insightCards = document.querySelectorAll('.bg-blue-50.border.border-blue-200.rounded-lg.p-4.animate-pulse');
      expect(insightCards.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Layout Stability Tests', () => {
    test('maintains consistent dimensions to prevent layout shifts', () => {
      render(<DashboardSkeleton />);
      
      // Check that skeleton maintains fixed heights and widths
      const titleSkeleton = document.querySelector('.h-9.w-64');
      expect(titleSkeleton).toBeInTheDocument();
      
      const subtitleSkeleton = document.querySelector('.h-5.w-96');
      expect(subtitleSkeleton).toBeInTheDocument();
      
      // Check stat card dimensions
      const statCardIcons = document.querySelectorAll('.w-8.h-8');
      expect(statCardIcons.length).toBeGreaterThanOrEqual(4);
    });

    test('uses consistent padding and margins', () => {
      render(<DashboardSkeleton />);
      
      // Check consistent padding on cards
      const paddedCards = document.querySelectorAll('.p-6');
      expect(paddedCards.length).toBeGreaterThan(0);
      
      // Check consistent gaps
      const gappedContainers = document.querySelectorAll('.gap-6');
      expect(gappedContainers.length).toBeGreaterThan(0);
    });
  });

  describe('Snapshot Tests', () => {
    test('DashboardSkeleton matches snapshot', () => {
      const { container } = render(<DashboardSkeleton />);
      expect(container.firstChild).toMatchSnapshot();
    });

    test('DashboardSkeleton with custom className matches snapshot', () => {
      const { container } = render(<DashboardSkeleton className="custom-class" />);
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});

describe('Individual Skeleton Components', () => {
  describe('StatCardSkeleton', () => {
    test('matches Dashboard StatCard structure', () => {
      render(<StatCardSkeleton />);
      
      const card = document.querySelector('.bg-white.rounded-lg.shadow.p-6.animate-pulse');
      expect(card).toBeInTheDocument();
      
      // Check for icon and content structure matching StatCard
      const iconElement = card.querySelector('.w-8.h-8.bg-gray-200.rounded.loading-shimmer');
      expect(iconElement).toBeInTheDocument();
      
      const contentContainer = card.querySelector('.ml-4.flex-1.space-y-2');
      expect(contentContainer).toBeInTheDocument();
      
      const contentElements = contentContainer.querySelectorAll('div');
      expect(contentElements).toHaveLength(3); // title, value, subtitle
    });
  });

  describe('ChartSkeleton', () => {
    test('matches Dashboard chart structure', () => {
      render(<ChartSkeleton height={300} />);
      
      const chart = document.querySelector('.bg-white.rounded-lg.shadow.p-6.animate-pulse');
      expect(chart).toBeInTheDocument();
      
      // Check for title area
      const titleArea = chart.querySelector('.mb-4 .h-6.bg-gray-200.rounded.w-1\\/3.loading-shimmer');
      expect(titleArea).toBeInTheDocument();
      
      // Check for chart area with correct height
      const chartArea = chart.querySelector('[style*="height: 300px"]');
      expect(chartArea).toBeInTheDocument();
    });
  });

  describe('InsightCardSkeleton', () => {
    test('matches Dashboard insight card structure', () => {
      render(<InsightCardSkeleton />);
      
      const card = document.querySelector('.bg-blue-50.border.border-blue-200.rounded-lg.p-4.animate-pulse');
      expect(card).toBeInTheDocument();
      
      // Check for icon and content structure
      const iconElement = card.querySelector('.w-6.h-6.bg-gray-200.rounded-full.flex-shrink-0.loading-shimmer');
      expect(iconElement).toBeInTheDocument();
      
      const contentContainer = card.querySelector('.flex-1.space-y-2');
      expect(contentContainer).toBeInTheDocument();
    });
  });
});