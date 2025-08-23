import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DashboardErrorFallback from '../DashboardErrorFallback';

describe('DashboardErrorFallback', () => {
  const mockError = new Error('Test error message');
  const mockResetError = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders error message and maintains layout structure', () => {
    render(
      <DashboardErrorFallback 
        error={mockError} 
        resetError={mockResetError} 
      />
    );

    // Check error message is displayed
    expect(screen.getByText('Dashboard Error')).toBeInTheDocument();
    expect(screen.getByText(/We encountered an error while loading your dashboard content/)).toBeInTheDocument();

    // Check layout structure is maintained
    expect(screen.getByText('Dashboard Error').closest('.min-h-screen')).toBeInTheDocument();
    
    // Check header structure is maintained
    const headerElement = document.querySelector('.h-16.bg-white.border-b');
    expect(headerElement).toBeInTheDocument();

    // Check grid layout is maintained with placeholder cards
    const gridElement = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-3');
    expect(gridElement).toBeInTheDocument();
  });

  it('calls resetError when retry button is clicked', () => {
    render(
      <DashboardErrorFallback 
        error={mockError} 
        resetError={mockResetError} 
      />
    );

    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);

    expect(mockResetError).toHaveBeenCalledTimes(1);
  });

  it('disables retry button when max retries reached', () => {
    render(
      <DashboardErrorFallback 
        error={mockError} 
        resetError={mockResetError} 
        retryCount={3}
      />
    );

    const retryButton = screen.getByRole('button', { name: /max retries reached/i });
    expect(retryButton).toBeDisabled();
  });

  it('shows retry button text based on retry count', () => {
    const { rerender } = render(
      <DashboardErrorFallback 
        error={mockError} 
        resetError={mockResetError} 
        retryCount={0}
      />
    );

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();

    rerender(
      <DashboardErrorFallback 
        error={mockError} 
        resetError={mockResetError} 
        retryCount={3}
      />
    );

    expect(screen.getByRole('button', { name: /max retries reached/i })).toBeInTheDocument();
  });

  it('renders without resetError prop', () => {
    render(
      <DashboardErrorFallback error={mockError} />
    );

    expect(screen.getByText('Dashboard Error')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });

  it('maintains consistent spacing and layout', () => {
    render(
      <DashboardErrorFallback 
        error={mockError} 
        resetError={mockResetError} 
      />
    );

    // Check main container has proper padding
    const mainContainer = screen.getByText('Dashboard Error').closest('.p-6');
    expect(mainContainer).toBeInTheDocument();

    // Check error card has proper styling
    const errorCard = screen.getByText('Dashboard Error').closest('.bg-white.rounded-lg.shadow');
    expect(errorCard).toBeInTheDocument();

    // Check placeholder cards maintain grid structure
    const placeholderCards = document.querySelectorAll('.bg-white.rounded-lg.shadow.p-4.opacity-50');
    expect(placeholderCards).toHaveLength(3);
  });

  it('displays alert triangle icon', () => {
    render(
      <DashboardErrorFallback 
        error={mockError} 
        resetError={mockResetError} 
      />
    );

    // Check that the AlertTriangle icon is rendered
    const alertIcon = document.querySelector('svg');
    expect(alertIcon).toBeInTheDocument();
  });

  it('prevents layout shifts with stable dimensions', () => {
    render(
      <DashboardErrorFallback 
        error={mockError} 
        resetError={mockResetError} 
      />
    );

    // Check that layout maintains stable structure
    const container = screen.getByText('Dashboard Error').closest('.min-h-screen');
    expect(container).toHaveClass('bg-gray-50');

    // Check grid maintains responsive classes
    const grid = document.querySelector('.grid.grid-cols-1.md\\:grid-cols-3.gap-6');
    expect(grid).toBeInTheDocument();

    // Check placeholder cards have consistent styling
    const placeholders = document.querySelectorAll('.h-4.bg-gray-200.rounded');
    expect(placeholders.length).toBeGreaterThan(0);
  });
});