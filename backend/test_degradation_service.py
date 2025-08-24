"""
Tests for graceful degradation service functionality.
Tests degradation mechanisms, fallback data providers, maintenance mode, and recovery scenarios.
"""

import pytest
import time
import json
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock

from degradation_service import (
    DegradationService, ServiceStatus, DegradationLevel, MaintenanceMode,
    FallbackDataProvider, ServiceHealthMonitor, get_degradation_service
)
from exceptions import DatabaseError, NetworkError, CircuitBreakerOpenError


class TestMaintenanceMode:
    """Test maintenance mode functionality."""
    
    def setup_method(self):
        """Setup test fixtures."""
        self.maintenance_mode = MaintenanceMode()
    
    def test_enable_maintenance_mode(self):
        """Test enabling maintenance mode."""
        message = "System maintenance in progress"
        duration = 60
        affected_services = ["dashboard", "experiments"]
        
        self.maintenance_mode.enable(message, duration, affected_services)
        
        assert self.maintenance_mode.is_enabled()
        assert self.maintenance_mode.is_enabled("dashboard")
        assert self.maintenance_mode.is_enabled("experiments")
        assert not self.maintenance_mode.is_enabled("other_service")
        
        info = self.maintenance_mode.get_info()
        assert info['enabled'] is True
        assert info['message'] == message
        assert info['affected_services'] == affected_services
        assert info['remaining_minutes'] <= duration
    
    def test_disable_maintenance_mode(self):
        """Test disabling maintenance mode."""
        self.maintenance_mode.enable("Test maintenance", 60)
        assert self.maintenance_mode.is_enabled()
        
        self.maintenance_mode.disable()
        assert not self.maintenance_mode.is_enabled()
        
        info = self.maintenance_mode.get_info()
        assert info['enabled'] is False
    
    def test_maintenance_mode_expiration(self):
        """Test automatic expiration of maintenance mode."""
        # Enable maintenance mode for a very short duration
        self.maintenance_mode.enable("Test maintenance", duration_minutes=0.01)  # 0.6 seconds
        
        assert self.maintenance_mode.is_enabled()
        
        # Wait for expiration
        time.sleep(1)
        
        # Should be automatically disabled
        assert not self.maintenance_mode.is_enabled()
    
    def test_service_specific_maintenance(self):
        """Test service-specific maintenance mode."""
        affected_services = ["dashboard"]
        self.maintenance_mode.enable("Dashboard maintenance", 60, affected_services)
        
        assert self.maintenance_mode.is_enabled("dashboard")
        assert not self.maintenance_mode.is_enabled("experiments")
        assert not self.maintenance_mode.is_enabled("other_service")


