"""
Validation middleware for NeuroLab 360 Flask application.
Provides request validation and sanitization middleware for API endpoints.
"""

from flask import request, jsonify, g
from functools import wraps
from typing import Dict, Any, Optional
import logging

from data_validator import validator, ValidationError, sanitize_input

logger = logging.getLogger(__name__)

class ValidationMiddleware:
    """Middleware class for request validation and sanitization."""
    
    def __init__(self, app=None):
        """Initialize validation middleware."""
        self.app = app
        if app is not None:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize the middleware with Flask app."""
        app.before_request(self.before_request)
        app.after_request(self.after_request)
    
    def before_request(self):
        """Process request before handling."""
        # Skip validation for health check and static endpoints
        if request.endpoint in ['health_check', 'api_info', 'static']:
            return
        
        # Skip validation for non-API endpoints
        if not request.path.startswith('/api/'):
            return
        
        try:
            # Sanitize query parameters
            if request.args:
                sanitized_args = {}
                for key, value in request.args.items():
                    sanitized_args[key] = sanitize_input(value)
                g.sanitized_args = sanitized_args
            
            # Sanitize JSON body if present
            if request.is_json:
                json_data = request.get_json(silent=True)
                if json_data:
                    g.sanitized_json = sanitize_input(json_data)
            
        except Exception as e:
            logger.error(f"Error in validation middleware: {str(e)}")
            return jsonify({
                'error': 'Request processing error',
                'error_code': 'MIDDLEWARE_ERROR',
                'message': 'Unable to process request'
            }), 400
    
    def after_request(self, response):
        """Process response after handling."""
        # Add security headers
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        
        return response

# Dashboard API validation schemas
DASHBOARD_VALIDATION_SCHEMAS = {
    'summary': {
        'query_params': {
            'force_refresh': {
                'type': 'string',
                'required': False
            }
        }
    },
    'charts': {
        'query_params': {
            'period': {
                'type': 'period',
                'required': False
            },
            'experiment_type': {
                'type': 'experiment_type',
                'required': False
            }
        }
    },
    'recent': {
        'query_params': {
            'limit': {
                'type': 'integer',
                'required': False,
                'min_value': 1,
                'max_value': 50
            },
            'days': {
                'type': 'integer',
                'required': False,
                'min_value': 1,
                'max_value': 365
            }
        }
    }
}

def validate_dashboard_summary():
    """Validate dashboard summary endpoint parameters."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                # Validate force_refresh parameter
                force_refresh = request.args.get('force_refresh', 'false')
                if force_refresh.lower() not in ['true', 'false']:
                    return jsonify({
                        'error': 'Invalid parameter',
                        'error_code': 'VALIDATION_ERROR',
                        'message': 'force_refresh must be true or false',
                        'field': 'force_refresh'
                    }), 400
                
                # Add validated params to request
                request.validated_params = {
                    'force_refresh': force_refresh.lower() == 'true'
                }
                
                return f(*args, **kwargs)
                
            except Exception as e:
                logger.error(f"Validation error in dashboard summary: {str(e)}")
                return jsonify({
                    'error': 'Validation failed',
                    'error_code': 'VALIDATION_ERROR',
                    'message': 'Invalid request parameters'
                }), 400
        
        return decorated_function
    return decorator

