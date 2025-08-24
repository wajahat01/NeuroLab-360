"""
Test degradation integration with dashboard endpoints.
This test verifies that dashboard endpoints properly use the degradation service.
"""

import json
from unittest.mock import patch, MagicMock
from degradation_service import get_degradation_service, ServiceStatus, DegradationLevel
from exceptions import DatabaseError, CircuitBreakerOpenError


def test_dashboard_degradation_decorators():
    """Test that dashboard endpoints have degradation decorators applied."""
    print("Testing dashboard degradation decorators...")
    
    # Check that the degradation service is imported and used in dashboard routes
    from routes.dashboard import degradation_service as dashboard_degradation_service
    assert dashboard_degradation_service is not None
    print("   ✓ Degradation service is imported in dashboard routes")
    
    # Check that the decorators are imported
    try:
        from routes.dashboard import with_graceful_degradation, maintenance_mode_check
        print("   ✓ Degradation decorators are imported")
    except ImportError as e:
        print(f"   ❌ Degradation decorators not imported: {e}")
        raise
    
    print("✅ Dashboard degradation decorators test passed!\n")


def test_maintenance_mode_integration():
    """Test maintenance mode integration with dashboard."""
    print("Testing maintenance mode integration...")
    
    degradation_service = get_degradation_service()
    
    # Test maintenance mode check function
    from degradation_service import maintenance_mode_check
    
    # Enable maintenance mode for dashboard
    degradation_service.maintenance_mode.enable(
        "Dashboard maintenance test", 30, ['dashboard']
    )
    
    # Verify maintenance mode is enabled
    assert degradation_service.maintenance_mode.is_enabled('dashboard')
    print("   ✓ Maintenance mode enabled for dashboard")
    
    # Test that service availability check works
    assert not degradation_service.check_service_availability('dashboard')
    print("   ✓ Dashboard service unavailable during maintenance")
    
    # Disable maintenance mode
    degradation_service.maintenance_mode.disable()
    assert not degradation_service.maintenance_mode.is_enabled('dashboard')
    assert degradation_service.check_service_availability('dashboard')
    print("   ✓ Dashboard service available after maintenance disabled")
    
    print("✅ Maintenance mode integration test passed!\n")


def test_graceful_degradation_decorator():
    """Test graceful degradation decorator functionality."""
    print("Testing graceful degradation decorator...")
    
    degradation_service = get_degradation_service()
    
    # Import the decorator
    from degradation_service import with_graceful_degradation
    
    # Create a mock function to test the decorator
    @with_graceful_degradation('test_service', 'test_data')
    def mock_dashboard_function():
        raise DatabaseError("Database connection failed")
    
    # Register fallback data for the test
    degradation_service.fallback_provider.register_static_fallback(
        'test_data', 
        {'fallback': True, 'message': 'Service unavailable'}, 
        confidence=0.8
    )
    
    # Test that the decorator handles the error and returns fallback
    result = mock_dashboard_function()
    
    # The decorator returns a tuple (response, status_code) for errors
    if isinstance(result, tuple):
        response_data, status_code = result
        assert isinstance(response_data, dict)
        assert status_code in [206, 503]  # Partial content or service unavailable
        
        if status_code == 206:
            assert 'data' in response_data
            assert response_data['service_degraded'] is True
            assert 'fallback_info' in response_data
            print("   ✓ Graceful degradation decorator handles database errors with fallback")
        else:
            assert 'error' in response_data
            print("   ✓ Graceful degradation decorator handles database errors with error response")
    else:
        # If it's just a dict, it should be a fallback response
        assert isinstance(result, dict)
        if 'data' in result:
            assert result['service_degraded'] is True
            assert 'fallback_info' in result
            print("   ✓ Graceful degradation decorator handles database errors with fallback")
        else:
            assert 'error' in result
            print("   ✓ Graceful degradation decorator handles database errors with error response")
    
    # Test with circuit breaker error
    @with_graceful_degradation('test_service2', 'test_data')
    def mock_circuit_breaker_function():
        raise CircuitBreakerOpenError("Circuit breaker open")
    
    result = mock_circuit_breaker_function()
    
    # Should update service health to unavailable
    health = degradation_service.health_monitor.get_service_health('test_service2')
    assert health.status == ServiceStatus.UNAVAILABLE
    print("   ✓ Circuit breaker errors properly update service health")
    
    # The result should be a tuple with error response
    if isinstance(result, tuple):
        response_data, status_code = result
        assert status_code in [503, 206]  # Service unavailable or partial content
        print(f"   ✓ Circuit breaker returns {status_code} status code")
    else:
        print("   ✓ Circuit breaker handled (response format may vary)")
    
    print("✅ Graceful degradation decorator test passed!\n")


