"""
Unit tests for the centralized error handling infrastructure.
Tests error classification, logging, response standardization, and metrics tracking.
"""

import pytest
import json
import time
from unittest.mock import Mock, patch, MagicMock
from flask import Flask, request, g

from error_handler import DashboardErrorHandler, ErrorMetrics, error_handler
from exceptions import (
    DashboardError, AuthenticationError, AuthorizationError, DatabaseError,
    ValidationError, NetworkError, CircuitBreakerOpenError, PartialDataError,
    CacheError, RateLimitError, ConfigurationError, ExternalServiceError
)


class TestErrorMetrics:
    """Test error metrics tracking functionality."""
    
    def test_error_metrics_initialization(self):
        """Test ErrorMetrics initialization."""
        metrics = ErrorMetrics()
        assert metrics.error_counts == {}
        assert metrics.error_rates == {}
        assert isinstance(metrics.last_reset, float)
    
    def test_increment_error_count(self):
        """Test incrementing error counts."""
        metrics = ErrorMetrics()
        
        metrics.increment('/api/dashboard/summary', 'DatabaseError')
        assert metrics.error_counts['/api/dashboard/summary:DatabaseError'] == 1
        
        metrics.increment('/api/dashboard/summary', 'DatabaseError')
        assert metrics.error_counts['/api/dashboard/summary:DatabaseError'] == 2
        
        metrics.increment('/api/dashboard/charts', 'ValidationError')
        assert metrics.error_counts['/api/dashboard/charts:ValidationError'] == 1
    
    def test_get_error_rate(self):
        """Test getting error rates."""
        metrics = ErrorMetrics()
        
        # Test with no errors
        assert metrics.get_error_rate('/api/dashboard/summary', 'DatabaseError') == 0
        
        # Test with errors
        metrics.increment('/api/dashboard/summary', 'DatabaseError')
        assert metrics.get_error_rate('/api/dashboard/summary', 'DatabaseError') == 1
    
    def test_error_count_reset(self):
        """Test error count reset after time threshold."""
        metrics = ErrorMetrics()
        
        # Add some errors
        metrics.increment('/api/dashboard/summary', 'DatabaseError')
        assert len(metrics.error_counts) == 1
        
        # Simulate time passing (more than 1 hour)
        metrics.last_reset = time.time() - 3700  # 1 hour and 2 minutes ago
        
        # Adding new error should trigger reset
        metrics.increment('/api/dashboard/charts', 'ValidationError')
        
        # Should only have the new error (the reset clears all, then adds the new one)
        assert len(metrics.error_counts) == 1
        assert '/api/dashboard/charts:ValidationError' in metrics.error_counts
        assert '/api/dashboard/summary:DatabaseError' not in metrics.error_counts


class TestCustomExceptions:
    """Test custom exception classes."""
    
    def test_dashboard_error_base(self):
        """Test base DashboardError class."""
        error = DashboardError("Test error", "TEST_ERROR", {"key": "value"})
        
        assert str(error) == "Test error"
        assert error.message == "Test error"
        assert error.error_code == "TEST_ERROR"
        assert error.details == {"key": "value"}
        assert error.error_id is not None
    
    def test_authentication_error(self):
        """Test AuthenticationError class."""
        error = AuthenticationError("Invalid token", {"token_expired": True})
        
        assert error.message == "Invalid token"
        assert error.error_code == "AUTH_FAILED"
        assert error.details == {"token_expired": True}
    
    def test_database_error(self):
        """Test DatabaseError class."""
        error = DatabaseError("Connection failed", {"host": "localhost"})
        
        assert error.message == "Connection failed"
        assert error.error_code == "DATABASE_ERROR"
        assert error.details == {"host": "localhost"}
    
    def test_validation_error_with_field(self):
        """Test ValidationError with field specification."""
        error = ValidationError("Invalid email format", field="email", details={"pattern": "email"})
        
        assert error.message == "Invalid email format"
        assert error.error_code == "VALIDATION_ERROR"
        assert error.details["field"] == "email"
        assert error.details["pattern"] == "email"
    
    def test_circuit_breaker_error_with_retry_after(self):
        """Test CircuitBreakerOpenError with retry_after."""
        error = CircuitBreakerOpenError("Service down", retry_after=120)
        
        assert error.message == "Service down"
        assert error.error_code == "CIRCUIT_BREAKER_OPEN"
        assert error.details["retry_after"] == 120
    
    def test_partial_data_error_with_failed_operations(self):
        """Test PartialDataError with failed operations list."""
        failed_ops = ["fetch_experiments", "fetch_results"]
        error = PartialDataError("Some data unavailable", failed_operations=failed_ops)
        
        assert error.message == "Some data unavailable"
        assert error.error_code == "PARTIAL_DATA_ERROR"
        assert error.details["failed_operations"] == failed_ops


class TestDashboardErrorHandler:
    """Test DashboardErrorHandler functionality."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.handler = DashboardErrorHandler()
        self.context = {
            'user_id': 'test-user-123',
            'endpoint': '/api/dashboard/summary',
            'method': 'GET',
            'params': {'limit': 10}
        }
    
    def test_handler_initialization(self):
        """Test error handler initialization."""
        handler = DashboardErrorHandler()
        
        assert handler.logger is not None
        assert handler.error_metrics is not None
        assert isinstance(handler.error_metrics, ErrorMetrics)
    
    @patch('error_handler.DashboardErrorHandler._log_error')
    def test_handle_authentication_error(self, mock_log):
        """Test handling of authentication errors."""
        error = AuthenticationError("Token expired")
        response, status_code = self.handler.handle_error(error, self.context)
        
        assert status_code == 401
        assert response['error'] == 'Authentication failed'
        assert response['error_code'] == 'AUTH_FAILED'
        assert response['message'] == 'Please refresh your session and try again'
        assert 'refresh_token' in response['actions']
        assert 'error_id' in response
        
        mock_log.assert_called_once()
    
    @patch('error_handler.DashboardErrorHandler._log_error')
    def test_handle_database_error(self, mock_log):
        """Test handling of database errors."""
        error = DatabaseError("Connection timeout")
        response, status_code = self.handler.handle_error(error, self.context)
        
        assert status_code == 503
        assert response['error'] == 'Data temporarily unavailable'
        assert response['error_code'] == 'DATABASE_ERROR'
        assert response['retry_after'] == 30
        assert response['fallback_available'] is True
        
        mock_log.assert_called_once()
    
    @patch('error_handler.DashboardErrorHandler._log_error')
    def test_handle_validation_error(self, mock_log):
        """Test handling of validation errors."""
        error = ValidationError("Invalid email", field="email")
        response, status_code = self.handler.handle_error(error, self.context)
        
        assert status_code == 400
        assert response['error'] == 'Invalid data format'
        assert response['error_code'] == 'VALIDATION_ERROR'
        assert response['field'] == 'email'
        
        mock_log.assert_called_once()
    
    @patch('error_handler.DashboardErrorHandler._log_error')
    def test_handle_circuit_breaker_error(self, mock_log):
        """Test handling of circuit breaker errors."""
        error = CircuitBreakerOpenError("Service unavailable", retry_after=120)
        response, status_code = self.handler.handle_error(error, self.context)
        
        assert status_code == 503
        assert response['error'] == 'Service temporarily unavailable'
        assert response['error_code'] == 'CIRCUIT_BREAKER_OPEN'
        assert response['retry_after'] == 120
        
        mock_log.assert_called_once()
    
    @patch('error_handler.DashboardErrorHandler._log_error')
    def test_handle_partial_data_error(self, mock_log):
        """Test handling of partial data errors."""
        failed_ops = ["fetch_experiments", "fetch_results"]
        error = PartialDataError("Some data failed", failed_operations=failed_ops)
        response, status_code = self.handler.handle_error(error, self.context)
        
        assert status_code == 206
        assert response['error'] == 'Partial data available'
        assert response['error_code'] == 'PARTIAL_DATA_ERROR'
        assert response['partial_failure'] is True
        assert response['failed_operations'] == failed_ops
        
        mock_log.assert_called_once()
    
    @patch('error_handler.DashboardErrorHandler._log_error')
    def test_handle_rate_limit_error(self, mock_log):
        """Test handling of rate limit errors."""
        error = RateLimitError("Too many requests", retry_after=300)
        response, status_code = self.handler.handle_error(error, self.context)
        
        assert status_code == 429
        assert response['error'] == 'Rate limit exceeded'
        assert response['error_code'] == 'RATE_LIMIT_EXCEEDED'
        assert response['retry_after'] == 300
        
        mock_log.assert_called_once()
    
    @patch('error_handler.DashboardErrorHandler._log_error')
    def test_handle_generic_error(self, mock_log):
        """Test handling of generic/unknown errors."""
        error = Exception("Unknown error")
        response, status_code = self.handler.handle_error(error, self.context)
        
        assert status_code == 500
        assert response['error'] == 'Internal server error'
        assert response['error_code'] == 'INTERNAL_ERROR'
        assert response['message'] == 'An unexpected error occurred. Our team has been notified.'
        assert response['retry_after'] == 60
        assert response['contact_support'] is True
        
        mock_log.assert_called_once()
    
    def test_error_metrics_tracking(self):
        """Test that error metrics are properly tracked."""
        error = DatabaseError("Connection failed")
        
        # Check initial state
        initial_count = self.handler.error_metrics.get_error_rate('/api/dashboard/summary', 'DatabaseError')
        assert initial_count == 0
        
        # Handle error
        self.handler.handle_error(error, self.context)
        
        # Check that metric was incremented
        new_count = self.handler.error_metrics.get_error_rate('/api/dashboard/summary', 'DatabaseError')
        assert new_count == 1
    
    def test_get_error_stats(self):
        """Test getting error statistics."""
        # Add some errors
        error1 = DatabaseError("DB Error")
        error2 = ValidationError("Validation Error")
        
        self.handler.handle_error(error1, self.context)
        self.handler.handle_error(error2, self.context)
        
        stats = self.handler.get_error_stats()
        
        assert 'error_counts' in stats
        assert 'last_reset' in stats
        assert 'total_errors' in stats
        assert stats['total_errors'] == 2


class TestErrorHandlerDecorator:
    """Test the error handler decorator functionality."""
    
    def setup_method(self):
        """Set up Flask app for testing."""
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        
        # Mock request context
        self.app_context = self.app.app_context()
        self.request_context = self.app.test_request_context()
    
    def test_decorator_success_case(self):
        """Test decorator with successful function execution."""
        handler = DashboardErrorHandler()
        
        @handler.handle_exceptions
        def test_function():
            return {"success": True}
        
        with self.app_context:
            with self.request_context:
                result = test_function()
                assert result == {"success": True}
    
    def test_decorator_exception_handling(self):
        """Test decorator with exception in function."""
        handler = DashboardErrorHandler()
        
        @handler.handle_exceptions
        def test_function():
            raise DatabaseError("Test database error")
        
        with self.app.test_request_context('/test', method='GET'):
            # Mock request attributes
            request.current_user = {'id': 'test-user'}
            
            response, status_code = test_function()
            
            assert status_code == 503
            response_data = json.loads(response.data)
            assert response_data['error'] == 'Data temporarily unavailable'
            assert response_data['error_code'] == 'DATABASE_ERROR'
    
    def test_decorator_context_building(self):
        """Test that decorator builds proper context from request."""
        handler = DashboardErrorHandler()
        captured_context = {}
        
        # Mock the handle_error method to capture context
        original_handle_error = handler.handle_error
        def mock_handle_error(error, context):
            captured_context.update(context)
            return original_handle_error(error, context)
        handler.handle_error = mock_handle_error
        
        @handler.handle_exceptions
        def test_function():
            raise ValidationError("Test validation error")
        
        with self.app.test_request_context('/api/test', method='POST'):
            # Set up request attributes
            request.current_user = {'id': 'test-user-123'}
            
            test_function()
            
            # Verify context was built correctly
            assert captured_context['user_id'] == 'test-user-123'
            assert captured_context['endpoint'] is not None  # Flask sets this automatically
            assert captured_context['method'] == 'POST'
            assert 'params' in captured_context
            assert 'headers' in captured_context
            assert 'request_time' in captured_context


class TestErrorResponseStandardization:
    """Test standardized error response formats."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.handler = DashboardErrorHandler()
        self.context = {
            'user_id': 'test-user',
            'endpoint': '/api/dashboard/summary'
        }
    
    def test_all_error_responses_have_required_fields(self):
        """Test that all error responses contain required fields."""
        test_errors = [
            AuthenticationError("Auth failed"),
            AuthorizationError("Access denied"),
            DatabaseError("DB failed"),
            ValidationError("Invalid data"),
            NetworkError("Network failed"),
            CircuitBreakerOpenError("Circuit open"),
            PartialDataError("Partial data"),
            CacheError("Cache failed"),
            RateLimitError("Rate limited"),
            ConfigurationError("Config error"),
            ExternalServiceError("Service failed"),
            Exception("Generic error")
        ]
        
        required_fields = ['error', 'error_code', 'error_id', 'message']
        
        for error in test_errors:
            response, status_code = self.handler.handle_error(error, self.context)
            
            # Check required fields are present
            for field in required_fields:
                assert field in response, f"Missing {field} in response for {type(error).__name__}"
            
            # Check error_id is not empty
            assert response['error_id'], f"Empty error_id for {type(error).__name__}"
            
            # Check status code is valid HTTP status
            assert 200 <= status_code <= 599, f"Invalid status code {status_code} for {type(error).__name__}"
    
    def test_error_response_json_serializable(self):
        """Test that all error responses are JSON serializable."""
        test_errors = [
            AuthenticationError("Auth failed"),
            DatabaseError("DB failed"),
            ValidationError("Invalid data", field="email"),
            PartialDataError("Partial data", failed_operations=["op1", "op2"])
        ]
        
        for error in test_errors:
            response, status_code = self.handler.handle_error(error, self.context)
            
            # Should not raise an exception
            try:
                json.dumps(response)
            except (TypeError, ValueError) as e:
                pytest.fail(f"Response not JSON serializable for {type(error).__name__}: {e}")


class TestGlobalErrorHandlerInstance:
    """Test the global error handler instance."""
    
    def test_global_instance_exists(self):
        """Test that global error handler instance exists and is properly configured."""
        assert error_handler is not None
        assert isinstance(error_handler, DashboardErrorHandler)
        assert error_handler.logger is not None
        assert error_handler.error_metrics is not None
    
    def test_global_instance_functionality(self):
        """Test that global error handler instance works correctly."""
        context = {
            'user_id': 'test-user',
            'endpoint': '/api/test'
        }
        
        error = ValidationError("Test error")
        response, status_code = error_handler.handle_error(error, context)
        
        assert status_code == 400
        assert response['error_code'] == 'VALIDATION_ERROR'


if __name__ == '__main__':
    pytest.main([__file__, '-v'])