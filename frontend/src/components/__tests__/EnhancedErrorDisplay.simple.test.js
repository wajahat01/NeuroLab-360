import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EnhancedErrorDisplay, ServiceStatusIndicator } from '../EnhancedErrorDisplay';

// Mock window.location
delete window.location;
window.location = { href: '', reload: jest.fn() };

describe('EnhancedErrorDisplay - Basic Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should render basic error message', () => {
    render(
      <EnhancedErrorDisplay
        error="Test error message"
      />
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test error message')).toBeInTheDocument();
  });

  test('should render authentication error with proper title', () => {
    const errorDetails = {
      code: 'AUTH_FAILED',
      message: 'Please refresh your session and try again',
      severity: 'warning'
    };

    render(
      <EnhancedErrorDisplay
        error="Authentication failed"
        errorDetails={errorDetails}
      />
    );

    expect(screen.getByText('Authentication Required')).toBeInTheDocument();
    expect(screen.getByText('Please refresh your session and try again')).toBeInTheDocument();
  });

  test('should render network error with suggestions', () => {
    const errorDetails = {
      code: 'NETWORK_ERROR',
      message: 'Network connection issue',
      suggestions: ['Check your internet connection', 'Try again in a moment'],
      severity: 'error'
    };

    render(
      <EnhancedErrorDisplay
        error="Network error"
        errorDetails={errorDetails}
      />
    );

    expect(screen.getByText('Connection Issue')).toBeInTheDocument();
    expect(screen.getByText('What you can try:')).toBeInTheDocument();
    expect(screen.getByText('Check your internet connection')).toBeInTheDocument();
    expect(screen.getByText('Try again in a moment')).toBeInTheDocument();
  });

  test('should show fallback notice when available', () => {
    render(
      <EnhancedErrorDisplay
        error="Service error"
        fallbackAvailable={true}
      />
    );

    expect(screen.getByText('Showing cached data while service recovers')).toBeInTheDocument();
  });

  test('should show retry timer', () => {
    render(
      <EnhancedErrorDisplay
        error="Service error"
        retryAfter={30}
      />
    );

    expect(screen.getByText('Automatic retry in 30 seconds')).toBeInTheDocument();
  });

  test('should handle action buttons', () => {
    const errorDetails = {
      code: 'AUTH_FAILED',
      actions: ['refresh_token', 'login_again']
    };

    render(
      <EnhancedErrorDisplay
        error="Auth error"
        errorDetails={errorDetails}
      />
    );

    const refreshButton = screen.getByText('Refresh Session');
    const loginButton = screen.getByText('Login Again');

    fireEvent.click(refreshButton);
    expect(window.location.reload).toHaveBeenCalled();

    fireEvent.click(loginButton);
    expect(window.location.href).toBe('/login');
  });
});

describe('ServiceStatusIndicator - Basic Functionality', () => {
  test('should display healthy status', () => {
    render(<ServiceStatusIndicator status="healthy" />);
    expect(screen.getByText('All systems operational')).toBeInTheDocument();
  });

  test('should display degraded status', () => {
    render(<ServiceStatusIndicator status="degraded" />);
    expect(screen.getByText('Service degraded')).toBeInTheDocument();
  });

  test('should display error status', () => {
    render(<ServiceStatusIndicator status="error" />);
    expect(screen.getByText('Service unavailable')).toBeInTheDocument();
  });

  test('should hide label when requested', () => {
    render(<ServiceStatusIndicator status="healthy" showLabel={false} />);
    expect(screen.queryByText('All systems operational')).not.toBeInTheDocument();
  });
});