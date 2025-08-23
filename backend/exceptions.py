"""
Custom exception classes for NeuroLab 360 Dashboard API.
Provides comprehensive error classification for better error handling and user experience.
"""

import uuid
from typing import Optional, Dict, Any


class DashboardError(Exception):
    """Base class for dashboard-specific errors."""
    
    def __init__(self, message: str, error_code: str = None, details: Dict[str, Any] = None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code or self.__class__.__name__.upper()
        self.details = details or {}
        self.error_id = str(uuid.uuid4())


class AuthenticationError(DashboardError):
    """Authentication-related errors."""
    
    def __init__(self, message: str = "Authentication failed", details: Dict[str, Any] = None):
        super().__init__(
            message=message,
            error_code="AUTH_FAILED",
            details=details
        )


class AuthorizationError(DashboardError):
    """Authorization-related errors."""
    
    def __init__(self, message: str = "Access denied", details: Dict[str, Any] = None):
        super().__init__(
            message=message,
            error_code="ACCESS_DENIED",
            details=details
        )


class DatabaseError(DashboardError):
    """Database connectivity and query errors."""
    
    def __init__(self, message: str = "Database operation failed", details: Dict[str, Any] = None):
        super().__init__(
            message=message,
            error_code="DATABASE_ERROR",
            details=details
        )


class ValidationError(DashboardError):
    """Data validation errors."""
    
    def __init__(self, message: str = "Invalid data format", field: str = None, details: Dict[str, Any] = None):
        details = details or {}
        if field:
            details['field'] = field
        
        super().__init__(
            message=message,
            error_code="VALIDATION_ERROR",
            details=details
        )


class NetworkError(DashboardError):
    """Network connectivity and timeout errors."""
    
    def __init__(self, message: str = "Network operation failed", details: Dict[str, Any] = None):
        super().__init__(
            message=message,
            error_code="NETWORK_ERROR",
            details=details
        )


class CircuitBreakerOpenError(DashboardError):
    """Circuit breaker is open, service unavailable."""
    
    def __init__(self, message: str = "Service temporarily unavailable", retry_after: int = 60, details: Dict[str, Any] = None):
        details = details or {}
        details['retry_after'] = retry_after
        
        super().__init__(
            message=message,
            error_code="CIRCUIT_BREAKER_OPEN",
            details=details
        )


class PartialDataError(DashboardError):
    """Some data could not be retrieved."""
    
    def __init__(self, message: str = "Partial data available", failed_operations: list = None, details: Dict[str, Any] = None):
        details = details or {}
        if failed_operations:
            details['failed_operations'] = failed_operations
        
        super().__init__(
            message=message,
            error_code="PARTIAL_DATA_ERROR",
            details=details
        )


class CacheError(DashboardError):
    """Cache operation errors."""
    
    def __init__(self, message: str = "Cache operation failed", details: Dict[str, Any] = None):
        super().__init__(
            message=message,
            error_code="CACHE_ERROR",
            details=details
        )


class RateLimitError(DashboardError):
    """Rate limiting errors."""
    
    def __init__(self, message: str = "Rate limit exceeded", retry_after: int = 60, details: Dict[str, Any] = None):
        details = details or {}
        details['retry_after'] = retry_after
        
        super().__init__(
            message=message,
            error_code="RATE_LIMIT_EXCEEDED",
            details=details
        )


class ConfigurationError(DashboardError):
    """Configuration and setup errors."""
    
    def __init__(self, message: str = "Configuration error", details: Dict[str, Any] = None):
        super().__init__(
            message=message,
            error_code="CONFIGURATION_ERROR",
            details=details
        )


class ExternalServiceError(DashboardError):
    """External service integration errors."""
    
    def __init__(self, message: str = "External service error", service_name: str = None, details: Dict[str, Any] = None):
        details = details or {}
        if service_name:
            details['service_name'] = service_name
        
        super().__init__(
            message=message,
            error_code="EXTERNAL_SERVICE_ERROR",
            details=details
        )