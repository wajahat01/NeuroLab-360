import React from 'react';

export const StatCardSkeleton = ({ className = '' }) => (
  <div className={`card animate-pulse ${className}`}>
    <div className="card-body">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-gray-200 rounded-lg flex-shrink-0"></div>
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-6 bg-gray-200 rounded w-1/2"></div>
          <div className="h-3 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    </div>
  </div>
);

export const ChartSkeleton = ({ height = 300, className = '' }) => (
  <div className={`card animate-pulse ${className}`}>
    <div className="card-header">
      <div className="h-5 bg-gray-200 rounded w-1/3"></div>
    </div>
    <div className="card-body">
      <div className="space-y-3 mb-4">
        <div className="flex justify-between">
          <div className="h-3 bg-gray-200 rounded w-16"></div>
          <div className="h-3 bg-gray-200 rounded w-16"></div>
        </div>
      </div>
      <div 
        className="bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 rounded-lg"
        style={{ height: `${height}px` }}
      >
        <div className="h-full flex items-end justify-around p-4 space-x-2">
          {[...Array(8)].map((_, i) => (
            <div 
              key={i}
              className="bg-gray-300 rounded-t"
              style={{ 
                height: `${Math.random() * 60 + 20}%`,
                width: '12px'
              }}
            ></div>
          ))}
        </div>
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
  <div className={`bg-primary-50 border border-primary-200 rounded-xl p-4 animate-pulse ${className}`}>
    <div className="flex items-start space-x-3">
      <div className="w-6 h-6 bg-gray-200 rounded-full flex-shrink-0"></div>
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-full"></div>
        <div className="h-3 bg-gray-200 rounded w-3/4"></div>
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
  <div className={`space-y-responsive ${className}`}>
    {/* Header skeleton */}
    <div className="space-y-2">
      <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
    </div>

    {/* Stats cards skeleton */}
    <div className="grid-responsive">
      {[...Array(4)].map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>

    {/* Period selector skeleton */}
    <div className="flex justify-end">
      <div className="flex space-x-1 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 bg-gray-200 rounded-lg w-20"></div>
        ))}
      </div>
    </div>

    {/* Charts skeleton */}
    <div className="grid-responsive-2">
      <ChartSkeleton height={300} />
      <ChartSkeleton height={300} />
    </div>

    {/* Recent experiments and insights skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="card animate-pulse">
          <div className="card-header">
            <div className="h-5 bg-gray-200 rounded w-1/3"></div>
          </div>
          <div className="card-body space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded-full w-16"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div>
        <div className="card animate-pulse">
          <div className="card-header">
            <div className="h-5 bg-gray-200 rounded w-1/2"></div>
          </div>
          <div className="card-body space-y-4">
            {[...Array(2)].map((_, i) => (
              <InsightCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
);