class TestFallbackDataProvider:
    """Test fallback data provider functionality."""
    
    def setup_method(self):
        """Setup test fixtures."""
        self.fallback_provider = FallbackDataProvider()
    
    def test_register_static_fallback(self):
        """Test registering static fallback data."""
        test_data = {"test": "data"}
        confidence = 0.8
        
        self.fallback_provider.register_static_fallback("test_type", test_data, confidence)
        
        fallback = self.fallback_provider.get_fallback_data("test_type")
        assert fallback is not None
        assert fallback.data == test_data
        assert fallback.confidence == confidence
        assert fallback.source == "static_fallback"
        assert fallback.is_stale is True
    
    def test_register_fallback_generator(self):
        """Test registering fallback data generator."""
        def test_generator(**kwargs):
            return {"generated": True, "user_id": kwargs.get("user_id")}
        
        self.fallback_provider.register_fallback_generator("test_type", test_generator)
        
        fallback = self.fallback_provider.get_fallback_data("test_type", user_id="test_user")
        assert fallback is not None
        assert fallback.data["generated"] is True
        assert fallback.data["user_id"] == "test_user"
        assert fallback.source == "generated_fallback"
        assert fallback.is_stale is False
    
    def test_fallback_generator_failure(self):
        """Test fallback generator failure handling."""
        def failing_generator(**kwargs):
            raise Exception("Generator failed")
        
        self.fallback_provider.register_fallback_generator("test_type", failing_generator)
        
        # Should not raise exception, should return None
        fallback = self.fallback_provider.get_fallback_data("test_type")
        assert fallback is None
    
    def test_minimal_dashboard_summary(self):
        """Test minimal dashboard summary generation."""
        summary = self.fallback_provider.get_minimal_dashboard_summary("test_user")
        
        assert summary['total_experiments'] == 0
        assert summary['experiments_by_type'] == {}
        assert summary['experiments_by_status'] == {}
        assert summary['recent_activity']['last_7_days'] == 0
        assert summary['recent_activity']['completion_rate'] == 0
        assert summary['fallback_data'] is True
        assert 'message' in summary
    
    def test_minimal_dashboard_charts(self):
        """Test minimal dashboard charts generation."""
        charts = self.fallback_provider.get_minimal_dashboard_charts("test_user", "30d")
        
        assert charts['activity_timeline'] == []
        assert charts['experiment_type_distribution'] == []
        assert charts['performance_trends'] == []
        assert charts['metric_comparisons'] == []
        assert charts['period'] == "30d"
        assert charts['total_experiments'] == 0
        assert charts['fallback_data'] is True
        assert 'message' in charts
    
    def test_minimal_recent_experiments(self):
        """Test minimal recent experiments generation."""
        experiments = self.fallback_provider.get_minimal_recent_experiments("test_user")
        
        assert experiments['experiments'] == []
        assert experiments['total_count'] == 0
        assert experiments['has_more'] is False
        assert experiments['fallback_data'] is True
        assert 'message' in experiments
    
    @patch('degradation_service.get_cache_service')
    def test_stale_cache_fallback(self, mock_get_cache_service):
        """Test fallback to stale cache data."""
        mock_cache_service = Mock()
        mock_cache_service.get_stale.return_value = {"cached": "data"}
        mock_get_cache_service.return_value = mock_cache_service
        
        # Create new provider to use mocked cache service
        provider = FallbackDataProvider()
        
        fallback = provider.get_fallback_data("test_type", cache_key="test_key")
        
        assert fallback is not None
        assert fallback.data == {"cached": "data"}
        assert fallback.source == "stale_cache"
        assert fallback.is_stale is True
        assert fallback.confidence == 0.7


