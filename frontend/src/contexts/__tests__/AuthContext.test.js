import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

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

// Test component to access auth context
const TestComponent = () => {
  const { user, loading, initialized, signIn, signUp, signOut } = useAuth();
  
  const handleSignIn = async () => {
    try {
      await signIn('test@example.com', 'password');
    } catch (error) {
      // Error will be thrown and caught by test
      throw error;
    }
  };

  const handleSignUp = async () => {
    try {
      await signUp('test@example.com', 'password');
    } catch (error) {
      throw error;
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      throw error;
    }
  };
  
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'not-loading'}</div>
      <div data-testid="initialized">{initialized ? 'initialized' : 'not-initialized'}</div>
      <div data-testid="user">{user ? user.email : 'no-user'}</div>
      <button onClick={handleSignIn} data-testid="signin">
        Sign In
      </button>
      <button onClick={handleSignUp} data-testid="signup">
        Sign Up
      </button>
      <button onClick={handleSignOut} data-testid="signout">
        Sign Out
      </button>
    </div>
  );
};

const renderWithAuthProvider = () => {
  return render(
    <AuthProvider>
      <TestComponent />
    </AuthProvider>
  );
};

describe('AuthContext', () => {
  let mockGetSession, mockOnAuthStateChange, mockSignInWithPassword, mockSignUp, mockSignOut;

  beforeEach(() => {
    const { supabase } = require('../../lib/supabase');
    mockGetSession = supabase.auth.getSession;
    mockOnAuthStateChange = supabase.auth.onAuthStateChange;
    mockSignInWithPassword = supabase.auth.signInWithPassword;
    mockSignUp = supabase.auth.signUp;
    mockSignOut = supabase.auth.signOut;
    
    jest.clearAllMocks();
    
    // Default mock implementations
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } }
    });
  });

  test('provides auth context when used within AuthProvider', () => {
    let authContext;
    const TestWrapper = () => {
      authContext = useAuth();
      return <div>Test</div>;
    };
    
    render(
      <AuthProvider>
        <TestWrapper />
      </AuthProvider>
    );
    
    expect(authContext).toBeDefined();
    expect(authContext.signIn).toBeDefined();
    expect(authContext.signUp).toBeDefined();
    expect(authContext.signOut).toBeDefined();
    expect(authContext.getAuthHeaders).toBeDefined();
    expect(typeof authContext.loading).toBe('boolean');
    expect(typeof authContext.initialized).toBe('boolean');
  });

  test('initializes with loading state', () => {
    renderWithAuthProvider();
    
    expect(screen.getByTestId('loading')).toHaveTextContent('loading');
    expect(screen.getByTestId('initialized')).toHaveTextContent('not-initialized');
    expect(screen.getByTestId('user')).toHaveTextContent('no-user');
  });

  test('sets user when session exists', async () => {
    const mockUser = { id: '1', email: 'test@example.com' };
    const { supabase } = require('../../lib/supabase');
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderWithAuthProvider();
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      expect(screen.getByTestId('initialized')).toHaveTextContent('initialized');
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
    });
  });

  test('handles auth state changes', async () => {
    const { supabase } = require('../../lib/supabase');
    let authStateCallback;
    supabase.auth.onAuthStateChange.mockImplementation((callback) => {
      authStateCallback = callback;
      return { data: { subscription: { unsubscribe: jest.fn() } } };
    });
    
    renderWithAuthProvider();
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
    });
    
    // Simulate auth state change
    const mockUser = { id: '1', email: 'test@example.com' };
    act(() => {
      authStateCallback('SIGNED_IN', { user: mockUser });
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
    });
    
    // Simulate sign out
    act(() => {
      authStateCallback('SIGNED_OUT', null);
    });
    
    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('no-user');
    });
  });

  test('signIn calls Supabase auth with correct parameters', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockData = { user: { id: '1', email: 'test@example.com' } };
    supabase.auth.signInWithPassword.mockResolvedValue({ data: mockData });
    
    renderWithAuthProvider();
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
    });
    
    const signInButton = screen.getByTestId('signin');
    act(() => {
      signInButton.click();
    });
    
    await waitFor(() => {
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
      });
    });
  });

  test('signIn throws error when Supabase returns error', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockError = new Error('Invalid credentials');
    supabase.auth.signInWithPassword.mockRejectedValue(mockError);
    
    let authContext;
    const TestWrapper = () => {
      authContext = useAuth();
      return null;
    };
    
    render(
      <AuthProvider>
        <TestWrapper />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(authContext.loading).toBe(false);
    });
    
    await expect(authContext.signIn('test@example.com', 'password')).rejects.toThrow('Invalid credentials');
  });

  test('signUp calls Supabase auth with correct parameters', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockData = { user: { id: '1', email: 'test@example.com' } };
    supabase.auth.signUp.mockResolvedValue({ data: mockData });
    
    renderWithAuthProvider();
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
    });
    
    const signUpButton = screen.getByTestId('signup');
    act(() => {
      signUpButton.click();
    });
    
    await waitFor(() => {
      expect(supabase.auth.signUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
      });
    });
  });

  test('signOut calls Supabase auth signOut', async () => {
    const { supabase } = require('../../lib/supabase');
    supabase.auth.signOut.mockResolvedValue({});
    
    renderWithAuthProvider();
    
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
    });
    
    const signOutButton = screen.getByTestId('signout');
    act(() => {
      signOutButton.click();
    });
    
    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });
  });

  test('signOut throws error when Supabase returns error', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockError = new Error('Sign out failed');
    supabase.auth.signOut.mockRejectedValue(mockError);
    
    let authContext;
    const TestWrapper = () => {
      authContext = useAuth();
      return null;
    };
    
    render(
      <AuthProvider>
        <TestWrapper />
      </AuthProvider>
    );
    
    await waitFor(() => {
      expect(authContext.loading).toBe(false);
    });
    
    await expect(authContext.signOut()).rejects.toThrow('Sign out failed');
  });

  test('unsubscribes from auth state changes on unmount', () => {
    const { supabase } = require('../../lib/supabase');
    const mockUnsubscribe = jest.fn();
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } }
    });
    
    const { unmount } = renderWithAuthProvider();
    
    unmount();
    
    expect(mockUnsubscribe).toHaveBeenCalled();
  });

  test('memoizes auth value to prevent unnecessary re-renders', async () => {
    let renderCount = 0;
    
    const MemoTestComponent = () => {
      const auth = useAuth();
      renderCount++;
      
      return (
        <div>
          <div data-testid="render-count">{renderCount}</div>
          <div data-testid="loading">{auth.loading ? 'loading' : 'not-loading'}</div>
          <div data-testid="initialized">{auth.initialized ? 'initialized' : 'not-initialized'}</div>
        </div>
      );
    };
    
    render(
      <AuthProvider>
        <MemoTestComponent />
      </AuthProvider>
    );
    
    // Wait for initial render to complete
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('not-loading');
      expect(screen.getByTestId('initialized')).toHaveTextContent('initialized');
    });
    
    // The component should only render twice: initial render and after auth initialization
    expect(renderCount).toBeLessThanOrEqual(2);
  });
});