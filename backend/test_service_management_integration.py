"""
Integration tests for service management endpoints.
Tests the complete service management API functionality including authentication,
maintenance mode, health monitoring, and degradation scenarios.
"""

import json
import pytest
from unittest.mock import patch, MagicMock

from app import create_app
from degradation_service import get_degradation_service, ServiceStatus, DegradationLevel


class TestServiceManagementIntegration:
    """Integration tests for service management endpoints."""
    
    @pytest.fixture
    def app(self):
        """Create test app."""
        app = create_app()
        app.config['TESTING'] = True
        return app
    
    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return app.test_client()
    
    @pytest.fixture
    def admin_headers(self):
        """Admin authentication headers."""
        return {
            'X-Admin-API-Key': 'admin-key-placeholder',
            'Content-Type': 'application/json'
        }
    
    def test_get_service_status(self, client):
        """Test getting service status."""
        response = client.get('/api/service/status')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'timestamp' in data
        assert 'maintenance_mode' in data
        assert 'overall_health' in data
    
    def test_get_service_status_specific_service(self, client):
        """Test getting status for specific service."""
        response = client.get('/api/service/status?service=dashboard')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'timestamp' in data
        assert 'maintenance_mode' in data
        assert 'service_health' in data
    
    def test_get_service_health(self, client):
        """Test getting service health information."""
        response = client.get('/api/service/health')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'health' in data
        assert 'maintenance_mode' in data
        assert 'timestamp' in data
    
    def test_enable_maintenance_mode_without_auth(self, client):
        """Test enabling maintenance mode without admin auth."""
        response = client.post('/api/service/maintenance', 
                             json={'message': 'Test maintenance'})
        
        assert response.status_code == 401
        data = json.loads(response.data)
        assert 'error' in data
        assert 'Admin authentication required' in data['error']
    
    def test_enable_maintenance_mode_success(self, client, admin_headers):
        """Test successfully enabling maintenance mode."""
        maintenance_data = {
            'message': 'Scheduled maintenance',
            'duration_minutes': 30,
            'affected_services': ['dashboard', 'experiments']
        }
        
        response = client.post('/api/service/maintenance', 
                             json=maintenance_data, 
                             headers=admin_headers)
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'maintenance_info' in data
        assert data['maintenance_info']['enabled'] is True
        assert data['maintenance_info']['message'] == 'Scheduled maintenance'
    
    def test_disable_maintenance_mode(self, client, admin_headers):
        """Test disabling maintenance mode."""
        # First enable maintenance mode
        degradation_service = get_degradation_service()
        degradation_service.maintenance_mode.enable('Test maintenance', 60)
        
        response = client.delete('/api/service/maintenance', headers=admin_headers)
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'disabled' in data['message']
        
        # Verify maintenance mode is actually disabled
        assert not degradation_service.maintenance_mode.is_enabled()
    
    def test_update_service_health_success(self, client, admin_headers):
        """Test successfully updating service health."""
        health_data = {
            'status': 'degraded',
            'response_time_ms': 2500,
            'error_count': 5,
            'message': 'Service experiencing slow responses',
            'details': {'last_error': 'Database timeout'}
        }
        
        response = client.put('/api/service/health/dashboard', 
                            json=health_data, 
                            headers=admin_headers)
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'service_health' in data
    
    def test_get_service_metrics(self, client):
        """Test getting service metrics."""
        response = client.get('/api/service/metrics')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'metrics' in data
        assert 'overall_health' in data
        assert 'maintenance_mode' in data


if __name__ == '__main__':
    pytest.main([__file__, '-v'])