class TestServiceHealthMonitor:
    """Test service health monitoring functionality."""
    
    def setup_method(self):
        """Setup test fixtures."""
        self.health_monitor = ServiceHealthMonitor()
    
    def test_update_service_health(self):
        """Test updating service health."""
        service_name = "test_service"
        status = ServiceStatus.HEALTHY
        response_time = 100.0
        error_count = 0
        message = "Service is healthy"
        
        self.health_monitor.update_service_health(
            service_name, status, response_time, error_count, message
        )
        
        health = self.health_monitor.get_service_health(service_name)
        assert health is not None
        assert health.service_name == service_name
        assert health.status == status
        assert health.degradation_level == DegradationLevel.NONE
        assert health.response_time_ms == response_time
        assert health.error_count == error_count
        assert health.message == message
    
    def test_degradation_level_calculation(self):
        """Test degradation level calculation based on metrics."""
        service_name = "test_service"
        
        # Test error count thresholds
        self.health_monitor.update_service_health(
            service_name, ServiceStatus.DEGRADED, error_count=25
        )
        health = self.health_monitor.get_service_health(service_name)
        assert health.degradation_level == DegradationLevel.SEVERE
        
        # Test response time thresholds
        self.health_monitor.update_service_health(
            service_name, ServiceStatus.DEGRADED, response_time_ms=15000
        )
        health = self.health_monitor.get_service_health(service_name)
        assert health.degradation_level == DegradationLevel.SEVERE
        
        # Test unavailable status
        self.health_monitor.update_service_health(
            service_name, ServiceStatus.UNAVAILABLE
        )
        health = self.health_monitor.get_service_health(service_name)
        assert health.degradation_level == DegradationLevel.CRITICAL
    
    def test_overall_health_calculation(self):
        """Test overall system health calculation."""
        # Add multiple services with different health states
        self.health_monitor.update_service_health(
            "service1", ServiceStatus.HEALTHY, error_count=0
        )
        self.health_monitor.update_service_health(
            "service2", ServiceStatus.DEGRADED, error_count=5
        )
        self.health_monitor.update_service_health(
            "service3", ServiceStatus.UNAVAILABLE, error_count=50
        )
        
        overall_health = self.health_monitor.get_overall_health()
        
        # Overall status should be the worst individual status
        assert overall_health['overall_status'] == ServiceStatus.UNAVAILABLE.value
        assert overall_health['degradation_level'] == DegradationLevel.CRITICAL.value
        assert len(overall_health['services']) == 3
    
    def test_is_service_degraded(self):
        """Test service degradation detection."""
        service_name = "test_service"
        
        # Healthy service should not be degraded
        self.health_monitor.update_service_health(
            service_name, ServiceStatus.HEALTHY, error_count=0
        )
        assert not self.health_monitor.is_service_degraded(service_name)
        
        # Degraded service should be detected
        self.health_monitor.update_service_health(
            service_name, ServiceStatus.DEGRADED, error_count=10
        )
        assert self.health_monitor.is_service_degraded(service_name)
        
        # Unavailable service should be detected
        self.health_monitor.update_service_health(
            service_name, ServiceStatus.UNAVAILABLE
        )
        assert self.health_monitor.is_service_degraded(service_name)


