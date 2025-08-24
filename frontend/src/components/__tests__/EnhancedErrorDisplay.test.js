import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnhancedErrorDisplay, ServiceStatusIndicator } from '../EnhancedErrorDisplay';

// Mock window.location
delete window.location;
window.location = { href: '', reload: jest.fn() };

describe('EnhancedErrorDisplay', () => {
  const mockOnRetry = jest.fn();
  const mockOnIntelligentRetry = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Error Display with New Format', () => {
    test('should display authentication error with recovery suggestions', () => {
      const errorDetails = {
        code: 'AUTH_FAILED',
        message: 'Please refresh your session and try again',
        suggestions: ['Try refreshing the page', 'Log in again'],
        actions: ['refresh_token', 'login_again'],
        severity: 'warning'
      };

      render(
        <EnhancedErrorDisplay
          error="Authentication failed"
          errorDetails={errorDetails}
          onIntelligentRetry={mockOnIntelligentRetry}
        />
      );

      expect(screen.getByText('Authentication Required')).toBeInTheDocument();
      expect(screen.getByText(errorDetails.message)).toBeInTheDocument();
      expect(screen.getByText('What you can try:')).toBeInTheDocument();
      expect(screen.getByText('Try refreshing the page')).toBeInTheDocument();
      expect(screen.getByText('Log in again')).toBeInTheDocument();
      expect(screen.getByText('Refresh Session')).toBeInTheDocument();
      expect(screen.getByText('Login Again')).toBeInTheDocument();
    });

    test('should display database error with fallback notice', () => {
      const errorDetails = {
        code: 'DATABASE_ERROR',
        message: 'We are experiencing technical difficulties',
        suggestions: ['Try again in a few minutes'],
        severity: 'error'
      };

      render(
        <EnhancedErrorDisplay
          error="Database error"
          errorDetails={errorDetails}
          fallbackAvailable={true}
          serviceStatus="degraded"
        />
      );

      expect(screen.getByText('Data Temporarily Unavailable')).toBeInTheDocument();
      expect(screen.getByText('Showing cached data while service recovers')).toBeInTheDocument();
      expect(screen.getByText('Try again in a few minutes')).toBeInTheDocument();
    });

    test('should display network error with appropriate suggestions', () => {
      const errorDetails = {
        code: 'NETWORK_ERROR',
        message: 'Network connection issue',
        suggestions: ['Check your internet connection', 'Try again in a moment'],
        canRetry: true,
        severity: 'error'
      };

      render(
        <EnhancedErrorDisplay
          error="Network error"
          errorDetails={errorDetails}
          onIntelligentRetry={mockOnIntelligentRetry}
        />
      );

      expect(screen.getByText('Connection Issue')).toBeInTheDocument();
      expect(screen.getByText('Check your internet connection')).toBeInTheDocument();
      expect(screen.getByText('Try again in a moment')).toBeInTheDocument();
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });

    test('should display service unavailable with retry timer', () => {
      const errorDetails = {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Service temporarily unavailable',
        retryAfter: 30,
        severity: 'error'
      };

      render(
        <EnhancedErrorDisplay
          error="Service unavailable"
          errorDetails={errorDetails}
          retryAfter={30}
        />
      );

      expect(screen.getByText('Service Temporarily Unavailable')).toBeInTheDocument();
      expect(screen.getByText('Automatic retry in 30 seconds')).toBeInTheDocument();
    });
  });

  describe('Legacy Error Format Support', () => {
    test('should handle legacy error format gracefully', () => {
      render(
        <EnhancedErrorDisplay
          error="Something went wrong"
          onRetry={mockOnRetry}
        />
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText('Try refreshing the page')).toBeInTheDocument();
      expect(screen.getByText('Try again')).toBeInTheDocument();
    });

    test('should provide default suggestions for unknown errors', () => {
      render(
        <EnhancedErrorDisplay
          error="Unknown error occurred"
          serviceStatus="error"
        />
      );

      expect(screen.getByText('Try refreshing the page')).toBeInTheDocument();
      expect(screen.getByText('Contact support if the issue persists')).toBeInTheDocument();
    });
  });

  describe('Interactive Features', () => {
    test('should call intelligent retry when retry button is clicked', async () => {
      const errorDetails = {
        code: 'NETWORK_ERROR',
        canRetry: true
      };

      render(
        <EnhancedErrorDisplay
          error="Network error"
          errorDetails={errorDetails}
          onIntelligentRetry={mockOnIntelligentRetry}
        />
      );

      const retryButton = screen.getByText('Try again');
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(mockOnIntelligentRetry).toHaveBeenCalledTimes(1);
      });
    });

    test('should handle action buttons correctly', () => {
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

    test('should toggle technical details visibility', () => {
      const errorDetails = {
        code: 'DATABASE_ERROR',
        errorId: 'err-123',
        details: { query: 'SELECT * FROM users' }
      };

      render(
        <EnhancedErrorDisplay
          error="Database error"
          errorDetails={errorDetails}
          showTechnicalDetails={true}
        />
      );

      const toggleButton = screen.getByText('Show technical details');
      fireEvent.click(toggleButton);

      expect(screen.getByText('Hide technical details')).toBeInTheDocument();
      expect(screen.getByText('Error Code:')).toBeInTheDocument();
      expect(screen.getByText('DATABASE_ERROR')).toBeInTheDocument();
      expect(screen.getByText('err-123')).toBeInTheDocument();
    });
  });

  describe('Visual States', () => {
    test('should show retry loading state', async () => {
      mockOnIntelligentRetry.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );

      const errorDetails = { canRetry: true };

      render(
        <EnhancedErrorDisplay
          error="Test error"
          errorDetails={errorDetails}
          onIntelligentRetry={mockOnIntelligentRetry}
        />
      );

      const retryButton = screen.getByText('Try again');
      fireEvent.click(retryButton);

      expect(screen.getByText('Retrying...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText('Try again')).toBeInTheDocument();
      });
    });

    test('should display appropriate error type styling', () => {
      const warningError = {
        severity: 'warning',
        code: 'AUTH_FAILED'
      };

      const { rerender } = render(
        <EnhancedErrorDisplay
          error="Warning error"
          errorDetails={warningError}
        />
      );

      // Should render as warning type
      expect(screen.getByText('Authentication Required')).toBeInTheDocument();

      const infoError = {
        severity: 'info',
        code: 'STALE_DATA'
      };

      rerender(
        <EnhancedErrorDisplay
          error="Info message"
          errorDetails={infoError}
          serviceStatus="degraded"
        />
      );

      // Should render as info type
      expect(screen.getByText('Service Degraded')).toBeInTheDocument();
    });
  });
});

