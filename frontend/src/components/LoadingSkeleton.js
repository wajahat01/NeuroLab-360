import React from 'react';

export const StatCardSkeleton = () => (
  <div className="bg-white rounded-lg shadow p-6 animate-pulse">
    <div className="h-4 bg-gray-200 rounded w-3/4 mb-3"></div>
    <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
    <div className="h-3 bg-gray-200 rounded w-full"></div>
  </div>
);

export const ChartSkeleton = ({ height = 300 }) => (
  <div className="bg-white rounded-lg shadow animate-pulse">
    <div className="px-6 py-4 border-b border-gray-200">
      <div className="h-5 bg-gray-200 rounded w-1/3"></div>
    </div>
    <div className="p-6">
      <div className={`bg-gray-200 rounded h-${Math.floor(height/4)}`}></div>
    </div>
  </div>
);

export const ExperimentCardSkeleton = () => (
  <div className="bg-white rounded-lg shadow p-4 animate-pulse">
    <div className="flex items-center justify-between mb-3">
      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      <div className="h-6 bg-gray-200 rounded-full w-16"></div>
    </div>
    <div className="h-3 bg-gray-200 rounded w-3/4 mb-2"></div>
    <div className="h-3 bg-gray-200 rounded w-1/2 mb-3"></div>
    <div className="flex justify-between items-center">
      <div className="h-3 bg-gray-200 rounded w-1/4"></div>
      <div className="h-3 bg-gray-200 rounded w-1/3"></div>
    </div>
  </div>
);

export const InsightCardSkeleton = () => (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 animate-pulse">
    <div className="flex items-start space-x-3">
      <div className="w-6 h-6 bg-gray-200 rounded-full flex-shrink-0"></div>
      <div className="flex-1">
        <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
        <div className="h-3 bg-gray-200 rounded w-3/4"></div>
      </div>
    </div>
  </div>
);

export const DashboardSkeleton = () => (
  <div className="space-y-6">
    {/* Header skeleton */}
    <div>
      <div className="h-8 bg-gray-200 rounded w-1/4 mb-2 animate-pulse"></div>
      <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
    </div>

    {/* Stats cards skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>

    {/* Charts skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartSkeleton height={300} />
      <ChartSkeleton height={300} />
    </div>

    {/* Recent experiments skeleton */}
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="h-5 bg-gray-200 rounded w-1/4 animate-pulse"></div>
      </div>
      <div className="p-6 space-y-4">
        {[...Array(3)].map((_, i) => (
          <ExperimentCardSkeleton key={i} />
        ))}
      </div>
    </div>
  </div>
);