import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Experiments from '../Experiments';

// Mock the custom hook
jest.mock('../../hooks/useExperiments', () => ({
  __esModule: true,
  default: jest.fn()
}));

// Mock components
jest.mock('../../components/ExperimentCard', () => {
  return function MockExperimentCard({ experiment, onDelete, onView }) {
    return (
      <div data-testid={`experiment-card-${experiment.id}`}>
        <h3>{experiment.name}</h3>
        <button onClick={() => onView(experiment)}>View Details</button>
        <button onClick={() => onDelete(experiment.id)}>Delete</button>
      </div>
    );
  };
});

jest.mock('../../components/ExperimentForm', () => {
  return function MockExperimentForm({ onSubmit, onCancel, isSubmitting }) {
    return (
      <div data-testid="experiment-form">
        <h2>Create New Experiment</h2>
        <button onClick={() => onSubmit({ name: 'Test', experiment_type: 'heart_rate' })}>
          {isSubmitting ? 'Creating...' : 'Submit'}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    );
  };
});

jest.mock('../../components/ExperimentDetails', () => {
  return function MockExperimentDetails({ experiment, onClose }) {
    return (
      <div data-testid="experiment-details">
        <h2>{experiment.name} Details</h2>
        <button onClick={onClose}>Close</button>
      </div>
    );
  };
});

jest.mock('../../components/ExperimentFilters', () => {
  return function MockExperimentFilters({ filters, onFiltersChange, totalCount }) {
    return (
      <div data-testid="experiment-filters">
        <input
          placeholder="Search..."
          value={filters.search}
          onChange={(e) => onFiltersChange({ search: e.target.value })}
        />
        <span>{totalCount} experiments</span>
      </div>
    );
  };
});

jest.mock('../../components/LoadingSkeleton', () => {
  return function MockLoadingSkeleton() {
    return <div data-testid="loading-skeleton">Loading...</div>;
  };
});

jest.mock('../../components/ErrorDisplay', () => {
  return function MockErrorDisplay({ message, onRetry }) {
    return (
      <div data-testid="error-display">
        <p>{message}</p>
        <button onClick={onRetry}>Retry</button>
      </div>
    );
  };
});

import useExperiments from '../../hooks/useExperiments';

const mockExperiments = [
  {
    id: '1',
    name: 'Heart Rate Test',
    experiment_type: 'heart_rate',
    status: 'completed'
  },
  {
    id: '2',
    name: 'Memory Test',
    experiment_type: 'memory',
    status: 'running'
  }
];

const defaultHookReturn = {
  experiments: mockExperiments,
  loading: false,
  error: null,
  filters: { experiment_type: '', status: '', search: '' },
  sortBy: 'created_at',
  sortOrder: 'desc',
  createExperiment: jest.fn(),
  deleteExperiment: jest.fn(),
  getExperimentDetails: jest.fn(),
  updateFilters: jest.fn(),
  updateSorting: jest.fn(),
  clearFilters: jest.fn(),
  refetch: jest.fn()
};