describe('ServiceStatusIndicator', () => {
  test('should display healthy status correctly', () => {
    render(<ServiceStatusIndicator status="healthy" />);
    
    expect(screen.getByText('All systems operational')).toBeInTheDocument();
  });

  test('should display degraded status correctly', () => {
    render(<ServiceStatusIndicator status="degraded" />);
    
    expect(screen.getByText('Service degraded')).toBeInTheDocument();
  });

  test('should display error status correctly', () => {
    render(<ServiceStatusIndicator status="error" />);
    
    expect(screen.getByText('Service unavailable')).toBeInTheDocument();
  });

  test('should display offline status correctly', () => {
    render(<ServiceStatusIndicator status="offline" />);
    
    expect(screen.getByText("You're offline")).toBeInTheDocument();
  });

  test('should display auth required status correctly', () => {
    render(<ServiceStatusIndicator status="auth_required" />);
    
    expect(screen.getByText('Authentication required')).toBeInTheDocument();
  });

  test('should hide label when showLabel is false', () => {
    render(<ServiceStatusIndicator status="healthy" showLabel={false} />);
    
    expect(screen.queryByText('All systems operational')).not.toBeInTheDocument();
  });

  test('should handle unknown status gracefully', () => {
    render(<ServiceStatusIndicator status="unknown" />);
    
    expect(screen.getByText('Unknown status')).toBeInTheDocument();
  });

  test('should apply custom className', () => {
    const { container } = render(
      <ServiceStatusIndicator status="healthy" className="custom-class" />
    );
    
    expect(container.firstChild).toHaveClass('custom-class');
  });
});