class TestDegradationService:
    """Test main degradation service functionality."""
    
    def setup_method(self):
        """Setup test fixtures."""
        self.degradation_service = DegradationService()
    
    def test_check_service_availability(self):
        """Test service availability checking."""
        service_name = "test_service"
        
        # Service should be available by default
        assert self.degradation_service.check_service_availability(service_name)
        
        # Service should be unavailable during maintenance
        self.degradation_service.maintenance_mode.enable("Test maintenance", 60, [service_name])
        assert not self.degradation_service.check_service_availability(service_name)
        
        # Service should be unavailable when health status is unavailable
        self.degradation_service.maintenance_mode.disable()
        self.degradation_service.health_monitor.update_service_health(
            service_name, ServiceStatus.UNAVAILABLE
        )
        assert not self.degradation_service.check_service_availability(service_name)
    
    def test_get_service_status_info(self):
        """Test service status information retrieval."""
        service_name = "test_service"
        
        # Update service health
        self.degradation_service.health_monitor.update_service_health(
            service_name, ServiceStatus.DEGRADED, error_count=5, message="Test degradation"
        )
        
        status_info = self.degradation_service.get_service_status_info(service_name)
        
        assert 'timestamp' in status_info
        assert 'maintenance_mode' in status_info
        assert 'service_health' in status_info
        assert status_info['service_health']['service_name'] == service_name
        assert status_info['service_health']['status'] == ServiceStatus.DEGRADED.value
    
    def test_handle_service_failure(self):
        """Test service failure handling with fallback."""
        service_name = "test_service"
        data_type = "test_data"
        error = DatabaseError("Database connection failed")
        
        # Register a fallback for the data type
        self.degradation_service.fallback_provider.register_static_fallback(
            data_type, {"fallback": True}, confidence=0.8
        )
        
        response = self.degradation_service.handle_service_failure(
            service_name, data_type, error
        )
        
        assert 'data' in response
        assert response['data']['fallback'] is True
        assert response['service_degraded'] is True
        assert 'fallback_info' in response
        assert response['fallback_info']['source'] == "static_fallback"
        assert response['fallback_info']['confidence'] == 0.8
        assert 'service_status' in response
    
    def test_handle_service_failure_no_fallback(self):
        """Test service failure handling without fallback data."""
        service_name = "test_service"
        data_type = "unknown_data_type"
        error = NetworkError("Network timeout")
        
        response = self.degradation_service.handle_service_failure(
            service_name, data_type, error
        )
        
        assert 'error' in response
        assert response['error'] == 'Service temporarily unavailable'
        assert 'service_status' in response
        assert 'retry_after' in response
    
    def test_add_degradation_indicators(self):
        """Test adding degradation indicators to responses."""
        service_name = "test_service"
        response_data = {"data": "test"}
        
        # Service is healthy - no indicators should be added
        result = self.degradation_service.add_degradation_indicators(response_data, service_name)
        assert 'service_degraded' not in result
        
        # Make service degraded
        self.degradation_service.health_monitor.update_service_health(
            service_name, ServiceStatus.DEGRADED, error_count=5
        )
        
        result = self.degradation_service.add_degradation_indicators(response_data, service_name)
        assert result['service_degraded'] is True
        assert 'service_status' in result
    
    def test_graceful_degradation_decorator_maintenance(self):
        """Test graceful degradation decorator during maintenance."""
        service_name = "test_service"
        data_type = "test_data"
        
        # Enable maintenance mode
        self.degradation_service.maintenance_mode.enable(
            "Test maintenance", 60, [service_name]
        )
        
        @self.degradation_service.graceful_degradation_decorator(service_name, data_type)
        def test_function():
            return {"success": True}
        
        result = test_function()
        
        assert isinstance(result, tuple)
        response, status_code = result
        assert status_code == 503
        assert response['error'] == 'Service under maintenance'
        assert 'maintenance_mode' in response
    
    def test_graceful_degradation_decorator_success(self):
        """Test graceful degradation decorator with successful execution."""
        service_name = "test_service"
        data_type = "test_data"
        
        @self.degradation_service.graceful_degradation_decorator(service_name, data_type)
        def test_function():
            return {"success": True}
        
        result = test_function()
        
        # Should return original result with degradation indicators
        assert isinstance(result, dict)
        assert result['success'] is True
    
    def test_graceful_degradation_decorator_failure_with_fallback(self):
        """Test graceful degradation decorator with failure and fallback."""
        service_name = "test_service"
        data_type = "test_data"
        
        # Register fallback data
        self.degradation_service.fallback_provider.register_static_fallback(
            data_type, {"fallback": True}
        )
        
        @self.degradation_service.graceful_degradation_decorator(service_name, data_type)
        def test_function():
            raise DatabaseError("Database failed")
        
        result = test_function()
        
        assert isinstance(result, tuple)
        response, status_code = result
        assert status_code == 206  # Partial content
        assert 'data' in response
        assert response['data']['fallback'] is True
        assert response['service_degraded'] is True
    
    def test_graceful_degradation_decorator_failure_no_fallback(self):
        """Test graceful degradation decorator with failure and no fallback."""
        service_name = "test_service"
        data_type = "unknown_data_type"
        
        @self.degradation_service.graceful_degradation_decorator(service_name, data_type)
        def test_function():
            raise NetworkError("Network failed")
        
        result = test_function()
        
        assert isinstance(result, tuple)
        response, status_code = result
        assert status_code == 503
        assert 'error' in response
        assert response['error'] == 'Service temporarily unavailable'


