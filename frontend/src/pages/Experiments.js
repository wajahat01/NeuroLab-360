import React, { useState } from 'react';
import { useOptimizedExperiments } from '../hooks/useOptimizedExperiments';
import ExperimentCard from '../components/ExperimentCard';
import ExperimentForm from '../components/ExperimentForm';
import ExperimentDetails from '../components/ExperimentDetails';
import ExperimentFilters from '../components/ExperimentFilters';
import { ExperimentCardSkeleton } from '../components/LoadingSkeleton';
import ErrorDisplay from '../components/ErrorDisplay';

const Experiments = () => {
  const {
    experiments,
    loading,
    error,
    isStale,
    isValidating,
    filters,
    isOptimistic,
    isOnline,
    createExperiment,
    deleteExperiment,
    getExperimentDetails,
    updateFilters,
    updateSorting,
    clearFilters,
    refetch
  } = useOptimizedExperiments({ enableOptimisticUpdates: true });

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateExperiment = async (experimentData) => {
    setIsCreating(true);
    try {
      await createExperiment(experimentData);
      setShowCreateForm(false);
    } catch (error) {
      // Error is already handled in the hook
    } finally {
      setIsCreating(false);
    }
  };

  const handleViewExperiment = async (experiment) => {
    try {
      const detailedExperiment = await getExperimentDetails(experiment.id);
      setSelectedExperiment(detailedExperiment);
      setShowDetails(true);
    } catch (error) {
      // Error is already handled in the hook
    }
  };

  const handleDeleteExperiment = async (experimentId) => {
    await deleteExperiment(experimentId);
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Experiments</h1>
            <p className="mt-2 text-gray-600">
              Create and manage your neurological experiments
            </p>
          </div>
        </div>
        <ErrorDisplay 
          message="Failed to load experiments"
          onRetry={refetch}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-3xl font-bold text-gray-900">Experiments</h1>
            {(isValidating || isStale) && (
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span>Updating...</span>
              </div>
            )}
            {isOptimistic && (
              <div className="flex items-center space-x-2 text-sm text-blue-600">
                <div className="animate-pulse rounded-full h-2 w-2 bg-blue-600"></div>
                <span>Saving changes...</span>
              </div>
            )}
            {!isOnline && (
              <div className="flex items-center space-x-2 text-sm text-orange-600">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728m0-12.728l12.728 12.728" />
                </svg>
                <span>Offline</span>
              </div>
            )}
          </div>
          <p className="mt-2 text-gray-600">
            Create and manage your neurological experiments
          </p>
        </div>
        <button 
          onClick={() => setShowCreateForm(true)}
          className="btn-primary"
          disabled={!isOnline}
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          New Experiment
        </button>
      </div>

      {/* Filters and Search */}
      <ExperimentFilters
        filters={filters}
        onFiltersChange={updateFilters}
        onClearFilters={clearFilters}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={updateSorting}
        totalCount={experiments.length}
      />

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, index) => (
            <ExperimentCardSkeleton key={index} />
          ))}
        </div>
      ) : experiments.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {filters.search || filters.experiment_type || filters.status 
                ? 'No experiments match your filters' 
                : 'No experiments yet'
              }
            </h3>
            <p className="text-gray-500 mb-4">
              {filters.search || filters.experiment_type || filters.status
                ? 'Try adjusting your search criteria or clear the filters.'
                : 'Get started by creating your first neurological experiment.'
              }
            </p>
            {filters.search || filters.experiment_type || filters.status ? (
              <button 
                onClick={clearFilters}
                className="btn-outline"
              >
                Clear Filters
              </button>
            ) : (
              <button 
                onClick={() => setShowCreateForm(true)}
                className="btn-primary"
              >
                Create your first experiment
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {experiments.map((experiment) => (
            <ExperimentCard
              key={experiment.id}
              experiment={experiment}
              onDelete={handleDeleteExperiment}
              onView={handleViewExperiment}
            />
          ))}
        </div>
      )}

      {/* Create Experiment Modal */}
      {showCreateForm && (
        <ExperimentForm
          onSubmit={handleCreateExperiment}
          onCancel={() => setShowCreateForm(false)}
          isSubmitting={isCreating}
        />
      )}

      {/* Experiment Details Modal */}
      {showDetails && selectedExperiment && (
        <ExperimentDetails
          experiment={selectedExperiment}
          onClose={() => {
            setShowDetails(false);
            setSelectedExperiment(null);
          }}
        />
      )}
    </div>
  );
};

export default Experiments;