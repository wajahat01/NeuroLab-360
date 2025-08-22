import React, { useState } from 'react';

const ExperimentForm = ({ onSubmit, onCancel, isSubmitting = false }) => {
  const [formData, setFormData] = useState({
    name: '',
    experiment_type: '',
    parameters: {}
  });
  const [errors, setErrors] = useState({});

  const experimentTypes = [
    {
      value: 'heart_rate',
      label: 'Heart Rate Monitoring',
      description: 'Monitor heart rate patterns over time',
      parameters: [
        { name: 'duration_minutes', label: 'Duration (minutes)', type: 'number', default: 5, min: 1, max: 60 },
        { name: 'baseline_bpm', label: 'Baseline BPM', type: 'number', default: 75, min: 40, max: 200 }
      ]
    },
    {
      value: 'reaction_time',
      label: 'Reaction Time Test',
      description: 'Measure response time to visual or audio stimuli',
      parameters: [
        { name: 'trials', label: 'Number of Trials', type: 'number', default: 10, min: 5, max: 50 },
        { 
          name: 'stimulus_type', 
          label: 'Stimulus Type', 
          type: 'select', 
          default: 'visual',
          options: [
            { value: 'visual', label: 'Visual' },
            { value: 'audio', label: 'Audio' }
          ]
        }
      ]
    },
    {
      value: 'memory',
      label: 'Memory Test',
      description: 'Assess memory recall and recognition abilities',
      parameters: [
        { name: 'items_count', label: 'Number of Items', type: 'number', default: 10, min: 5, max: 30 },
        { 
          name: 'test_type', 
          label: 'Test Type', 
          type: 'select', 
          default: 'visual',
          options: [
            { value: 'visual', label: 'Visual Memory' },
            { value: 'verbal', label: 'Verbal Memory' },
            { value: 'spatial', label: 'Spatial Memory' }
          ]
        }
      ]
    },
    {
      value: 'eeg',
      label: 'EEG Recording',
      description: 'Record brainwave activity patterns',
      parameters: [
        { name: 'duration_minutes', label: 'Duration (minutes)', type: 'number', default: 2, min: 1, max: 30 },
        { name: 'sampling_rate', label: 'Sampling Rate (Hz)', type: 'number', default: 256, min: 128, max: 1024 }
      ]
    }
  ];

  const selectedExperimentType = experimentTypes.find(type => type.value === formData.experiment_type);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleParameterChange = (paramName, value) => {
    setFormData(prev => ({
      ...prev,
      parameters: {
        ...prev.parameters,
        [paramName]: value
      }
    }));
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Experiment name is required';
    }

    if (!formData.experiment_type) {
      newErrors.experiment_type = 'Please select an experiment type';
    }

    // Validate parameters
    if (selectedExperimentType) {
      selectedExperimentType.parameters.forEach(param => {
        const value = formData.parameters[param.name];
        
        if (param.type === 'number') {
          const numValue = Number(value);
          if (isNaN(numValue) || numValue < param.min || numValue > param.max) {
            newErrors[`param_${param.name}`] = `${param.label} must be between ${param.min} and ${param.max}`;
          }
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    // Set default parameters if not provided
    const parameters = { ...formData.parameters };
    if (selectedExperimentType) {
      selectedExperimentType.parameters.forEach(param => {
        if (parameters[param.name] === undefined || parameters[param.name] === '') {
          parameters[param.name] = param.default;
        } else if (param.type === 'number') {
          parameters[param.name] = Number(parameters[param.name]);
        }
      });
    }

    onSubmit({
      ...formData,
      parameters
    });
  };

  const renderParameterInput = (param) => {
    const value = formData.parameters[param.name] ?? param.default;
    const errorKey = `param_${param.name}`;
    const inputId = `param-${param.name}`;

    if (param.type === 'select') {
      return (
        <div key={param.name} className="space-y-1">
          <label htmlFor={inputId} className="form-label">
            {param.label}
          </label>
          <select
            id={inputId}
            value={value}
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            className="form-input"
          >
            {param.options.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {errors[errorKey] && (
            <p className="form-error">{errors[errorKey]}</p>
          )}
        </div>
      );
    }

    return (
      <div key={param.name} className="space-y-1">
        <label htmlFor={inputId} className="form-label">
          {param.label}
        </label>
        <input
          id={inputId}
          type={param.type}
          value={value}
          onChange={(e) => handleParameterChange(param.name, e.target.value)}
          min={param.min}
          max={param.max}
          className="form-input"
          placeholder={`Default: ${param.default}`}
        />
        {errors[errorKey] && (
          <p className="form-error">{errors[errorKey]}</p>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex items-center justify-center">
      <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Create New Experiment</h2>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600 transition-colors duration-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Experiment Name */}
            <div className="space-y-1">
              <label htmlFor="experiment-name" className="form-label">
                Experiment Name *
              </label>
              <input
                id="experiment-name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="form-input"
                placeholder="Enter a descriptive name for your experiment"
              />
              {errors.name && (
                <p className="form-error">{errors.name}</p>
              )}
            </div>

            {/* Experiment Type */}
            <div className="space-y-1">
              <label className="form-label">
                Experiment Type *
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {experimentTypes.map(type => (
                  <div
                    key={type.value}
                    className={`relative rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                      formData.experiment_type === type.value
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => handleInputChange({ target: { name: 'experiment_type', value: type.value } })}
                  >
                    <div className="p-4">
                      <div className="flex items-center">
                        <input
                          type="radio"
                          name="experiment_type"
                          value={type.value}
                          checked={formData.experiment_type === type.value}
                          onChange={handleInputChange}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300"
                        />
                        <div className="ml-3">
                          <label className="text-sm font-medium text-gray-900 cursor-pointer">
                            {type.label}
                          </label>
                          <p className="text-xs text-gray-500 mt-1">
                            {type.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {errors.experiment_type && (
                <p className="form-error">{errors.experiment_type}</p>
              )}
            </div>

            {/* Parameters */}
            {selectedExperimentType && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Experiment Parameters
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedExperimentType.parameters.map(renderParameterInput)}
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex items-center justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="btn-outline"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? (
                  <>
                    <div className="loading-spinner w-4 h-4 mr-2"></div>
                    Creating Experiment...
                  </>
                ) : (
                  'Create & Run Experiment'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ExperimentForm;