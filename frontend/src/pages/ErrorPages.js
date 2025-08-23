import React from 'react';
import { useNavigate } from 'react-router-dom';
import ErrorDisplay from '../components/ErrorDisplay';

// 404 Not Found Page
export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-50 px-4">
      <div className="max-w-lg w-full text-center">
        <div className="mb-8 animate-fade-in">
          <div className="mx-auto h-24 w-24 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full flex items-center justify-center mb-6">
            <svg className="h-12 w-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Page Not Found</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>
        
        <div className="space-y-4 animate-slide-up">
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary px-8 py-3 w-full sm:w-auto"
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Go to Dashboard</span>
            </div>
          </button>
          
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary px-8 py-3 w-full sm:w-auto ml-0 sm:ml-4"
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Go Back</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

// 500 Server Error Page
export const ServerErrorPage = ({ error, onRetry }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-red-50 px-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8 animate-fade-in">
          <div className="mx-auto h-24 w-24 bg-gradient-to-r from-red-400 to-red-500 rounded-full flex items-center justify-center mb-6">
            <svg className="h-12 w-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-6xl font-bold text-gray-900 mb-4">500</h1>
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Server Error</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Something went wrong on our end. We're working to fix this issue.
          </p>
        </div>
        
        <ErrorDisplay
          error={error}
          title="Server Error"
          onRetry={onRetry}
          showDetails={false}
          className="mb-6"
        />
        
        <div className="text-center space-y-4 animate-slide-up">
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary px-8 py-3 w-full sm:w-auto"
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Go to Dashboard</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

// Network Error Page
export const NetworkErrorPage = ({ onRetry }) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-orange-50 px-4">
      <div className="max-w-lg w-full text-center">
        <div className="mb-8 animate-fade-in">
          <div className="mx-auto h-24 w-24 bg-gradient-to-r from-orange-400 to-orange-500 rounded-full flex items-center justify-center mb-6">
            <svg className="h-12 w-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Connection Problem</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            Unable to connect to the server. Please check your internet connection and try again.
          </p>
        </div>
        
        <div className="space-y-4 animate-slide-up">
          <button
            onClick={onRetry}
            className="btn-primary px-8 py-3 w-full sm:w-auto"
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Try Again</span>
            </div>
          </button>
          
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-secondary px-8 py-3 w-full sm:w-auto ml-0 sm:ml-4"
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Go to Dashboard</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

// Access Denied Page
export const AccessDeniedPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-yellow-50 via-white to-yellow-50 px-4">
      <div className="max-w-lg w-full text-center">
        <div className="mb-8 animate-fade-in">
          <div className="mx-auto h-24 w-24 bg-gradient-to-r from-yellow-400 to-yellow-500 rounded-full flex items-center justify-center mb-6">
            <svg className="h-12 w-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-6xl font-bold text-gray-900 mb-4">403</h1>
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            You don't have permission to access this resource. Please contact your administrator if you believe this is an error.
          </p>
        </div>
        
        <div className="space-y-4 animate-slide-up">
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary px-8 py-3 w-full sm:w-auto"
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Go to Dashboard</span>
            </div>
          </button>
          
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary px-8 py-3 w-full sm:w-auto ml-0 sm:ml-4"
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Go Back</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

// Generic Error Page Component
export const ErrorPage = ({ 
  error, 
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  onRetry,
  showRetry = true 
}) => {
  const navigate = useNavigate();

  // Determine error type and render appropriate page
  if (error?.status === 404) {
    return <NotFoundPage />;
  }
  
  if (error?.status === 403) {
    return <AccessDeniedPage />;
  }
  
  if (error?.status >= 500) {
    return <ServerErrorPage error={error} onRetry={onRetry} />;
  }
  
  if (!navigator.onLine || error?.name === 'NetworkError') {
    return <NetworkErrorPage onRetry={onRetry} />;
  }

  // Generic error page
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-50 px-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8 animate-fade-in">
          <div className="mx-auto h-24 w-24 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full flex items-center justify-center mb-6">
            <svg className="h-12 w-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-700 mb-4">{title}</h2>
          <p className="text-gray-600 mb-8 leading-relaxed">
            {description}
          </p>
        </div>
        
        {error && (
          <ErrorDisplay
            error={error}
            title={title}
            onRetry={onRetry}
            showRetry={showRetry}
            className="mb-6"
          />
        )}
        
        <div className="text-center space-y-4 animate-slide-up">
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary px-8 py-3 w-full sm:w-auto"
          >
            <div className="flex items-center justify-center space-x-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Go to Dashboard</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default {
  NotFoundPage,
  ServerErrorPage,
  NetworkErrorPage,
  AccessDeniedPage,
  ErrorPage
};