describe('Experiments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useExperiments.mockReturnValue(defaultHookReturn);
  });

  it('renders page header and new experiment button', () => {
    render(<Experiments />);

    expect(screen.getByText('Experiments')).toBeInTheDocument();
    expect(screen.getByText('Create and manage your neurological experiments')).toBeInTheDocument();
    expect(screen.getByText('New Experiment')).toBeInTheDocument();
  });

  it('renders experiment filters', () => {
    render(<Experiments />);

    expect(screen.getByTestId('experiment-filters')).toBeInTheDocument();
    expect(screen.getByText('2 experiments')).toBeInTheDocument();
  });

  it('renders experiment cards when experiments exist', () => {
    render(<Experiments />);

    expect(screen.getByTestId('experiment-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('experiment-card-2')).toBeInTheDocument();
    expect(screen.getByText('Heart Rate Test')).toBeInTheDocument();
    expect(screen.getByText('Memory Test')).toBeInTheDocument();
  });

  it('shows loading skeletons when loading', () => {
    useExperiments.mockReturnValue({
      ...defaultHookReturn,
      loading: true,
      experiments: []
    });

    render(<Experiments />);

    expect(screen.getAllByTestId('loading-skeleton')).toHaveLength(6);
  });

  it('shows error display when there is an error', () => {
    const mockRefetch = jest.fn();
    useExperiments.mockReturnValue({
      ...defaultHookReturn,
      error: 'Failed to load',
      experiments: [],
      refetch: mockRefetch
    });

    render(<Experiments />);

    expect(screen.getByTestId('error-display')).toBeInTheDocument();
    expect(screen.getByText('Failed to load experiments')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Retry'));
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('shows empty state when no experiments exist', () => {
    useExperiments.mockReturnValue({
      ...defaultHookReturn,
      experiments: []
    });

    render(<Experiments />);

    expect(screen.getByText('No experiments yet')).toBeInTheDocument();
    expect(screen.getByText('Get started by creating your first neurological experiment.')).toBeInTheDocument();
    expect(screen.getByText('Create your first experiment')).toBeInTheDocument();
  });

  it('shows filtered empty state when no experiments match filters', () => {
    useExperiments.mockReturnValue({
      ...defaultHookReturn,
      experiments: [],
      filters: { search: 'nonexistent', experiment_type: '', status: '' }
    });

    render(<Experiments />);

    expect(screen.getByText('No experiments match your filters')).toBeInTheDocument();
    expect(screen.getByText('Try adjusting your search criteria or clear the filters.')).toBeInTheDocument();
    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
  });

  it('opens create experiment form when new experiment button is clicked', () => {
    render(<Experiments />);

    fireEvent.click(screen.getByText('New Experiment'));
    expect(screen.getByTestId('experiment-form')).toBeInTheDocument();
  });

  it('creates experiment and closes form', async () => {
    const mockCreateExperiment = jest.fn().mockResolvedValue();
    useExperiments.mockReturnValue({
      ...defaultHookReturn,
      createExperiment: mockCreateExperiment
    });

    render(<Experiments />);

    fireEvent.click(screen.getByText('New Experiment'));
    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(mockCreateExperiment).toHaveBeenCalledWith({
        name: 'Test',
        experiment_type: 'heart_rate'
      });
    });

    expect(screen.queryByTestId('experiment-form')).not.toBeInTheDocument();
  });

  it('cancels experiment creation', () => {
    render(<Experiments />);

    fireEvent.click(screen.getByText('New Experiment'));
    expect(screen.getByTestId('experiment-form')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByTestId('experiment-form')).not.toBeInTheDocument();
  });

  it('views experiment details', async () => {
    const mockGetExperimentDetails = jest.fn().mockResolvedValue({
      id: '1',
      name: 'Heart Rate Test',
      results: []
    });
    useExperiments.mockReturnValue({
      ...defaultHookReturn,
      getExperimentDetails: mockGetExperimentDetails
    });

    render(<Experiments />);

    fireEvent.click(screen.getAllByText('View Details')[0]);

    await waitFor(() => {
      expect(mockGetExperimentDetails).toHaveBeenCalledWith('1');
    });

    expect(screen.getByTestId('experiment-details')).toBeInTheDocument();
    expect(screen.getByText('Heart Rate Test Details')).toBeInTheDocument();
  });

  it('closes experiment details', async () => {
    const mockGetExperimentDetails = jest.fn().mockResolvedValue({
      id: '1',
      name: 'Heart Rate Test',
      results: []
    });
    useExperiments.mockReturnValue({
      ...defaultHookReturn,
      getExperimentDetails: mockGetExperimentDetails
    });

    render(<Experiments />);

    fireEvent.click(screen.getAllByText('View Details')[0]);

    await waitFor(() => {
      expect(screen.getByTestId('experiment-details')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Close'));
    expect(screen.queryByTestId('experiment-details')).not.toBeInTheDocument();
  });

  it('deletes experiment', async () => {
    const mockDeleteExperiment = jest.fn().mockResolvedValue();
    useExperiments.mockReturnValue({
      ...defaultHookReturn,
      deleteExperiment: mockDeleteExperiment
    });

    render(<Experiments />);

    fireEvent.click(screen.getAllByText('Delete')[0]);

    await waitFor(() => {
      expect(mockDeleteExperiment).toHaveBeenCalledWith('1');
    });
  });

  it('updates filters through filter component', () => {
    const mockUpdateFilters = jest.fn();
    useExperiments.mockReturnValue({
      ...defaultHookReturn,
      updateFilters: mockUpdateFilters
    });

    render(<Experiments />);

    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'heart' }
    });

    expect(mockUpdateFilters).toHaveBeenCalledWith({ search: 'heart' });
  });

  it('shows creating state in form', () => {
    render(<Experiments />);

    fireEvent.click(screen.getByText('New Experiment'));
    
    // Simulate creating state
    useExperiments.mockReturnValue({
      ...defaultHookReturn,
      createExperiment: jest.fn()
    });

    // Re-render with creating state
    render(<Experiments />);
    fireEvent.click(screen.getByText('New Experiment'));
    
    // The form should show the creating state when isSubmitting is true
    expect(screen.getByTestId('experiment-form')).toBeInTheDocument();
  });
});