def validate_dashboard_charts():
    """Validate dashboard charts endpoint parameters."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                validated_params = validator.validate_dashboard_query_params(request.args.to_dict())
                
                # Additional validation for charts-specific parameters
                period = validated_params.get('period', '30d')
                experiment_type = validated_params.get('experiment_type')
                
                # Validate period
                if period not in validator.VALID_PERIODS:
                    return jsonify({
                        'error': 'Invalid parameter',
                        'error_code': 'VALIDATION_ERROR',
                        'message': f'period must be one of: {", ".join(validator.VALID_PERIODS)}',
                        'field': 'period'
                    }), 400
                
                # Validate experiment_type if provided
                if experiment_type and experiment_type not in validator.VALID_EXPERIMENT_TYPES:
                    return jsonify({
                        'error': 'Invalid parameter',
                        'error_code': 'VALIDATION_ERROR',
                        'message': f'experiment_type must be one of: {", ".join(validator.VALID_EXPERIMENT_TYPES)}',
                        'field': 'experiment_type'
                    }), 400
                
                # Add validated params to request
                request.validated_params = {
                    'period': period,
                    'experiment_type': experiment_type
                }
                
                return f(*args, **kwargs)
                
            except ValidationError as e:
                logger.warning(f"Validation error in dashboard charts: {e.message}")
                return jsonify({
                    'error': 'Validation failed',
                    'error_code': 'VALIDATION_ERROR',
                    'message': e.message,
                    'field': e.field
                }), 400
            except Exception as e:
                logger.error(f"Unexpected validation error in dashboard charts: {str(e)}")
                return jsonify({
                    'error': 'Validation failed',
                    'error_code': 'VALIDATION_ERROR',
                    'message': 'Invalid request parameters'
                }), 400
        
        return decorated_function
    return decorator

def validate_dashboard_recent():
    """Validate dashboard recent experiments endpoint parameters."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                validated_params = validator.validate_dashboard_query_params(request.args.to_dict())
                
                # Extract and validate specific parameters
                limit = validated_params.get('limit', 10)
                days = validated_params.get('days', 7)
                
                # Additional validation
                if limit < 1 or limit > 50:
                    return jsonify({
                        'error': 'Invalid parameter',
                        'error_code': 'VALIDATION_ERROR',
                        'message': 'limit must be between 1 and 50',
                        'field': 'limit'
                    }), 400
                
                if days < 1 or days > 365:
                    return jsonify({
                        'error': 'Invalid parameter',
                        'error_code': 'VALIDATION_ERROR',
                        'message': 'days must be between 1 and 365',
                        'field': 'days'
                    }), 400
                
                # Add validated params to request
                request.validated_params = {
                    'limit': limit,
                    'days': days
                }
                
                return f(*args, **kwargs)
                
            except ValidationError as e:
                logger.warning(f"Validation error in dashboard recent: {e.message}")
                return jsonify({
                    'error': 'Validation failed',
                    'error_code': 'VALIDATION_ERROR',
                    'message': e.message,
                    'field': e.field
                }), 400
            except Exception as e:
                logger.error(f"Unexpected validation error in dashboard recent: {str(e)}")
                return jsonify({
                    'error': 'Validation failed',
                    'error_code': 'VALIDATION_ERROR',
                    'message': 'Invalid request parameters'
                }), 400
        
        return decorated_function
    return decorator

def validate_experiment_data():
    """Validate experiment data in request body."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                if not request.is_json:
                    return jsonify({
                        'error': 'Invalid content type',
                        'error_code': 'VALIDATION_ERROR',
                        'message': 'Request must contain JSON data'
                    }), 400
                
                json_data = request.get_json()
                if not json_data:
                    return jsonify({
                        'error': 'Missing data',
                        'error_code': 'VALIDATION_ERROR',
                        'message': 'Request body cannot be empty'
                    }), 400
                
                # Validate experiment data
                validated_experiment = validator.validate_experiment(json_data)
                
                # Add validated data to request
                request.validated_json = validated_experiment
                
                return f(*args, **kwargs)
                
            except ValidationError as e:
                logger.warning(f"Validation error in experiment data: {e.message}")
                return jsonify({
                    'error': 'Validation failed',
                    'error_code': 'VALIDATION_ERROR',
                    'message': e.message,
                    'field': e.field
                }), 400
            except Exception as e:
                logger.error(f"Unexpected validation error in experiment data: {str(e)}")
                return jsonify({
                    'error': 'Validation failed',
                    'error_code': 'VALIDATION_ERROR',
                    'message': 'Invalid experiment data'
                }), 400
        
        return decorated_function
    return decorator

def validate_user_id():
    """Validate user ID parameter."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                # Get user ID from various sources
                user_id = None
                
                # Check URL parameters
                if 'user_id' in request.view_args:
                    user_id = request.view_args['user_id']
                
                # Check query parameters
                elif 'user_id' in request.args:
                    user_id = request.args.get('user_id')
                
                # Check JSON body
                elif request.is_json:
                    json_data = request.get_json()
                    if json_data and 'user_id' in json_data:
                        user_id = json_data['user_id']
                
                # Check current user from auth
                elif hasattr(request, 'current_user') and request.current_user:
                    user_id = request.current_user.get('id')
                
                if user_id:
                    validated_user_id = validator.validate_uuid(user_id, 'user_id')
                    request.validated_user_id = validated_user_id
                
                return f(*args, **kwargs)
                
            except ValidationError as e:
                logger.warning(f"User ID validation error: {e.message}")
                return jsonify({
                    'error': 'Invalid user ID',
                    'error_code': 'VALIDATION_ERROR',
                    'message': e.message,
                    'field': 'user_id'
                }), 400
            except Exception as e:
                logger.error(f"Unexpected error in user ID validation: {str(e)}")
                return jsonify({
                    'error': 'Validation failed',
                    'error_code': 'VALIDATION_ERROR',
                    'message': 'Invalid user identification'
                }), 400
        
        return decorated_function
    return decorator

# Create middleware instance
validation_middleware = ValidationMiddleware()