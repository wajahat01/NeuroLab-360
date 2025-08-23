import React, { useState } from 'react';

const ErrorDisplay = ({ 
  error, 
  onRetry, 
  title = "Something went wrong",
  showRetry = true,
  className = "",
  type = "error",
  size = "md",
  showDetails = false
}) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [showFullError, setShowFullError] = useState(false);

  const handleRetry = async () => {
    if (isRetrying || !onRetry) return;
    
    setIsRetrying(true);
    try {
      await onRetry();
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setIsRetrying(false);
    }
  };

  const typeConfig = {
    error: {
      bgColor: 'bg-error-50',
      borderColor: 'border-error-200',
      textColor: 'text-error-800',
      iconColor: 'text-error-400',
      buttonBg: 'bg-error-100 hover:bg-error-200',
      buttonText: 'text-error-800',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      )
    },
    warning: {
      bgColor: 'bg-warning-50',
      borderColor: 'border-warning-200',
      textColor: 'text-warning-800',
      iconColor: 'text-warning-400',
      buttonBg: 'bg-warning-100 hover:bg-warning-200',
      buttonText: 'text-warning-800',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      )
    },
    info: {
      bgColor: 'bg-primary-50',
      borderColor: 'border-primary-200',
      textColor: 'text-primary-800',
      iconColor: 'text-primary-400',
      buttonBg: 'bg-primary-100 hover:bg-primary-200',
      buttonText: 'text-primary-800',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      )
    }
  };

  const config = typeConfig[type] || typeConfig.error;
  
  const sizeConfig = {
    sm: {
      padding: 'p-4',
      iconSize: 'h-4 w-4',
      titleSize: 'text-sm',
      textSize: 'text-xs',
      buttonSize: 'px-3 py-1.5 text-xs'
    },
    md: {
      padding: 'p-6',
      iconSize: 'h-5 w-5',
      titleSize: 'text-sm',
      textSize: 'text-sm',
      buttonSize: 'px-4 py-2 text-sm'
    },
    lg: {
      padding: 'p-8',
      iconSize: 'h-6 w-6',
      titleSize: 'text-base',
      textSize: 'text-sm',
      buttonSize: 'px-6 py-3 text-base'
    }
  };

  const sizeStyles = sizeConfig[size] || sizeConfig.md;

  const errorMessage = typeof error === 'string' ? error : error?.message || "An unexpected error occurred. Please try again.";
  const errorDetails = typeof error === 'object' ? JSON.stringify(error, null, 2) : null;

  return (
    <div className={`${config.bgColor} border ${config.borderColor} rounded-xl ${sizeStyles.padding} animate-fade-in ${className}`}>
      <div className="flex items-start space-x-3">
        <div className={`flex-shrink-0 ${config.iconColor}`}>
          <div className={sizeStyles.iconSize}>
            {config.icon}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`${sizeStyles.titleSize} font-semibold ${config.textColor} mb-2`}>
            {title}
          </h3>
          <div className={`${sizeStyles.textSize} ${config.textColor} mb-4`}>
            <p className="leading-relaxed">{errorMessage}</p>
            {showDetails && errorDetails && (
              <div className="mt-3">
                <button
                  onClick={() => setShowFullError(!showFullError)}
                  className={`${sizeStyles.textSize} underline hover:no-underline transition-all duration-200`}
                >
                  {showFullError ? 'Hide' : 'Show'} technical details
                </button>
                {showFullError && (
                  <pre className="mt-2 p-3 bg-gray-100 rounded-lg text-xs overflow-x-auto text-gray-700">
                    {errorDetails}
                  </pre>
                )}
              </div>
            )}
          </div>
          {showRetry && onRetry && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRetry}
                disabled={isRetrying}
                className={`${config.buttonBg} ${config.buttonText} ${sizeStyles.buttonSize} font-medium rounded-lg focus-ring transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover-lift`}
              >
                {isRetrying ? (
                  <div className="flex items-center space-x-2">
                    <div className="loading-spinner h-4 w-4"></div>
                    <span>Retrying...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Try again</span>
                  </div>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const EmptyState = ({ 
  title = "No data available",
  description = "There's nothing to show here yet.",
  action,
  actionLabel = "Get started",
  icon,
  className = "",
  size = "md",
  variant = "default"
}) => {
  const sizeConfig = {
    sm: {
      container: 'py-8',
      iconSize: 'w-8 h-8',
      titleSize: 'text-base',
      descSize: 'text-sm',
      buttonSize: 'px-4 py-2 text-sm'
    },
    md: {
      container: 'py-12',
      iconSize: 'w-12 h-12',
      titleSize: 'text-lg',
      descSize: 'text-sm',
      buttonSize: 'px-6 py-3 text-base'
    },
    lg: {
      container: 'py-16',
      iconSize: 'w-16 h-16',
      titleSize: 'text-xl',
      descSize: 'text-base',
      buttonSize: 'px-8 py-4 text-lg'
    }
  };

  const variantConfig = {
    default: {
      iconColor: 'text-gray-400',
      titleColor: 'text-gray-900',
      descColor: 'text-gray-500'
    },
    primary: {
      iconColor: 'text-primary-400',
      titleColor: 'text-primary-900',
      descColor: 'text-primary-600'
    },
    success: {
      iconColor: 'text-success-400',
      titleColor: 'text-success-900',
      descColor: 'text-success-600'
    }
  };

  const sizeStyles = sizeConfig[size] || sizeConfig.md;
  const variantStyles = variantConfig[variant] || variantConfig.default;

  const defaultIcon = (
    <svg className={`${sizeStyles.iconSize} ${variantStyles.iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );

  return (
    <div className={`text-center ${sizeStyles.container} animate-fade-in ${className}`}>
      <div className="mx-auto mb-4 flex justify-center">
        {icon || defaultIcon}
      </div>
      <h3 className={`${sizeStyles.titleSize} font-semibold ${variantStyles.titleColor} mb-2`}>
        {title}
      </h3>
      <p className={`${sizeStyles.descSize} ${variantStyles.descColor} mb-6 max-w-sm mx-auto leading-relaxed`}>
        {description}
      </p>
      {action && (
        <button
          onClick={action}
          className={`btn-primary ${sizeStyles.buttonSize} inline-flex items-center space-x-2 hover-lift`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
};

// Toast notification component
export const Toast = ({ 
  message, 
  type = 'info', 
  onClose, 
  duration = 4000,
  className = '' 
}) => {
  React.useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const typeConfig = {
    success: {
      bgColor: 'bg-success-50',
      borderColor: 'border-success-200',
      textColor: 'text-success-800',
      iconColor: 'text-success-400',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )
    },
    error: {
      bgColor: 'bg-error-50',
      borderColor: 'border-error-200',
      textColor: 'text-error-800',
      iconColor: 'text-error-400',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      )
    },
    warning: {
      bgColor: 'bg-warning-50',
      borderColor: 'border-warning-200',
      textColor: 'text-warning-800',
      iconColor: 'text-warning-400',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      )
    },
    info: {
      bgColor: 'bg-primary-50',
      borderColor: 'border-primary-200',
      textColor: 'text-primary-800',
      iconColor: 'text-primary-400',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      )
    }
  };

  const config = typeConfig[type] || typeConfig.info;

  return (
    <div className={`${config.bgColor} border ${config.borderColor} rounded-xl p-4 shadow-lg animate-slide-up ${className}`}>
      <div className="flex items-start space-x-3">
        <div className={`flex-shrink-0 ${config.iconColor}`}>
          {config.icon}
        </div>
        <div className="flex-1">
          <p className={`text-sm font-medium ${config.textColor}`}>
            {message}
          </p>
        </div>
        <button
          onClick={onClose}
          className={`flex-shrink-0 ${config.iconColor} hover:opacity-75 transition-opacity duration-200`}
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ErrorDisplay;