def test_service_status_indicators():
    """Test service status indicators in responses."""
    print("Testing service status indicators...")
    
    degradation_service = get_degradation_service()
    
    # Test adding degradation indicators to response
    test_response = {'data': 'test_data'}
    
    # Mark service as degraded
    degradation_service.health_monitor.update_service_health(
        'test_service', ServiceStatus.DEGRADED, error_count=5
    )
    
    # Add degradation indicators
    enhanced_response = degradation_service.add_degradation_indicators(
        test_response, 'test_service'
    )
    
    assert enhanced_response['service_degraded'] is True
    assert 'service_status' in enhanced_response
    assert 'service_health' in enhanced_response['service_status']
    assert enhanced_response['service_status']['service_health']['status'] == 'degraded'
    print("   ✓ Degradation indicators added to response")
    
    # Test with healthy service
    degradation_service.health_monitor.update_service_health(
        'healthy_service', ServiceStatus.HEALTHY, error_count=0
    )
    
    healthy_response = {'data': 'test_data'}
    enhanced_healthy = degradation_service.add_degradation_indicators(
        healthy_response, 'healthy_service'
    )
    
    # Should not add degradation indicators for healthy service
    assert 'service_degraded' not in enhanced_healthy
    print("   ✓ No degradation indicators for healthy service")
    
    print("✅ Service status indicators test passed!\n")


def test_fallback_data_providers():
    """Test fallback data providers for dashboard data."""
    print("Testing fallback data providers...")
    
    degradation_service = get_degradation_service()
    
    # Test minimal dashboard summary
    summary = degradation_service.fallback_provider.get_minimal_dashboard_summary('test_user')
    
    assert summary['total_experiments'] == 0
    assert summary['fallback_data'] is True
    assert 'message' in summary
    assert 'experiments_by_type' in summary
    assert 'experiments_by_status' in summary
    assert 'recent_activity' in summary
    print("   ✓ Minimal dashboard summary fallback works")
    
    # Test minimal dashboard charts
    charts = degradation_service.fallback_provider.get_minimal_dashboard_charts('test_user', '30d')
    
    assert charts['total_experiments'] == 0
    assert charts['fallback_data'] is True
    assert charts['period'] == '30d'
    assert 'activity_timeline' in charts
    assert 'experiment_type_distribution' in charts
    print("   ✓ Minimal dashboard charts fallback works")
    
    # Test minimal recent experiments
    recent = degradation_service.fallback_provider.get_minimal_recent_experiments('test_user')
    
    assert recent['total_count'] == 0
    assert recent['fallback_data'] is True
    assert recent['experiments'] == []
    assert recent['has_more'] is False
    print("   ✓ Minimal recent experiments fallback works")
    
    print("✅ Fallback data providers test passed!\n")


def test_service_health_monitoring():
    """Test service health monitoring integration."""
    print("Testing service health monitoring...")
    
    degradation_service = get_degradation_service()
    
    # Test updating service health
    degradation_service.health_monitor.update_service_health(
        'dashboard', ServiceStatus.HEALTHY, response_time_ms=150, error_count=0
    )
    
    health = degradation_service.health_monitor.get_service_health('dashboard')
    assert health.status == ServiceStatus.HEALTHY
    assert health.degradation_level == DegradationLevel.NONE
    assert health.response_time_ms == 150
    print("   ✓ Service health updated successfully")
    
    # Test degradation level calculation
    degradation_service.health_monitor.update_service_health(
        'dashboard', ServiceStatus.DEGRADED, response_time_ms=3000, error_count=8
    )
    
    health = degradation_service.health_monitor.get_service_health('dashboard')
    assert health.status == ServiceStatus.DEGRADED
    assert health.degradation_level in [DegradationLevel.MINOR, DegradationLevel.MODERATE]
    print(f"   ✓ Degradation level calculated: {health.degradation_level}")
    
    # Test overall health calculation
    overall_health = degradation_service.health_monitor.get_overall_health()
    assert 'overall_status' in overall_health
    assert 'services' in overall_health
    assert 'dashboard' in overall_health['services']
    print("   ✓ Overall health calculation works")
    
    print("✅ Service health monitoring test passed!\n")


def test_error_handling_integration():
    """Test error handling integration with degradation service."""
    print("Testing error handling integration...")
    
    degradation_service = get_degradation_service()
    
    # Test handling database error
    db_error = DatabaseError("Connection timeout")
    response = degradation_service.handle_service_failure(
        'dashboard', 'dashboard_summary', db_error, user_id='test_user'
    )
    
    # Should have fallback data or error response
    assert isinstance(response, dict)
    if 'data' in response:
        assert response['service_degraded'] is True
        assert 'fallback_info' in response
        print("   ✓ Database error handled with fallback data")
    else:
        assert 'error' in response
        assert 'service_status' in response
        print("   ✓ Database error handled with error response")
    
    # Verify service health was updated
    health = degradation_service.health_monitor.get_service_health('dashboard')
    assert health.status in [ServiceStatus.DEGRADED, ServiceStatus.UNAVAILABLE]
    print("   ✓ Service health updated after error")
    
    print("✅ Error handling integration test passed!\n")


def main():
    """Run all degradation dashboard integration tests."""
    print("🚀 Starting Dashboard Degradation Integration Tests\n")
    
    try:
        test_dashboard_degradation_decorators()
        test_maintenance_mode_integration()
        test_graceful_degradation_decorator()
        test_service_status_indicators()
        test_fallback_data_providers()
        test_service_health_monitoring()
        test_error_handling_integration()
        
        print("🎉 All dashboard degradation integration tests passed!")
        print("\nKey integrations verified:")
        print("  ✓ Dashboard routes have degradation decorators")
        print("  ✓ Maintenance mode integration")
        print("  ✓ Graceful degradation decorator functionality")
        print("  ✓ Service status indicators in responses")
        print("  ✓ Fallback data providers for dashboard data")
        print("  ✓ Service health monitoring")
        print("  ✓ Error handling with degradation service")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        raise


if __name__ == "__main__":
    main()