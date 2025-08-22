import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Login from '../Login';

// Mock react-hot-toast
jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

// Mock react-router-dom
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock AuthContext
const mockSignIn = jest.fn();
const mockUser = null;
jest.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    signIn: mockSignIn,
    user: mockUser,
  }),
}));

const renderLogin = () => {
  return render(
    <BrowserRouter>
      <Login />
    </BrowserRouter>
  );
};

describe('Login Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
  });

  test('renders login form with all required elements', () => {
    renderLogin();
    
    expect(screen.getByText('NeuroLab 360')).toBeInTheDocument();
    expect(screen.getByText('Sign in to your account')).toBeInTheDocument();
    expect(screen.getByTestId('email-input')).toBeInTheDocument();
    expect(screen.getByTestId('password-input')).toBeInTheDocument();
    expect(screen.getByTestId('submit-button')).toBeInTheDocument();
  });

  test('shows validation errors for empty fields', async () => {
    renderLogin();
    
    const emailInput = screen.getByTestId('email-input');
    const passwordInput = screen.getByTestId('password-input');
    
    // First enter some text, then clear it to trigger validation
    fireEvent.change(emailInput, { target: { value: 'test' } });
    fireEvent.change(emailInput, { target: { value: '' } });
    fireEvent.change(passwordInput, { target: { value: 'test' } });
    fireEvent.change(passwordInput, { target: { value: '' } });
    
    await waitFor(() => {
      expect(screen.getByTestId('email-error')).toHaveTextContent('Email is required');
      expect(screen.getByTestId('password-error')).toHaveTextContent('Password is required');
    });
  });

  test('shows validation error for invalid email format', async () => {
    renderLogin();
    
    const emailInput = screen.getByTestId('email-input');
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    
    await waitFor(() => {
      expect(screen.getByTestId('email-error')).toHaveTextContent('Please enter a valid email address');
    });
  });

  test('shows validation error for short password', async () => {
    renderLogin();
    
    const passwordInput = screen.getByTestId('password-input');
    fireEvent.change(passwordInput, { target: { value: '123' } });
    
    await waitFor(() => {
      expect(screen.getByTestId('password-error')).toHaveTextContent('Password must be at least 6 characters');
    });
  });

  test('clears validation errors when valid input is provided', async () => {
    renderLogin();
    
    const emailInput = screen.getByTestId('email-input');
    const passwordInput = screen.getByTestId('password-input');
    
    // First trigger errors
    fireEvent.change(emailInput, { target: { value: 'invalid' } });
    fireEvent.change(passwordInput, { target: { value: '123' } });
    
    await waitFor(() => {
      expect(screen.getByTestId('email-error')).toBeInTheDocument();
      expect(screen.getByTestId('password-error')).toBeInTheDocument();
    });
    
    // Then provide valid input
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    
    await waitFor(() => {
      expect(screen.queryByTestId('email-error')).not.toBeInTheDocument();
      expect(screen.queryByTestId('password-error')).not.toBeInTheDocument();
    });
  });

  test('disables submit button when there are validation errors', async () => {
    renderLogin();
    
    const emailInput = screen.getByTestId('email-input');
    const submitButton = screen.getByTestId('submit-button');
    
    fireEvent.change(emailInput, { target: { value: 'invalid' } });
    
    await waitFor(() => {
      expect(submitButton).toBeDisabled();
    });
  });

  test('enables submit button when form is valid', async () => {
    renderLogin();
    
    const emailInput = screen.getByTestId('email-input');
    const passwordInput = screen.getByTestId('password-input');
    const submitButton = screen.getByTestId('submit-button');
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
  });

  test('shows loading state during form submission', async () => {
    mockSignIn.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({}), 100))
    );
    
    renderLogin();
    
    const emailInput = screen.getByTestId('email-input');
    const passwordInput = screen.getByTestId('password-input');
    const submitButton = screen.getByTestId('submit-button');
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);
    
    expect(screen.getByText('Signing in...')).toBeInTheDocument();
    expect(submitButton).toBeDisabled();
  });

  test('handles login success', async () => {
    const toast = require('react-hot-toast');
    mockSignIn.mockResolvedValue({});
    
    renderLogin();
    
    const emailInput = screen.getByTestId('email-input');
    const passwordInput = screen.getByTestId('password-input');
    const submitButton = screen.getByTestId('submit-button');
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith('test@example.com', 'password123');
      expect(toast.success).toHaveBeenCalledWith('Successfully signed in!');
      expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    });
  });

  test('handles login error with invalid credentials', async () => {
    const toast = require('react-hot-toast');
    mockSignIn.mockRejectedValue(new Error('Invalid login credentials'));
    
    renderLogin();
    
    const emailInput = screen.getByTestId('email-input');
    const passwordInput = screen.getByTestId('password-input');
    const submitButton = screen.getByTestId('submit-button');
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid email or password');
    });
  });

  test('handles generic login error', async () => {
    const toast = require('react-hot-toast');
    mockSignIn.mockRejectedValue(new Error('Network error'));
    
    renderLogin();
    
    const emailInput = screen.getByTestId('email-input');
    const passwordInput = screen.getByTestId('password-input');
    const submitButton = screen.getByTestId('submit-button');
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('An error occurred during sign in');
    });
  });
});