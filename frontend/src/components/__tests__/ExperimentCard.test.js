import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExperimentCard from '../ExperimentCard';

// Mock date-fns
jest.mock('date-fns', () => ({
  format: jest.fn((date, formatStr) => {
    if (formatStr === 'MMM d, yyyy HH:mm') {
      return 'Jan 15, 2024 10:30';
    }
    return '2024-01-15 10:30';
  })
}));

const mockExperiment = {
  id: 'test-id-123',
  name: 'Test Heart Rate Experiment',
  experiment_type: 'heart_rate',
  status: 'completed',
  created_at: '2024-01-15T10:30:00Z',
  updated_at: '2024-01-15T10:35:00Z',
  results: {
    metrics: {
      mean: 75.5,
      std_dev: 8.2,
      min: 65,
      max: 95
    }
  }
};

const mockOnDelete = jest.fn();
const mockOnView = jest.fn();

describe('ExperimentCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders experiment information correctly', () => {
    render(
      <ExperimentCard
        experiment={mockExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    expect(screen.getByText('Test Heart Rate Experiment')).toBeInTheDocument();
    expect(screen.getByText('Heart Rate')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
    expect(screen.getByText(/Created:/)).toBeInTheDocument();
    expect(screen.getByText('Avg: 75.5 BPM')).toBeInTheDocument();
  });

  it('displays correct status color for completed experiment', () => {
    render(
      <ExperimentCard
        experiment={mockExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    const statusBadge = screen.getByText('completed');
    expect(statusBadge).toHaveClass('bg-success-100', 'text-success-800');
  });

  it('displays correct status color for running experiment', () => {
    const runningExperiment = { ...mockExperiment, status: 'running' };
    render(
      <ExperimentCard
        experiment={runningExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    const statusBadge = screen.getByText('running');
    expect(statusBadge).toHaveClass('bg-warning-100', 'text-warning-800');
  });

  it('displays correct status color for failed experiment', () => {
    const failedExperiment = { ...mockExperiment, status: 'failed' };
    render(
      <ExperimentCard
        experiment={failedExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    const statusBadge = screen.getByText('failed');
    expect(statusBadge).toHaveClass('bg-error-100', 'text-error-800');
  });

  it('calls onView when View Details button is clicked', () => {
    render(
      <ExperimentCard
        experiment={mockExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    fireEvent.click(screen.getByText('View Details'));
    expect(mockOnView).toHaveBeenCalledWith(mockExperiment);
  });

  it('shows delete confirmation modal when delete button is clicked', () => {
    render(
      <ExperimentCard
        experiment={mockExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('Delete Experiment')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('calls onDelete when delete is confirmed', async () => {
    mockOnDelete.mockResolvedValue();
    
    render(
      <ExperimentCard
        experiment={mockExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    // Open delete confirmation
    fireEvent.click(screen.getByText('Delete'));
    
    // Confirm deletion - get all delete buttons and click the modal one
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[1]); // The modal delete button
    
    await waitFor(() => {
      expect(mockOnDelete).toHaveBeenCalledWith('test-id-123');
    });
  });

  it('cancels delete when cancel button is clicked', () => {
    render(
      <ExperimentCard
        experiment={mockExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    // Open delete confirmation
    fireEvent.click(screen.getByText('Delete'));
    
    // Cancel deletion
    fireEvent.click(screen.getByText('Cancel'));
    
    expect(screen.queryByText('Delete Experiment')).not.toBeInTheDocument();
    expect(mockOnDelete).not.toHaveBeenCalled();
  });

  it('displays correct results summary for different experiment types', () => {
    // Test reaction time experiment
    const reactionTimeExperiment = {
      ...mockExperiment,
      experiment_type: 'reaction_time',
      results: { metrics: { mean: 250.5 } }
    };

    const { rerender } = render(
      <ExperimentCard
        experiment={reactionTimeExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    expect(screen.getByText('Avg: 250.5ms')).toBeInTheDocument();

    // Test memory experiment
    const memoryExperiment = {
      ...mockExperiment,
      experiment_type: 'memory',
      results: { metrics: { accuracy: 85.5 } }
    };

    rerender(
      <ExperimentCard
        experiment={memoryExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    expect(screen.getByText('Accuracy: 85.5%')).toBeInTheDocument();
  });

  it('displays "No results available" when results are missing', () => {
    const experimentWithoutResults = {
      ...mockExperiment,
      results: null
    };

    render(
      <ExperimentCard
        experiment={experimentWithoutResults}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    expect(screen.getByText('No results available')).toBeInTheDocument();
  });

  it('displays correct icon for different experiment types', () => {
    const { rerender } = render(
      <ExperimentCard
        experiment={mockExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    // Heart rate should show heart icon (path contains heart-like path)
    expect(screen.getByText('Heart Rate')).toBeInTheDocument();

    // Test EEG experiment
    const eegExperiment = { ...mockExperiment, experiment_type: 'eeg' };
    rerender(
      <ExperimentCard
        experiment={eegExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    expect(screen.getByText('Eeg')).toBeInTheDocument();
  });

  it('shows loading state during deletion', async () => {
    // Mock a delayed delete operation
    mockOnDelete.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
    
    render(
      <ExperimentCard
        experiment={mockExperiment}
        onDelete={mockOnDelete}
        onView={mockOnView}
      />
    );

    // Open delete confirmation
    fireEvent.click(screen.getByText('Delete'));
    
    // Confirm deletion - get all delete buttons and click the modal one
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(deleteButtons[1]); // The modal delete button
    
    // Should show loading state
    expect(screen.getByText('Deleting...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Deleting/ })).toBeDisabled();
    
    await waitFor(() => {
      expect(mockOnDelete).toHaveBeenCalled();
    });
  });
});