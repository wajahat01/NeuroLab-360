import React from 'react';
import { format } from 'date-fns';
import DataChart from './DataChart';

const ExperimentDetails = ({ experiment, onClose }) => {
  if (!experiment) return null;

  const formatExperimentType = (type) => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return 'bg-success-100 text-success-800';
      case 'running':
        return 'bg-warning-100 text-warning-800';
      case 'failed':
        return 'bg-error-100 text-error-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const renderParameters = () => {
    if (!experiment.parameters || Object.keys(experiment.parameters).length === 0) {
      return <p className="text-gray-500">No parameters configured</p>;
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(experiment.parameters).map(([key, value]) => (
          <div key={key} className="bg-gray-50 p-3 rounded-md">
            <dt className="text-sm font-medium text-gray-500 capitalize">
              {key.replace('_', ' ')}
            </dt>
            <dd className="text-sm text-gray-900 mt-1">
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </dd>
          </div>
        ))}
      </div>
    );
  };

  const renderMetrics = () => {
    if (!experiment.results || !experiment.results.metrics) {
      return <p className="text-gray-500">No metrics available</p>;
    }

    const { metrics } = experiment.results;
    
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(metrics).map(([key, value]) => (
          <div key={key} className="bg-gray-50 p-3 rounded-md text-center">
            <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              {key.replace('_', ' ')}
            </dt>
            <dd className="text-lg font-semibold text-gray-900 mt-1">
              {typeof value === 'number' ? value.toFixed(2) : String(value)}
            </dd>
          </div>
        ))}
      </div>
    );
  };

  const prepareChartData = () => {
    if (!experiment.results || !experiment.results.data_points) {
      return null;
    }

    const { data_points } = experiment.results;
    
    // Prepare data based on experiment type
    switch (experiment.experiment_type) {
      case 'heart_rate':
        return {
          labels: data_points.map((_, index) => `${Math.floor(index / 60)}:${(index % 60).toString().padStart(2, '0')}`),
          datasets: [{
            label: 'Heart Rate (BPM)',
            data: data_points.map(point => point.value),
            borderColor: 'rgb(239, 68, 68)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            tension: 0.4
          }]
        };
      
      case 'reaction_time':
        return {
          labels: data_points.map((_, index) => `Trial ${index + 1}`),
          datasets: [{
            label: 'Reaction Time (ms)',
            data: data_points.map(point => point.value),
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.4
          }]
        };
      
      case 'memory':
        return {
          labels: data_points.map((_, index) => `Item ${index + 1}`),
          datasets: [{
            label: 'Correct (1) / Incorrect (0)',
            data: data_points.map(point => point.value),
            borderColor: 'rgb(34, 197, 94)',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            tension: 0.4
          }]
        };
      
      case 'eeg':
        return {
          labels: data_points.map(point => `${point.timestamp}s`),
          datasets: [
            {
              label: 'Alpha (μV)',
              data: data_points.map(point => point.metadata?.alpha || 0),
              borderColor: 'rgb(168, 85, 247)',
              backgroundColor: 'rgba(168, 85, 247, 0.1)',
              tension: 0.4
            },
            {
              label: 'Beta (μV)',
              data: data_points.map(point => point.metadata?.beta || 0),
              borderColor: 'rgb(59, 130, 246)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              tension: 0.4
            },
            {
              label: 'Theta (μV)',
              data: data_points.map(point => point.metadata?.theta || 0),
              borderColor: 'rgb(34, 197, 94)',
              backgroundColor: 'rgba(34, 197, 94, 0.1)',
              tension: 0.4
            }
          ]
        };
      
      default:
        return {
          labels: data_points.map((_, index) => `Point ${index + 1}`),
          datasets: [{
            label: 'Value',
            data: data_points.map(point => point.value),
            borderColor: 'rgb(107, 114, 128)',
            backgroundColor: 'rgba(107, 114, 128, 0.1)',
            tension: 0.4
          }]
        };
    }
  };

  const chartData = prepareChartData();

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{experiment.name}</h2>
              <div className="flex items-center space-x-4 mt-2">
                <span className="text-sm text-gray-500">
                  {formatExperimentType(experiment.experiment_type)}
                </span>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(experiment.status)}`}>
                  {experiment.status}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-8">
            {/* Basic Information */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 p-3 rounded-md">
                  <dt className="text-sm font-medium text-gray-500">Created</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {format(new Date(experiment.created_at), 'MMM d, yyyy HH:mm:ss')}
                  </dd>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <dt className="text-sm font-medium text-gray-500">Last Updated</dt>
                  <dd className="text-sm text-gray-900 mt-1">
                    {format(new Date(experiment.updated_at), 'MMM d, yyyy HH:mm:ss')}
                  </dd>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <dt className="text-sm font-medium text-gray-500">Experiment ID</dt>
                  <dd className="text-sm text-gray-900 mt-1 font-mono">
                    {experiment.id}
                  </dd>
                </div>
              </div>
            </div>

            {/* Parameters */}
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Parameters</h3>
              {renderParameters()}
            </div>

            {/* Results and Metrics */}
            {experiment.results && (
              <>
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Metrics</h3>
                  {renderMetrics()}
                </div>

                {/* Analysis Summary */}
                {experiment.results.analysis_summary && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Analysis Summary</h3>
                    <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
                      <p className="text-sm text-blue-800">
                        {experiment.results.analysis_summary}
                      </p>
                    </div>
                  </div>
                )}

                {/* Data Visualization */}
                {chartData && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">Data Visualization</h3>
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <DataChart 
                        data={chartData}
                        type="line"
                        title={`${experiment.name} - Results`}
                        height={400}
                      />
                    </div>
                  </div>
                )}

                {/* Raw Data */}
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Raw Data</h3>
                  <div className="bg-gray-50 border border-gray-200 rounded-md p-4 max-h-64 overflow-y-auto">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                      {JSON.stringify(experiment.results.data_points, null, 2)}
                    </pre>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end pt-6 border-t border-gray-200 mt-8">
            <button
              onClick={onClose}
              className="btn-primary"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExperimentDetails;