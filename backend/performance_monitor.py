"""
Performance monitoring and logging infrastructure for NeuroLab 360.
Provides request/response logging, performance metrics, and structured logging with correlation IDs.
"""

import time
import uuid
import logging
import json
from datetime import datetime
from functools import wraps
from typing import Dict, Any, Optional, Callable
from flask import request, g, current_app
import threading
from collections import defaultdict, deque
import statistics

# Configure structured logger
logger = logging.getLogger(__name__)

class PerformanceMetrics:
    """Thread-safe performance metrics collector."""
    
    def __init__(self):
        self._lock = threading.Lock()
        self._metrics = defaultdict(lambda: {
            'count': 0,
            'total_time': 0.0,
            'min_time': float('inf'),
            'max_time': 0.0,
            'response_times': deque(maxlen=1000),  # Keep last 1000 measurements
            'error_count': 0,
            'status_codes': defaultdict(int)
        })
    
    def record_request(self, endpoint: str, method: str, duration: float, 
                      status_code: int, error: bool = False):
        """Record request performance metrics."""
        key = f"{method}:{endpoint}"
        
        with self._lock:
            metrics = self._metrics[key]
            metrics['count'] += 1
            metrics['total_time'] += duration
            metrics['min_time'] = min(metrics['min_time'], duration)
            metrics['max_time'] = max(metrics['max_time'], duration)
            metrics['response_times'].append(duration)
            metrics['status_codes'][status_code] += 1
            
            if error:
                metrics['error_count'] += 1
    
    def get_metrics(self, endpoint: str = None) -> Dict[str, Any]:
        """Get performance metrics for endpoint or all endpoints."""
        with self._lock:
            if endpoint:
                if endpoint in self._metrics:
                    return self._calculate_stats(endpoint, self._metrics[endpoint])
                return {}
            
            result = {}
            for key, metrics in self._metrics.items():
                result[key] = self._calculate_stats(key, metrics)
            return result
    
    def _calculate_stats(self, key: str, metrics: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate statistical metrics."""
        response_times = list(metrics['response_times'])
        
        stats = {
            'endpoint': key,
            'total_requests': metrics['count'],
            'total_time': round(metrics['total_time'], 3),
            'average_time': round(metrics['total_time'] / metrics['count'], 3) if metrics['count'] > 0 else 0,
            'min_time': round(metrics['min_time'], 3) if metrics['min_time'] != float('inf') else 0,
            'max_time': round(metrics['max_time'], 3),
            'error_count': metrics['error_count'],
            'error_rate': round((metrics['error_count'] / metrics['count']) * 100, 2) if metrics['count'] > 0 else 0,
            'status_codes': dict(metrics['status_codes'])
        }
        
        # Calculate percentiles if we have enough data
        if len(response_times) >= 10:
            sorted_times = sorted(response_times)
            stats['p50'] = round(statistics.median(sorted_times), 3)
            stats['p95'] = round(sorted_times[int(len(sorted_times) * 0.95)], 3)
            stats['p99'] = round(sorted_times[int(len(sorted_times) * 0.99)], 3)
        
        return stats

# Global metrics instance
performance_metrics = PerformanceMetrics()

class StructuredLogger:
    """Structured logger with correlation ID support."""
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self._setup_formatter()
    
    def _setup_formatter(self):
        """Setup JSON formatter for structured logging."""
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        
        # Add handler if not already present
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(formatter)
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)
    
    def _get_correlation_id(self) -> str:
        """Get or create correlation ID for current request."""
        try:
            if hasattr(g, 'correlation_id'):
                return g.correlation_id
            
            correlation_id = str(uuid.uuid4())
            g.correlation_id = correlation_id
            return correlation_id
        except RuntimeError:
            # Outside of application context (e.g., during testing)
            return str(uuid.uuid4())
    
    def _create_log_entry(self, level: str, message: str, **kwargs) -> Dict[str, Any]:
        """Create structured log entry."""
        log_entry = {
            'timestamp': datetime.utcnow().isoformat(),
            'level': level,
            'message': message,
            'correlation_id': self._get_correlation_id(),
            'service': 'neurolab-360-backend'
        }
        
        # Add request context if available
        if request:
            log_entry.update({
                'request_id': getattr(g, 'request_id', None),
                'method': request.method,
                'endpoint': request.endpoint,
                'path': request.path,
                'user_id': getattr(request, 'current_user', {}).get('id') if hasattr(request, 'current_user') else None,
                'ip_address': request.remote_addr,
                'user_agent': request.headers.get('User-Agent')
            })
        
        # Add custom fields
        log_entry.update(kwargs)
        
        return log_entry
    
    def info(self, message: str, **kwargs):
        """Log info message with structured format."""
        log_entry = self._create_log_entry('INFO', message, **kwargs)
        self.logger.info(json.dumps(log_entry))
    
    def warning(self, message: str, **kwargs):
        """Log warning message with structured format."""
        log_entry = self._create_log_entry('WARNING', message, **kwargs)
        self.logger.warning(json.dumps(log_entry))
    
    def error(self, message: str, **kwargs):
        """Log error message with structured format."""
        log_entry = self._create_log_entry('ERROR', message, **kwargs)
        self.logger.error(json.dumps(log_entry))
    
    def debug(self, message: str, **kwargs):
        """Log debug message with structured format."""
        log_entry = self._create_log_entry('DEBUG', message, **kwargs)
        self.logger.debug(json.dumps(log_entry))

# Global structured logger instance
structured_logger = StructuredLogger('neurolab.performance')

def request_logging_middleware(app):
    """Flask middleware for request/response logging with performance metrics."""
    
    @app.before_request
    def before_request():
        """Initialize request tracking."""
        g.start_time = time.time()
        g.request_id = str(uuid.uuid4())
        g.correlation_id = request.headers.get('X-Correlation-ID', str(uuid.uuid4()))
        
        # Log incoming request
        structured_logger.info(
            "Incoming request",
            request_id=g.request_id,
            method=request.method,
            path=request.path,
            query_params=dict(request.args),
            content_length=request.content_length,
            headers={k: v for k, v in request.headers.items() if k.lower() not in ['authorization', 'cookie']}
        )
    
    @app.after_request
    def after_request(response):
        """Log response and record metrics."""
        if hasattr(g, 'start_time'):
            duration = time.time() - g.start_time
            
            # Determine if this was an error
            is_error = response.status_code >= 400
            
            # Record performance metrics
            endpoint = request.endpoint or 'unknown'
            performance_metrics.record_request(
                endpoint=endpoint,
                method=request.method,
                duration=duration,
                status_code=response.status_code,
                error=is_error
            )
            
            # Log response
            structured_logger.info(
                "Request completed",
                request_id=getattr(g, 'request_id', None),
                method=request.method,
                path=request.path,
                status_code=response.status_code,
                duration_ms=round(duration * 1000, 2),
                response_size=response.content_length,
                is_error=is_error
            )
            
            # Add correlation ID to response headers
            response.headers['X-Correlation-ID'] = getattr(g, 'correlation_id', '')
        
        return response
    
    return app

def performance_monitor(operation_name: str = None):
    """Decorator for monitoring performance of critical operations."""
    
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            op_name = operation_name or f"{func.__module__}.{func.__name__}"
            start_time = time.time()
            
            # Log operation start
            structured_logger.debug(
                f"Starting operation: {op_name}",
                operation=op_name,
                function=func.__name__,
                module=func.__module__
            )
            
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time
                
                # Log successful completion
                structured_logger.info(
                    f"Operation completed: {op_name}",
                    operation=op_name,
                    duration_ms=round(duration * 1000, 2),
                    success=True
                )
                
                return result
                
            except Exception as e:
                duration = time.time() - start_time
                
                # Log operation failure
                structured_logger.error(
                    f"Operation failed: {op_name}",
                    operation=op_name,
                    duration_ms=round(duration * 1000, 2),
                    success=False,
                    error_type=type(e).__name__,
                    error_message=str(e)
                )
                
                raise
        
        return wrapper
    return decorator

def track_endpoint(endpoint_name: str = None):
    """Decorator for tracking endpoint performance."""
    
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            ep_name = endpoint_name or func.__name__
            start_time = time.time()
            
            # Log endpoint start
            structured_logger.debug(
                f"Endpoint started: {ep_name}",
                endpoint=ep_name,
                function=func.__name__
            )
            
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time
                
                # Log endpoint completion
                structured_logger.info(
                    f"Endpoint completed: {ep_name}",
                    endpoint=ep_name,
                    duration_ms=round(duration * 1000, 2),
                    success=True
                )
                
                return result
                
            except Exception as e:
                duration = time.time() - start_time
                
                # Log endpoint failure
                structured_logger.error(
                    f"Endpoint failed: {ep_name}",
                    endpoint=ep_name,
                    duration_ms=round(duration * 1000, 2),
                    success=False,
                    error_type=type(e).__name__,
                    error_message=str(e)
                )
                
                raise
        
        return wrapper
    return decorator

def database_operation_monitor(operation_type: str):
    """Decorator for monitoring database operations."""
    
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            start_time = time.time()
            
            # Extract operation details from args/kwargs if possible
            table = kwargs.get('table') or (args[0] if args else 'unknown')
            operation = kwargs.get('operation') or operation_type
            
            structured_logger.debug(
                f"Database operation started: {operation}",
                operation=operation,
                table=table,
                function=func.__name__
            )
            
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time
                
                # Log successful database operation
                structured_logger.info(
                    f"Database operation completed: {operation}",
                    operation=operation,
                    table=table,
                    duration_ms=round(duration * 1000, 2),
                    success=True,
                    rows_affected=len(result.get('data', [])) if isinstance(result, dict) and result.get('data') else None
                )
                
                return result
                
            except Exception as e:
                duration = time.time() - start_time
                
                # Log database operation failure
                structured_logger.error(
                    f"Database operation failed: {operation}",
                    operation=operation,
                    table=table,
                    duration_ms=round(duration * 1000, 2),
                    success=False,
                    error_type=type(e).__name__,
                    error_message=str(e)
                )
                
                raise
        
        return wrapper
    return decorator

class PerformanceAnalyzer:
    """Utility class for analyzing performance metrics and logs."""
    
    def __init__(self):
        self.metrics = performance_metrics
    
    def get_slow_endpoints(self, threshold_ms: float = 1000.0) -> Dict[str, Any]:
        """Get endpoints that are slower than threshold."""
        all_metrics = self.metrics.get_metrics()
        slow_endpoints = {}
        
        for endpoint, stats in all_metrics.items():
            if stats['average_time'] * 1000 > threshold_ms:
                slow_endpoints[endpoint] = {
                    'average_time_ms': round(stats['average_time'] * 1000, 2),
                    'max_time_ms': round(stats['max_time'] * 1000, 2),
                    'total_requests': stats['total_requests'],
                    'error_rate': stats['error_rate']
                }
        
        return slow_endpoints
    
    def get_error_summary(self) -> Dict[str, Any]:
        """Get summary of errors across all endpoints."""
        all_metrics = self.metrics.get_metrics()
        error_summary = {
            'total_errors': 0,
            'total_requests': 0,
            'endpoints_with_errors': [],
            'overall_error_rate': 0.0
        }
        
        for endpoint, stats in all_metrics.items():
            error_summary['total_errors'] += stats['error_count']
            error_summary['total_requests'] += stats['total_requests']
            
            if stats['error_count'] > 0:
                error_summary['endpoints_with_errors'].append({
                    'endpoint': endpoint,
                    'error_count': stats['error_count'],
                    'error_rate': stats['error_rate'],
                    'total_requests': stats['total_requests']
                })
        
        if error_summary['total_requests'] > 0:
            error_summary['overall_error_rate'] = round(
                (error_summary['total_errors'] / error_summary['total_requests']) * 100, 2
            )
        
        return error_summary
    
    def get_performance_report(self) -> Dict[str, Any]:
        """Generate comprehensive performance report."""
        all_metrics = self.metrics.get_metrics()
        
        if not all_metrics:
            return {
                'summary': 'No performance data available',
                'endpoints': {},
                'slow_endpoints': {},
                'error_summary': {}
            }
        
        # Calculate overall statistics
        total_requests = sum(stats['total_requests'] for stats in all_metrics.values())
        total_errors = sum(stats['error_count'] for stats in all_metrics.values())
        avg_response_times = [stats['average_time'] for stats in all_metrics.values()]
        
        overall_avg_time = statistics.mean(avg_response_times) if avg_response_times else 0
        overall_error_rate = (total_errors / total_requests * 100) if total_requests > 0 else 0
        
        return {
            'summary': {
                'total_requests': total_requests,
                'total_errors': total_errors,
                'overall_error_rate': round(overall_error_rate, 2),
                'average_response_time_ms': round(overall_avg_time * 1000, 2),
                'endpoints_monitored': len(all_metrics)
            },
            'endpoints': all_metrics,
            'slow_endpoints': self.get_slow_endpoints(),
            'error_summary': self.get_error_summary()
        }

# Global performance analyzer instance
performance_analyzer = PerformanceAnalyzer()

def init_performance_monitoring(app):
    """Initialize performance monitoring for Flask app."""
    # Apply request logging middleware
    request_logging_middleware(app)
    
    # Add performance metrics endpoint
    @app.route('/api/performance/metrics', methods=['GET'])
    def get_performance_metrics():
        """Get current performance metrics."""
        endpoint = request.args.get('endpoint')
        metrics = performance_metrics.get_metrics(endpoint)
        return json.dumps(metrics, indent=2), 200, {'Content-Type': 'application/json'}
    
    @app.route('/api/performance/report', methods=['GET'])
    def get_performance_report():
        """Get comprehensive performance report."""
        report = performance_analyzer.get_performance_report()
        return json.dumps(report, indent=2), 200, {'Content-Type': 'application/json'}
    
    structured_logger.info("Performance monitoring initialized")
    
    return app