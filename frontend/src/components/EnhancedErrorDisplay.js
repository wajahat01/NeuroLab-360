import React, { useState, useCallback } from 'react';
import ErrorDisplay from './ErrorDisplay';

/**
 * Enhanced error display component that handles new error response formats
 * and provides intelligent recovery suggestions
 */
export const EnhancedErrorDisplay = ({ 
  error, 
  errorDetails,
  onRetry, 
  onIntelligentRetry,
  title,
  className = "",
  size = "md",
  showTechnicalDetails = false,
  fallbackAvailable = false,
  serviceStatus = 'error',
  retryAfter = null
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // Get error configuration based on error details
  const getErrorConfig = useCallback(() => {
    if (!errorDetails) {
      return {
        type: 'error',
        title: title || 'Something went wrong',
        message: error || 'An unexpected error occurred',
        suggestions: ['Try refreshing the page'],
        canRetry: true,
        severity: 'error'
      };
    }

    const config = {
      type: errorDetails.severity === 'warning' ? 'warning' : 
            errorDetails.severity === 'info' ? 'info' : 'error',
      title: title || getErrorTitle(errorDetails.code, serviceStatus),
      message: errorDetails.message || error,
      suggestions: errorDetails.suggestions || getDefaultSuggestions(errorDetails.code),
      canRetry: errorDetails.canRetry !== false,
      severity: errorDetails.severity || 'error',
      actions: errorDetails.actions || []
    };

    return config;
  }, [error, errorDetails, title, serviceStatus]);

  // Get error title based on error code and service status
  const getErrorTitle = useCallback((errorCode, status) => {
    switch (errorCode) {
      case 'AUTH_FAILED':
        return 'Authentication Required';
      case 'NETWORK_ERROR':
        return 'Connection Issue';
      case 'DATABASE_ERROR':
        return 'Data Temporarily Unavailable';
      case 'SERVICE_UNAVAILABLE':
        return 'Service Temporarily Unavailable';
      case 'VALIDATION_ERROR':
        return 'Invalid Data';
      default:
        switch (status) {
          case 'degraded':
            return 'Service Degraded';
          case 'offline':
            return 'You\'re Offline';
          case 'auth_required':
            return 'Authentication Required';
          default:
            return 'Something went wrong';
        }
    }
  }, []);

  // Get default suggestions based on error code
  const getDefaultSuggestions = useCallback((errorCode) => {
    switch (errorCode) {
      case 'AUTH_FAILED':
        return ['Try refreshing the page', 'Log in again'];
      case 'NETWORK_ERROR':
        return ['Check your internet connection', 'Try again in a moment'];
      case 'DATABASE_ERROR':
        return ['Try again in a few minutes', 'Contact support if the issue persists'];
      case 'SERVICE_UNAVAILABLE':
        return ['Wait a moment and try again', 'Check our status page'];
      case 'VALIDATION_ERROR':
        return ['Check your input', 'Try again with different data'];
      default:
        return ['Try refreshing the page', 'Contact support if the issue persists'];
    }
  }, []);

  // Handle intelligent retry
  const handleIntelligentRetry = useCallback(async () => {
    if (isRetrying) return;
    
    setIsRetrying(true);
    try {
      if (onIntelligentRetry) {
        await onIntelligentRetry();
      } else if (onRetry) {
        await onRetry();
      }
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying, onIntelligentRetry, onRetry]);

  // Handle specific actions
  const handleAction = useCallback((action) => {
    switch (action) {
      case 'refresh_token':
        // Trigger token refresh
        window.location.reload();
        break;
      case 'login_again':
        // Redirect to login
        window.location.href = '/login';
        break;
      default:
        console.log('Unknown action:', action);
    }
  }, []);

  const config = getErrorConfig();

  return (
    <div className={`enhanced-error-display ${className}`}>
      <ErrorDisplay
        error={config.message}
        title={config.title}
        type={config.type}
        size={size}
        onRetry={config.canRetry ? handleIntelligentRetry : undefined}
        showRetry={config.canRetry}
        className="mb-4"
      />
      
      {/* Recovery Suggestions */}
      {config.suggestions && config.suggestions.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-2">
            What you can try:
          </h4>
          <ul className="text-sm text-gray-600 space-y-1">
            {config.suggestions.map((suggestion, index) => (
              <li key={index} className="flex items-start space-x-2">
                <span className="text-gray-400 mt-0.5">•</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Retry Timer */}
      {retryAfter && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
          <div className="flex items-center space-x-2">
            <svg className="h-4 w-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-blue-800">
              Automatic retry in {retryAfter} seconds
            </span>
          </div>
        </div>
      )}

      {/* Fallback Data Notice */}
      {fallbackAvailable && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <div className="flex items-center space-x-2">
            <svg className="h-4 w-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-yellow-800">
              Showing cached data while service recovers
            </span>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {config.actions && config.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {config.actions.map((action, index) => (
            <button
              key={index}
              onClick={() => handleAction(action)}
              className="px-3 py-1.5 text-sm bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 transition-colors duration-200"
            >
              {action === 'refresh_token' && 'Refresh Session'}
              {action === 'login_again' && 'Login Again'}
              {!['refresh_token', 'login_again'].includes(action) && action}
            </button>
          ))}
        </div>
      )}

      {/* Technical Details */}
      {showTechnicalDetails && errorDetails && (
        <div className="border-t border-gray-200 pt-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-gray-500 hover:text-gray-700 underline mb-2"
          >
            {showDetails ? 'Hide' : 'Show'} technical details
          </button>
          
          {showDetails && (
            <div className="bg-gray-100 rounded-lg p-3 text-xs font-mono text-gray-700 overflow-x-auto">
              <div className="space-y-1">
                <div><strong>Error Code:</strong> {errorDetails.code}</div>
                <div><strong>Error ID:</strong> {errorDetails.errorId || 'N/A'}</div>
                <div><strong>Service Status:</strong> {serviceStatus}</div>
                {errorDetails.details && (
                  <div><strong>Details:</strong> {JSON.stringify(errorDetails.details, null, 2)}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Service status indicator component
 */
export const ServiceStatusIndicator = ({ 
  status = 'healthy', 
  className = "",
  showLabel = true 
}) => {
  const getStatusConfig = useCallback((status) => {
    switch (status) {
      case 'healthy':
        return {
          color: 'text-green-600',
          bgColor: 'bg-green-100',
          label: 'All systems operational',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )
        };
      case 'degraded':
        return {
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
          label: 'Service degraded',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          )
        };
      case 'error':
      case 'unavailable':
        return {
          color: 'text-red-600',
          bgColor: 'bg-red-100',
          label: 'Service unavailable',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )
        };
      case 'offline':
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          label: 'You\'re offline',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192L5.636 18.364M12 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
      case 'auth_required':
        return {
          color: 'text-blue-600',
          bgColor: 'bg-blue-100',
          label: 'Authentication required',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          )
        };
      default:
        return {
          color: 'text-gray-600',
          bgColor: 'bg-gray-100',
          label: 'Unknown status',
          icon: (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )
        };
    }
  }, []);

  const config = getStatusConfig(status);

  return (
    <div className={`inline-flex items-center space-x-2 px-2 py-1 rounded-full ${config.bgColor} ${className}`}>
      <div className={config.color}>
        {config.icon}
      </div>
      {showLabel && (
        <span className={`text-xs font-medium ${config.color}`}>
          {config.label}
        </span>
      )}
    </div>
  );
};

export default EnhancedErrorDisplay;