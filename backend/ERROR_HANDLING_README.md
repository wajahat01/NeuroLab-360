# Centralized Error Handling Infrastructure

This document describes the centralized error handling infrastructure implemented for the NeuroLab 360 Dashboard API reliability improvements.

## Overview

The error handling infrastructure provides:
- **Comprehensive error classification** with custom exception classes
- **Centralized error handling** with standardized responses
- **Detailed logging** with structured error information
- **Error metrics tracking** for monitoring and alerting
- **User-friendly error messages** with actionable guidance

## Components

### 1. Custom Exception Classes (`exceptions.py`)

All dashboard-specific errors inherit from `DashboardError` and include:

```python
from exceptions import (
    AuthenticationError,    # Authentication failures
    AuthorizationError,     # Access denied errors
    DatabaseError,          # Database connectivity issues
    ValidationError,        # Data validation failures
    NetworkError,           # Network connectivity issues
    CircuitBreakerOpenError,# Service unavailable due to circuit breaker
    PartialDataError,       # Some data could not be retrieved
    CacheError,            # Cache operation failures
    RateLimitError,        # Rate limiting errors
    ConfigurationError,    # Configuration issues
    ExternalServiceError   # External service failures
)
```

### 2. Centralized Error Handler (`error_handler.py`)

The `DashboardErrorHandler` class provides:
- Error classification and appropriate HTTP status codes
- Structured logging with correlation IDs
- Error metrics tracking
- Standardized error response formats

### 3. Error Metrics (`ErrorMetrics` class)

Tracks error counts by endpoint and error type with automatic hourly reset.

## Usage

### Method 1: Decorator (Recommended)

Use the `@error_handler.handle_exceptions` decorator on route functions:

```python
from error_handler import error_handler
from exceptions import DatabaseError, ValidationError

@app.route('/api/dashboard/summary')
@error_handler.handle_exceptions
def get_dashboard_summary():
    # Your route logic here
    if some_condition:
        raise DatabaseError("Database connection failed")
    
    return jsonify({"data": "success"})
```

### Method 2: Manual Error Handling

For more control, handle errors manually:

```python
from error_handler import error_handler
from exceptions import ValidationError

@app.route('/api/dashboard/data')
def get_dashboard_data():
    try:
        # Your route logic here
        data = process_request()
        return jsonify(data)
    
    except Exception as e:
        context = {
            'user_id': getattr(request, 'current_user', {}).get('id'),
            'endpoint': request.endpoint,
            'method': request.method,
            'params': request.args.to_dict()
        }
        
        error_response, status_code = error_handler.handle_error(e, context)
        return jsonify(error_response), status_code
```

## Error Response Format

All errors return a standardized JSON response:

```json
{
    "error": "Human-readable error type",
    "error_code": "MACHINE_READABLE_CODE",
    "error_id": "unique-correlation-id",
    "message": "User-friendly error message",
    "details": {},
    "actions": ["suggested_action_1", "suggested_action_2"],
    "retry_after": 30
}
```

### Common Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| `AUTH_FAILED` | 401 | Authentication required or failed |
| `ACCESS_DENIED` | 403 | User lacks required permissions |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `DATABASE_ERROR` | 503 | Database connectivity issues |
| `NETWORK_ERROR` | 503 | Network connectivity problems |
| `CIRCUIT_BREAKER_OPEN` | 503 | Service temporarily unavailable |
| `PARTIAL_DATA_ERROR` | 206 | Some data retrieved, some failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Unexpected server error |

## Error Logging

All errors are logged with structured information:

```
2024-01-01 12:00:00 - error_handler - ERROR - Dashboard API Error [abc-123]: Database connection failed
```

Log entries include:
- Unique error ID for correlation
- User ID (if available)
- Request endpoint and method
- Request parameters
- Full stack trace
- Timestamp

## Error Metrics

Track error rates and patterns:

```python
from error_handler import error_handler

# Get current error statistics
stats = error_handler.get_error_stats()
print(stats)
# Output: {
#     'error_counts': {'/api/dashboard/summary:DatabaseError': 5},
#     'total_errors': 5,
#     'last_reset': 1640995200.0
# }
```

## Best Practices

### 1. Use Specific Exception Types

```python
# Good
if not user_authenticated:
    raise AuthenticationError("Invalid or expired token")

# Avoid
if not user_authenticated:
    raise Exception("Auth failed")
```

### 2. Provide Context in Error Details

```python
# Good
raise ValidationError(
    "Invalid email format", 
    field="email",
    details={"provided_value": email, "expected_format": "user@domain.com"}
)

# Basic
raise ValidationError("Invalid email")
```

### 3. Handle Partial Failures Gracefully

```python
failed_operations = []
results = {}

try:
    results['experiments'] = fetch_experiments()
except Exception as e:
    failed_operations.append('experiments')
    results['experiments'] = []

if failed_operations:
    raise PartialDataError(
        "Some data could not be retrieved",
        failed_operations=failed_operations
    )
```

### 4. Use Circuit Breaker for External Services

```python
if circuit_breaker.is_open():
    raise CircuitBreakerOpenError(
        "External service temporarily unavailable",
        retry_after=60
    )
```

## Integration with Existing Code

To integrate with existing dashboard routes:

1. **Import the error handler and exceptions:**
   ```python
   from error_handler import error_handler
   from exceptions import DatabaseError, ValidationError, AuthenticationError
   ```

2. **Add the decorator to route functions:**
   ```python
   @dashboard_bp.route('/dashboard/summary')
   @error_handler.handle_exceptions
   def get_dashboard_summary():
       # existing code
   ```

3. **Replace generic exceptions with specific ones:**
   ```python
   # Replace this:
   if not result['success']:
       return jsonify({'error': 'Failed to retrieve data'}), 500
   
   # With this:
   if not result['success']:
       raise DatabaseError(f"Failed to retrieve data: {result['error']}")
   ```

4. **Add validation for request parameters:**
   ```python
   limit = request.args.get('limit', '10')
   try:
       limit = int(limit)
       if limit < 1 or limit > 100:
           raise ValidationError("Limit must be between 1 and 100", field="limit")
   except ValueError:
       raise ValidationError("Limit must be a valid integer", field="limit")
   ```

## Testing

The error handling infrastructure includes comprehensive unit tests in `test_error_handler.py`. Run tests with:

```bash
python -m pytest test_error_handler.py -v
```

## Monitoring and Alerting

Use the error metrics to set up monitoring:

```python
# Example monitoring check
stats = error_handler.get_error_stats()
total_errors = stats['total_errors']

if total_errors > ERROR_THRESHOLD:
    send_alert(f"High error rate detected: {total_errors} errors")
```

## Example Implementation

See `error_handler_example.py` for a complete example of how to use the error handling infrastructure in your routes.