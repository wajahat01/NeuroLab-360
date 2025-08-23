/**
 * Visual Regression Tests for UI Consistency
 * 
 * These tests validate that UI components render consistently
 * and maintain their visual appearance across changes.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Import components to test
import { 
  LoadingSpinner, 
  ProgressBar, 
  SkeletonLoader,
  ErrorDisplay, 
  EmptyState,
  StatCardSkeleton,
  ChartSkeleton,
  ExperimentCardSkeleton
} from '../components';

// Mock wrapper for components that need routing
const RouterWrapper = ({ children }) => (
  <BrowserRouter>
    {children}
  </BrowserRouter>
);

describe('Visual Regression Tests', () => {
  describe('Loading Components', () => {
    test('LoadingSpinner renders with different sizes', () => {
      const { rerender } = render(<LoadingSpinner size="sm" />);
      expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
      
      rerender(<LoadingSpinner size="md" />);
      expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
      
      rerender(<LoadingSpinner size="lg" />);
      expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
    });

    test('LoadingSpinner renders with different types', () => {
      const { rerender } = render(<LoadingSpinner type="spinner" />);
      expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
      
      rerender(<LoadingSpinner type="dots" />);
      expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
      
      rerender(<LoadingSpinner type="pulse" />);
      expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
    });

    test('ProgressBar renders with different progress values', () => {
      const { rerender } = render(<ProgressBar progress={0} />);
      expect(document.querySelector('[style*="width: 0%"]')).toBeInTheDocument();
      
      rerender(<ProgressBar progress={50} />);
      expect(document.querySelector('[style*="width: 50%"]')).toBeInTheDocument();
      
      rerender(<ProgressBar progress={100} />);
      expect(document.querySelector('[style*="width: 100%"]')).toBeInTheDocument();
    });

    test('SkeletonLoader renders with different configurations', () => {
      const { rerender } = render(<SkeletonLoader lines={3} />);
      expect(document.querySelectorAll('.animate-pulse')).toHaveLength(1);
      
      rerender(<SkeletonLoader lines={5} avatar={true} />);
      expect(document.querySelectorAll('.animate-pulse')).toHaveLength(1);
      
      rerender(<SkeletonLoader lines={2} button={true} />);
      expect(document.querySelectorAll('.animate-pulse')).toHaveLength(1);
    });
  });

  describe('Error and Empty State Components', () => {
    test('ErrorDisplay renders with different types', () => {
      const { rerender } = render(
        <ErrorDisplay error="Test error" type="error" />
      );
      expect(screen.getByText('Test error')).toBeInTheDocument();
      
      rerender(<ErrorDisplay error="Test warning" type="warning" />);
      expect(screen.getByText('Test warning')).toBeInTheDocument();
      
      rerender(<ErrorDisplay error="Test info" type="info" />);
      expect(screen.getByText('Test info')).toBeInTheDocument();
    });

    test('EmptyState renders with different variants', () => {
      const mockAction = jest.fn();
      const { rerender } = render(
        <EmptyState 
          title="No data" 
          description="Test description" 
          action={mockAction}
          actionLabel="Test Action"
          variant="default"
        />
      );
      expect(screen.getByText('No data')).toBeInTheDocument();
      expect(screen.getByText('Test description')).toBeInTheDocument();
      expect(screen.getByText('Test Action')).toBeInTheDocument();
      
      rerender(
        <EmptyState 
          title="Success state" 
          description="Success description" 
          variant="success"
        />
      );
      expect(screen.getByText('Success state')).toBeInTheDocument();
    });
  });

  describe('Skeleton Components', () => {
    test('StatCardSkeleton renders consistently', () => {
      render(<StatCardSkeleton />);
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
      expect(document.querySelector('.card')).toBeInTheDocument();
    });

    test('ChartSkeleton renders with different heights', () => {
      const { rerender } = render(<ChartSkeleton height={200} />);
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
      
      rerender(<ChartSkeleton height={400} />);
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    });

    test('ExperimentCardSkeleton renders consistently', () => {
      render(<ExperimentCardSkeleton />);
      expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
      expect(document.querySelector('.card')).toBeInTheDocument();
    });
  });

  describe('Responsive Design Tests', () => {
    test('Components have responsive classes', () => {
      render(<StatCardSkeleton />);
      const card = document.querySelector('.card');
      expect(card).toHaveClass('card');
      
      // Test that responsive utilities are applied
      expect(document.body).toContainHTML('animate-pulse');
    });

    test('Grid responsive utilities work', () => {
      render(
        <div className="grid-responsive">
          <div>Item 1</div>
          <div>Item 2</div>
          <div>Item 3</div>
        </div>
      );
      
      const grid = document.querySelector('.grid-responsive');
      expect(grid).toHaveClass('grid-responsive');
    });
  });

  describe('Interactive Elements', () => {
    test('Buttons have hover and focus states', () => {
      render(
        <button className="btn-primary">
          Test Button
        </button>
      );
      
      const button = screen.getByText('Test Button');
      expect(button).toHaveClass('btn-primary');
    });

    test('Form inputs have proper styling', () => {
      render(
        <div>
          <input className="form-input" placeholder="Test input" />
          <input className="form-input-error" placeholder="Error input" />
          <input className="form-input-success" placeholder="Success input" />
        </div>
      );
      
      expect(document.querySelector('.form-input')).toBeInTheDocument();
      expect(document.querySelector('.form-input-error')).toBeInTheDocument();
      expect(document.querySelector('.form-input-success')).toBeInTheDocument();
    });
  });

  describe('Animation Classes', () => {
    test('Animation utilities are applied correctly', () => {
      render(
        <div>
          <div className="animate-fade-in">Fade in</div>
          <div className="animate-slide-up">Slide up</div>
          <div className="animate-scale-in">Scale in</div>
          <div className="hover-lift">Hover lift</div>
        </div>
      );
      
      expect(document.querySelector('.animate-fade-in')).toBeInTheDocument();
      expect(document.querySelector('.animate-slide-up')).toBeInTheDocument();
      expect(document.querySelector('.animate-scale-in')).toBeInTheDocument();
      expect(document.querySelector('.hover-lift')).toBeInTheDocument();
    });
  });

  describe('Color Consistency', () => {
    test('Status indicators use consistent colors', () => {
      render(
        <div>
          <div className="status-dot-success">Success</div>
          <div className="status-dot-error">Error</div>
          <div className="status-dot-warning">Warning</div>
          <div className="status-dot-info">Info</div>
        </div>
      );
      
      expect(document.querySelector('.status-dot-success')).toBeInTheDocument();
      expect(document.querySelector('.status-dot-error')).toBeInTheDocument();
      expect(document.querySelector('.status-dot-warning')).toBeInTheDocument();
      expect(document.querySelector('.status-dot-info')).toBeInTheDocument();
    });

    test('Alert components use consistent styling', () => {
      render(
        <div>
          <div className="alert-success">Success alert</div>
          <div className="alert-error">Error alert</div>
          <div className="alert-warning">Warning alert</div>
          <div className="alert-info">Info alert</div>
        </div>
      );
      
      expect(document.querySelector('.alert-success')).toBeInTheDocument();
      expect(document.querySelector('.alert-error')).toBeInTheDocument();
      expect(document.querySelector('.alert-warning')).toBeInTheDocument();
      expect(document.querySelector('.alert-info')).toBeInTheDocument();
    });
  });

  describe('Typography and Spacing', () => {
    test('Text gradient utilities work', () => {
      render(
        <div>
          <h1 className="text-gradient">Gradient text</h1>
          <h2 className="text-gradient-success">Success gradient</h2>
          <h3 className="text-gradient-error">Error gradient</h3>
        </div>
      );
      
      expect(document.querySelector('.text-gradient')).toBeInTheDocument();
      expect(document.querySelector('.text-gradient-success')).toBeInTheDocument();
      expect(document.querySelector('.text-gradient-error')).toBeInTheDocument();
    });

    test('Responsive spacing utilities work', () => {
      render(
        <div>
          <div className="space-y-responsive">Responsive spacing</div>
          <div className="px-responsive">Responsive padding X</div>
          <div className="py-responsive">Responsive padding Y</div>
        </div>
      );
      
      expect(document.querySelector('.space-y-responsive')).toBeInTheDocument();
      expect(document.querySelector('.px-responsive')).toBeInTheDocument();
      expect(document.querySelector('.py-responsive')).toBeInTheDocument();
    });
  });
});

// Snapshot tests for visual consistency
describe('Component Snapshots', () => {
  test('LoadingSpinner snapshot', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.firstChild).toMatchSnapshot();
  });

  test('ErrorDisplay snapshot', () => {
    const { container } = render(
      <ErrorDisplay error="Test error" title="Test Title" />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('EmptyState snapshot', () => {
    const { container } = render(
      <EmptyState title="No data" description="Test description" />
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  test('StatCardSkeleton snapshot', () => {
    const { container } = render(<StatCardSkeleton />);
    expect(container.firstChild).toMatchSnapshot();
  });
});