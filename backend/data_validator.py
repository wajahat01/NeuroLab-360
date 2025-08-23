"""
Data validation and sanitization module for NeuroLab 360.
Provides comprehensive validation for dashboard API endpoints and data types.
"""

import re
import uuid
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Union
from functools import wraps
from flask import request, jsonify
import logging

logger = logging.getLogger(__name__)

class ValidationError(Exception):
    """Custom exception for validation errors."""
    def __init__(self, message: str, field: str = None, value: Any = None):
        self.message = message
        self.field = field
        self.value = value
        super().__init__(self.message)

class DataValidator:
    """Comprehensive data validator for dashboard API endpoints."""
    
    # Valid experiment types
    VALID_EXPERIMENT_TYPES = [
        'eeg', 'fmri', 'behavioral', 'cognitive', 'neuropsychological',
        'eye_tracking', 'emg', 'ecg', 'sleep_study', 'reaction_time'
    ]
    
    # Valid experiment statuses
    VALID_STATUSES = [
        'draft', 'active', 'paused', 'completed', 'cancelled', 'archived'
    ]
    
    # Valid time periods for dashboard queries
    VALID_PERIODS = ['7d', '30d', '90d', 'all']
    
    # Maximum limits for various parameters
    MAX_LIMIT = 100
    MAX_DAYS_LOOKBACK = 365
    MAX_STRING_LENGTH = 1000
    MAX_DESCRIPTION_LENGTH = 5000
    
    def __init__(self):
        """Initialize the data validator."""
        self.uuid_pattern = re.compile(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
            re.IGNORECASE
        )
        self.email_pattern = re.compile(
            r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        )
    
    def validate_uuid(self, value: Any, field_name: str = "id") -> str:
        """Validate UUID format."""
        if not value:
            raise ValidationError(f"Missing required field: {field_name}", field_name, value)
        
        if not isinstance(value, str):
            raise ValidationError(f"Invalid {field_name} format: must be string", field_name, value)
        
        if not self.uuid_pattern.match(value):
            raise ValidationError(f"Invalid {field_name} format: must be valid UUID", field_name, value)
        
        return value.lower()
    
    def validate_string(self, value: Any, field_name: str, required: bool = True, 
                       max_length: int = None, min_length: int = 0) -> Optional[str]:
        """Validate and sanitize string fields."""
        if value is None or value == "" or (isinstance(value, (list, dict)) and len(value) == 0):
            if required:
                raise ValidationError(f"Missing required field: {field_name}", field_name, value)
            return None
        
        if not isinstance(value, str):
            raise ValidationError(f"Invalid {field_name} format: must be string", field_name, value)
        
        # Sanitize string - remove control characters and normalize whitespace
        sanitized = re.sub(r'[\x00-\x1f\x7f-\x9f]', '', str(value))
        sanitized = re.sub(r'\s+', ' ', sanitized).strip()
        
        if len(sanitized) < min_length:
            raise ValidationError(
                f"Invalid {field_name}: minimum length is {min_length} characters", 
                field_name, value
            )
        
        max_len = max_length or self.MAX_STRING_LENGTH
        if len(sanitized) > max_len:
            raise ValidationError(
                f"Invalid {field_name}: maximum length is {max_len} characters", 
                field_name, value
            )
        
        return sanitized
    
    def validate_integer(self, value: Any, field_name: str, required: bool = True,
                        min_value: int = None, max_value: int = None) -> Optional[int]:
        """Validate integer fields."""
        if value is None:
            if required:
                raise ValidationError(f"Missing required field: {field_name}", field_name, value)
            return None
        
        try:
            int_value = int(value)
        except (ValueError, TypeError):
            raise ValidationError(f"Invalid {field_name} format: must be integer", field_name, value)
        
        if min_value is not None and int_value < min_value:
            raise ValidationError(
                f"Invalid {field_name}: minimum value is {min_value}", 
                field_name, value
            )
        
        if max_value is not None and int_value > max_value:
            raise ValidationError(
                f"Invalid {field_name}: maximum value is {max_value}", 
                field_name, value
            )
        
        return int_value
    
    def validate_datetime(self, value: Any, field_name: str, required: bool = True) -> Optional[str]:
        """Validate and normalize datetime strings."""
        if value is None or value == "":
            if required:
                raise ValidationError(f"Missing required field: {field_name}", field_name, value)
            return None
        
        if not isinstance(value, str):
            raise ValidationError(f"Invalid {field_name} format: must be string", field_name, value)
        
        try:
            # Handle different datetime formats
            date_str = value.strip()
            if date_str.endswith('Z'):
                date_str = date_str.replace('Z', '+00:00')
            elif '+' not in date_str and 'T' in date_str:
                date_str = date_str + '+00:00'
            
            # Parse to validate
            parsed_date = datetime.fromisoformat(date_str)
            
            # Check if date is reasonable (not too far in past/future)
            # Make both dates timezone-aware for comparison
            from datetime import timezone
            now = datetime.now(timezone.utc)
            
            # Convert parsed_date to UTC if it's naive
            if parsed_date.tzinfo is None:
                parsed_date = parsed_date.replace(tzinfo=timezone.utc)
            
            min_date = now - timedelta(days=365 * 10)  # 10 years ago
            max_date = now + timedelta(days=365 * 2)   # 2 years in future
            
            if parsed_date < min_date or parsed_date > max_date:
                raise ValidationError(
                    f"Invalid {field_name}: date must be within reasonable range", 
                    field_name, value
                )
            
            return parsed_date.isoformat()
            
        except (ValueError, TypeError) as e:
            raise ValidationError(f"Invalid {field_name} format: {str(e)}", field_name, value)
    
    def validate_json(self, value: Any, field_name: str, required: bool = True) -> Optional[Dict[str, Any]]:
        """Validate JSON fields."""
        if value is None:
            if required:
                raise ValidationError(f"Missing required field: {field_name}", field_name, value)
            return {}
        
        if isinstance(value, dict):
            return value
        
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError as e:
                raise ValidationError(f"Invalid {field_name} format: {str(e)}", field_name, value)
        
        raise ValidationError(f"Invalid {field_name} format: must be JSON object", field_name, value)
    
    def validate_experiment_type(self, value: Any, field_name: str = "experiment_type") -> str:
        """Validate experiment type."""
        validated_value = self.validate_string(value, field_name, required=True)
        
        if validated_value.lower() not in self.VALID_EXPERIMENT_TYPES:
            raise ValidationError(
                f"Invalid {field_name}: must be one of {', '.join(self.VALID_EXPERIMENT_TYPES)}", 
                field_name, value
            )
        
        return validated_value.lower()
    
    def validate_status(self, value: Any, field_name: str = "status") -> str:
        """Validate experiment status."""
        validated_value = self.validate_string(value, field_name, required=True)
        
        if validated_value.lower() not in self.VALID_STATUSES:
            raise ValidationError(
                f"Invalid {field_name}: must be one of {', '.join(self.VALID_STATUSES)}", 
                field_name, value
            )
        
        return validated_value.lower()
    
    def validate_period(self, value: Any, field_name: str = "period") -> str:
        """Validate time period for dashboard queries."""
        if value is None:
            return '30d'  # Default period
        
        validated_value = self.validate_string(value, field_name, required=False)
        
        if validated_value and validated_value.lower() not in self.VALID_PERIODS:
            raise ValidationError(
                f"Invalid {field_name}: must be one of {', '.join(self.VALID_PERIODS)}", 
                field_name, value
            )
        
        return validated_value.lower() if validated_value else '30d'
    
    def validate_experiment(self, experiment_data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate complete experiment data structure."""
        if not isinstance(experiment_data, dict):
            raise ValidationError("Experiment data must be a JSON object")
        
        validated = {}
        
        # Required fields
        validated['id'] = self.validate_uuid(experiment_data.get('id'), 'id')
        validated['name'] = self.validate_string(
            experiment_data.get('name'), 'name', required=True, min_length=1, max_length=200
        )
        validated['experiment_type'] = self.validate_experiment_type(
            experiment_data.get('experiment_type')
        )
        validated['status'] = self.validate_status(experiment_data.get('status'))
        validated['created_at'] = self.validate_datetime(
            experiment_data.get('created_at'), 'created_at'
        )
        
        # Optional fields
        validated['user_id'] = self.validate_uuid(
            experiment_data.get('user_id'), 'user_id'
        ) if experiment_data.get('user_id') else None
        
        validated['description'] = self.validate_string(
            experiment_data.get('description'), 'description', 
            required=False, max_length=self.MAX_DESCRIPTION_LENGTH
        )
        
        validated['parameters'] = self.validate_json(
            experiment_data.get('parameters'), 'parameters', required=False
        )
        
        validated['updated_at'] = self.validate_datetime(
            experiment_data.get('updated_at'), 'updated_at', required=False
        )
        
        return validated
    
    def validate_dashboard_query_params(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Validate dashboard API query parameters."""
        validated = {}
        
        # Period validation
        validated['period'] = self.validate_period(args.get('period'))
        
        # Limit validation
        validated['limit'] = self.validate_integer(
            args.get('limit'), 'limit', required=False, 
            min_value=1, max_value=self.MAX_LIMIT
        ) or 10
        
        # Days validation
        validated['days'] = self.validate_integer(
            args.get('days'), 'days', required=False,
            min_value=1, max_value=self.MAX_DAYS_LOOKBACK
        ) or 7
        
        # Experiment type filter
        if args.get('experiment_type'):
            validated['experiment_type'] = self.validate_experiment_type(
                args.get('experiment_type')
            )
        
        # Force refresh flag
        validated['force_refresh'] = str(args.get('force_refresh', 'false')).lower() == 'true'
        
        return validated

# Global validator instance
validator = DataValidator()

def validate_request_params(validation_schema: Dict[str, Any]):
    """
    Decorator to validate request parameters using a schema.
    
    Args:
        validation_schema: Dictionary defining validation rules for parameters
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                # Validate query parameters
                if 'query_params' in validation_schema:
                    validated_params = {}
                    for param_name, rules in validation_schema['query_params'].items():
                        value = request.args.get(param_name)
                        
                        if rules.get('type') == 'string':
                            validated_params[param_name] = validator.validate_string(
                                value, param_name, 
                                required=rules.get('required', False),
                                max_length=rules.get('max_length'),
                                min_length=rules.get('min_length', 0)
                            )
                        elif rules.get('type') == 'integer':
                            validated_params[param_name] = validator.validate_integer(
                                value, param_name,
                                required=rules.get('required', False),
                                min_value=rules.get('min_value'),
                                max_value=rules.get('max_value')
                            )
                        elif rules.get('type') == 'period':
                            validated_params[param_name] = validator.validate_period(value, param_name)
                        elif rules.get('type') == 'experiment_type':
                            if value:  # Only validate if provided
                                validated_params[param_name] = validator.validate_experiment_type(value, param_name)
                    
                    # Add validated params to request context
                    request.validated_params = validated_params
                
                # Validate JSON body
                if 'json_body' in validation_schema and request.is_json:
                    json_data = request.get_json()
                    if json_data:
                        validated_json = {}
                        for field_name, rules in validation_schema['json_body'].items():
                            value = json_data.get(field_name)
                            
                            if rules.get('type') == 'string':
                                validated_json[field_name] = validator.validate_string(
                                    value, field_name,
                                    required=rules.get('required', False),
                                    max_length=rules.get('max_length'),
                                    min_length=rules.get('min_length', 0)
                                )
                            elif rules.get('type') == 'uuid':
                                validated_json[field_name] = validator.validate_uuid(value, field_name)
                            elif rules.get('type') == 'experiment':
                                validated_json[field_name] = validator.validate_experiment(value)
                        
                        # Add validated JSON to request context
                        request.validated_json = validated_json
                
                return f(*args, **kwargs)
                
            except ValidationError as e:
                logger.warning(f"Validation error in {f.__name__}: {e.message}")
                return jsonify({
                    'error': 'Validation failed',
                    'error_code': 'VALIDATION_ERROR',
                    'message': e.message,
                    'field': e.field,
                    'value': str(e.value) if e.value is not None else None
                }), 400
            except Exception as e:
                logger.error(f"Unexpected error in validation: {str(e)}")
                return jsonify({
                    'error': 'Internal validation error',
                    'error_code': 'INTERNAL_ERROR',
                    'message': 'An unexpected error occurred during validation'
                }), 500
        
        return decorated_function
    return decorator

def sanitize_input(data: Any) -> Any:
    """
    Recursively sanitize input data to prevent XSS and injection attacks.
    
    Args:
        data: Input data to sanitize
        
    Returns:
        Sanitized data
    """
    if isinstance(data, str):
        # Remove control characters but preserve spaces
        sanitized = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]', '', data)
        # Normalize multiple spaces but preserve single spaces
        sanitized = re.sub(r'[ \t]+', ' ', sanitized).strip()
        # Convert line breaks to spaces
        sanitized = re.sub(r'[\n\r]+', ' ', sanitized)
        
        # Remove potentially dangerous HTML/script content
        sanitized = re.sub(r'<script[^>]*>.*?</script>', '', sanitized, flags=re.IGNORECASE | re.DOTALL)
        sanitized = re.sub(r'<[^>]+>', '', sanitized)  # Remove HTML tags
        
        # Escape common injection patterns
        sanitized = sanitized.replace('--', '\\--')  # SQL comment
        sanitized = sanitized.replace(';', '\\;')    # SQL statement separator
        
        return sanitized
    
    elif isinstance(data, dict):
        return {key: sanitize_input(value) for key, value in data.items()}
    
    elif isinstance(data, list):
        return [sanitize_input(item) for item in data]
    
    else:
        return data