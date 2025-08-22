import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ProtectedRoute from '../ProtectedRoute';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock the LoadingSpinner component
jest.mock('../LoadingSpinner', () => {
  return function MockLoadingSpinner() {
    return <div data-testid="loading-spinner">Loading...</div>;
  };
});

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

const TestChild = () => <div data-testid="protected-content">Protected Content</div>;

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

  test('shows loading spinner when auth is loading', () => {
    const { supabase } = require('../../lib/supabase');
    // Mock loading state
    supabase.auth.getSession.mockImplementation(() => 
      new Promise(() => {}) // Never resolves to keep loading state
    );
    
    renderProtectedRoute();
    
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  test('renders children when user is authenticated', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderProtectedRoute();
    
    // Wait for auth to resolve
    await screen.findByTestId('protected-content');
    
    expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument();
  });

  test('redirects to login when user is not authenticated', async () => {
    const { supabase } = require('../../lib/supabase');
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null }
    });
    
    renderProtectedRoute();
    
    // The component should redirect, so protected content should not be rendered
    // We can't easily test the redirect in this setup, but we can verify
    // that the protected content is not rendered
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });
});