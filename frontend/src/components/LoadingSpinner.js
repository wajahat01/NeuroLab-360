import React from 'react';

const LoadingSpinner = ({ 
  size = 'md', 
  className = '', 
  color = 'primary',
  type = 'spinner',
  text = null 
}) => {
  const sizeClasses = {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };

  const colorClasses = {
    primary: 'border-primary-600',
    secondary: 'border-secondary-600',
    success: 'border-success-600',
    warning: 'border-warning-600',
    error: 'border-error-600',
    white: 'border-white',
  };

  if (type === 'dots') {
    return (
      <div className={`flex items-center space-x-2 ${className}`} role="status" aria-label="Loading">
        <div className="loading-dots">
          <div className={`${sizeClasses[size]} ${colorClasses[color].replace('border-', 'bg-')}`}></div>
          <div className={`${sizeClasses[size]} ${colorClasses[color].replace('border-', 'bg-')}`}></div>
          <div className={`${sizeClasses[size]} ${colorClasses[color].replace('border-', 'bg-')}`}></div>
        </div>
        {text && <span className="text-sm text-gray-600 ml-2">{text}</span>}
      </div>
    );
  }

  if (type === 'pulse') {
    return (
      <div className={`flex items-center space-x-2 ${className}`} role="status" aria-label="Loading">
        <div className={`${sizeClasses[size]} ${colorClasses[color].replace('border-', 'bg-')} rounded-full animate-pulse`}></div>
        {text && <span className="text-sm text-gray-600">{text}</span>}
      </div>
    );
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`} role="status" aria-label="Loading">
      <div className={`loading-spinner ${sizeClasses[size]} border-2 border-gray-300 ${colorClasses[color]} border-t-current`}></div>
      {text && <span className="text-sm text-gray-600">{text}</span>}
    </div>
  );
};

// Progress bar component
export const ProgressBar = ({ 
  progress = 0, 
  className = '', 
  color = 'primary',
  size = 'md',
  showPercentage = false,
  animated = true 
}) => {
  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  const colorClasses = {
    primary: 'bg-primary-600',
    secondary: 'bg-secondary-600',
    success: 'bg-success-600',
    warning: 'bg-warning-600',
    error: 'bg-error-600',
  };

  return (
    <div className={`w-full ${className}`}>
      <div className={`bg-gray-200 rounded-full ${sizeClasses[size]} overflow-hidden`}>
        <div 
          className={`${sizeClasses[size]} ${colorClasses[color]} rounded-full transition-all duration-300 ${animated ? 'animate-pulse' : ''}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        ></div>
      </div>
      {showPercentage && (
        <div className="text-xs text-gray-600 mt-1 text-center">
          {Math.round(progress)}%
        </div>
      )}
    </div>
  );
};

// Skeleton loader component
export const SkeletonLoader = ({ 
  lines = 3, 
  className = '',
  avatar = false,
  button = false 
}) => {
  return (
    <div className={`animate-pulse ${className}`}>
      {avatar && (
        <div className="flex items-center space-x-4 mb-4">
          <div className="rounded-full bg-gray-200 h-10 w-10"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {[...Array(lines)].map((_, i) => (
          <div 
            key={i}
            className={`h-4 bg-gray-200 rounded ${
              i === lines - 1 ? 'w-2/3' : 'w-full'
            }`}
          ></div>
        ))}
      </div>
      {button && (
        <div className="mt-4">
          <div className="h-10 bg-gray-200 rounded w-24"></div>
        </div>
      )}
    </div>
  );
};

export default LoadingSpinner;