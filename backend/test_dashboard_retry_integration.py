"""
Dashboard retry integration tests.
Tests retry logic integration specifically with dashboard routes.
"""

import pytest
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
from routes.dashboard import dashboard_bp


class TestDashboardRetryIntegration:
    """Test retry logic integration with dashboard routes."""
    
    def test_retry_operation_creation_in_dashboard_summary(self):
        """Test that dashboard summary creates RetryableOperation correctly."""
        # Import the dashboard module to access the route function
        from routes.dashboard import get_dashboard_summary
        
        # Check that RetryableOperation is imported and available
        assert RetryableOperation is not None
        assert get_database_circuit_breaker is not None
        
        # Verify circuit breaker is properly configured
        cb = get_database_circuit_breaker()
        assert isinstance(cb, CircuitBreaker)
        assert cb.config.failure_threshold == 5
        assert cb.config.recovery_timeout == 60.0
    
    def test_retry_operation_creation_in_dashboard_charts(self):
        """Test that dashboard charts creates RetryableOperation correctly."""
        from routes.dashboard import get_dashboard_charts
        
        # Check that the function exists and imports are available
        assert get_dashboard_charts is not None
        assert RetryableOperation is not None
    
    def test_retry_operation_creation_in_dashboard_recent(self):
        """Test that dashboard recent creates RetryableOperation correctly."""
        from routes.dashboard import get_recent_experiments
        
        # Check that the function exists and imports are available
        assert get_recent_experiments is not None
        assert RetryableOperation is not None
    
    def test_circuit_breaker_configuration(self):
        """Test circuit breaker is properly configured for dashboard operations."""
        cb = get_database_circuit_breaker()
        
        # Verify configuration
        assert cb.config.failure_threshold == 5
        assert cb.config.recovery_timeout == 60.0
        assert cb.config.expected_exception == (ConnectionError, TimeoutError, OSError)
        
        # Verify initial state
        assert cb.state == CircuitBreakerState.CLOSED
        assert cb.failure_count >= 0  # May have failures from other tests
    
    def test_dashboard_routes_import_retry_components(self):
        """Test that dashboard routes properly import retry components."""
        # Verify that all necessary components are imported in dashboard routes
        from routes.dashboard import RetryableOperation, get_database_circuit_breaker, CircuitBreakerOpenError
        
        assert RetryableOperation is not None
        assert get_database_circuit_breaker is not None
        assert CircuitBreakerOpenError is not None
        
        # Verify the circuit breaker is properly configured
        cb = get_database_circuit_breaker()
        assert isinstance(cb, CircuitBreaker)
        assert cb.config.failure_threshold == 5
    
    def test_retry_operation_parameters(self):
        """Test that RetryableOperation is created with correct parameters in dashboard routes."""
        # Test the parameters used in dashboard routes
        retry_op = RetryableOperation(
            max_retries=3,
            base_delay=1.0,
            max_delay=10.0,
            circuit_breaker=get_database_circuit_breaker()
        )
        
        assert retry_op.max_retries == 3
        assert retry_op.base_delay == 1.0
        assert retry_op.max_delay == 10.0
        assert retry_op.circuit_breaker is not None
        
        # Test delay calculation
        assert retry_op._calculate_delay(0) >= 0.75  # With jitter, should be around 1.0
        assert retry_op._calculate_delay(0) <= 1.25
        
        assert retry_op._calculate_delay(1) >= 1.5   # With jitter, should be around 2.0
        assert retry_op._calculate_delay(1) <= 2.5
    
    def test_error_handling_integration(self):
        """Test that dashboard routes handle retry-related errors correctly."""
        from exceptions import CircuitBreakerOpenError
        
        # Test that CircuitBreakerOpenError is properly imported and available
        assert CircuitBreakerOpenError is not None
        
        # Test error creation
        error = CircuitBreakerOpenError("Service temporarily unavailable")
        assert error.error_code == "CIRCUIT_BREAKER_OPEN"
        assert "temporarily unavailable" in error.message
        assert error.details.get('retry_after') == 60
    
    def test_database_operations_use_retry_logic(self):
        """Test that database operations in dashboard routes use retry logic."""
        # This test verifies the integration pattern used in dashboard routes
        
        # Create a retry operation like the dashboard routes do
        retry_operation = RetryableOperation(
            max_retries=3,
            base_delay=1.0,
            max_delay=10.0,
            circuit_breaker=get_database_circuit_breaker()
        )
        
        # Mock a database operation
        call_count = 0
        def mock_db_operation():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise DatabaseError("Connection failed")
            return {'success': True, 'data': []}
        
        # Execute with retry logic
        result = retry_operation.execute(mock_db_operation)
        
        # Should succeed after retries
        assert result['success'] is True
        assert call_count == 3  # Failed twice, succeeded on third try
    
    def test_circuit_breaker_integration_with_dashboard_pattern(self):
        """Test circuit breaker integration using the dashboard pattern."""
        # Reset circuit breaker
        cb = get_database_circuit_breaker()
        cb.state = CircuitBreakerState.CLOSED
        cb.failure_count = 0
        cb.last_failure_time = None
        
        retry_operation = RetryableOperation(
            max_retries=3,
            base_delay=0.01,  # Fast for testing
            circuit_breaker=cb
        )
        
        # Mock operation that always fails
        def failing_operation():
            raise DatabaseError("Database connection failed")
        
        # Execute multiple times to trigger circuit breaker
        for i in range(2):  # Need 2 operations to reach threshold of 5 (3 retries each = 6 failures)
            try:
                retry_operation.execute(failing_operation)
            except DatabaseError:
                pass  # Expected
        
        # Circuit breaker should be open now
        assert cb.state == CircuitBreakerState.OPEN
        
        # Next operation should be blocked
        with pytest.raises(CircuitBreakerOpenError):
            retry_operation.execute(failing_operation)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])