"""
Tests for retry logic and circuit breaker functionality.
Verifies retry behavior, circuit breaker patterns, and error handling.
"""

import pytest
import time
import asyncio
import warnings
from unittest.mock import Mock, patch, MagicMock
from threading import Thread

# Suppress Pydantic deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="gotrue")

from retry_logic import (
    RetryableOperation, 
    CircuitBreaker, 
    CircuitBreakerConfig, 
    CircuitBreakerState,
    CircuitBreakerOpenError,
    with_retry,
    get_database_circuit_breaker,
    get_api_circuit_breaker
)
from exceptions import DatabaseError, NetworkError, AuthenticationError


class TestCircuitBreaker:
    """Test circuit breaker functionality."""
    
    def test_circuit_breaker_initialization(self):
        """Test circuit breaker initializes with correct defaults."""
        cb = CircuitBreaker()
        
        assert cb.state == CircuitBreakerState.CLOSED
        assert cb.failure_count == 0
        assert cb.last_failure_time is None
        assert cb.config.failure_threshold == 5
        assert cb.config.recovery_timeout == 60.0
    
    def test_circuit_breaker_custom_config(self):
        """Test circuit breaker with custom configuration."""
        config = CircuitBreakerConfig(
            failure_threshold=3,
            recovery_timeout=30.0,
            expected_exception=(DatabaseError,)
        )
        cb = CircuitBreaker(config)
        
        assert cb.config.failure_threshold == 3
        assert cb.config.recovery_timeout == 30.0
        assert cb.config.expected_exception == (DatabaseError,)
    
    def test_circuit_breaker_closed_state(self):
        """Test circuit breaker behavior in closed state."""
        cb = CircuitBreaker()
        
        assert not cb.is_open()
        assert cb.state == CircuitBreakerState.CLOSED
    
    def test_circuit_breaker_failure_recording(self):
        """Test circuit breaker records failures correctly."""
        config = CircuitBreakerConfig(failure_threshold=3)
        cb = CircuitBreaker(config)
        
        # Record failures
        cb.record_failure()
        assert cb.failure_count == 1
        assert cb.state == CircuitBreakerState.CLOSED
        
        cb.record_failure()
        assert cb.failure_count == 2
        assert cb.state == CircuitBreakerState.CLOSED
        
        cb.record_failure()
        assert cb.failure_count == 3
        assert cb.state == CircuitBreakerState.OPEN
    
    def test_circuit_breaker_opens_on_threshold(self):
        """Test circuit breaker opens when failure threshold is reached."""
        config = CircuitBreakerConfig(failure_threshold=2)
        cb = CircuitBreaker(config)
        
        cb.record_failure()
        cb.record_failure()
        
        assert cb.state == CircuitBreakerState.OPEN
        assert cb.is_open()
    
    def test_circuit_breaker_success_resets_failures(self):
        """Test circuit breaker resets failure count on success."""
        config = CircuitBreakerConfig(failure_threshold=3)
        cb = CircuitBreaker(config)
        
        cb.record_failure()
        cb.record_failure()
        assert cb.failure_count == 2
        
        cb.record_success()
        assert cb.failure_count == 0
        assert cb.state == CircuitBreakerState.CLOSED
    
    def test_circuit_breaker_half_open_transition(self):
        """Test circuit breaker transitions to half-open after timeout."""
        config = CircuitBreakerConfig(failure_threshold=1, recovery_timeout=0.1)
        cb = CircuitBreaker(config)
        
        # Trigger circuit breaker
        cb.record_failure()
        assert cb.state == CircuitBreakerState.OPEN
        assert cb.is_open()
        
        # Wait for recovery timeout
        time.sleep(0.2)
        
        # Should transition to half-open
        assert not cb.is_open()
        assert cb.state == CircuitBreakerState.HALF_OPEN
    
    def test_circuit_breaker_half_open_to_closed(self):
        """Test circuit breaker transitions from half-open to closed on success."""
        config = CircuitBreakerConfig(failure_threshold=1, recovery_timeout=0.1)
        cb = CircuitBreaker(config)
        
        # Trigger circuit breaker and wait for half-open
        cb.record_failure()
        time.sleep(0.2)
        cb.is_open()  # This call transitions to half-open
        
        # Record success should close the circuit
        cb.record_success()
        assert cb.state == CircuitBreakerState.CLOSED
    
    def test_circuit_breaker_get_state(self):
        """Test circuit breaker state information."""
        config = CircuitBreakerConfig(failure_threshold=3, recovery_timeout=60.0)
        cb = CircuitBreaker(config)
        
        state = cb.get_state()
        
        assert state['state'] == 'closed'
        assert state['failure_count'] == 0
        assert state['failure_threshold'] == 3
        assert state['recovery_timeout'] == 60.0
        assert state['last_failure_time'] is None


