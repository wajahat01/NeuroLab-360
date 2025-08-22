import React from 'react';

const ExperimentFilters = ({ 
  filters, 
  onFiltersChange, 
  onClearFilters, 
  sortBy, 
  sortOrder, 
  onSortChange,
  totalCount = 0 
}) => {
  const experimentTypes = [
    { value: '', label: 'All Types' },
    { value: 'heart_rate', label: 'Heart Rate' },
    { value: 'reaction_time', label: 'Reaction Time' },
    { value: 'memory', label: 'Memory Test' },
    { value: 'eeg', label: 'EEG Recording' }
  ];

  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: 'completed', label: 'Completed' },
    { value: 'running', label: 'Running' },
    { value: 'failed', label: 'Failed' },
    { value: 'pending', label: 'Pending' }
  ];

  const sortOptions = [
    { value: 'created_at', label: 'Date Created' },
    { value: 'updated_at', label: 'Last Updated' },
    { value: 'name', label: 'Name' },
    { value: 'experiment_type', label: 'Type' },
    { value: 'status', label: 'Status' }
  ];

  const handleFilterChange = (key, value) => {
    onFiltersChange({ [key]: value });
  };

  const hasActiveFilters = filters.experiment_type || filters.status || filters.search;

  return (
    <div className="bg-white rounded-lg shadow-soft border border-gray-200 p-4 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 flex-1">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search experiments..."
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              className="form-input pl-10"
            />
          </div>

          {/* Experiment Type Filter */}
          <div className="min-w-0 flex-shrink-0">
            <select
              value={filters.experiment_type}
              onChange={(e) => handleFilterChange('experiment_type', e.target.value)}
              className="form-input"
            >
              {experimentTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="min-w-0 flex-shrink-0">
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="form-input"
            >
              {statusOptions.map(status => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Sort and Actions */}
        <div className="flex items-center space-x-4">
          {/* Sort */}
          <div className="flex items-center space-x-2">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Sort by:
            </label>
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value)}
              className="form-input text-sm min-w-0"
            >
              {sortOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => onSortChange(sortBy)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
              title={`Sort ${sortOrder === 'asc' ? 'descending' : 'ascending'}`}
            >
              <svg 
                className={`w-4 h-4 transform transition-transform duration-200 ${
                  sortOrder === 'desc' ? 'rotate-180' : ''
                }`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
              </svg>
            </button>
          </div>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors duration-200"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Results Count */}
      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            {totalCount === 0 ? (
              'No experiments found'
            ) : totalCount === 1 ? (
              '1 experiment found'
            ) : (
              `${totalCount} experiments found`
            )}
            {hasActiveFilters && (
              <span className="ml-1 text-gray-500">
                (filtered)
              </span>
            )}
          </p>
          
          {/* Active Filters Display */}
          {hasActiveFilters && (
            <div className="flex items-center space-x-2">
              <span className="text-xs text-gray-500">Active filters:</span>
              <div className="flex items-center space-x-1">
                {filters.search && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary-100 text-primary-800">
                    Search: "{filters.search}"
                    <button
                      onClick={() => handleFilterChange('search', '')}
                      className="ml-1 text-primary-600 hover:text-primary-800"
                    >
                      ×
                    </button>
                  </span>
                )}
                {filters.experiment_type && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary-100 text-primary-800">
                    Type: {experimentTypes.find(t => t.value === filters.experiment_type)?.label}
                    <button
                      onClick={() => handleFilterChange('experiment_type', '')}
                      className="ml-1 text-primary-600 hover:text-primary-800"
                    >
                      ×
                    </button>
                  </span>
                )}
                {filters.status && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary-100 text-primary-800">
                    Status: {statusOptions.find(s => s.value === filters.status)?.label}
                    <button
                      onClick={() => handleFilterChange('status', '')}
                      className="ml-1 text-primary-600 hover:text-primary-800"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExperimentFilters;