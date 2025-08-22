import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Navbar from '../Navbar';
import { AuthProvider } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
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

const renderNavbar = (initialPath = '/dashboard') => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <Navbar />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('Navbar', () => {
  beforeEach(() => {
    const { supabase } = require('../../lib/supabase');
    jest.clearAllMocks();
    supabase.auth.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } }
    });
  });

  test('renders navigation links', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByText('NeuroLab 360')).toBeInTheDocument();
      expect(screen.getAllByText('Dashboard')).toHaveLength(2); // Desktop and mobile
      expect(screen.getAllByText('Experiments')).toHaveLength(2); // Desktop and mobile
    });
  });

  test('displays user email when authenticated', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getAllByText('test@example.com')).toHaveLength(2); // Desktop and mobile
    });
  });

  test('displays sign out button when authenticated', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByTestId('signout-button')).toBeInTheDocument();
    });
  });

  test('does not display user info when not authenticated', async () => {
    const { supabase } = require('../../lib/supabase');
    supabase.auth.getSession.mockResolvedValue({
      data: { session: null }
    });
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.queryByTestId('signout-button')).not.toBeInTheDocument();
    });
  });

  test('handles successful sign out', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    supabase.auth.signOut.mockResolvedValue({});
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByTestId('signout-button')).toBeInTheDocument();
    });
    
    const signOutButton = screen.getByTestId('signout-button');
    fireEvent.click(signOutButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('logout-modal')).toBeInTheDocument();
    });
    
    const confirmButton = screen.getByTestId('confirm-logout');
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Successfully signed out');
    });
  });

  test('handles sign out error', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    supabase.auth.signOut.mockRejectedValue(new Error('Sign out failed'));
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByTestId('signout-button')).toBeInTheDocument();
    });
    
    const signOutButton = screen.getByTestId('signout-button');
    fireEvent.click(signOutButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('logout-modal')).toBeInTheDocument();
    });
    
    const confirmButton = screen.getByTestId('confirm-logout');
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('Error signing out. Please try again.');
    });
  });

  test('shows loading state during sign out', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    let resolveSignOut;
    supabase.auth.signOut.mockImplementation(() => 
      new Promise(resolve => {
        resolveSignOut = resolve;
      })
    );
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByTestId('signout-button')).toBeInTheDocument();
    });
    
    const signOutButton = screen.getByTestId('signout-button');
    fireEvent.click(signOutButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('logout-modal')).toBeInTheDocument();
    });
    
    const confirmButton = screen.getByTestId('confirm-logout');
    fireEvent.click(confirmButton);
    
    // Check for loading state - the modal closes and loading shows in navbar buttons
    await waitFor(() => {
      expect(screen.getByTestId('signout-button')).toHaveTextContent('Signing out...');
      expect(screen.getByTestId('signout-button')).toBeDisabled();
    });
    
    // Resolve the sign out promise
    resolveSignOut({});
    
    await waitFor(() => {
      expect(screen.getByTestId('signout-button')).toHaveTextContent('Sign Out');
      expect(screen.getByTestId('signout-button')).not.toBeDisabled();
    });
  });

  test('prevents multiple simultaneous sign out attempts', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    supabase.auth.signOut.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({}), 100))
    );
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByTestId('signout-button')).toBeInTheDocument();
    });
    
    const signOutButton = screen.getByTestId('signout-button');
    
    // Click to show confirmation dialog
    fireEvent.click(signOutButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('logout-modal')).toBeInTheDocument();
    });
    
    const confirmButton = screen.getByTestId('confirm-logout');
    
    // Click multiple times rapidly
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);
    
    // Should only call signOut once
    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    });
  });

  test('shows logout confirmation dialog when sign out is clicked', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByTestId('signout-button')).toBeInTheDocument();
    });
    
    const signOutButton = screen.getByTestId('signout-button');
    fireEvent.click(signOutButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('logout-modal')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Sign Out' })).toBeInTheDocument();
      expect(screen.getByText('Are you sure you want to sign out? You will need to log in again to access your experiments.')).toBeInTheDocument();
      expect(screen.getByTestId('cancel-logout')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-logout')).toBeInTheDocument();
    });
  });

  test('cancels logout when cancel button is clicked', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByTestId('signout-button')).toBeInTheDocument();
    });
    
    const signOutButton = screen.getByTestId('signout-button');
    fireEvent.click(signOutButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('logout-modal')).toBeInTheDocument();
    });
    
    const cancelButton = screen.getByTestId('cancel-logout');
    fireEvent.click(cancelButton);
    
    await waitFor(() => {
      expect(screen.queryByTestId('logout-modal')).not.toBeInTheDocument();
    });
    
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  test('confirms logout when confirm button is clicked', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    supabase.auth.signOut.mockResolvedValue({});
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByTestId('signout-button')).toBeInTheDocument();
    });
    
    const signOutButton = screen.getByTestId('signout-button');
    fireEvent.click(signOutButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('logout-modal')).toBeInTheDocument();
    });
    
    const confirmButton = screen.getByTestId('confirm-logout');
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Successfully signed out');
      expect(screen.queryByTestId('logout-modal')).not.toBeInTheDocument();
    });
  });

  test('toggles mobile menu when hamburger button is clicked', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    // Mock window.innerWidth to simulate mobile view
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 500,
    });
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByTestId('mobile-menu-button')).toBeInTheDocument();
    });
    
    const mobileMenuButton = screen.getByTestId('mobile-menu-button');
    
    // Initially mobile menu should be hidden
    expect(screen.queryByTestId('mobile-menu')).toHaveClass('hidden');
    
    // Click to open mobile menu
    fireEvent.click(mobileMenuButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('mobile-menu')).toHaveClass('block');
    });
    
    // Click to close mobile menu
    fireEvent.click(mobileMenuButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('mobile-menu')).toHaveClass('hidden');
    });
  });

  test('closes mobile menu when navigation link is clicked', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByTestId('mobile-menu-button')).toBeInTheDocument();
    });
    
    const mobileMenuButton = screen.getByTestId('mobile-menu-button');
    
    // Open mobile menu
    fireEvent.click(mobileMenuButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('mobile-menu')).toHaveClass('block');
    });
    
    // Click on a navigation link in mobile menu
    const mobileNavLinks = screen.getByTestId('mobile-menu').querySelectorAll('a');
    fireEvent.click(mobileNavLinks[0]);
    
    await waitFor(() => {
      expect(screen.getByTestId('mobile-menu')).toHaveClass('hidden');
    });
  });

  test('shows mobile sign out button and handles logout', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    supabase.auth.signOut.mockResolvedValue({});
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByTestId('mobile-menu-button')).toBeInTheDocument();
    });
    
    const mobileMenuButton = screen.getByTestId('mobile-menu-button');
    
    // Open mobile menu
    fireEvent.click(mobileMenuButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('mobile-menu')).toHaveClass('block');
      expect(screen.getByTestId('mobile-signout-button')).toBeInTheDocument();
    });
    
    // Click mobile sign out button
    const mobileSignOutButton = screen.getByTestId('mobile-signout-button');
    fireEvent.click(mobileSignOutButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('logout-modal')).toBeInTheDocument();
      expect(screen.getByTestId('mobile-menu')).toHaveClass('hidden');
    });
    
    // Confirm logout
    const confirmButton = screen.getByTestId('confirm-logout');
    fireEvent.click(confirmButton);
    
    await waitFor(() => {
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('Successfully signed out');
    });
  });

  test('highlights active navigation link', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderNavbar();
    
    await waitFor(() => {
      // Get desktop navigation links specifically
      const desktopNav = screen.getByRole('navigation');
      const desktopLinks = desktopNav.querySelectorAll('.sm\\:flex a');
      
      // Find dashboard and experiments links in desktop nav
      const dashboardLink = Array.from(desktopLinks).find(link => link.textContent === 'Dashboard');
      const experimentsLink = Array.from(desktopLinks).find(link => link.textContent === 'Experiments');
      
      expect(dashboardLink).toHaveClass('text-primary-600');
      expect(experimentsLink).toHaveClass('text-gray-500');
    });
  });

  test('displays user avatar in mobile menu', async () => {
    const { supabase } = require('../../lib/supabase');
    const mockUser = { id: '1', email: 'test@example.com' };
    supabase.auth.getSession.mockResolvedValue({
      data: { session: { user: mockUser } }
    });
    
    renderNavbar();
    
    await waitFor(() => {
      expect(screen.getByTestId('mobile-menu-button')).toBeInTheDocument();
    });
    
    const mobileMenuButton = screen.getByTestId('mobile-menu-button');
    
    // Open mobile menu
    fireEvent.click(mobileMenuButton);
    
    await waitFor(() => {
      expect(screen.getByTestId('mobile-menu')).toHaveClass('block');
      // Check for user avatar (first letter of email)
      expect(screen.getByText('T')).toBeInTheDocument(); // First letter of test@example.com
      // Check for full email in mobile menu
      const mobileMenu = screen.getByTestId('mobile-menu');
      expect(mobileMenu).toHaveTextContent('test@example.com');
    });
  });
});