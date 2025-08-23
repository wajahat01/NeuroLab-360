import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock the DashboardSkeleton component
jest.mock('../LoadingSkeleton', () => ({
  DashboardSkeleton: function MockDashboardSkeleton() {
    return <div data-testid="dashboard-skeleton-content">Dashboard Loading...</div>;
  },
}));

// Mock Supabase client
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      onAuthStateChange: jest.fn(),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

const TestChild = () => <div data-testid="test-child">Protected Content</div>;

const renderProtectedRoute = () => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <ProtectedRoute>
          <TestChild />
        </ProtectedRoute>
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    const { supabase } = require('../../lib/supabase');
    jest.clearAllMocks();
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } }
    });
  });

  test('shows dashboard skeleton when auth is not initialized', () => {
    const { supabase } = require('../../lib/supabase');
    // Mock uninitialized state
    supabase.auth.getSession.mockImplementation(() => 
      new Promise(() => {}) // Never resolves to keep loading state
    );
    
    renderProtectedRoute();
    
    expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-skeleton-content')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  test('shows dashboard skeleton when auth is loading', async () => {
    const { supabase } = require('../../lib/supabase');
    let resolveSession;
    const sessionPromise = new Promise(resolve => {
      resolveSession = resolve;
    });
    
    supabase.auth.getSession.mockReturnValue(sessionPromise);
    
    renderProtectedRoute();
    
    // Should show skeleton while loading
    expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-skeleton-content')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    
    // Resolve the session
    resolveSession({
      data: { session: { user: { id: '1', email: 'test@example.com' } } }
    });
    
    // Wait for auth to resolve and content to appear
    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
  });

  test('renders children when user is authenticated and initialized', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderProtectedRoute();
    
    // Wait for auth to resolve
    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('dashboard-skeleton')).not.toBeInTheDocument();
  });

  test('redirects to login when user is not authenticated after initialization', async () => {
    const { supabase } = require('../../lib/supabase');
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null }
    });
    
    renderProtectedRoute();
    
    // Wait for auth to resolve
    await waitFor(() => {
      // The component should redirect, so protected content should not be rendered
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
    });
  });

  test('prevents flash of login page by showing skeleton until initialized', async () => {
    const { supabase } = require('../../lib/supabase');
    let resolveSession;
    const sessionPromise = new Promise(resolve => {
      resolveSession = resolve;
    });
    
    supabase.auth.getSession.mockReturnValue(sessionPromise);
    
    renderProtectedRoute();
    
    // Should immediately show skeleton, not redirect
    expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-skeleton-content')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    
    // Even after a short delay, should still show skeleton
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.getByTestId('loading-state')).toBeInTheDocument();
    
    // Resolve with no user (unauthenticated)
    resolveSession({
      data: { session: null }
    });
    
    // Now it should redirect (skeleton disappears)
    await waitFor(() => {
      expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
    });
  });

  test('applies fade-in animation classes for smooth transitions', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderProtectedRoute();
    
    // Check loading state has fade-in class
    const loadingState = screen.getByTestId('loading-state');
    expect(loadingState).toHaveClass('fade-in');
    
    // Wait for auth to resolve and check protected content has fade-in class
    await waitFor(() => {
      const protectedContent = screen.getByTestId('protected-content');
      expect(protectedContent).toHaveClass('fade-in');
    });
  });

  test('handles auth state changes smoothly', async () => {
    const { supabase } = require('../../lib/supabase');
    
    // Start with authenticated user
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderProtectedRoute();
    
    // Should show protected content when authenticated
    await waitFor(() => {
      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
    
    expect(screen.queryByTestId('loading-state')).not.toBeInTheDocument();
  });
});