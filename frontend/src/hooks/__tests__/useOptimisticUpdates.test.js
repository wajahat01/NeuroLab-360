import { renderHook, act, waitFor } from '@testing-library/react';
import { useOptimisticUpdates, useOptimisticCrud } from '../useOptimisticUpdates';

describe('useOptimisticUpdates', () => {
  it('should apply optimistic updates', () => {
    const initialData = [{ id: 1, name: 'Item 1' }];
    
    const { result } = renderHook(() =>
      useOptimisticUpdates(initialData)
    );

    expect(result.current.data).toEqual(initialData);
    expect(result.current.isOptimistic).toBe(false);

    // Apply optimistic update
    let operationId;
    act(() => {
      operationId = result.current.applyOptimisticUpdate(
        (data) => [...data, { id: 2, name: 'Item 2' }]
      );
    });

    expect(result.current.data).toEqual([
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' }
    ]);
    expect(result.current.isOptimistic).toBe(true);
    expect(result.current.pendingOperations).toContain(operationId);
  });

  it('should confirm optimistic updates', () => {
    const initialData = [{ id: 1, name: 'Item 1' }];
    const onSuccess = jest.fn();
    
    const { result } = renderHook(() =>
      useOptimisticUpdates(initialData, { onSuccess })
    );

    // Apply optimistic update
    let operationId;
    act(() => {
      operationId = result.current.applyOptimisticUpdate(
        (data) => [...data, { id: 2, name: 'Item 2' }]
      );
    });

    expect(result.current.isOptimistic).toBe(true);

    // Confirm update
    const finalData = [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2 Updated' }
    ];

    act(() => {
      result.current.confirmUpdate(operationId, finalData);
    });

    expect(result.current.data).toEqual(finalData);
    expect(result.current.isOptimistic).toBe(false);
    expect(result.current.pendingOperations).not.toContain(operationId);
    expect(onSuccess).toHaveBeenCalledWith(operationId, finalData);
  });

  it('should rollback optimistic updates', () => {
    const initialData = [{ id: 1, name: 'Item 1' }];
    const onRollback = jest.fn();
    const onError = jest.fn();
    
    const { result } = renderHook(() =>
      useOptimisticUpdates(initialData, { onRollback, onError })
    );

    // Apply optimistic update
    let operationId;
    act(() => {
      operationId = result.current.applyOptimisticUpdate(
        (data) => [...data, { id: 2, name: 'Item 2' }]
      );
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.isOptimistic).toBe(true);

    // Rollback update
    const error = new Error('Operation failed');
    act(() => {
      result.current.rollbackUpdate(operationId, error);
    });

    expect(result.current.data).toEqual(initialData);
    expect(result.current.isOptimistic).toBe(false);
    expect(result.current.pendingOperations).not.toContain(operationId);
    expect(onRollback).toHaveBeenCalledWith(operationId, error);
    expect(onError).toHaveBeenCalledWith(error);
  });

  it('should handle automatic rollback with timer', async () => {
    const initialData = [{ id: 1, name: 'Item 1' }];
    
    const { result } = renderHook(() =>
      useOptimisticUpdates(initialData, { rollbackDelay: 100 })
    );

    // Apply optimistic update
    let operationId;
    act(() => {
      operationId = result.current.applyOptimisticUpdate(
        (data) => [...data, { id: 2, name: 'Item 2' }]
      );
    });

    // Set rollback timer
    act(() => {
      result.current.setRollbackTimer(operationId, 100);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.isOptimistic).toBe(true);

    // Wait for automatic rollback
    await waitFor(() => {
      expect(result.current.data).toEqual(initialData);
    }, { timeout: 200 });

    expect(result.current.isOptimistic).toBe(false);
  });

  it('should rollback all pending operations', () => {
    const initialData = [{ id: 1, name: 'Item 1' }];
    
    const { result } = renderHook(() =>
      useOptimisticUpdates(initialData)
    );

    // Apply multiple optimistic updates
    let operationId1, operationId2;
    act(() => {
      operationId1 = result.current.applyOptimisticUpdate(
        (data) => [...data, { id: 2, name: 'Item 2' }]
      );
      operationId2 = result.current.applyOptimisticUpdate(
        (data) => [...data, { id: 3, name: 'Item 3' }]
      );
    });

    expect(result.current.data).toHaveLength(3);
    expect(result.current.pendingOperations).toHaveLength(2);

    // Rollback all
    act(() => {
      result.current.rollbackAll();
    });

    expect(result.current.data).toEqual(initialData);
    expect(result.current.isOptimistic).toBe(false);
    expect(result.current.pendingOperations).toHaveLength(0);
  });
});

describe('useOptimisticCrud', () => {
  const mockApiCall = jest.fn();

  beforeEach(() => {
    mockApiCall.mockClear();
  });

  it('should handle optimistic create', async () => {
    const initialData = [{ id: 1, name: 'Item 1' }];
    const newItem = { name: 'New Item' };
    const createdItem = { id: 2, name: 'New Item' };

    mockApiCall.mockResolvedValueOnce(createdItem);

    const { result } = renderHook(() =>
      useOptimisticCrud('/api/items', initialData)
    );

    expect(result.current.data).toEqual(initialData);

    // Optimistic create
    let createPromise;
    act(() => {
      createPromise = result.current.optimisticCreate(newItem, mockApiCall);
    });

    // Should immediately show optimistic data
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0].name).toBe('New Item');
    expect(result.current.isOptimistic).toBe(true);

    // Wait for API call to complete
    await act(async () => {
      const result = await createPromise;
      expect(result).toEqual(createdItem);
    });

    expect(mockApiCall).toHaveBeenCalledWith(newItem);
    expect(result.current.isOptimistic).toBe(false);
  });

  it('should handle optimistic update', async () => {
    const initialData = [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' }
    ];
    const updates = { name: 'Updated Item 1' };
    const updatedItem = { id: 1, name: 'Updated Item 1' };

    mockApiCall.mockResolvedValueOnce(updatedItem);

    const { result } = renderHook(() =>
      useOptimisticCrud('/api/items', initialData)
    );

    // Optimistic update
    let updatePromise;
    act(() => {
      updatePromise = result.current.optimisticUpdate(1, updates, mockApiCall);
    });

    // Should immediately show optimistic data
    expect(result.current.data[0].name).toBe('Updated Item 1');
    expect(result.current.isOptimistic).toBe(true);

    // Wait for API call to complete
    await act(async () => {
      const result = await updatePromise;
      expect(result).toEqual(updatedItem);
    });

    expect(mockApiCall).toHaveBeenCalledWith(1, updates);
    expect(result.current.isOptimistic).toBe(false);
  });

  it('should handle optimistic delete', async () => {
    const initialData = [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' }
    ];

    mockApiCall.mockResolvedValueOnce();

    const { result } = renderHook(() =>
      useOptimisticCrud('/api/items', initialData)
    );

    // Optimistic delete
    let deletePromise;
    act(() => {
      deletePromise = result.current.optimisticDelete(1, mockApiCall);
    });

    // Should immediately remove item
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data[0].id).toBe(2);
    expect(result.current.isOptimistic).toBe(true);

    // Wait for API call to complete
    await act(async () => {
      await deletePromise;
    });

    expect(mockApiCall).toHaveBeenCalledWith(1);
    expect(result.current.isOptimistic).toBe(false);
  });

  it('should rollback on API failure', async () => {
    const initialData = [{ id: 1, name: 'Item 1' }];
    const newItem = { name: 'New Item' };
    const error = new Error('API Error');

    mockApiCall.mockRejectedValueOnce(error);

    const { result } = renderHook(() =>
      useOptimisticCrud('/api/items', initialData)
    );

    // Optimistic create that will fail
    let createPromise;
    act(() => {
      createPromise = result.current.optimisticCreate(newItem, mockApiCall);
    });

    // Should immediately show optimistic data
    expect(result.current.data).toHaveLength(2);
    expect(result.current.isOptimistic).toBe(true);

    // Wait for API call to fail and rollback
    await act(async () => {
      try {
        await createPromise;
      } catch (err) {
        expect(err).toBe(error);
      }
    });

    // Should rollback to original data
    expect(result.current.data).toEqual(initialData);
    expect(result.current.isOptimistic).toBe(false);
  });
});