class TestRetryableOperation:
    """Test retryable operation functionality."""
    
    def test_retryable_operation_initialization(self):
        """Test retryable operation initializes with correct defaults."""
        retry_op = RetryableOperation()
        
        assert retry_op.max_retries == 3
        assert retry_op.base_delay == 1.0
        assert retry_op.max_delay == 30.0
        assert retry_op.backoff_multiplier == 2.0
        assert retry_op.jitter is True
        assert retry_op.circuit_breaker is None
    
    def test_retryable_operation_custom_config(self):
        """Test retryable operation with custom configuration."""
        cb = CircuitBreaker()
        retry_op = RetryableOperation(
            max_retries=5,
            base_delay=0.5,
            max_delay=10.0,
            backoff_multiplier=1.5,
            jitter=False,
            circuit_breaker=cb
        )
        
        assert retry_op.max_retries == 5
        assert retry_op.base_delay == 0.5
        assert retry_op.max_delay == 10.0
        assert retry_op.backoff_multiplier == 1.5
        assert retry_op.jitter is False
        assert retry_op.circuit_breaker is cb
    
    def test_calculate_delay_exponential_backoff(self):
        """Test delay calculation with exponential backoff."""
        retry_op = RetryableOperation(
            base_delay=1.0,
            backoff_multiplier=2.0,
            max_delay=10.0,
            jitter=False
        )
        
        assert retry_op._calculate_delay(0) == 1.0  # 1.0 * 2^0
        assert retry_op._calculate_delay(1) == 2.0  # 1.0 * 2^1
        assert retry_op._calculate_delay(2) == 4.0  # 1.0 * 2^2
        assert retry_op._calculate_delay(3) == 8.0  # 1.0 * 2^3
        assert retry_op._calculate_delay(4) == 10.0  # Capped at max_delay
    
    def test_calculate_delay_with_jitter(self):
        """Test delay calculation includes jitter."""
        retry_op = RetryableOperation(
            base_delay=2.0,
            backoff_multiplier=2.0,
            jitter=True
        )
        
        # With jitter, delay should vary around the base value
        delays = [retry_op._calculate_delay(0) for _ in range(10)]
        
        # All delays should be positive
        assert all(delay >= 0 for delay in delays)
        
        # Should have some variation (not all identical)
        assert len(set(delays)) > 1
    
    def test_successful_operation_no_retry(self):
        """Test successful operation executes without retry."""
        retry_op = RetryableOperation(max_retries=3)
        
        mock_operation = Mock(return_value="success")
        
        result = retry_op.execute(mock_operation, "arg1", kwarg1="value1")
        
        assert result == "success"
        assert mock_operation.call_count == 1
        mock_operation.assert_called_with("arg1", kwarg1="value1")
    
    def test_operation_retry_on_retryable_error(self):
        """Test operation retries on retryable errors."""
        retry_op = RetryableOperation(max_retries=2, base_delay=0.01)
        
        mock_operation = Mock(side_effect=[
            ConnectionError("Connection failed"),
            ConnectionError("Connection failed"),
            "success"
        ])
        
        result = retry_op.execute(mock_operation)
        
        assert result == "success"
        assert mock_operation.call_count == 3
    
    def test_operation_fails_after_max_retries(self):
        """Test operation fails after exhausting max retries."""
        retry_op = RetryableOperation(max_retries=2, base_delay=0.01)
        
        mock_operation = Mock(side_effect=ConnectionError("Connection failed"))
        
        with pytest.raises(ConnectionError):
            retry_op.execute(mock_operation)
        
        assert mock_operation.call_count == 3  # Initial + 2 retries
    
    def test_operation_no_retry_on_non_retryable_error(self):
        """Test operation doesn't retry on non-retryable errors."""
        retry_op = RetryableOperation(max_retries=3)
        
        mock_operation = Mock(side_effect=ValueError("Invalid value"))
        
        with pytest.raises(ValueError):
            retry_op.execute(mock_operation)
        
        assert mock_operation.call_count == 1  # No retries
    
    def test_is_retryable_error_classification(self):
        """Test error classification for retry logic."""
        retry_op = RetryableOperation()
        
        # Retryable errors
        assert retry_op._is_retryable_error(ConnectionError("Connection failed"))
        assert retry_op._is_retryable_error(TimeoutError("Timeout"))
        assert retry_op._is_retryable_error(OSError("Network error"))
        
        # Retryable by message content
        assert retry_op._is_retryable_error(Exception("Connection timeout"))
        assert retry_op._is_retryable_error(Exception("Service unavailable"))
        assert retry_op._is_retryable_error(Exception("HTTP 503 error"))
        
        # Non-retryable errors
        assert not retry_op._is_retryable_error(ValueError("Invalid value"))
        assert not retry_op._is_retryable_error(TypeError("Type error"))
        assert not retry_op._is_retryable_error(Exception("Invalid input"))
    
    def test_circuit_breaker_integration(self):
        """Test retry operation integrates with circuit breaker."""
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=2))
        retry_op = RetryableOperation(max_retries=1, circuit_breaker=cb)
        
        mock_operation = Mock(side_effect=ConnectionError("Connection failed"))
        
        # First call should fail and record failure
        with pytest.raises(ConnectionError):
            retry_op.execute(mock_operation)
        
        assert cb.failure_count == 2  # Initial + 1 retry
        assert cb.state == CircuitBreakerState.OPEN  # Should be open after threshold
        
        # Second call should be blocked by circuit breaker
        with pytest.raises(CircuitBreakerOpenError):
            retry_op.execute(mock_operation)
    
    def test_circuit_breaker_success_recording(self):
        """Test circuit breaker records success."""
        cb = CircuitBreaker()
        retry_op = RetryableOperation(circuit_breaker=cb)
        
        mock_operation = Mock(return_value="success")
        
        result = retry_op.execute(mock_operation)
        
        assert result == "success"
        assert cb.failure_count == 0
    
    @pytest.mark.asyncio
    async def test_async_operation_success(self):
        """Test async operation executes successfully."""
        retry_op = RetryableOperation(max_retries=2)
        
        async def mock_async_operation():
            return "async_success"
        
        result = await retry_op.execute_async(mock_async_operation)
        
        assert result == "async_success"
    
    @pytest.mark.asyncio
    async def test_async_operation_retry(self):
        """Test async operation retries on failure."""
        retry_op = RetryableOperation(max_retries=2, base_delay=0.01)
        
        call_count = 0
        
        async def mock_async_operation():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ConnectionError("Connection failed")
            return "async_success"
        
        result = await retry_op.execute_async(mock_async_operation)
        
        assert result == "async_success"
        assert call_count == 3


