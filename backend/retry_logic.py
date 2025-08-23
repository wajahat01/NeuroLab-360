"""
Retry logic and circuit breaker implementation for NeuroLab 360.
Provides resilient operation execution with exponential backoff and circuit breaker patterns.
"""

import asyncio
import time
import logging
from typing import Callable, Any, Optional, Dict, List
from functools import wraps
from enum import Enum
from dataclasses import dataclass
from threading import Lock

logger = logging.getLogger(__name__)


class CircuitBreakerState(Enum):
    """Circuit breaker states."""
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker."""
    failure_threshold: int = 5
    recovery_timeout: float = 60.0
    expected_exception: tuple = (Exception,)


class CircuitBreaker:
    """
    Circuit breaker implementation to prevent cascading failures.
    
    The circuit breaker monitors failures and opens when failure threshold is reached,
    preventing further calls until recovery timeout expires.
    """
    
    def __init__(self, config: Optional[CircuitBreakerConfig] = None):
        """
        Initialize circuit breaker.
        
        Args:
            config: Circuit breaker configuration
        """
        self.config = config or CircuitBreakerConfig()
        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.last_failure_time = None
        self.lock = Lock()
        
        logger.info(f"Circuit breaker initialized with threshold: {self.config.failure_threshold}")
    
    def is_open(self) -> bool:
        """Check if circuit breaker is open."""
        with self.lock:
            if self.state == CircuitBreakerState.OPEN:
                # Check if recovery timeout has passed
                if (time.time() - self.last_failure_time) >= self.config.recovery_timeout:
                    self.state = CircuitBreakerState.HALF_OPEN
                    logger.info("Circuit breaker moved to HALF_OPEN state")
                    return False
                return True
            return False
    
    def record_success(self) -> None:
        """Record a successful operation."""
        with self.lock:
            if self.state == CircuitBreakerState.HALF_OPEN:
                self.state = CircuitBreakerState.CLOSED
                logger.info("Circuit breaker closed after successful operation")
            
            self.failure_count = 0
    
    def record_failure(self) -> None:
        """Record a failed operation."""
        with self.lock:
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            if self.failure_count >= self.config.failure_threshold:
                if self.state != CircuitBreakerState.OPEN:
                    self.state = CircuitBreakerState.OPEN
                    logger.warning(f"Circuit breaker opened after {self.failure_count} failures")
    
    def get_state(self) -> Dict[str, Any]:
        """Get current circuit breaker state information."""
        with self.lock:
            return {
                'state': self.state.value,
                'failure_count': self.failure_count,
                'failure_threshold': self.config.failure_threshold,
                'last_failure_time': self.last_failure_time,
                'recovery_timeout': self.config.recovery_timeout
            }


class CircuitBreakerOpenError(Exception):
    """Exception raised when circuit breaker is open."""
    pass


class RetryableOperation:
    """
    Implements retry logic with exponential backoff and circuit breaker integration.
    
    Provides configurable retry attempts with exponential backoff delay
    and integrates with circuit breaker to prevent cascading failures.
    """
    
    def __init__(
        self,
        max_retries: int = 3,
        base_delay: float = 1.0,
        max_delay: float = 30.0,
        backoff_multiplier: float = 2.0,
        jitter: bool = True,
        circuit_breaker: Optional[CircuitBreaker] = None
    ):
        """
        Initialize retryable operation.
        
        Args:
            max_retries: Maximum number of retry attempts
            base_delay: Base delay in seconds for first retry
            max_delay: Maximum delay in seconds between retries
            backoff_multiplier: Multiplier for exponential backoff
            jitter: Whether to add random jitter to delays
            circuit_breaker: Optional circuit breaker instance
        """
        self.max_retries = max_retries
        self.base_delay = base_delay
        self.max_delay = max_delay
        self.backoff_multiplier = backoff_multiplier
        self.jitter = jitter
        self.circuit_breaker = circuit_breaker
        
        logger.debug(f"RetryableOperation initialized: max_retries={max_retries}, base_delay={base_delay}")
    
    def _calculate_delay(self, attempt: int) -> float:
        """
        Calculate delay for retry attempt with exponential backoff.
        
        Args:
            attempt: Current attempt number (0-based)
            
        Returns:
            Delay in seconds
        """
        delay = self.base_delay * (self.backoff_multiplier ** attempt)
        delay = min(delay, self.max_delay)
        
        if self.jitter:
            import random
            # Add ±25% jitter
            jitter_range = delay * 0.25
            delay += random.uniform(-jitter_range, jitter_range)
            delay = max(0, delay)
        
        return delay
    
    def execute(self, operation: Callable, *args, **kwargs) -> Any:
        """
        Execute operation with retry logic (synchronous version).
        
        Args:
            operation: Function to execute
            *args: Positional arguments for operation
            **kwargs: Keyword arguments for operation
            
        Returns:
            Operation result
            
        Raises:
            CircuitBreakerOpenError: If circuit breaker is open
            Exception: Last exception from failed operation
        """
        # Check circuit breaker
        if self.circuit_breaker and self.circuit_breaker.is_open():
            raise CircuitBreakerOpenError("Circuit breaker is open - service temporarily unavailable")
        
        last_exception = None
        
        for attempt in range(self.max_retries + 1):
            try:
                logger.debug(f"Executing operation, attempt {attempt + 1}/{self.max_retries + 1}")
                result = operation(*args, **kwargs)
                
                # Record success if circuit breaker is available
                if self.circuit_breaker:
                    self.circuit_breaker.record_success()
                
                if attempt > 0:
                    logger.info(f"Operation succeeded on attempt {attempt + 1}")
                
                return result
                
            except Exception as e:
                last_exception = e
                
                # Record failure if circuit breaker is available
                if self.circuit_breaker:
                    self.circuit_breaker.record_failure()
                
                # Check if this is a retryable error
                if not self._is_retryable_error(e):
                    logger.warning(f"Non-retryable error encountered: {type(e).__name__}: {str(e)}")
                    raise e
                
                # Don't retry on last attempt
                if attempt >= self.max_retries:
                    logger.error(f"Operation failed after {self.max_retries + 1} attempts: {str(e)}")
                    break
                
                # Calculate and apply delay
                delay = self._calculate_delay(attempt)
                logger.warning(f"Operation failed (attempt {attempt + 1}), retrying in {delay:.2f}s: {str(e)}")
                time.sleep(delay)
        
        # All retries exhausted
        raise last_exception
    
    async def execute_async(self, operation: Callable, *args, **kwargs) -> Any:
        """
        Execute operation with retry logic (asynchronous version).
        
        Args:
            operation: Async function to execute
            *args: Positional arguments for operation
            **kwargs: Keyword arguments for operation
            
        Returns:
            Operation result
            
        Raises:
            CircuitBreakerOpenError: If circuit breaker is open
            Exception: Last exception from failed operation
        """
        # Check circuit breaker
        if self.circuit_breaker and self.circuit_breaker.is_open():
            raise CircuitBreakerOpenError("Circuit breaker is open - service temporarily unavailable")
        
        last_exception = None
        
        for attempt in range(self.max_retries + 1):
            try:
                logger.debug(f"Executing async operation, attempt {attempt + 1}/{self.max_retries + 1}")
                result = await operation(*args, **kwargs)
                
                # Record success if circuit breaker is available
                if self.circuit_breaker:
                    self.circuit_breaker.record_success()
                
                if attempt > 0:
                    logger.info(f"Async operation succeeded on attempt {attempt + 1}")
                
                return result
                
            except Exception as e:
                last_exception = e
                
                # Record failure if circuit breaker is available
                if self.circuit_breaker:
                    self.circuit_breaker.record_failure()
                
                # Check if this is a retryable error
                if not self._is_retryable_error(e):
                    logger.warning(f"Non-retryable error encountered: {type(e).__name__}: {str(e)}")
                    raise e
                
                # Don't retry on last attempt
                if attempt >= self.max_retries:
                    logger.error(f"Async operation failed after {self.max_retries + 1} attempts: {str(e)}")
                    break
                
                # Calculate and apply delay
                delay = self._calculate_delay(attempt)
                logger.warning(f"Async operation failed (attempt {attempt + 1}), retrying in {delay:.2f}s: {str(e)}")
                await asyncio.sleep(delay)
        
        # All retries exhausted
        raise last_exception
    
    def _is_retryable_error(self, error: Exception) -> bool:
        """
        Determine if an error is retryable.
        
        Args:
            error: Exception to check
            
        Returns:
            True if error is retryable, False otherwise
        """
        # Import custom exceptions here to avoid circular imports
        try:
            from exceptions import DatabaseError, NetworkError, ExternalServiceError
            custom_retryable_errors = (DatabaseError, NetworkError, ExternalServiceError)
        except ImportError:
            custom_retryable_errors = ()
        
        # Define retryable error types
        retryable_errors = (
            ConnectionError,
            TimeoutError,
            OSError,  # Network-related errors
        ) + custom_retryable_errors
        
        # Check for specific error messages that indicate retryable conditions
        retryable_messages = [
            'connection',
            'timeout',
            'network',
            'temporary',
            'unavailable',
            'overloaded',
            'rate limit',
            'database',
            'service'
        ]
        
        error_message = str(error).lower()
        
        # Check error type
        if isinstance(error, retryable_errors):
            return True
        
        # Check error message for retryable conditions
        for message in retryable_messages:
            if message in error_message:
                return True
        
        # Check for HTTP-like status codes in error messages
        if any(code in error_message for code in ['500', '502', '503', '504', '429']):
            return True
        
        return False


def with_retry(
    max_retries: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 30.0,
    circuit_breaker: Optional[CircuitBreaker] = None
):
    """
    Decorator to add retry logic to functions.
    
    Args:
        max_retries: Maximum number of retry attempts
        base_delay: Base delay in seconds for first retry
        max_delay: Maximum delay in seconds between retries
        circuit_breaker: Optional circuit breaker instance
        
    Returns:
        Decorated function with retry logic
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            retry_operation = RetryableOperation(
                max_retries=max_retries,
                base_delay=base_delay,
                max_delay=max_delay,
                circuit_breaker=circuit_breaker
            )
            return retry_operation.execute(func, *args, **kwargs)
        
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            retry_operation = RetryableOperation(
                max_retries=max_retries,
                base_delay=base_delay,
                max_delay=max_delay,
                circuit_breaker=circuit_breaker
            )
            return await retry_operation.execute_async(func, *args, **kwargs)
        
        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return wrapper
    
    return decorator


# Global circuit breaker instances for different services
database_circuit_breaker = CircuitBreaker(
    CircuitBreakerConfig(
        failure_threshold=5,
        recovery_timeout=60.0,
        expected_exception=(ConnectionError, TimeoutError, OSError)
    )
)

api_circuit_breaker = CircuitBreaker(
    CircuitBreakerConfig(
        failure_threshold=10,
        recovery_timeout=30.0,
        expected_exception=(Exception,)
    )
)


def get_database_circuit_breaker() -> CircuitBreaker:
    """Get the global database circuit breaker instance."""
    return database_circuit_breaker


def get_api_circuit_breaker() -> CircuitBreaker:
    """Get the global API circuit breaker instance."""
    return api_circuit_breaker