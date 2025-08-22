import { renderHook, act, waitFor } from '@testing-library/react';
import useExperiments from '../useExperiments';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

// Mock dependencies
jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn()
    }
  }
}));

jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn()
}));

// Mock fetch
global.fetch = jest.fn();

const mockSession = {
  access_token: 'mock-token-123'
};

const mockExperiments = [
  {
    id: '1',
    name: 'Heart Rate Test',
    experiment_type: 'heart_rate',
    status: 'completed',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:05:00Z',
    results: { metrics: { mean: 75 } }
  },
  {
    id: '2',
    name: 'Memory Test',
    experiment_type: 'memory',
    status: 'running',
    created_at: '2024-01-14T15:30:00Z',
    updated_at: '2024-01-14T15:35:00Z',
    results: { metrics: { accuracy: 85 } }
  }
];

describe('useExperiments', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    supabase.auth.getSession.mockResolvedValue({ data: { session: mockSession } });
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ experiments: mockExperiments })
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('fetches experiments on mount', async () => {
    const { result } = renderHook(() => useExperiments());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.experiments).toEqual(mockExperiments);
    expect(result.current.error).toBe(null);
    expect(fetch).toHaveBeenCalledWith('/api/experiments?', {
      headers: {
        'Authorization': 'Bearer mock-token-123',
        'Content-Type': 'application/json'
      }
    });
  });

  it('handles fetch error', async () => {
    fetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useExperiments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.experiments).toEqual([]);
    expect(toast.error).toHaveBeenCalledWith('Failed to load experiments');
  });

  it('handles API error response', async () => {
    fetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Unauthorized' })
    });

    const { result } = renderHook(() => useExperiments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Unauthorized');
    expect(toast.error).toHaveBeenCalledWith('Failed to load experiments');
  });

  it('creates new experiment', async () => {
    const newExperiment = {
      id: '3',
      name: 'New Test',
      experiment_type: 'reaction_time',
      status: 'completed'
    };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ experiments: mockExperiments })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ experiment: newExperiment })
      });

    const { result } = renderHook(() => useExperiments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const experimentData = {
      name: 'New Test',
      experiment_type: 'reaction_time',
      parameters: { trials: 10 }
    };

    await act(async () => {
      await result.current.createExperiment(experimentData);
    });

    expect(fetch).toHaveBeenCalledWith('/api/experiments', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer mock-token-123',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(experimentData)
    });

    expect(result.current.experiments).toHaveLength(3);
    expect(result.current.experiments[0]).toEqual(newExperiment);
    expect(toast.success).toHaveBeenCalledWith('Experiment created and completed successfully!');
  });

  it('handles create experiment error', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ experiments: mockExperiments })
      })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid data' })
      });

    const { result } = renderHook(() => useExperiments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const experimentData = { name: '', experiment_type: 'invalid' };

    await expect(
      act(async () => {
        await result.current.createExperiment(experimentData);
      })
    ).rejects.toThrow('Invalid data');

    expect(toast.error).toHaveBeenCalledWith('Invalid data');
  });

  it('deletes experiment', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ experiments: mockExperiments })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Deleted' })
      });

    const { result } = renderHook(() => useExperiments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteExperiment('1');
    });

    expect(fetch).toHaveBeenCalledWith('/api/experiments/1', {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer mock-token-123'
      }
    });

    expect(result.current.experiments).toHaveLength(1);
    expect(result.current.experiments[0].id).toBe('2');
    expect(toast.success).toHaveBeenCalledWith('Experiment deleted successfully');
  });

  it('gets experiment details', async () => {
    const detailedExperiment = {
      ...mockExperiments[0],
      results: [{ id: 'result-1', data_points: [] }]
    };

    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ experiments: mockExperiments })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(detailedExperiment)
      });

    const { result } = renderHook(() => useExperiments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let experimentDetails;
    await act(async () => {
      experimentDetails = await result.current.getExperimentDetails('1');
    });

    expect(fetch).toHaveBeenCalledWith('/api/experiments/1', {
      headers: {
        'Authorization': 'Bearer mock-token-123'
      }
    });

    expect(experimentDetails).toEqual(detailedExperiment);
  });

  it('updates filters', async () => {
    const { result } = renderHook(() => useExperiments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateFilters({ experiment_type: 'heart_rate' });
    });

    expect(result.current.filters.experiment_type).toBe('heart_rate');
  });

  it('updates sorting', async () => {
    const { result } = renderHook(() => useExperiments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateSorting('name');
    });

    expect(result.current.sortBy).toBe('name');
    expect(result.current.sortOrder).toBe('desc');

    // Clicking same field should toggle order
    act(() => {
      result.current.updateSorting('name');
    });

    expect(result.current.sortBy).toBe('name');
    expect(result.current.sortOrder).toBe('asc');
  });

  it('clears filters', async () => {
    const { result } = renderHook(() => useExperiments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Set some filters
    act(() => {
      result.current.updateFilters({
        experiment_type: 'heart_rate',
        status: 'completed',
        search: 'test'
      });
    });

    expect(result.current.filters.experiment_type).toBe('heart_rate');
    expect(result.current.filters.status).toBe('completed');
    expect(result.current.filters.search).toBe('test');

    // Clear filters
    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.filters.experiment_type).toBe('');
    expect(result.current.filters.status).toBe('');
    expect(result.current.filters.search).toBe('');
  });

  it('applies client-side search filter', async () => {
    const { result } = renderHook(() => useExperiments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    act(() => {
      result.current.updateFilters({ search: 'heart' });
    });

    // Should refetch with search filter applied
    await waitFor(() => {
      expect(result.current.experiments).toHaveLength(1);
      expect(result.current.experiments[0].name).toBe('Heart Rate Test');
    });
  });

  it('applies client-side sorting', async () => {
    const { result } = renderHook(() => useExperiments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Sort by name ascending
    act(() => {
      result.current.updateSorting('name');
      result.current.updateSorting('name'); // Toggle to asc
    });

    await waitFor(() => {
      expect(result.current.experiments[0].name).toBe('Heart Rate Test');
      expect(result.current.experiments[1].name).toBe('Memory Test');
    });
  });

  it('handles missing auth token', async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });

    const { result } = renderHook(() => useExperiments());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('No authentication token available');
    expect(toast.error).toHaveBeenCalledWith('Failed to load experiments');
  });
});