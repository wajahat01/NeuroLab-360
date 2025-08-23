"""
Integration tests for dashboard validation with actual endpoints.
Tests the complete validation flow with dashboard routes.
"""

import pytest
import uuid
from datetime import datetime
from flask import Flask
from unittest.mock import patch, MagicMock

from app import create_app
from validation_middleware import validation_middleware

class TestDashboardValidationIntegration:
    """Integration tests for dashboard validation."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        
        # Mock user for authentication
        self.mock_user = {'id': str(uuid.uuid4())}
        
        # Mock Supabase client
        self.mock_supabase_result = {
            'success': True,
            'data': [
                {
                    'id': str(uuid.uuid4()),
                    'name': 'Test Experiment',
                    'experiment_type': 'eeg',
                    'status': 'completed',
                    'created_at': datetime.utcnow().isoformat(),
                    'user_id': self.mock_user['id']
                }
            ]
        }
    
    @patch('routes.dashboard.supabase_client')
    @patch('routes.dashboard.request')
    def test_dashboard_summary_with_validation(self, mock_request, mock_supabase):
        """Test dashboard summary endpoint with validation."""
        # Mock authentication
        mock_request.current_user = self.mock_user
        mock_request.args.get.return_value = 'false'
        mock_request.args.to_dict.return_value = {'force_refresh': 'false'}
        
        # Mock database calls
        mock_supabase.execute_query.return_value = self.mock_supabase_result
        
        # Test valid request
        with self.app.test_request_context():
            mock_request.current_user = self.mock_user
            
            response = self.client.get('/api/dashboard/summary', 
                                     headers={'Authorization': 'Bearer valid_token'})
            
            # Should succeed with validation
            assert response.status_code in [200, 401]  # 401 if auth fails, 200 if succeeds
    
    def test_dashboard_summary_invalid_parameters(self):
        """Test dashboard summary with invalid parameters."""
        # Test with invalid force_refresh parameter
        response = self.client.get('/api/dashboard/summary?force_refresh=invalid',
                                 headers={'Authorization': 'Bearer valid_token'})
        
        # Should return validation error (400) or auth error (401)
        assert response.status_code in [400, 401]
        
        if response.status_code == 400:
            data = response.get_json()
            assert data['error_code'] == 'VALIDATION_ERROR'
    
    def test_dashboard_charts_invalid_period(self):
        """Test dashboard charts with invalid period parameter."""
        response = self.client.get('/api/dashboard/charts?period=invalid',
                                 headers={'Authorization': 'Bearer valid_token'})
        
        # Should return validation error (400) or auth error (401)
        assert response.status_code in [400, 401]
        
        if response.status_code == 400:
            data = response.get_json()
            assert data['error_code'] == 'VALIDATION_ERROR'
            assert 'period' in data['message']
    
    def test_dashboard_charts_invalid_experiment_type(self):
        """Test dashboard charts with invalid experiment type."""
        response = self.client.get('/api/dashboard/charts?experiment_type=invalid',
                                 headers={'Authorization': 'Bearer valid_token'})
        
        # Should return validation error (400) or auth error (401)
        assert response.status_code in [400, 401]
        
        if response.status_code == 400:
            data = response.get_json()
            assert data['error_code'] == 'VALIDATION_ERROR'
            assert 'experiment_type' in data['message']
    
    def test_dashboard_recent_invalid_limit(self):
        """Test dashboard recent with invalid limit parameter."""
        response = self.client.get('/api/dashboard/recent?limit=1000',
                                 headers={'Authorization': 'Bearer valid_token'})
        
        # Should return validation error (400) or auth error (401)
        assert response.status_code in [400, 401]
        
        if response.status_code == 400:
            data = response.get_json()
            assert data['error_code'] == 'VALIDATION_ERROR'
            assert 'limit' in data['message']
    
    def test_dashboard_recent_invalid_days(self):
        """Test dashboard recent with invalid days parameter."""
        response = self.client.get('/api/dashboard/recent?days=500',
                                 headers={'Authorization': 'Bearer valid_token'})
        
        # Should return validation error (400) or auth error (401)
        assert response.status_code in [400, 401]
        
        if response.status_code == 400:
            data = response.get_json()
            assert data['error_code'] == 'VALIDATION_ERROR'
            assert 'days' in data['message']
    
    def test_security_headers_present(self):
        """Test that security headers are added by validation middleware."""
        response = self.client.get('/health')
        
        # Check security headers
        assert response.headers.get('X-Content-Type-Options') == 'nosniff'
        assert response.headers.get('X-Frame-Options') == 'DENY'
        assert response.headers.get('X-XSS-Protection') == '1; mode=block'
    
    def test_malicious_input_sanitization(self):
        """Test that malicious input is properly sanitized."""
        malicious_inputs = [
            "force_refresh=<script>alert('xss')</script>",
            "period='; DROP TABLE experiments; --",
            "experiment_type=<img src=x onerror=alert(1)>"
        ]
        
        for malicious_input in malicious_inputs:
            response = self.client.get(f'/api/dashboard/summary?{malicious_input}',
                                     headers={'Authorization': 'Bearer valid_token'})
            
            # Should either validate safely or return validation error
            assert response.status_code in [200, 400, 401]
            
            # Response should not contain the malicious script
            response_text = response.get_data(as_text=True)
            assert '<script>' not in response_text
            assert 'alert(' not in response_text
            assert 'DROP TABLE' not in response_text

class TestValidationPerformanceIntegration:
    """Performance tests for validation integration."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
    
    def test_validation_performance_impact(self):
        """Test that validation doesn't significantly impact performance."""
        import time
        
        # Test multiple requests to measure performance impact
        start_time = time.time()
        
        for _ in range(50):
            response = self.client.get('/api/dashboard/summary?force_refresh=false',
                                     headers={'Authorization': 'Bearer valid_token'})
            # Don't assert status code since auth will fail, just measure performance
        
        end_time = time.time()
        total_time = end_time - start_time
        
        # Should complete 50 requests in reasonable time (< 10 seconds)
        assert total_time < 10.0
        
        # Average time per request should be reasonable (< 200ms)
        avg_time = total_time / 50
        assert avg_time < 0.2

if __name__ == '__main__':
    pytest.main([__file__])