class TestRetryDecorator:
    """Test retry decorator functionality."""
    
    def test_sync_function_decorator(self):
        """Test retry decorator on synchronous function."""
        call_count = 0
        
        @with_retry(max_retries=2, base_delay=0.01)
        def test_function():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ConnectionError("Connection failed")
            return "success"
        
        result = test_function()
        
        assert result == "success"
        assert call_count == 3
    
    @pytest.mark.asyncio
    async def test_async_function_decorator(self):
        """Test retry decorator on asynchronous function."""
        call_count = 0
        
        @with_retry(max_retries=2, base_delay=0.01)
        async def test_async_function():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ConnectionError("Connection failed")
            return "async_success"
        
        result = await test_async_function()
        
        assert result == "async_success"
        assert call_count == 3


class TestDashboardIntegration:
    """Test retry logic integration with dashboard operations."""
    
    def test_database_circuit_breaker_singleton(self):
        """Test database circuit breaker is singleton."""
        cb1 = get_database_circuit_breaker()
        cb2 = get_database_circuit_breaker()
        
        assert cb1 is cb2
        assert isinstance(cb1, CircuitBreaker)
    
    def test_api_circuit_breaker_singleton(self):
        """Test API circuit breaker is singleton."""
        cb1 = get_api_circuit_breaker()
        cb2 = get_api_circuit_breaker()
        
        assert cb1 is cb2
        assert isinstance(cb1, CircuitBreaker)
    
    @patch('supabase_client.SupabaseClient._execute_single_query')
    def test_supabase_client_retry_integration(self, mock_execute):
        """Test Supabase client integrates retry logic."""
        from supabase_client import get_supabase_client
        
        # Mock successful response after retries
        mock_execute.side_effect = [
            NetworkError("Network timeout"),
            NetworkError("Network timeout"),
            {
                'success': True,
                'data': [{'id': 1, 'name': 'test'}],
                'response_time': 0.1
            }
        ]
        
        client = get_supabase_client()
        result = client.execute_query('experiments', 'select')
        
        assert result['success'] is True
        assert result['data'] == [{'id': 1, 'name': 'test'}]
        assert mock_execute.call_count == 3
    
    @patch('supabase_client.SupabaseClient._execute_single_query')
    def test_supabase_client_circuit_breaker_integration(self, mock_execute):
        """Test Supabase client circuit breaker integration."""
        from supabase_client import get_supabase_client
        
        # Reset circuit breaker state
        cb = get_database_circuit_breaker()
        cb.failure_count = 0
        cb.state = CircuitBreakerState.CLOSED
        
        # Mock failures to trigger circuit breaker
        mock_execute.side_effect = DatabaseError("Database connection failed")
        
        client = get_supabase_client()
        
        # Multiple failures should eventually trigger circuit breaker
        for _ in range(6):  # More than failure threshold
            result = client.execute_query('experiments', 'select')
            assert result['success'] is False
        
        # Circuit breaker should be open now
        assert cb.state == CircuitBreakerState.OPEN


