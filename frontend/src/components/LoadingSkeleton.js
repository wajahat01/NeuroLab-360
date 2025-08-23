import React from 'react';

export const StatCardSkeleton = ({ className = '' }) => (
  <div className={`bg-white rounded-lg shadow p-6 animate-pulse ${className}`}>
    <div className="flex items-center">
      <div className="flex-shrink-0">
        <div className="w-8 h-8 bg-gray-200 rounded loading-shimmer"></div>
      </div>
      <div className="ml-4 flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-3/4 loading-shimmer"></div>
        <div className="h-7 bg-gray-200 rounded w-1/2 loading-shimmer"></div>
        <div className="h-3 bg-gray-200 rounded w-full loading-shimmer"></div>
      </div>
    </div>
  </div>
);

export const ChartSkeleton = ({ height = 300, className = '' }) => (
  <div className={`stable-dimensions ${className}`}>
    <div className="mb-4">
      <div className="h-6 bg-gray-200 rounded w-1/3 loading-shimmer"></div>
    </div>
    <div 
      className="bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-lg loading-shimmer"
      style={{ height: `${height}px`, minHeight: `${height}px` }}
    >
      <div className="h-full flex items-end justify-around p-4 space-x-2">
        {[...Array(8)].map((_, i) => {
          // Use deterministic heights for consistent testing
          const heights = [30, 60, 45, 75, 40, 55, 35, 65];
          return (
            <div 
              key={i}
              className="bg-gray-300 rounded-t animate-pulse"
              style={{ 
                height: `${heights[i]}%`,
                width: '12px'
              }}
            ></div>
          );
        })}
      </div>
    </div>
  </div>
);

export const ExperimentCardSkeleton = ({ className = '' }) => (
  <div className={`card animate-pulse ${className}`}>
    <div className="card-body">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3 flex-1">
          <div className="w-5 h-5 bg-gray-200 rounded flex-shrink-0"></div>
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-gray-200 rounded w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
        <div className="h-6 bg-gray-200 rounded-full w-20 flex-shrink-0"></div>
      </div>
      
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <div className="h-3 bg-gray-200 rounded w-1/3"></div>
          <div className="h-3 bg-gray-200 rounded w-1/4"></div>
        </div>
      </div>
      
      <div className="flex justify-between items-center">
        <div className="h-8 bg-gray-200 rounded w-24"></div>
        <div className="h-4 bg-gray-200 rounded w-16"></div>
      </div>
    </div>
  </div>
);

export const InsightCardSkeleton = ({ className = '' }) => (
  <div className={`bg-blue-50 border border-blue-200 rounded-lg p-4 animate-pulse ${className}`}>
    <div className="flex items-start space-x-3">
      <div className="w-6 h-6 bg-gray-200 rounded-full flex-shrink-0 loading-shimmer"></div>
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-full loading-shimmer"></div>
        <div className="h-3 bg-gray-200 rounded w-3/4 loading-shimmer"></div>
      </div>
    </div>
  </div>
);

export const TableSkeleton = ({ rows = 5, columns = 4, className = '' }) => (
  <div className={`card animate-pulse ${className}`}>
    <div className="card-header">
      <div className="h-5 bg-gray-200 rounded w-1/4"></div>
    </div>
    <div className="card-body p-0">
      <div className="overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-4 gap-4 p-4 border-b border-gray-200">
          {[...Array(columns)].map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded"></div>
          ))}
        </div>
        {/* Table rows */}
        {[...Array(rows)].map((_, rowIndex) => (
          <div key={rowIndex} className="grid grid-cols-4 gap-4 p-4 border-b border-gray-100">
            {[...Array(columns)].map((_, colIndex) => (
              <div 
                key={colIndex} 
                className={`h-4 bg-gray-200 rounded ${
                  colIndex === 0 ? 'w-3/4' : colIndex === columns - 1 ? 'w-1/2' : 'w-full'
                }`}
              ></div>
            ))}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const FormSkeleton = ({ fields = 3, className = '' }) => (
  <div className={`card animate-pulse ${className}`}>
    <div className="card-header">
      <div className="h-6 bg-gray-200 rounded w-1/3"></div>
    </div>
    <div className="card-body space-y-6">
      {[...Array(fields)].map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-10 bg-gray-200 rounded-lg w-full"></div>
        </div>
      ))}
      <div className="flex justify-end space-x-3 pt-4">
        <div className="h-10 bg-gray-200 rounded-lg w-20"></div>
        <div className="h-10 bg-gray-200 rounded-lg w-24"></div>
      </div>
    </div>
  </div>
);

export const DashboardSkeleton = ({ className = '' }) => (
  <div className={`dashboard-content prevent-layout-shift ${className}`}>
    {/* Header skeleton - matches Dashboard header exactly */}
    <div className="space-y-2">
      <div className="h-9 bg-gray-200 rounded w-64 loading-shimmer"></div>
      <div className="h-5 bg-gray-200 rounded w-96 loading-shimmer"></div>
    </div>

    {/* Summary Stats Cards skeleton - uses stable grid layout */}
    <div className="dashboard-stats-grid">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="dashboard-stat-card animate-pulse">
          <div className="flex items-center w-full">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-gray-200 rounded loading-shimmer"></div>
            </div>
            <div className="ml-4 flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4 loading-shimmer"></div>
              <div className="h-7 bg-gray-200 rounded w-1/2 loading-shimmer"></div>
              <div className="h-3 bg-gray-200 rounded w-full loading-shimmer"></div>
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* Period selector skeleton - uses stable layout */}
    <div className="dashboard-period-selector">
      <div className="inline-flex rounded-md shadow-sm animate-pulse" role="group">
        {[...Array(4)].map((_, i) => (
          <div 
            key={i} 
            className={`h-10 bg-gray-200 w-20 border border-gray-300 loading-shimmer ${
              i === 0 ? 'rounded-l-md' : i === 3 ? 'rounded-r-md' : ''
            }`}
          ></div>
        ))}
      </div>
    </div>

    {/* Charts Section skeleton - uses stable grid layout */}
    <div className="dashboard-charts-grid">
      <div className="dashboard-chart-card animate-pulse">
        <ChartSkeleton height={300} />
      </div>
      <div className="dashboard-chart-card animate-pulse">
        <ChartSkeleton height={300} />
      </div>
    </div>

    {/* Performance Trends Chart skeleton - uses stable layout */}
    <div className="dashboard-performance-chart animate-pulse">
      <ChartSkeleton height={300} />
    </div>

    {/* Recent Experiments and Insights skeleton - uses stable grid layout */}
    <div className="dashboard-bottom-grid">
      {/* Recent Experiments - lg:col-span-2 */}
      <div className="lg:col-span-2">
        <div className="dashboard-experiments-card animate-pulse">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="h-6 bg-gray-200 rounded w-48 loading-shimmer"></div>
          </div>
          <div className="p-6 space-y-4 stable-dimensions">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4 loading-shimmer"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2 loading-shimmer"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded-full w-16 loading-shimmer"></div>
              </div>
            ))}
            <div className="pt-4 border-t border-gray-200">
              <div className="h-4 bg-gray-200 rounded w-40 loading-shimmer"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Insights Panel */}
      <div>
        <div className="dashboard-insights-card animate-pulse">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="h-6 bg-gray-200 rounded w-20 loading-shimmer"></div>
          </div>
          <div className="p-6 space-y-4 stable-dimensions">
            {[...Array(2)].map((_, i) => (
              <InsightCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);