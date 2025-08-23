"""
Simple integration test for retry logic and circuit breaker functionality.
Tests the retry logic integration without complex mocking.
"""

import pytest
import time
import warnings
from unittest.mock import Mock, patch, MagicMock

# Suppress Pydantic deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="gotrue")

from retry_logic import (
    RetryableOperation, 
    CircuitBreaker, 
    CircuitBreakerConfig, 
    CircuitBreakerState,
    CircuitBreakerOpenError,
    get_database_circuit_breaker
)
from exceptions import DatabaseError, NetworkError
from supabase_client import get_supabase_client


class TestRetryIntegrationSimple:
    """Simple integration tests for retry logic."""
    
    def test_retryable_operation_with_database_circuit_breaker(self):
        """Test RetryableOperation works with database circuit breaker."""
        # Get the database circuit breaker
        cb = get_database_circuit_breaker()
        
        # Reset circuit breaker state
        cb.state = CircuitBreakerState.CLOSED
        cb.failure_count = 0
        cb.last_failure_time = None
        
        # Create retry operation
        retry_op = RetryableOperation(
            max_retries=2,
            base_delay=0.01,
            circuit_breaker=cb
        )
        
        # Test successful operation
        mock_operation = Mock(return_value="success")
        result = retry_op.execute(mock_operation)
        
        assert result == "success"
        assert mock_operation.call_count == 1
        assert cb.failure_count == 0
    
    def test_retryable_operation_with_failures_and_circuit_breaker(self):
        """Test RetryableOperation handles failures and circuit breaker correctly."""
        # Create a fresh circuit breaker for this test
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=3, recovery_timeout=0.1))
        
        retry_op = RetryableOperation(
            max_retries=2,
            base_delay=0.01,
            circuit_breaker=cb
        )
        
        # Test operation that always fails
        mock_operation = Mock(side_effect=DatabaseError("Connection failed"))
        
        with pytest.raises(DatabaseError):
            retry_op.execute(mock_operation)
        
        # Should have tried 3 times (initial + 2 retries)
        assert mock_operation.call_count == 3
        # Circuit breaker should have recorded failures
        assert cb.failure_count == 3
        assert cb.state == CircuitBreakerState.OPEN
        
        # Next operation should be blocked by circuit breaker
        with pytest.raises(CircuitBreakerOpenError):
            retry_op.execute(mock_operation)
    
    def test_supabase_client_retry_integration(self):
        """Test Supabase client integrates retry logic correctly."""
        client = get_supabase_client()
        
        # Mock the internal _execute_single_query method
        with patch.object(client, '_execute_single_query') as mock_execute:
            # First call fails, second succeeds
            mock_execute.side_effect = [
                DatabaseError("Connection timeout"),
                {
                    'success': True,
                    'data': [{'id': 1, 'name': 'test'}],
                    'response_time': 0.1
                }
            ]
            
            result = client.execute_query('experiments', 'select')
            
            # Should succeed after retry
            assert result['success'] is True
            assert result['data'] == [{'id': 1, 'name': 'test'}]
            # Should have retried once
            assert mock_execute.call_count == 2
    
    def test_supabase_client_circuit_breaker_integration(self):
        """Test Supabase client circuit breaker integration."""
        client = get_supabase_client()
        
        # Reset circuit breaker
        cb = get_database_circuit_breaker()
        cb.state = CircuitBreakerState.CLOSED
        cb.failure_count = 0
        cb.last_failure_time = None
        
        with patch.object(client, '_execute_single_query') as mock_execute:
            # Always fail
            mock_execute.side_effect = DatabaseError("Database connection failed")
            
            # Make multiple calls to trigger circuit breaker
            for i in range(3):
                result = client.execute_query('experiments', 'select')
                assert result['success'] is False
                
                # Check if circuit breaker opened
                if cb.state == CircuitBreakerState.OPEN:
                    break
            
            # Circuit breaker should be open
            assert cb.state == CircuitBreakerState.OPEN
    
    def test_error_classification_in_supabase_client(self):
        """Test that Supabase client correctly classifies errors for retry logic."""
        client = get_supabase_client()
        
        # Reset circuit breaker
        cb = get_database_circuit_breaker()
        cb.state = CircuitBreakerState.CLOSED
        cb.failure_count = 0
        cb.last_failure_time = None
        
        with patch.object(client, '_execute_single_query') as mock_execute:
            # Test NetworkError (should be retryable)
            mock_execute.side_effect = [
                NetworkError("Network timeout"),
                {
                    'success': True,
                    'data': [],
                    'response_time': 0.1
                }
            ]
            
            result = client.execute_query('experiments', 'select')
            assert result['success'] is True
            assert mock_execute.call_count == 2  # Retried once
            
            # Reset mock
            mock_execute.reset_mock()
            
            # Test DatabaseError (should be retryable)
            mock_execute.side_effect = [
                DatabaseError("Database connection failed"),
                {
                    'success': True,
                    'data': [],
                    'response_time': 0.1
                }
            ]
            
            result = client.execute_query('experiments', 'select')
            assert result['success'] is True
            assert mock_execute.call_count == 2  # Retried once
    
    def test_circuit_breaker_recovery_after_timeout(self):
        """Test circuit breaker recovery after timeout."""
        # Create circuit breaker with short timeout
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=1, recovery_timeout=0.1))
        
        retry_op = RetryableOperation(
            max_retries=1,
            base_delay=0.01,
            circuit_breaker=cb
        )
        
        # Trigger circuit breaker
        mock_operation = Mock(side_effect=DatabaseError("Connection failed"))
        with pytest.raises(DatabaseError):
            retry_op.execute(mock_operation)
        
        assert cb.state == CircuitBreakerState.OPEN
        
        # Wait for recovery timeout
        time.sleep(0.2)
        
        # Should transition to half-open and allow operation
        mock_operation.side_effect = None
        mock_operation.return_value = "success"
        
        result = retry_op.execute(mock_operation)
        assert result == "success"
        assert cb.state == CircuitBreakerState.CLOSED
    
    def test_concurrent_retry_operations(self):
        """Test multiple retry operations can work concurrently."""
        import threading
        
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=10))
        results = []
        
        def execute_operation(operation_id):
            retry_op = RetryableOperation(
                max_retries=1,
                base_delay=0.01,
                circuit_breaker=cb
            )
            
            def mock_operation():
                if operation_id % 2 == 0:  # Even operations succeed
                    return f"success_{operation_id}"
                else:  # Odd operations fail
                    raise DatabaseError("Connection failed")
            
            try:
                result = retry_op.execute(mock_operation)
                results.append(result)
            except DatabaseError:
                results.append(f"failed_{operation_id}")
        
        # Execute operations concurrently
        threads = []
        for i in range(6):
            thread = threading.Thread(target=execute_operation, args=(i,))
            threads.append(thread)
            thread.start()
        
        for thread in threads:
            thread.join()
        
        # Check results
        assert len(results) == 6
        success_count = len([r for r in results if r.startswith('success')])
        failed_count = len([r for r in results if r.startswith('failed')])
        
        assert success_count == 3  # Even operations (0, 2, 4)
        assert failed_count == 3   # Odd operations (1, 3, 5)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])