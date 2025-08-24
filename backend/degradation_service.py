"""
Graceful degradation service for NeuroLab 360 Dashboard API.

This module provides comprehensive graceful degradation mechanisms including:
- Fallback data providers for when primary services are unavailable
- Service status indicators in API responses
- Maintenance mode handling with appropriate user messaging
- Service health monitoring and automatic degradation triggers
"""

import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Callable
from enum import Enum
from dataclasses import dataclass, asdict
from functools import wraps
import threading

from cache_service import get_cache_service
from exceptions import DatabaseError, NetworkError, CircuitBreakerOpenError

logger = logging.getLogger(__name__)


class ServiceStatus(Enum):
    """Service status levels."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"
    MAINTENANCE = "maintenance"


class DegradationLevel(Enum):
    """Degradation levels for different scenarios."""
    NONE = "none"
    MINOR = "minor"
    MODERATE = "moderate"
    SEVERE = "severe"
    CRITICAL = "critical"


@dataclass
class ServiceHealth:
    """Service health information."""
    service_name: str
    status: ServiceStatus
    degradation_level: DegradationLevel
    last_check: datetime
    error_count: int = 0
    response_time_ms: float = 0.0
    message: str = ""
    details: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.details is None:
            self.details = {}


@dataclass
class FallbackData:
    """Fallback data structure."""
    data: Any
    source: str
    timestamp: datetime
    is_stale: bool = False
    confidence: float = 1.0  # 0.0 to 1.0
    message: str = ""


class MaintenanceMode:
    """Maintenance mode configuration and management."""
    
    def __init__(self):
        self._enabled = False
        self._start_time = None
        self._end_time = None
        self._message = ""
        self._affected_services = []
        self._lock = threading.RLock()
    
    def enable(self, message: str, duration_minutes: int = 60, affected_services: List[str] = None):
        """Enable maintenance mode."""
        with self._lock:
            self._enabled = True
            self._start_time = datetime.utcnow()
            self._end_time = self._start_time + timedelta(minutes=duration_minutes)
            self._message = message
            self._affected_services = affected_services or []
            
            logger.info(f"Maintenance mode enabled: {message} (Duration: {duration_minutes} minutes)")
    
    def disable(self):
        """Disable maintenance mode."""
        with self._lock:
            self._enabled = False
            self._start_time = None
            self._end_time = None
            self._message = ""
            self._affected_services = []
            
            logger.info("Maintenance mode disabled")
    
    def is_enabled(self, service_name: str = None) -> bool:
        """Check if maintenance mode is enabled."""
        with self._lock:
            if not self._enabled:
                return False
            
            # Check if maintenance period has expired
            if self._end_time and datetime.utcnow() > self._end_time:
                self.disable()
                return False
            
            # Check if specific service is affected
            if service_name and self._affected_services:
                return service_name in self._affected_services
            
            return True
    
    def get_info(self) -> Dict[str, Any]:
        """Get maintenance mode information."""
        with self._lock:
            if not self._enabled:
                return {'enabled': False}
            
            return {
                'enabled': True,
                'message': self._message,
                'start_time': self._start_time.isoformat() if self._start_time else None,
                'end_time': self._end_time.isoformat() if self._end_time else None,
                'affected_services': self._affected_services,
                'remaining_minutes': int((self._end_time - datetime.utcnow()).total_seconds() / 60) if self._end_time else None
            }


class FallbackDataProvider:
    """Provides fallback data when primary services are unavailable."""
    
    def __init__(self):
        self.cache_service = get_cache_service()
        self._fallback_generators = {}
        self._static_fallbacks = {}
    
    def register_fallback_generator(self, data_type: str, generator: Callable[..., Any]):
        """Register a fallback data generator function."""
        self._fallback_generators[data_type] = generator
        logger.debug(f"Registered fallback generator for {data_type}")
    
    def register_static_fallback(self, data_type: str, data: Any, confidence: float = 0.5):
        """Register static fallback data."""
        self._static_fallbacks[data_type] = FallbackData(
            data=data,
            source="static_fallback",
            timestamp=datetime.utcnow(),
            is_stale=True,
            confidence=confidence,
            message="Using static fallback data"
        )
        logger.debug(f"Registered static fallback for {data_type}")
    
    def get_fallback_data(self, data_type: str, **kwargs) -> Optional[FallbackData]:
        """Get fallback data for the specified type."""
        # Try cache first (stale data)
        if self.cache_service:
            cache_key = kwargs.get('cache_key', f"fallback_{data_type}")
            stale_data = self.cache_service.get_stale(cache_key)
            if stale_data:
                return FallbackData(
                    data=stale_data,
                    source="stale_cache",
                    timestamp=datetime.utcnow(),
                    is_stale=True,
                    confidence=0.7,
                    message="Using stale cached data due to service unavailability"
                )
        
        # Try registered generator
        if data_type in self._fallback_generators:
            try:
                generated_data = self._fallback_generators[data_type](**kwargs)
                return FallbackData(
                    data=generated_data,
                    source="generated_fallback",
                    timestamp=datetime.utcnow(),
                    is_stale=False,
                    confidence=0.6,
                    message="Using generated fallback data"
                )
            except Exception as e:
                logger.error(f"Fallback generator failed for {data_type}: {e}")
        
        # Try static fallback
        if data_type in self._static_fallbacks:
            return self._static_fallbacks[data_type]
        
        return None
    
    def get_minimal_dashboard_summary(self, user_id: str = None) -> Dict[str, Any]:
        """Generate minimal dashboard summary as fallback."""
        return {
            'total_experiments': 0,
            'experiments_by_type': {},
            'experiments_by_status': {},
            'recent_activity': {
                'last_7_days': 0,
                'completion_rate': 0
            },
            'average_metrics': {},
            'last_updated': datetime.utcnow().isoformat(),
            'fallback_data': True,
            'message': 'Service temporarily unavailable - showing minimal data'
        }
    
    def get_minimal_dashboard_charts(self, user_id: str = None, period: str = '30d') -> Dict[str, Any]:
        """Generate minimal dashboard charts as fallback."""
        return {
            'activity_timeline': [],
            'experiment_type_distribution': [],
            'performance_trends': [],
            'metric_comparisons': [],
            'period': period,
            'total_experiments': 0,
            'date_range': {
                'start': (datetime.utcnow() - timedelta(days=30)).isoformat(),
                'end': datetime.utcnow().isoformat()
            },
            'last_updated': datetime.utcnow().isoformat(),
            'fallback_data': True,
            'message': 'Chart service temporarily unavailable - showing empty charts'
        }
    
    def get_minimal_recent_experiments(self, user_id: str = None) -> Dict[str, Any]:
        """Generate minimal recent experiments as fallback."""
        return {
            'experiments': [],
            'total_count': 0,
            'has_more': False,
            'last_updated': datetime.utcnow().isoformat(),
            'fallback_data': True,
            'message': 'Experiment service temporarily unavailable - showing empty list'
        }


class ServiceHealthMonitor:
    """Monitors service health and determines degradation levels."""
    
    def __init__(self):
        self._service_health = {}
        self._lock = threading.RLock()
        self._health_check_interval = 30  # seconds
        self._error_thresholds = {
            DegradationLevel.MINOR: 5,
            DegradationLevel.MODERATE: 10,
            DegradationLevel.SEVERE: 20,
            DegradationLevel.CRITICAL: 50
        }
        self._response_time_thresholds = {
            DegradationLevel.MINOR: 2000,    # 2 seconds
            DegradationLevel.MODERATE: 5000,  # 5 seconds
            DegradationLevel.SEVERE: 10000,   # 10 seconds
            DegradationLevel.CRITICAL: 30000  # 30 seconds
        }
    
    def update_service_health(self, service_name: str, status: ServiceStatus, 
                            response_time_ms: float = 0.0, error_count: int = 0, 
                            message: str = "", details: Dict[str, Any] = None):
        """Update health information for a service."""
        with self._lock:
            # Determine degradation level based on metrics
            degradation_level = self._calculate_degradation_level(
                status, response_time_ms, error_count
            )
            
            self._service_health[service_name] = ServiceHealth(
                service_name=service_name,
                status=status,
                degradation_level=degradation_level,
                last_check=datetime.utcnow(),
                error_count=error_count,
                response_time_ms=response_time_ms,
                message=message,
                details=details or {}
            )
            
            logger.debug(f"Updated health for {service_name}: {status.value} ({degradation_level.value})")
    
    def _calculate_degradation_level(self, status: ServiceStatus, 
                                   response_time_ms: float, error_count: int) -> DegradationLevel:
        """Calculate degradation level based on metrics."""
        if status == ServiceStatus.UNAVAILABLE:
            return DegradationLevel.CRITICAL
        elif status == ServiceStatus.MAINTENANCE:
            return DegradationLevel.MODERATE
        
        # Check error count thresholds
        for level, threshold in sorted(self._error_thresholds.items(), 
                                     key=lambda x: x[1], reverse=True):
            if error_count >= threshold:
                return level
        
        # Check response time thresholds
        for level, threshold in sorted(self._response_time_thresholds.items(), 
                                     key=lambda x: x[1], reverse=True):
            if response_time_ms >= threshold:
                return level
        
        return DegradationLevel.NONE
    
    def get_service_health(self, service_name: str) -> Optional[ServiceHealth]:
        """Get health information for a specific service."""
        with self._lock:
            return self._service_health.get(service_name)
    
    def get_overall_health(self) -> Dict[str, Any]:
        """Get overall system health summary."""
        with self._lock:
            if not self._service_health:
                return {
                    'overall_status': ServiceStatus.HEALTHY.value,
                    'degradation_level': DegradationLevel.NONE.value,
                    'services': {},
                    'message': 'No services monitored'
                }
            
            # Determine overall status
            statuses = [health.status for health in self._service_health.values()]
            degradation_levels = [health.degradation_level for health in self._service_health.values()]
            
            # Overall status is the worst individual status
            if ServiceStatus.UNAVAILABLE in statuses:
                overall_status = ServiceStatus.UNAVAILABLE
            elif ServiceStatus.MAINTENANCE in statuses:
                overall_status = ServiceStatus.MAINTENANCE
            elif ServiceStatus.DEGRADED in statuses:
                overall_status = ServiceStatus.DEGRADED
            else:
                overall_status = ServiceStatus.HEALTHY
            
            # Overall degradation is the worst individual degradation
            overall_degradation = max(degradation_levels, 
                                    key=lambda x: list(DegradationLevel).index(x))
            
            services_dict = {}
            for name, health in self._service_health.items():
                health_dict = asdict(health)
                # Convert enum values to strings for JSON serialization
                health_dict['status'] = health.status.value
                health_dict['degradation_level'] = health.degradation_level.value
                health_dict['last_check'] = health.last_check.isoformat()
                services_dict[name] = health_dict
            
            return {
                'overall_status': overall_status.value,
                'degradation_level': overall_degradation.value,
                'services': services_dict,
                'last_updated': datetime.utcnow().isoformat()
            }
    
    def is_service_degraded(self, service_name: str) -> bool:
        """Check if a service is degraded."""
        health = self.get_service_health(service_name)
        if not health:
            return False
        
        return (health.status != ServiceStatus.HEALTHY or 
                health.degradation_level != DegradationLevel.NONE)


class DegradationService:
    """Main service for handling graceful degradation scenarios."""
    
    def __init__(self):
        self.maintenance_mode = MaintenanceMode()
        self.fallback_provider = FallbackDataProvider()
        self.health_monitor = ServiceHealthMonitor()
        
        # Register default fallback generators
        self._register_default_fallbacks()
        
        logger.info("DegradationService initialized")
    
    def _register_default_fallbacks(self):
        """Register default fallback data generators."""
        self.fallback_provider.register_fallback_generator(
            'dashboard_summary', 
            self.fallback_provider.get_minimal_dashboard_summary
        )
        self.fallback_provider.register_fallback_generator(
            'dashboard_charts', 
            self.fallback_provider.get_minimal_dashboard_charts
        )
        self.fallback_provider.register_fallback_generator(
            'recent_experiments', 
            self.fallback_provider.get_minimal_recent_experiments
        )
    
    def check_service_availability(self, service_name: str) -> bool:
        """Check if a service is available (not in maintenance or unavailable)."""
        # Check maintenance mode
        if self.maintenance_mode.is_enabled(service_name):
            return False
        
        # Check service health
        health = self.health_monitor.get_service_health(service_name)
        if health and health.status == ServiceStatus.UNAVAILABLE:
            return False
        
        return True
    
    def get_service_status_info(self, service_name: str = None) -> Dict[str, Any]:
        """Get service status information for API responses."""
        status_info = {
            'timestamp': datetime.utcnow().isoformat(),
            'maintenance_mode': self.maintenance_mode.get_info()
        }
        
        if service_name:
            health = self.health_monitor.get_service_health(service_name)
            if health:
                health_dict = asdict(health)
                # Convert enum values to strings for JSON serialization
                health_dict['status'] = health.status.value
                health_dict['degradation_level'] = health.degradation_level.value
                health_dict['last_check'] = health.last_check.isoformat()
                status_info['service_health'] = health_dict
            else:
                status_info['service_health'] = {
                    'service_name': service_name,
                    'status': ServiceStatus.HEALTHY.value,
                    'degradation_level': DegradationLevel.NONE.value,
                    'message': 'No health data available'
                }
        else:
            status_info['overall_health'] = self.health_monitor.get_overall_health()
        
        return status_info
    
    def handle_service_failure(self, service_name: str, data_type: str, 
                             error: Exception, **fallback_kwargs) -> Dict[str, Any]:
        """Handle service failure and provide fallback response."""
        # Update service health based on error type
        if isinstance(error, (DatabaseError, NetworkError)):
            status = ServiceStatus.DEGRADED
            message = f"Service experiencing connectivity issues: {str(error)}"
        elif isinstance(error, CircuitBreakerOpenError):
            status = ServiceStatus.UNAVAILABLE
            message = "Service temporarily unavailable due to high error rates"
        else:
            status = ServiceStatus.DEGRADED
            message = f"Service error: {str(error)}"
        
        self.health_monitor.update_service_health(
            service_name=service_name,
            status=status,
            error_count=1,  # Increment would be handled by caller
            message=message
        )
        
        # Get fallback data
        fallback_data = self.fallback_provider.get_fallback_data(data_type, **fallback_kwargs)
        
        if fallback_data:
            response = {
                'data': fallback_data.data,
                'service_degraded': True,
                'fallback_info': {
                    'source': fallback_data.source,
                    'confidence': fallback_data.confidence,
                    'is_stale': fallback_data.is_stale,
                    'message': fallback_data.message,
                    'timestamp': fallback_data.timestamp.isoformat()
                },
                'service_status': self.get_service_status_info(service_name)
            }
        else:
            # No fallback available
            response = {
                'error': 'Service temporarily unavailable',
                'message': 'Service is experiencing issues and no fallback data is available',
                'service_status': self.get_service_status_info(service_name),
                'retry_after': 60
            }
        
        return response
    
    def add_degradation_indicators(self, response_data: Dict[str, Any], 
                                 service_name: str) -> Dict[str, Any]:
        """Add service status indicators to API responses."""
        # Check if service is degraded
        is_degraded = (
            self.maintenance_mode.is_enabled(service_name) or
            self.health_monitor.is_service_degraded(service_name)
        )
        
        if is_degraded:
            response_data['service_degraded'] = True
            response_data['service_status'] = self.get_service_status_info(service_name)
        
        return response_data
    
    def graceful_degradation_decorator(self, service_name: str, data_type: str):
        """Decorator for adding graceful degradation to endpoint functions."""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                # Check maintenance mode
                if self.maintenance_mode.is_enabled(service_name):
                    maintenance_info = self.maintenance_mode.get_info()
                    return {
                        'error': 'Service under maintenance',
                        'message': maintenance_info['message'],
                        'maintenance_mode': maintenance_info,
                        'retry_after': maintenance_info.get('remaining_minutes', 60) * 60
                    }, 503
                
                try:
                    # Execute the original function
                    result = func(*args, **kwargs)
                    
                    # Add degradation indicators if needed
                    if isinstance(result, dict):
                        result = self.add_degradation_indicators(result, service_name)
                    elif isinstance(result, tuple) and len(result) >= 1 and isinstance(result[0], dict):
                        # Handle (response_dict, status_code) tuples
                        response_dict = self.add_degradation_indicators(result[0], service_name)
                        result = (response_dict,) + result[1:]
                    
                    return result
                    
                except Exception as e:
                    # Handle service failure with fallback
                    fallback_response = self.handle_service_failure(
                        service_name, data_type, e, **kwargs
                    )
                    
                    if 'error' in fallback_response:
                        return fallback_response, 503
                    else:
                        return fallback_response, 206  # Partial content
            
            return wrapper
        return decorator


# Global degradation service instance
degradation_service = DegradationService()


def get_degradation_service() -> DegradationService:
    """Get the global degradation service instance."""
    return degradation_service


# Convenience decorators
def with_graceful_degradation(service_name: str, data_type: str):
    """Decorator for adding graceful degradation to functions."""
    return degradation_service.graceful_degradation_decorator(service_name, data_type)


def maintenance_mode_check(service_name: str = None):
    """Decorator to check maintenance mode before executing function."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if degradation_service.maintenance_mode.is_enabled(service_name):
                maintenance_info = degradation_service.maintenance_mode.get_info()
                return {
                    'error': 'Service under maintenance',
                    'message': maintenance_info['message'],
                    'maintenance_mode': maintenance_info,
                    'retry_after': maintenance_info.get('remaining_minutes', 60) * 60
                }, 503
            
            return func(*args, **kwargs)
        return wrapper
    return decorator