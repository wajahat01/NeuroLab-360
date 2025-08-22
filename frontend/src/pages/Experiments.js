import React from 'react';

const Experiments = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Experiments</h1>
          <p className="mt-2 text-gray-600">
            Create and manage your neurological experiments
          </p>
        </div>
        <button className="btn-primary">
          New Experiment
        </button>
      </div>
      
      <div className="card">
        <div className="card-body text-center py-12">
          <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No experiments yet
          </h3>
          <p className="text-gray-500 mb-4">
            Experiment management functionality will be implemented in task 10
          </p>
          <button className="btn-primary">
            Create your first experiment
          </button>
        </div>
      </div>
    </div>
  );
};

export default Experiments;