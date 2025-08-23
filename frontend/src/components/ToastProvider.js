import React, { createContext, useContext, useState, useCallback } from 'react';
import { Toast } from './ErrorDisplay';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children, maxToasts = 5 }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', options = {}) => {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const toast = {
      id,
      message,
      type,
      duration: options.duration || 4000,
      persistent: options.persistent || false,
      action: options.action,
      actionLabel: options.actionLabel,
      ...options
    };

    setToasts(prev => {
      const newToasts = [toast, ...prev];
      // Limit number of toasts
      return newToasts.slice(0, maxToasts);
    });

    return id;
  }, [maxToasts]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Convenience methods
  const success = useCallback((message, options) => 
    addToast(message, 'success', options), [addToast]);
  
  const error = useCallback((message, options) => 
    addToast(message, 'error', options), [addToast]);
  
  const warning = useCallback((message, options) => 
    addToast(message, 'warning', options), [addToast]);
  
  const info = useCallback((message, options) => 
    addToast(message, 'info', options), [addToast]);

  const contextValue = {
    toasts,
    addToast,
    removeToast,
    clearAllToasts,
    success,
    error,
    warning,
    info
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

const ToastContainer = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <EnhancedToast
          key={toast.id}
          toast={toast}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  );
};

const EnhancedToast = ({ toast, onClose }) => {
  const handleAction = () => {
    if (toast.action) {
      toast.action();
    }
    if (!toast.persistent) {
      onClose();
    }
  };

  return (
    <div className="animate-slide-in-right">
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={onClose}
        duration={toast.persistent ? 0 : toast.duration}
        className="shadow-lg"
      />
      {toast.action && (
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleAction}
            className="text-xs px-3 py-1 bg-white bg-opacity-20 hover:bg-opacity-30 rounded transition-all duration-200"
          >
            {toast.actionLabel || 'Action'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ToastProvider;