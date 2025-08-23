import React, { useState, useCallback, useRef } from 'react';
import { useApiCache } from './useApiCache';
import toast from 'react-hot-toast';

// Hook for optimistic updates with rollback capability
export const useOptimisticUpdates = (
  initialData = null,
  options = {}
) => {
  const {
    onSuccess,
    onError,
    onRollback,
    rollbackDelay = 5000
  } = options;

  const [data, setData] = useState(initialData);
  const [isOptimistic, setIsOptimistic] = useState(false);
  const [pendingOperations, setPendingOperations] = useState(new Map());
  
  const rollbackTimersRef = useRef(new Map());
  const operationIdRef = useRef(0);

  // Generate unique operation ID
  const generateOperationId = useCallback(() => {
    return `op_${++operationIdRef.current}_${Date.now()}`;
  }, []);

  // Apply optimistic update
  const applyOptimisticUpdate = useCallback((
    updateFn,
    operationId = null
  ) => {
    const opId = operationId || generateOperationId();
    
    setData(prevData => {
      const newData = updateFn(prevData);
      
      // Store the previous state for potential rollback
      setPendingOperations(prev => new Map(prev).set(opId, {
        previousData: prevData,
        newData,
        timestamp: Date.now()
      }));
      
      return newData;
    });
    
    setIsOptimistic(true);
    return opId;
  }, [generateOperationId]);

  // Confirm optimistic update (remove from pending)
  const confirmUpdate = useCallback((operationId, finalData = null) => {
    setPendingOperations(prev => {
      const newMap = new Map(prev);
      newMap.delete(operationId);
      return newMap;
    });

    // Clear rollback timer if exists
    if (rollbackTimersRef.current.has(operationId)) {
      clearTimeout(rollbackTimersRef.current.get(operationId));
      rollbackTimersRef.current.delete(operationId);
    }

    // Update with final data if provided
    if (finalData !== null) {
      setData(finalData);
    }

    // Check if any operations are still pending
    setPendingOperations(prev => {
      if (prev.size === 0) {
        setIsOptimistic(false);
      }
      return prev;
    });

    if (onSuccess) {
      onSuccess(operationId, finalData);
    }
  }, [onSuccess]);

  // Rollback optimistic update
  const rollbackUpdate = useCallback((operationId, error = null) => {
    setPendingOperations(prev => {
      const operation = prev.get(operationId);
      if (operation) {
        setData(operation.previousData);
        
        const newMap = new Map(prev);
        newMap.delete(operationId);
        
        // Check if any operations are still pending
        if (newMap.size === 0) {
          setIsOptimistic(false);
        }
        
        return newMap;
      }
      return prev;
    });

    // Clear rollback timer
    if (rollbackTimersRef.current.has(operationId)) {
      clearTimeout(rollbackTimersRef.current.get(operationId));
      rollbackTimersRef.current.delete(operationId);
    }

    if (onRollback) {
      onRollback(operationId, error);
    }

    if (onError && error) {
      onError(error);
    }
  }, [onRollback, onError]);

  // Set automatic rollback timer
  const setRollbackTimer = useCallback((operationId, delay = rollbackDelay) => {
    const timer = setTimeout(() => {
      rollbackUpdate(operationId, new Error('Operation timed out'));
    }, delay);
    
    rollbackTimersRef.current.set(operationId, timer);
  }, [rollbackUpdate, rollbackDelay]);

  // Rollback all pending operations
  const rollbackAll = useCallback(() => {
    pendingOperations.forEach((operation, operationId) => {
      rollbackUpdate(operationId);
    });
  }, [pendingOperations, rollbackUpdate]);

  // Clear all rollback timers on unmount
  React.useEffect(() => {
    return () => {
      rollbackTimersRef.current.forEach(timer => clearTimeout(timer));
      rollbackTimersRef.current.clear();
    };
  }, []);

  return {
    data,
    isOptimistic,
    pendingOperations: Array.from(pendingOperations.keys()),
    applyOptimisticUpdate,
    confirmUpdate,
    rollbackUpdate,
    rollbackAll,
    setRollbackTimer
  };
};

// Hook for optimistic CRUD operations
export const useOptimisticCrud = (
  baseUrl,
  initialData = [],
  options = {}
) => {
  const {
    idField = 'id',
    onCreateSuccess,
    onUpdateSuccess,
    onDeleteSuccess,
    onError
  } = options;

  const {
    data,
    isOptimistic,
    applyOptimisticUpdate,
    confirmUpdate,
    rollbackUpdate,
    setRollbackTimer
  } = useOptimisticUpdates(initialData, { onError });

  // Optimistic create
  const optimisticCreate = useCallback(async (newItem, apiCall) => {
    const tempId = `temp_${Date.now()}`;
    const itemWithTempId = { ...newItem, [idField]: tempId };
    
    const operationId = applyOptimisticUpdate(prevData => [
      itemWithTempId,
      ...prevData
    ]);

    setRollbackTimer(operationId);

    try {
      const result = await apiCall(newItem);
      
      // Replace temp item with real item
      const finalData = data.map(item => 
        item[idField] === tempId ? result : item
      );
      
      confirmUpdate(operationId, finalData);
      
      if (onCreateSuccess) {
        onCreateSuccess(result);
      }
      
      return result;
    } catch (error) {
      rollbackUpdate(operationId, error);
      throw error;
    }
  }, [
    data,
    idField,
    applyOptimisticUpdate,
    confirmUpdate,
    rollbackUpdate,
    setRollbackTimer,
    onCreateSuccess
  ]);

  // Optimistic update
  const optimisticUpdate = useCallback(async (itemId, updates, apiCall) => {
    const operationId = applyOptimisticUpdate(prevData =>
      prevData.map(item =>
        item[idField] === itemId ? { ...item, ...updates } : item
      )
    );

    setRollbackTimer(operationId);

    try {
      const result = await apiCall(itemId, updates);
      
      // Update with server response
      const finalData = data.map(item =>
        item[idField] === itemId ? result : item
      );
      
      confirmUpdate(operationId, finalData);
      
      if (onUpdateSuccess) {
        onUpdateSuccess(result);
      }
      
      return result;
    } catch (error) {
      rollbackUpdate(operationId, error);
      throw error;
    }
  }, [
    data,
    idField,
    applyOptimisticUpdate,
    confirmUpdate,
    rollbackUpdate,
    setRollbackTimer,
    onUpdateSuccess
  ]);

  // Optimistic delete
  const optimisticDelete = useCallback(async (itemId, apiCall) => {
    const operationId = applyOptimisticUpdate(prevData =>
      prevData.filter(item => item[idField] !== itemId)
    );

    setRollbackTimer(operationId);

    try {
      await apiCall(itemId);
      confirmUpdate(operationId);
      
      if (onDeleteSuccess) {
        onDeleteSuccess(itemId);
      }
    } catch (error) {
      rollbackUpdate(operationId, error);
      throw error;
    }
  }, [
    idField,
    applyOptimisticUpdate,
    confirmUpdate,
    rollbackUpdate,
    setRollbackTimer,
    onDeleteSuccess
  ]);

  return {
    data,
    isOptimistic,
    optimisticCreate,
    optimisticUpdate,
    optimisticDelete
  };
};