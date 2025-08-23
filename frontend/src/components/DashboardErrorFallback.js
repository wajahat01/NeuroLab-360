import React from 'react';

const DashboardErrorFallback = ({ error, resetError, retryCount = 0 }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Maintain header structure */}
      <div className="h-16 bg-white border-b border-gray-200 flex items-center px-6">
        <div className="h-4 bg-gray-300 rounded w-32"></div>
      </div>
      
      {/* Main content area with error message */}
      <div className="p-6">
        <div className="max-w-2xl mx-auto">
          {/* Error card that maintains dashboard layout */}
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="flex justify-center mb-4">
              <svg className="h-12 w-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Dashboard Error
            </h3>
            
            <p className="text-gray-600 mb-4">
              We encountered an error while loading your dashboard content.
            </p>

            {resetError && (
              <button
                onClick={resetError}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                disabled={retryCount >= 3}
              >
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {retryCount >= 3 ? 'Max retries reached' : 'Retry'}
              </button>
            )}
          </div>

          {/* Maintain grid layout structure with placeholder cards */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-lg shadow p-4 opacity-50">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardErrorFallback;