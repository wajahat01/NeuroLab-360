"""
Centralized error handling for NeuroLab 360 Dashboard API.
Provides comprehensive error classification, logging, and standardized responses.
"""

import logging
import traceback
import time
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
from functools import wraps
from flask import request, jsonify, g

from exceptions import (
    DashboardError, AuthenticationError, AuthorizationError, DatabaseError,
    ValidationError, NetworkError, CircuitBreakerOpenError, PartialDataError,
    CacheError, RateLimitError, ConfigurationError, ExternalServiceError
)


class ErrorMetrics:
    """Simple in-memory error metrics tracking."""
    
    def __init__(self):
        self.error_counts = {}
        self.error_rates = {}
        self.last_reset = time.time()
    
    def increment(self, endpoint: str, error_type: str):
        """Increment error count for endpoint and error type."""
        # Reset counters every hour
        current_time = time.time()
        if current_time - self.last_reset > 3600:  # 1 hour
            self.error_counts.clear()
            self.last_reset = current_time
        
        key = f"{endpoint}:{error_type}"
        self.error_counts[key] = self.error_counts.get(key, 0) + 1
    
    def get_error_rate(self, endpoint: str, error_type: str) -> int:
        """Get error count for endpoint and error type."""
        key = f"{endpoint}:{error_type}"
        return self.error_counts.get(key, 0)


class DashboardErrorHandler:
    """Centralized error handling for dashboard APIs."""
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.error_metrics = ErrorMetrics()
        
        # Configure structured logging
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
        # Ensure handler is configured
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)
    
    def handle_error(self, error: Exception, context: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
        """
        Handle errors with appropriate logging and user-friendly responses.
        
        Args:
            error: The exception that occurred
            context: Request context including user_id, endpoint, params, etc.
        
        Returns:
            Tuple of (error_response_dict, http_status_code)
        """
        error_id = getattr(error, 'error_id', None) or str(time.time())
        
        # Extract context information
        user_id = context.get('user_id', 'anonymous')
        endpoint = context.get('endpoint', 'unknown')
        request_params = context.get('params', {})
        
        # Log detailed error information
        self._log_error(error, error_id, user_id, endpoint, request_params)
        
        # Update error metrics
        self.error_metrics.increment(
            endpoint=endpoint,
            error_type=type(error).__name__
        )
        
        # Generate appropriate error response
        if isinstance(error, AuthenticationError):
            return self._handle_auth_error(error, error_id), 401
        elif isinstance(error, AuthorizationError):
            return self._handle_authorization_error(error, error_id), 403
        elif isinstance(error, ValidationError):
            return self._handle_validation_error(error, error_id), 400
        elif isinstance(error, DatabaseError):
            return self._handle_database_error(error, error_id, context), 503
        elif isinstance(error, NetworkError):
            return self._handle_network_error(error, error_id), 503
        elif isinstance(error, CircuitBreakerOpenError):
            return self._handle_circuit_breaker_error(error, error_id), 503
        elif isinstance(error, PartialDataError):
            return self._handle_partial_data_error(error, error_id), 206
        elif isinstance(error, CacheError):
            return self._handle_cache_error(error, error_id), 503
        elif isinstance(error, RateLimitError):
            return self._handle_rate_limit_error(error, error_id), 429
        elif isinstance(error, ConfigurationError):
            return self._handle_configuration_error(error, error_id), 500
        elif isinstance(error, ExternalServiceError):
            return self._handle_external_service_error(error, error_id), 503
        else:
            return self._handle_generic_error(error, error_id), 500
    
    def _log_error(self, error: Exception, error_id: str, user_id: str, endpoint: str, params: Dict[str, Any]):
        """Log detailed error information."""
        self.logger.error(
            f"Dashboard API Error [{error_id}]: {str(error)}",
            extra={
                'error_id': error_id,
                'error_type': type(error).__name__,
                'user_id': user_id,
                'endpoint': endpoint,
                'request_params': params,
                'stack_trace': traceback.format_exc(),
                'timestamp': datetime.utcnow().isoformat()
            }
        )
    
    def _handle_auth_error(self, error: AuthenticationError, error_id: str) -> Dict[str, Any]:
        """Handle authentication errors."""
        return {
            'error': 'Authentication failed',
            'error_code': error.error_code,
            'error_id': error_id,
            'message': 'Please refresh your session and try again',
            'actions': ['refresh_token', 'login_again'],
            'details': error.details
        }
    
    def _handle_authorization_error(self, error: AuthorizationError, error_id: str) -> Dict[str, Any]:
        """Handle authorization errors."""
        return {
            'error': 'Access denied',
            'error_code': error.error_code,
            'error_id': error_id,
            'message': 'You do not have permission to access this resource',
            'actions': ['contact_admin'],
            'details': error.details
        }
    
    def _handle_validation_error(self, error: ValidationError, error_id: str) -> Dict[str, Any]:
        """Handle validation errors."""
        return {
            'error': 'Invalid data format',
            'error_code': error.error_code,
            'error_id': error_id,
            'message': 'The request contains invalid data',
            'details': error.details,
            'field': error.details.get('field')
        }
    
    def _handle_database_error(self, error: DatabaseError, error_id: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """Handle database errors."""
        return {
            'error': 'Data temporarily unavailable',
            'error_code': error.error_code,
            'error_id': error_id,
            'message': 'We are experiencing technical difficulties. Please try again in a few moments.',
            'retry_after': 30,
            'fallback_available': True,
            'details': error.details
        }
    
    def _handle_network_error(self, error: NetworkError, error_id: str) -> Dict[str, Any]:
        """Handle network errors."""
        return {
            'error': 'Network connectivity issue',
            'error_code': error.error_code,
            'error_id': error_id,
            'message': 'Network connectivity issue. Please check your connection and try again.',
            'retry_after': 15,
            'details': error.details
        }
    
    def _handle_circuit_breaker_error(self, error: CircuitBreakerOpenError, error_id: str) -> Dict[str, Any]:
        """Handle circuit breaker errors."""
        retry_after = error.details.get('retry_after', 60)
        return {
            'error': 'Service temporarily unavailable',
            'error_code': error.error_code,
            'error_id': error_id,
            'message': 'Service is temporarily unavailable due to high error rates. Please try again later.',
            'retry_after': retry_after,
            'details': error.details
        }
    
    def _handle_partial_data_error(self, error: PartialDataError, error_id: str) -> Dict[str, Any]:
        """Handle partial data errors."""
        return {
            'error': 'Partial data available',
            'error_code': error.error_code,
            'error_id': error_id,
            'message': 'Some data could not be retrieved, but partial results are available',
            'partial_failure': True,
            'failed_operations': error.details.get('failed_operations', []),
            'details': error.details
        }
    
    def _handle_cache_error(self, error: CacheError, error_id: str) -> Dict[str, Any]:
        """Handle cache errors."""
        return {
            'error': 'Cache service unavailable',
            'error_code': error.error_code,
            'error_id': error_id,
            'message': 'Caching service is temporarily unavailable. Data may load slower than usual.',
            'degraded_performance': True,
            'details': error.details
        }
    
    def _handle_rate_limit_error(self, error: RateLimitError, error_id: str) -> Dict[str, Any]:
        """Handle rate limit errors."""
        retry_after = error.details.get('retry_after', 60)
        return {
            'error': 'Rate limit exceeded',
            'error_code': error.error_code,
            'error_id': error_id,
            'message': 'Too many requests. Please wait before making another request.',
            'retry_after': retry_after,
            'details': error.details
        }
    
    def _handle_configuration_error(self, error: ConfigurationError, error_id: str) -> Dict[str, Any]:
        """Handle configuration errors."""
        return {
            'error': 'Service configuration error',
            'error_code': error.error_code,
            'error_id': error_id,
            'message': 'Service is temporarily unavailable due to configuration issues. Our team has been notified.',
            'contact_support': True,
            'details': error.details
        }
    
    def _handle_external_service_error(self, error: ExternalServiceError, error_id: str) -> Dict[str, Any]:
        """Handle external service errors."""
        service_name = error.details.get('service_name', 'external service')
        return {
            'error': 'External service unavailable',
            'error_code': error.error_code,
            'error_id': error_id,
            'message': f'An external service ({service_name}) is temporarily unavailable.',
            'retry_after': 30,
            'service_name': service_name,
            'details': error.details
        }
    
    def _handle_generic_error(self, error: Exception, error_id: str) -> Dict[str, Any]:
        """Handle generic/unknown errors."""
        return {
            'error': 'Internal server error',
            'error_code': 'INTERNAL_ERROR',
            'error_id': error_id,
            'message': 'An unexpected error occurred. Our team has been notified.',
            'retry_after': 60,
            'contact_support': True
        }
    
    def handle_exceptions(self, f):
        """
        Decorator to handle exceptions in route functions.
        
        Usage:
            @error_handler.handle_exceptions
            def my_route():
                # route logic here
        """
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                # Track request start time
                g.request_start_time = time.time()
                
                return f(*args, **kwargs)
                
            except Exception as e:
                # Build context from request
                context = {
                    'user_id': getattr(request, 'current_user', {}).get('id', 'anonymous'),
                    'endpoint': request.endpoint or request.path,
                    'method': request.method,
                    'params': {
                        'query': request.args.to_dict(),
                        'json': request.get_json(silent=True) or {},
                        'form': request.form.to_dict()
                    },
                    'headers': dict(request.headers),
                    'remote_addr': request.remote_addr,
                    'user_agent': request.headers.get('User-Agent', ''),
                    'request_time': time.time() - getattr(g, 'request_start_time', time.time())
                }
                
                # Handle the error
                error_response, status_code = self.handle_error(e, context)
                
                return jsonify(error_response), status_code
        
        return decorated_function
    
    def get_error_stats(self) -> Dict[str, Any]:
        """Get current error statistics."""
        return {
            'error_counts': dict(self.error_metrics.error_counts),
            'last_reset': self.error_metrics.last_reset,
            'total_errors': sum(self.error_metrics.error_counts.values())
        }


# Global error handler instance
error_handler = DashboardErrorHandler()