class TestDegradationIntegration:
    """Integration tests for degradation scenarios."""
    
    def setup_method(self):
        """Setup test fixtures."""
        self.degradation_service = DegradationService()
    
    def test_database_failure_scenario(self):
        """Test complete database failure scenario."""
        service_name = "dashboard"
        
        # Simulate database failure
        error = DatabaseError("Connection timeout")
        
        # Register fallback data
        self.degradation_service.fallback_provider.register_static_fallback(
            "dashboard_summary", 
            {"total_experiments": 0, "fallback": True},
            confidence=0.6
        )
        
        # Handle the failure
        response = self.degradation_service.handle_service_failure(
            service_name, "dashboard_summary", error
        )
        
        # Verify response structure
        assert 'data' in response
        assert response['data']['total_experiments'] == 0
        assert response['data']['fallback_data'] is True
        assert response['service_degraded'] is True
        assert 'fallback_info' in response
        assert 'service_status' in response
        
        # Verify service health was updated
        health = self.degradation_service.health_monitor.get_service_health(service_name)
        assert health.status == ServiceStatus.DEGRADED
        assert health.error_count == 1
    
    def test_circuit_breaker_scenario(self):
        """Test circuit breaker failure scenario."""
        service_name = "dashboard"
        error = CircuitBreakerOpenError("Circuit breaker open")
        
        response = self.degradation_service.handle_service_failure(
            service_name, "dashboard_summary", error
        )
        
        # Verify service was marked as unavailable
        health = self.degradation_service.health_monitor.get_service_health(service_name)
        assert health.status == ServiceStatus.UNAVAILABLE
        
        # Verify appropriate error response
        if 'error' in response:
            assert 'temporarily unavailable' in response['error']
    
    def test_maintenance_mode_scenario(self):
        """Test maintenance mode scenario."""
        service_name = "dashboard"
        
        # Enable maintenance mode
        self.degradation_service.maintenance_mode.enable(
            "Scheduled maintenance", 30, [service_name]
        )
        
        # Check service availability
        assert not self.degradation_service.check_service_availability(service_name)
        
        # Get status info
        status_info = self.degradation_service.get_service_status_info(service_name)
        assert status_info['maintenance_mode']['enabled'] is True
        assert status_info['maintenance_mode']['message'] == "Scheduled maintenance"
        
        # Disable maintenance mode
        self.degradation_service.maintenance_mode.disable()
        assert self.degradation_service.check_service_availability(service_name)
    
    def test_recovery_scenario(self):
        """Test service recovery scenario."""
        service_name = "dashboard"
        
        # Start with degraded service
        self.degradation_service.health_monitor.update_service_health(
            service_name, ServiceStatus.DEGRADED, error_count=10
        )
        
        assert self.degradation_service.health_monitor.is_service_degraded(service_name)
        
        # Simulate recovery
        self.degradation_service.health_monitor.update_service_health(
            service_name, ServiceStatus.HEALTHY, error_count=0, response_time_ms=100
        )
        
        assert not self.degradation_service.health_monitor.is_service_degraded(service_name)
        
        health = self.degradation_service.health_monitor.get_service_health(service_name)
        assert health.status == ServiceStatus.HEALTHY
        assert health.degradation_level == DegradationLevel.NONE
    
    def test_partial_service_degradation(self):
        """Test scenario where only some services are degraded."""
        # Set up multiple services with different health states
        self.degradation_service.health_monitor.update_service_health(
            "dashboard", ServiceStatus.HEALTHY, error_count=0
        )
        self.degradation_service.health_monitor.update_service_health(
            "experiments", ServiceStatus.DEGRADED, error_count=5
        )
        self.degradation_service.health_monitor.update_service_health(
            "analytics", ServiceStatus.UNAVAILABLE, error_count=50
        )
        
        # Check individual service availability
        assert self.degradation_service.check_service_availability("dashboard")
        assert self.degradation_service.check_service_availability("experiments")  # Degraded but available
        assert not self.degradation_service.check_service_availability("analytics")
        
        # Check overall health
        overall_health = self.degradation_service.health_monitor.get_overall_health()
        assert overall_health['overall_status'] == ServiceStatus.UNAVAILABLE.value
        assert len(overall_health['services']) == 3


if __name__ == '__main__':
    pytest.main([__file__, '-v'])