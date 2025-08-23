"""
Tests for validation middleware functionality.
Tests request validation, parameter sanitization, and error handling.
"""

import pytest
import json
import uuid
from datetime import datetime
from flask import Flask, request, jsonify
from unittest.mock import patch, MagicMock

from validation_middleware import (
    ValidationMiddleware, validate_dashboard_summary, validate_dashboard_charts,
    validate_dashboard_recent, validate_experiment_data, validate_user_id
)
from data_validator import ValidationError

class TestValidationMiddleware:
    """Test cases for ValidationMiddleware class."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.middleware = ValidationMiddleware(self.app)
        self.client = self.app.test_client()
        
        # Add test routes
        @self.app.route('/api/test', methods=['GET', 'POST'])
        def test_route():
            return jsonify({'message': 'success'})
        
        @self.app.route('/health', methods=['GET'])
        def health():
            return jsonify({'status': 'ok'})
    
    def test_middleware_initialization(self):
        """Test middleware initialization."""
        app = Flask(__name__)
        middleware = ValidationMiddleware()
        middleware.init_app(app)
        
        # Should have before_request and after_request handlers
        assert len(app.before_request_funcs[None]) > 0
        assert len(app.after_request_funcs[None]) > 0
    
    def test_security_headers_added(self):
        """Test that security headers are added to responses."""
        response = self.client.get('/health')
        
        assert response.headers.get('X-Content-Type-Options') == 'nosniff'
        assert response.headers.get('X-Frame-Options') == 'DENY'
        assert response.headers.get('X-XSS-Protection') == '1; mode=block'
    
    def test_skip_validation_for_health_endpoints(self):
        """Test that validation is skipped for health check endpoints."""
        response = self.client.get('/health')
        assert response.status_code == 200
    
    def test_query_parameter_sanitization(self):
        """Test query parameter sanitization."""
        with self.app.test_request_context('/api/test?param=<script>alert("xss")</script>'):
            # Trigger before_request
            self.middleware.before_request()
            
            # Check if sanitized args are available
            from flask import g
            assert hasattr(g, 'sanitized_args')
            # Script tags are completely removed, so result should be empty
            assert g.sanitized_args['param'] == ''
            assert '<script>' not in g.sanitized_args['param']
    
    def test_json_body_sanitization(self):
        """Test JSON body sanitization."""
        test_data = {
            'name': '<script>alert("xss")</script>Test',
            'description': 'SQL injection; DROP TABLE;--'
        }
        
        with self.app.test_request_context('/api/test', 
                                         method='POST',
                                         json=test_data,
                                         content_type='application/json'):
            # Trigger before_request
            self.middleware.before_request()
            
            # Check if sanitized JSON is available
            from flask import g
            assert hasattr(g, 'sanitized_json')
            # Script tags are completely removed, only 'Test' remains
            assert g.sanitized_json['name'] == 'Test'
            assert '<script>' not in g.sanitized_json['name']
            assert '\\;' in g.sanitized_json['description']

class TestDashboardValidationDecorators:
    """Test cases for dashboard validation decorators."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        
        # Mock current_user for auth
        self.mock_user = {'id': str(uuid.uuid4())}
        
        # Add test routes with validation
        @self.app.route('/api/dashboard/summary', methods=['GET'])
        @validate_dashboard_summary()
        def test_summary():
            return jsonify({'validated_params': getattr(request, 'validated_params', {})})
        
        @self.app.route('/api/dashboard/charts', methods=['GET'])
        @validate_dashboard_charts()
        def test_charts():
            return jsonify({'validated_params': getattr(request, 'validated_params', {})})
        
        @self.app.route('/api/dashboard/recent', methods=['GET'])
        @validate_dashboard_recent()
        def test_recent():
            return jsonify({'validated_params': getattr(request, 'validated_params', {})})
        
        @self.app.route('/api/experiments', methods=['POST'])
        @validate_experiment_data()
        def test_experiment():
            return jsonify({'validated_json': getattr(request, 'validated_json', {})})
        
        @self.app.route('/api/user/<user_id>', methods=['GET'])
        @validate_user_id()
        def test_user_id(user_id):
            return jsonify({'validated_user_id': getattr(request, 'validated_user_id', None)})
    
    def test_dashboard_summary_validation_valid(self):
        """Test dashboard summary validation with valid parameters."""
        response = self.client.get('/api/dashboard/summary?force_refresh=true')
        assert response.status_code == 200
        
        data = response.get_json()
        assert data['validated_params']['force_refresh'] is True
        
        # Test default value
        response = self.client.get('/api/dashboard/summary')
        assert response.status_code == 200
        data = response.get_json()
        assert data['validated_params']['force_refresh'] is False
    
    def test_dashboard_summary_validation_invalid(self):
        """Test dashboard summary validation with invalid parameters."""
        response = self.client.get('/api/dashboard/summary?force_refresh=invalid')
        assert response.status_code == 400
        
        data = response.get_json()
        assert data['error_code'] == 'VALIDATION_ERROR'
        assert 'force_refresh' in data['message']
    
    def test_dashboard_charts_validation_valid(self):
        """Test dashboard charts validation with valid parameters."""
        response = self.client.get('/api/dashboard/charts?period=30d&experiment_type=eeg')
        assert response.status_code == 200
        
        data = response.get_json()
        assert data['validated_params']['period'] == '30d'
        assert data['validated_params']['experiment_type'] == 'eeg'
    
    def test_dashboard_charts_validation_invalid_period(self):
        """Test dashboard charts validation with invalid period."""
        response = self.client.get('/api/dashboard/charts?period=invalid')
        assert response.status_code == 400
        
        data = response.get_json()
        assert data['error_code'] == 'VALIDATION_ERROR'
        assert 'period' in data['message']
    
    def test_dashboard_charts_validation_invalid_experiment_type(self):
        """Test dashboard charts validation with invalid experiment type."""
        response = self.client.get('/api/dashboard/charts?experiment_type=invalid')
        assert response.status_code == 400
        
        data = response.get_json()
        assert data['error_code'] == 'VALIDATION_ERROR'
        assert 'experiment_type' in data['message']
    
    def test_dashboard_recent_validation_valid(self):
        """Test dashboard recent validation with valid parameters."""
        response = self.client.get('/api/dashboard/recent?limit=20&days=14')
        assert response.status_code == 200
        
        data = response.get_json()
        assert data['validated_params']['limit'] == 20
        assert data['validated_params']['days'] == 14
    
    def test_dashboard_recent_validation_invalid_limit(self):
        """Test dashboard recent validation with invalid limit."""
        response = self.client.get('/api/dashboard/recent?limit=100')
        assert response.status_code == 400
        
        data = response.get_json()
        assert data['error_code'] == 'VALIDATION_ERROR'
        assert 'limit' in data['message']
    
    def test_dashboard_recent_validation_invalid_days(self):
        """Test dashboard recent validation with invalid days."""
        response = self.client.get('/api/dashboard/recent?days=500')
        assert response.status_code == 400
        
        data = response.get_json()
        assert data['error_code'] == 'VALIDATION_ERROR'
        assert 'days' in data['message']
    
    def test_experiment_data_validation_valid(self):
        """Test experiment data validation with valid data."""
        valid_experiment = {
            'id': str(uuid.uuid4()),
            'name': 'Test Experiment',
            'experiment_type': 'eeg',
            'status': 'active',
            'created_at': datetime.utcnow().isoformat(),
            'user_id': str(uuid.uuid4()),
            'description': 'A test experiment',
            'parameters': {'param1': 'value1'}
        }
        
        response = self.client.post('/api/experiments',
                                  json=valid_experiment,
                                  content_type='application/json')
        assert response.status_code == 200
        
        data = response.get_json()
        assert 'validated_json' in data
        assert data['validated_json']['name'] == 'Test Experiment'
    
    def test_experiment_data_validation_missing_content_type(self):
        """Test experiment data validation without JSON content type."""
        response = self.client.post('/api/experiments', data='not json')
        assert response.status_code == 400
        
        data = response.get_json()
        assert data['error_code'] == 'VALIDATION_ERROR'
        assert 'json' in data['message'].lower()
    
    def test_experiment_data_validation_empty_body(self):
        """Test experiment data validation with empty body."""
        response = self.client.post('/api/experiments',
                                  json=None,
                                  content_type='application/json')
        assert response.status_code == 400
        
        data = response.get_json()
        assert data['error_code'] == 'VALIDATION_ERROR'
        # The error message may vary, just check it's a validation error
        assert 'experiment' in data['message'].lower() or 'data' in data['message'].lower()
    
    def test_experiment_data_validation_invalid_data(self):
        """Test experiment data validation with invalid data."""
        invalid_experiment = {
            'name': 'Test',
            # Missing required fields
        }
        
        response = self.client.post('/api/experiments',
                                  json=invalid_experiment,
                                  content_type='application/json')
        assert response.status_code == 400
        
        data = response.get_json()
        assert data['error_code'] == 'VALIDATION_ERROR'
    
    def test_user_id_validation_valid(self):
        """Test user ID validation with valid UUID."""
        valid_uuid = str(uuid.uuid4())
        response = self.client.get(f'/api/user/{valid_uuid}')
        assert response.status_code == 200
        
        data = response.get_json()
        assert data['validated_user_id'] == valid_uuid.lower()
    
    def test_user_id_validation_invalid(self):
        """Test user ID validation with invalid UUID."""
        response = self.client.get('/api/user/invalid-uuid')
        assert response.status_code == 400
        
        data = response.get_json()
        assert data['error_code'] == 'VALIDATION_ERROR'
        assert 'user_id' in data['field']