class TestConcurrentAccess:
    """Test retry logic and circuit breaker under concurrent access."""
    
    def test_circuit_breaker_thread_safety(self):
        """Test circuit breaker is thread-safe."""
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=10))
        
        def record_failures():
            for _ in range(5):
                cb.record_failure()
                time.sleep(0.001)
        
        # Start multiple threads recording failures
        threads = [Thread(target=record_failures) for _ in range(3)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        
        # Should have recorded all failures
        assert cb.failure_count == 15
        assert cb.state == CircuitBreakerState.OPEN
    
    def test_retry_operation_concurrent_execution(self):
        """Test retry operations can execute concurrently."""
        cb = CircuitBreaker(CircuitBreakerConfig(failure_threshold=20))
        
        results = []
        
        def execute_operation(operation_id):
            retry_op = RetryableOperation(
                max_retries=2,
                base_delay=0.01,
                circuit_breaker=cb
            )
            
            def mock_operation():
                if operation_id % 3 == 0:  # Every third operation fails
                    raise ConnectionError("Connection failed")
                return f"success_{operation_id}"
            
            try:
                result = retry_op.execute(mock_operation)
                results.append(result)
            except ConnectionError:
                results.append(f"failed_{operation_id}")
        
        # Execute operations concurrently
        threads = [Thread(target=execute_operation, args=(i,)) for i in range(10)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        
        # Check results
        assert len(results) == 10
        success_count = len([r for r in results if r.startswith('success')])
        failed_count = len([r for r in results if r.startswith('failed')])
        
        assert success_count > 0
        assert failed_count > 0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])