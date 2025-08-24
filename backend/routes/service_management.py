"""
Service management routes for NeuroLab 360.
Provides endpoints for managing service status, maintenance mode, and degradation settings.
"""

from flask import Blueprint, request, jsonify
from functools import wraps
from typing import Dict, Any
import logging

from degradation_service import get_degradation_service, ServiceStatus, DegradationLevel
from error_handler import error_handler

logger = logging.getLogger(__name__)

# Create blueprint for service management routes
service_mgmt_bp = Blueprint('service_management', __name__)

# Get degradation service
degradation_service = get_degradation_service()


def require_admin_auth(f):
    """Decorator to require admin authentication for management routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # In a real implementation, this would check for admin privileges
        # For now, we'll use a simple API key check
        api_key = request.headers.get('X-Admin-API-Key')
        if not api_key or api_key != 'admin-key-placeholder':
            return jsonify({
                'error': 'Admin authentication required',
                'message': 'This endpoint requires admin privileges'
            }), 401
        
        return f(*args, **kwargs)
    
    return decorated_function


@service_mgmt_bp.route('/service/status', methods=['GET'])
@error_handler.handle_exceptions
def get_service_status():
    """Get overall service status and health information."""
    service_name = request.args.get('service')
    
    if service_name:
        # Get specific service status
        status_info = degradation_service.get_service_status_info(service_name)
    else:
        # Get overall system status
        status_info = degradation_service.get_service_status_info()
    
    return jsonify(status_info)


@service_mgmt_bp.route('/service/health', methods=['GET'])
@error_handler.handle_exceptions
def get_service_health():
    """Get detailed service health information."""
    overall_health = degradation_service.health_monitor.get_overall_health()
    
    return jsonify({
        'health': overall_health,
        'maintenance_mode': degradation_service.maintenance_mode.get_info(),
        'timestamp': overall_health.get('last_updated')
    })


@service_mgmt_bp.route('/service/maintenance', methods=['POST'])
@require_admin_auth
@error_handler.handle_exceptions
def enable_maintenance_mode():
    """Enable maintenance mode for specified services."""
    data = request.get_json()
    
    if not data:
        return jsonify({
            'error': 'Invalid request',
            'message': 'JSON data required'
        }), 400
    
    message = data.get('message', 'System maintenance in progress')
    duration_minutes = data.get('duration_minutes', 60)
    affected_services = data.get('affected_services', [])
    
    # Validate inputs
    if not isinstance(duration_minutes, int) or duration_minutes <= 0:
        return jsonify({
            'error': 'Invalid duration',
            'message': 'Duration must be a positive integer (minutes)'
        }), 400
    
    if duration_minutes > 1440:  # 24 hours max
        return jsonify({
            'error': 'Duration too long',
            'message': 'Maximum maintenance duration is 24 hours (1440 minutes)'
        }), 400
    
    # Enable maintenance mode
    degradation_service.maintenance_mode.enable(
        message=message,
        duration_minutes=duration_minutes,
        affected_services=affected_services
    )
    
    logger.info(f"Maintenance mode enabled: {message} (Duration: {duration_minutes} minutes)")
    
    return jsonify({
        'success': True,
        'message': 'Maintenance mode enabled',
        'maintenance_info': degradation_service.maintenance_mode.get_info()
    })


@service_mgmt_bp.route('/service/maintenance', methods=['DELETE'])
@require_admin_auth
@error_handler.handle_exceptions
def disable_maintenance_mode():
    """Disable maintenance mode."""
    degradation_service.maintenance_mode.disable()
    
    logger.info("Maintenance mode disabled via API")
    
    return jsonify({
        'success': True,
        'message': 'Maintenance mode disabled'
    })


@service_mgmt_bp.route('/service/maintenance', methods=['GET'])
@error_handler.handle_exceptions
def get_maintenance_status():
    """Get current maintenance mode status."""
    maintenance_info = degradation_service.maintenance_mode.get_info()
    
    return jsonify({
        'maintenance_mode': maintenance_info
    })


@service_mgmt_bp.route('/service/health/<service_name>', methods=['PUT'])
@require_admin_auth
@error_handler.handle_exceptions
def update_service_health(service_name: str):
    """Manually update service health status."""
    data = request.get_json()
    
    if not data:
        return jsonify({
            'error': 'Invalid request',
            'message': 'JSON data required'
        }), 400
    
    # Validate status
    status_str = data.get('status', '').upper()
    try:
        status = ServiceStatus(status_str.lower())
    except ValueError:
        return jsonify({
            'error': 'Invalid status',
            'message': f'Status must be one of: {[s.value for s in ServiceStatus]}'
        }), 400
    
    # Optional fields
    response_time_ms = data.get('response_time_ms', 0.0)
    error_count = data.get('error_count', 0)
    message = data.get('message', '')
    details = data.get('details', {})
    
    # Update service health
    degradation_service.health_monitor.update_service_health(
        service_name=service_name,
        status=status,
        response_time_ms=response_time_ms,
        error_count=error_count,
        message=message,
        details=details
    )
    
    logger.info(f"Service health updated for {service_name}: {status.value}")
    
    return jsonify({
        'success': True,
        'message': f'Service health updated for {service_name}',
        'service_health': degradation_service.health_monitor.get_service_health(service_name).__dict__
    })


@service_mgmt_bp.route('/service/fallback/<data_type>', methods=['POST'])
@require_admin_auth
@error_handler.handle_exceptions
def register_fallback_data(data_type: str):
    """Register static fallback data for a specific data type."""
    data = request.get_json()
    
    if not data:
        return jsonify({
            'error': 'Invalid request',
            'message': 'JSON data required'
        }), 400
    
    fallback_data = data.get('data')
    confidence = data.get('confidence', 0.5)
    
    if fallback_data is None:
        return jsonify({
            'error': 'Missing data',
            'message': 'Fallback data is required'
        }), 400
    
    if not isinstance(confidence, (int, float)) or not 0 <= confidence <= 1:
        return jsonify({
            'error': 'Invalid confidence',
            'message': 'Confidence must be a number between 0 and 1'
        }), 400
    
    # Register the fallback data
    degradation_service.fallback_provider.register_static_fallback(
        data_type=data_type,
        data=fallback_data,
        confidence=confidence
    )
    
    logger.info(f"Static fallback data registered for {data_type}")
    
    return jsonify({
        'success': True,
        'message': f'Fallback data registered for {data_type}',
        'data_type': data_type,
        'confidence': confidence
    })


@service_mgmt_bp.route('/service/test-degradation', methods=['POST'])
@require_admin_auth
@error_handler.handle_exceptions
def test_degradation():
    """Test degradation scenarios for development/testing purposes."""
    data = request.get_json()
    
    if not data:
        return jsonify({
            'error': 'Invalid request',
            'message': 'JSON data required'
        }), 400
    
    test_type = data.get('test_type')
    service_name = data.get('service_name', 'dashboard')
    
    if test_type == 'database_failure':
        # Simulate database failure
        degradation_service.health_monitor.update_service_health(
            service_name=service_name,
            status=ServiceStatus.UNAVAILABLE,
            error_count=10,
            message='Simulated database failure for testing'
        )
        
        return jsonify({
            'success': True,
            'message': f'Simulated database failure for {service_name}',
            'test_type': test_type
        })
    
    elif test_type == 'slow_response':
        # Simulate slow response times
        degradation_service.health_monitor.update_service_health(
            service_name=service_name,
            status=ServiceStatus.DEGRADED,
            response_time_ms=8000,  # 8 seconds
            message='Simulated slow response times for testing'
        )
        
        return jsonify({
            'success': True,
            'message': f'Simulated slow response for {service_name}',
            'test_type': test_type
        })
    
    elif test_type == 'reset':
        # Reset service to healthy
        degradation_service.health_monitor.update_service_health(
            service_name=service_name,
            status=ServiceStatus.HEALTHY,
            response_time_ms=100,
            error_count=0,
            message='Service reset to healthy state'
        )
        
        return jsonify({
            'success': True,
            'message': f'Reset {service_name} to healthy state',
            'test_type': test_type
        })
    
    else:
        return jsonify({
            'error': 'Invalid test type',
            'message': 'Supported test types: database_failure, slow_response, reset'
        }), 400


@service_mgmt_bp.route('/service/metrics', methods=['GET'])
@error_handler.handle_exceptions
def get_service_metrics():
    """Get service performance and degradation metrics."""
    # This would integrate with the performance monitoring system
    # For now, return basic health metrics
    
    overall_health = degradation_service.health_monitor.get_overall_health()
    maintenance_info = degradation_service.maintenance_mode.get_info()
    
    # Calculate some basic metrics
    services = overall_health.get('services', {})
    total_services = len(services)
    healthy_services = sum(1 for s in services.values() 
                          if s['status'] == ServiceStatus.HEALTHY.value)
    degraded_services = sum(1 for s in services.values() 
                           if s['status'] == ServiceStatus.DEGRADED.value)
    unavailable_services = sum(1 for s in services.values() 
                              if s['status'] == ServiceStatus.UNAVAILABLE.value)
    
    return jsonify({
        'metrics': {
            'total_services': total_services,
            'healthy_services': healthy_services,
            'degraded_services': degraded_services,
            'unavailable_services': unavailable_services,
            'overall_health_score': (healthy_services / total_services * 100) if total_services > 0 else 100
        },
        'overall_health': overall_health,
        'maintenance_mode': maintenance_info,
        'timestamp': overall_health.get('last_updated')
    })