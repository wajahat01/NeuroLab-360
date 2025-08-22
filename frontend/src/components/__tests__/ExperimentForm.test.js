import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExperimentForm from '../ExperimentForm';

const mockOnSubmit = jest.fn();
const mockOnCancel = jest.fn();

describe('ExperimentForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders form with all required fields', () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Create New Experiment')).toBeInTheDocument();
    expect(screen.getByLabelText(/Experiment Name/)).toBeInTheDocument();
    expect(screen.getByText('Experiment Type *')).toBeInTheDocument();
    expect(screen.getByText('Heart Rate Monitoring')).toBeInTheDocument();
    expect(screen.getByText('Reaction Time Test')).toBeInTheDocument();
    expect(screen.getByText('Memory Test')).toBeInTheDocument();
    expect(screen.getByText('EEG Recording')).toBeInTheDocument();
  });

  it('shows validation errors for empty required fields', async () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.click(screen.getByText('Create & Run Experiment'));

    await waitFor(() => {
      expect(screen.getByText('Experiment name is required')).toBeInTheDocument();
      expect(screen.getByText('Please select an experiment type')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('shows parameters when experiment type is selected', () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Select heart rate experiment
    fireEvent.click(screen.getByText('Heart Rate Monitoring'));

    expect(screen.getByText('Experiment Parameters')).toBeInTheDocument();
    expect(screen.getByLabelText('Duration (minutes)')).toBeInTheDocument();
    expect(screen.getByLabelText('Baseline BPM')).toBeInTheDocument();
  });

  it('validates parameter ranges', async () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Fill in required fields
    fireEvent.change(screen.getByLabelText(/Experiment Name/), {
      target: { value: 'Test Experiment' }
    });
    fireEvent.click(screen.getByText('Heart Rate Monitoring'));

    // Set invalid parameter values
    fireEvent.change(screen.getByLabelText('Duration (minutes)'), {
      target: { value: '100' } // Max is 60
    });
    fireEvent.change(screen.getByLabelText('Baseline BPM'), {
      target: { value: '300' } // Max is 200
    });

    fireEvent.click(screen.getByText('Create & Run Experiment'));

    await waitFor(() => {
      expect(screen.getByText('Duration (minutes) must be between 1 and 60')).toBeInTheDocument();
      expect(screen.getByText('Baseline BPM must be between 40 and 200')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('submits form with valid data', async () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Fill in form
    fireEvent.change(screen.getByLabelText(/Experiment Name/), {
      target: { value: 'My Heart Rate Test' }
    });
    fireEvent.click(screen.getByText('Heart Rate Monitoring'));
    
    fireEvent.change(screen.getByLabelText('Duration (minutes)'), {
      target: { value: '10' }
    });
    fireEvent.change(screen.getByLabelText('Baseline BPM'), {
      target: { value: '80' }
    });

    fireEvent.click(screen.getByText('Create & Run Experiment'));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: 'My Heart Rate Test',
        experiment_type: 'heart_rate',
        parameters: {
          duration_minutes: 10,
          baseline_bpm: 80
        }
      });
    });
  });

  it('uses default parameters when not specified', async () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Fill in only required fields
    fireEvent.change(screen.getByLabelText(/Experiment Name/), {
      target: { value: 'Default Params Test' }
    });
    fireEvent.click(screen.getByText('Reaction Time Test'));

    fireEvent.click(screen.getByText('Create & Run Experiment'));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: 'Default Params Test',
        experiment_type: 'reaction_time',
        parameters: {
          trials: 10,
          stimulus_type: 'visual'
        }
      });
    });
  });

  it('handles select parameters correctly', async () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Fill in form with memory test
    fireEvent.change(screen.getByLabelText(/Experiment Name/), {
      target: { value: 'Memory Test' }
    });
    fireEvent.click(screen.getByText('Memory Test'));

    // Change select parameter
    fireEvent.change(screen.getByLabelText('Test Type'), {
      target: { value: 'verbal' }
    });

    fireEvent.click(screen.getByText('Create & Run Experiment'));

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({
        name: 'Memory Test',
        experiment_type: 'memory',
        parameters: {
          items_count: 10,
          test_type: 'verbal'
        }
      });
    });
  });

  it('calls onCancel when cancel button is clicked', () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('calls onCancel when close button is clicked', () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '' })); // Close button (X)
    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('shows loading state when submitting', () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
        isSubmitting={true}
      />
    );

    expect(screen.getByText('Creating Experiment...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Creating Experiment/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('clears validation errors when user starts typing', async () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Trigger validation error
    fireEvent.click(screen.getByText('Create & Run Experiment'));

    await waitFor(() => {
      expect(screen.getByText('Experiment name is required')).toBeInTheDocument();
    });

    // Start typing to clear error
    fireEvent.change(screen.getByLabelText(/Experiment Name/), {
      target: { value: 'T' }
    });

    expect(screen.queryByText('Experiment name is required')).not.toBeInTheDocument();
  });

  it('displays correct experiment type descriptions', () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    expect(screen.getByText('Monitor heart rate patterns over time')).toBeInTheDocument();
    expect(screen.getByText('Measure response time to visual or audio stimuli')).toBeInTheDocument();
    expect(screen.getByText('Assess memory recall and recognition abilities')).toBeInTheDocument();
    expect(screen.getByText('Record brainwave activity patterns')).toBeInTheDocument();
  });

  it('shows different parameters for different experiment types', () => {
    render(
      <ExperimentForm
        onSubmit={mockOnSubmit}
        onCancel={mockOnCancel}
      />
    );

    // Test EEG parameters
    fireEvent.click(screen.getByText('EEG Recording'));
    expect(screen.getByLabelText('Duration (minutes)')).toBeInTheDocument();
    expect(screen.getByLabelText('Sampling Rate (Hz)')).toBeInTheDocument();

    // Test Reaction Time parameters
    fireEvent.click(screen.getByText('Reaction Time Test'));
    expect(screen.getByLabelText('Number of Trials')).toBeInTheDocument();
    expect(screen.getByLabelText('Stimulus Type')).toBeInTheDocument();
  });
});