class TestValidationErrorHandling:
    """Test cases for validation error handling."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        
        # Add test route that raises validation error
        @self.app.route('/api/test-error', methods=['GET'])
        @validate_dashboard_summary()
        def test_error():
            raise ValidationError("Test validation error", "test_field", "test_value")
    
    def test_validation_error_response_format(self):
        """Test validation error response format."""
        response = self.client.get('/api/test-error?force_refresh=invalid')
        assert response.status_code == 400
        
        data = response.get_json()
        assert 'error' in data
        assert 'error_code' in data
        assert 'message' in data
        assert data['error_code'] == 'VALIDATION_ERROR'
    
    def test_unexpected_error_handling(self):
        """Test handling of unexpected errors in validation."""
        # Add the route to the test app
        @self.app.route('/api/dashboard/charts', methods=['GET'])
        @validate_dashboard_charts()
        def test_charts():
            return jsonify({'status': 'ok'})
        
        with patch('validation_middleware.validator.validate_dashboard_query_params') as mock_validate:
            mock_validate.side_effect = Exception("Unexpected error")
            
            response = self.client.get('/api/dashboard/charts')
            assert response.status_code == 400
            
            data = response.get_json()
            assert data['error_code'] == 'VALIDATION_ERROR'

class TestValidationIntegration:
    """Integration tests for validation with dashboard endpoints."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        
        # Mock authentication
        @self.app.before_request
        def mock_auth():
            if request.path.startswith('/api/'):
                request.current_user = {'id': str(uuid.uuid4())}
        
        # Add dashboard routes with full validation
        @self.app.route('/api/dashboard/summary', methods=['GET'])
        @validate_user_id()
        @validate_dashboard_summary()
        def dashboard_summary():
            validated_params = getattr(request, 'validated_params', {})
            validated_user_id = getattr(request, 'validated_user_id', None)
            
            return jsonify({
                'user_id': validated_user_id,
                'force_refresh': validated_params.get('force_refresh', False),
                'message': 'Dashboard summary data'
            })
    
    def test_full_validation_chain(self):
        """Test complete validation chain for dashboard endpoints."""
        response = self.client.get('/api/dashboard/summary?force_refresh=true')
        assert response.status_code == 200
        
        data = response.get_json()
        assert 'user_id' in data
        assert data['force_refresh'] is True
        assert data['message'] == 'Dashboard summary data'
    
    def test_validation_with_malicious_input(self):
        """Test validation with malicious input patterns."""
        malicious_params = [
            "force_refresh=<script>alert('xss')</script>",
            "force_refresh='; DROP TABLE users; --",
            "force_refresh=1' OR '1'='1"
        ]
        
        for param in malicious_params:
            response = self.client.get(f'/api/dashboard/summary?{param}')
            # Should either validate safely or return validation error
            assert response.status_code in [200, 400]
            
            if response.status_code == 400:
                data = response.get_json()
                assert data['error_code'] == 'VALIDATION_ERROR'

class TestValidationPerformance:
    """Test cases for validation performance."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.app = Flask(__name__)
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        
        @self.app.route('/api/test', methods=['GET'])
        @validate_dashboard_charts()
        def test_route():
            return jsonify({'status': 'ok'})
    
    def test_validation_performance(self):
        """Test validation performance with multiple requests."""
        import time
        
        start_time = time.time()
        
        # Make multiple requests
        for _ in range(100):
            response = self.client.get('/api/test?period=30d&experiment_type=eeg')
            assert response.status_code == 200
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Should complete 100 requests in reasonable time (< 5 seconds)
        assert total_time < 5.0
        
        # Average time per request should be reasonable (< 50ms)
        avg_time = total_time / 100
        assert avg_time < 0.05

if __name__ == '__main__':
    pytest.main([__file__])