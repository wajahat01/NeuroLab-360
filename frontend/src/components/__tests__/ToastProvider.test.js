import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import ToastProvider, { useToast } from '../ToastProvider';

// Test component that uses the toast hook
const TestComponent = () => {
  const { success, error, warning, info, clearAllToasts } = useToast();

  return (
    <div>
      <button onClick={() => success('Success message')}>Success Toast</button>
      <button onClick={() => error('Error message')}>Error Toast</button>
      <button onClick={() => warning('Warning message')}>Warning Toast</button>
      <button onClick={() => info('Info message')}>Info Toast</button>
      <button onClick={() => clearAllToasts()}>Clear All</button>
    </div>
  );
};

// Mock timers for testing auto-dismiss
jest.useFakeTimers();

describe('ToastProvider', () => {
  beforeEach(() => {
    jest.clearAllTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
  });

  it('renders children without toasts initially', () => {
    render(
      <ToastProvider>
        <div>Test content</div>
      </ToastProvider>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('throws error when useToast is used outside provider', () => {
    // Suppress console.error for this test
    const originalError = console.error;
    console.error = jest.fn();

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useToast must be used within a ToastProvider');

    console.error = originalError;
  });

  it('displays success toast', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Success Toast'));
    expect(screen.getByText('Success message')).toBeInTheDocument();
  });

  it('displays error toast', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Error Toast'));
    expect(screen.getByText('Error message')).toBeInTheDocument();
  });

  it('displays warning toast', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Warning Toast'));
    expect(screen.getByText('Warning message')).toBeInTheDocument();
  });

  it('displays info toast', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Info Toast'));
    expect(screen.getByText('Info message')).toBeInTheDocument();
  });

  it('auto-dismisses toasts after duration', async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Success Toast'));
    expect(screen.getByText('Success message')).toBeInTheDocument();

    // Fast-forward time
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    await waitFor(() => {
      expect(screen.queryByText('Success message')).not.toBeInTheDocument();
    });
  });

  it('allows manual dismissal of toasts', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Success Toast'));
    expect(screen.getByText('Success message')).toBeInTheDocument();

    // Find and click the close button (it doesn't have accessible name, so find by SVG)
    const closeButtons = screen.getAllByRole('button');
    const closeButton = closeButtons.find(button => 
      button.querySelector('svg path[d*="M6 18L18 6M6 6l12 12"]')
    );
    if (closeButton) {
      fireEvent.click(closeButton);
    }

    expect(screen.queryByText('Success message')).not.toBeInTheDocument();
  });

  it('clears all toasts', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    // Add multiple toasts
    fireEvent.click(screen.getByText('Success Toast'));
    fireEvent.click(screen.getByText('Error Toast'));
    fireEvent.click(screen.getByText('Warning Toast'));

    expect(screen.getByText('Success message')).toBeInTheDocument();
    expect(screen.getByText('Error message')).toBeInTheDocument();
    expect(screen.getByText('Warning message')).toBeInTheDocument();

    // Clear all toasts
    fireEvent.click(screen.getByText('Clear All'));

    expect(screen.queryByText('Success message')).not.toBeInTheDocument();
    expect(screen.queryByText('Error message')).not.toBeInTheDocument();
    expect(screen.queryByText('Warning message')).not.toBeInTheDocument();
  });

  it('limits number of toasts based on maxToasts prop', () => {
    const TestComponentMany = () => {
      const { info } = useToast();
      return (
        <button onClick={() => {
          for (let i = 0; i < 10; i++) {
            info(`Message ${i}`);
          }
        }}>
          Add Many Toasts
        </button>
      );
    };

    render(
      <ToastProvider maxToasts={3}>
        <TestComponentMany />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Add Many Toasts'));

    // Should only show the last 3 messages (7, 8, 9)
    expect(screen.getByText('Message 7')).toBeInTheDocument();
    expect(screen.getByText('Message 8')).toBeInTheDocument();
    expect(screen.getByText('Message 9')).toBeInTheDocument();
    expect(screen.queryByText('Message 0')).not.toBeInTheDocument();
    expect(screen.queryByText('Message 6')).not.toBeInTheDocument();
  });

  it('handles persistent toasts', () => {
    const TestComponentPersistent = () => {
      const { addToast } = useToast();
      return (
        <button onClick={() => addToast('Persistent message', 'info', { persistent: true })}>
          Persistent Toast
        </button>
      );
    };

    render(
      <ToastProvider>
        <TestComponentPersistent />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Persistent Toast'));
    expect(screen.getByText('Persistent message')).toBeInTheDocument();

    // Fast-forward time - should still be there
    act(() => {
      jest.advanceTimersByTime(10000);
    });

    expect(screen.getByText('Persistent message')).toBeInTheDocument();
  });

  it('handles toast with custom action', () => {
    const mockAction = jest.fn();
    
    const TestComponentAction = () => {
      const { addToast } = useToast();
      return (
        <button onClick={() => addToast('Action message', 'info', { 
          action: mockAction, 
          actionLabel: 'Custom Action' 
        })}>
          Toast with Action
        </button>
      );
    };

    render(
      <ToastProvider>
        <TestComponentAction />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Toast with Action'));
    expect(screen.getByText('Action message')).toBeInTheDocument();
    
    const actionButton = screen.getByText('Custom Action');
    fireEvent.click(actionButton);
    
    expect(mockAction).toHaveBeenCalled();
  });
});