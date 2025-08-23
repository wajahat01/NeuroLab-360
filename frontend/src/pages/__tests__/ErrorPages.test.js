import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import '@testing-library/jest-dom';
import {
  NotFoundPage,
  ServerErrorPage,
  NetworkErrorPage,
  AccessDeniedPage,
  ErrorPage
} from '../ErrorPages';

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate
}));

// Wrapper component for router context
const RouterWrapper = ({ children }) => (
  <BrowserRouter>
    {children}
  </BrowserRouter>
);

describe('ErrorPages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('NotFoundPage', () => {
    it('renders 404 error page', () => {
      render(
        <RouterWrapper>
          <NotFoundPage />
        </RouterWrapper>
      );

      expect(screen.getByText('404')).toBeInTheDocument();
      expect(screen.getByText('Page Not Found')).toBeInTheDocument();
      expect(screen.getByText(/The page you're looking for doesn't exist/)).toBeInTheDocument();
    });

    it('navigates to dashboard on button click', () => {
      render(
        <RouterWrapper>
          <NotFoundPage />
        </RouterWrapper>
      );

      fireEvent.click(screen.getByText('Go to Dashboard'));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });

    it('navigates back on back button click', () => {
      render(
        <RouterWrapper>
          <NotFoundPage />
        </RouterWrapper>
      );

      fireEvent.click(screen.getByText('Go Back'));
      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });
  });

  describe('ServerErrorPage', () => {
    const mockError = new Error('Server error message');
    const mockRetry = jest.fn();

    it('renders 500 error page', () => {
      render(
        <RouterWrapper>
          <ServerErrorPage error={mockError} onRetry={mockRetry} />
        </RouterWrapper>
      );

      expect(screen.getByText('500')).toBeInTheDocument();
      expect(screen.getByText('Server Error')).toBeInTheDocument();
      expect(screen.getByText(/Something went wrong on our end/)).toBeInTheDocument();
    });

    it('calls retry function when retry button is clicked', () => {
      render(
        <RouterWrapper>
          <ServerErrorPage error={mockError} onRetry={mockRetry} />
        </RouterWrapper>
      );

      fireEvent.click(screen.getByText('Try again'));
      expect(mockRetry).toHaveBeenCalled();
    });

    it('navigates to dashboard on button click', () => {
      render(
        <RouterWrapper>
          <ServerErrorPage error={mockError} onRetry={mockRetry} />
        </RouterWrapper>
      );

      fireEvent.click(screen.getByText('Go to Dashboard'));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('NetworkErrorPage', () => {
    const mockRetry = jest.fn();

    it('renders network error page', () => {
      render(
        <RouterWrapper>
          <NetworkErrorPage onRetry={mockRetry} />
        </RouterWrapper>
      );

      expect(screen.getByText('Connection Problem')).toBeInTheDocument();
      expect(screen.getByText(/Unable to connect to the server/)).toBeInTheDocument();
    });

    it('calls retry function when try again button is clicked', () => {
      render(
        <RouterWrapper>
          <NetworkErrorPage onRetry={mockRetry} />
        </RouterWrapper>
      );

      fireEvent.click(screen.getByText('Try Again'));
      expect(mockRetry).toHaveBeenCalled();
    });

    it('navigates to dashboard on button click', () => {
      render(
        <RouterWrapper>
          <NetworkErrorPage onRetry={mockRetry} />
        </RouterWrapper>
      );

      fireEvent.click(screen.getByText('Go to Dashboard'));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('AccessDeniedPage', () => {
    it('renders 403 error page', () => {
      render(
        <RouterWrapper>
          <AccessDeniedPage />
        </RouterWrapper>
      );

      expect(screen.getByText('403')).toBeInTheDocument();
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText(/You don't have permission to access/)).toBeInTheDocument();
    });

    it('navigates to dashboard on button click', () => {
      render(
        <RouterWrapper>
          <AccessDeniedPage />
        </RouterWrapper>
      );

      fireEvent.click(screen.getByText('Go to Dashboard'));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });

    it('navigates back on back button click', () => {
      render(
        <RouterWrapper>
          <AccessDeniedPage />
        </RouterWrapper>
      );

      fireEvent.click(screen.getByText('Go Back'));
      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });
  });

  describe('ErrorPage', () => {
    const mockRetry = jest.fn();

    it('renders generic error page', () => {
      render(
        <RouterWrapper>
          <ErrorPage 
            title="Custom Error"
            description="Custom error description"
            onRetry={mockRetry}
          />
        </RouterWrapper>
      );

      expect(screen.getByText('Custom Error')).toBeInTheDocument();
      expect(screen.getByText('Custom error description')).toBeInTheDocument();
    });

    it('renders NotFoundPage for 404 errors', () => {
      const error404 = { status: 404 };
      
      render(
        <RouterWrapper>
          <ErrorPage error={error404} />
        </RouterWrapper>
      );

      expect(screen.getByText('404')).toBeInTheDocument();
      expect(screen.getByText('Page Not Found')).toBeInTheDocument();
    });

    it('renders AccessDeniedPage for 403 errors', () => {
      const error403 = { status: 403 };
      
      render(
        <RouterWrapper>
          <ErrorPage error={error403} />
        </RouterWrapper>
      );

      expect(screen.getByText('403')).toBeInTheDocument();
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });

    it('renders ServerErrorPage for 5xx errors', () => {
      const error500 = { status: 500 };
      
      render(
        <RouterWrapper>
          <ErrorPage error={error500} onRetry={mockRetry} />
        </RouterWrapper>
      );

      expect(screen.getByText('500')).toBeInTheDocument();
      expect(screen.getByText('Server Error')).toBeInTheDocument();
    });

    it('renders NetworkErrorPage for network errors', () => {
      const networkError = { name: 'NetworkError' };
      
      render(
        <RouterWrapper>
          <ErrorPage error={networkError} onRetry={mockRetry} />
        </RouterWrapper>
      );

      expect(screen.getByText('Connection Problem')).toBeInTheDocument();
    });

    it('renders NetworkErrorPage when offline', () => {
      // Mock navigator.onLine
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      });

      const error = new Error('Network error');
      
      render(
        <RouterWrapper>
          <ErrorPage error={error} onRetry={mockRetry} />
        </RouterWrapper>
      );

      expect(screen.getByText('Connection Problem')).toBeInTheDocument();

      // Restore navigator.onLine
      navigator.onLine = true;
    });

    it('calls retry function when retry is available', () => {
      render(
        <RouterWrapper>
          <ErrorPage 
            error={new Error('Test error')}
            onRetry={mockRetry}
            showRetry={true}
          />
        </RouterWrapper>
      );

      fireEvent.click(screen.getByText('Try again'));
      expect(mockRetry).toHaveBeenCalled();
    });

    it('hides retry button when showRetry is false', () => {
      render(
        <RouterWrapper>
          <ErrorPage 
            error={new Error('Test error')}
            onRetry={mockRetry}
            showRetry={false}
          />
        </RouterWrapper>
      );

      expect(screen.queryByText('Try again')).not.toBeInTheDocument();
    });

    it('navigates to dashboard on dashboard button click', () => {
      render(
        <RouterWrapper>
          <ErrorPage error={new Error('Test error')} />
        </RouterWrapper>
      );

      fireEvent.click(screen.getByText('Go to Dashboard'));
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });
});