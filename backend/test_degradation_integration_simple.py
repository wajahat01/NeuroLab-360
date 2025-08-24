"""
Simple integration test to verify degradation mechanisms work end-to-end.
This test demonstrates the key degradation features without complex mocking.
"""

import time
from degradation_service import get_degradation_service, ServiceStatus, DegradationLevel
from exceptions import DatabaseError, CircuitBreakerOpenError


def test_basic_degradation_flow():
    """Test basic degradation flow from healthy to degraded to recovery."""
    print("Testing basic degradation flow...")
    
    degradation_service = get_degradation_service()
    service_name = "test_service"
    
    # 1. Start with healthy service
    print("1. Setting service to healthy...")
    degradation_service.health_monitor.update_service_health(
        service_name, ServiceStatus.HEALTHY, error_count=0, response_time_ms=100
    )
    
    health = degradation_service.health_monitor.get_service_health(service_name)
    assert health.status == ServiceStatus.HEALTHY
    assert health.degradation_level == DegradationLevel.NONE
    assert degradation_service.check_service_availability(service_name)
    print("   ✓ Service is healthy and available")
    
    # 2. Degrade service
    print("2. Degrading service...")
    degradation_service.health_monitor.update_service_health(
        service_name, ServiceStatus.DEGRADED, error_count=10, response_time_ms=3000
    )
    
    health = degradation_service.health_monitor.get_service_health(service_name)
    assert health.status == ServiceStatus.DEGRADED
    print(f"   Degradation level: {health.degradation_level}")
    # The degradation level depends on error count and response time thresholds
    assert health.degradation_level in [DegradationLevel.MINOR, DegradationLevel.MODERATE]
    assert degradation_service.check_service_availability(service_name)  # Still available but degraded
    print("   ✓ Service is degraded but still available")
    
    # 3. Make service unavailable
    print("3. Making service unavailable...")
    degradation_service.health_monitor.update_service_health(
        service_name, ServiceStatus.UNAVAILABLE, error_count=50
    )
    
    health = degradation_service.health_monitor.get_service_health(service_name)
    assert health.status == ServiceStatus.UNAVAILABLE
    assert health.degradation_level == DegradationLevel.CRITICAL
    assert not degradation_service.check_service_availability(service_name)
    print("   ✓ Service is unavailable")
    
    # 4. Recover service
    print("4. Recovering service...")
    degradation_service.health_monitor.update_service_health(
        service_name, ServiceStatus.HEALTHY, error_count=0, response_time_ms=150
    )
    
    health = degradation_service.health_monitor.get_service_health(service_name)
    assert health.status == ServiceStatus.HEALTHY
    assert health.degradation_level == DegradationLevel.NONE
    assert degradation_service.check_service_availability(service_name)
    print("   ✓ Service recovered to healthy state")
    
    print("✅ Basic degradation flow test passed!\n")


def test_maintenance_mode():
    """Test maintenance mode functionality."""
    print("Testing maintenance mode...")
    
    degradation_service = get_degradation_service()
    service_name = "maintenance_test_service"
    
    # 1. Service should be available initially
    assert degradation_service.check_service_availability(service_name)
    print("1. ✓ Service initially available")
    
    # 2. Enable maintenance mode
    print("2. Enabling maintenance mode...")
    degradation_service.maintenance_mode.enable(
        "Scheduled maintenance for testing", 
        duration_minutes=1,  # Short duration for testing
        affected_services=[service_name]
    )
    
    assert not degradation_service.check_service_availability(service_name)
    maintenance_info = degradation_service.maintenance_mode.get_info()
    assert maintenance_info['enabled'] is True
    assert service_name in maintenance_info['affected_services']
    print("   ✓ Service unavailable during maintenance")
    
    # 3. Disable maintenance mode
    print("3. Disabling maintenance mode...")
    degradation_service.maintenance_mode.disable()
    
    assert degradation_service.check_service_availability(service_name)
    maintenance_info = degradation_service.maintenance_mode.get_info()
    assert maintenance_info['enabled'] is False
    print("   ✓ Service available after maintenance")
    
    print("✅ Maintenance mode test passed!\n")


def test_fallback_data():
    """Test fallback data providers."""
    print("Testing fallback data providers...")
    
    degradation_service = get_degradation_service()
    
    # 1. Test static fallback
    print("1. Testing static fallback...")
    test_data = {"test": "static_fallback", "value": 42}
    degradation_service.fallback_provider.register_static_fallback(
        "test_data_type", test_data, confidence=0.8
    )
    
    fallback = degradation_service.fallback_provider.get_fallback_data("test_data_type")
    assert fallback is not None
    assert fallback.data == test_data
    assert fallback.confidence == 0.8
    assert fallback.source == "static_fallback"
    print("   ✓ Static fallback works")
    
    # 2. Test generator fallback
    print("2. Testing generator fallback...")
    def test_generator(**kwargs):
        return {"test": "generated_fallback", "user_id": kwargs.get("user_id", "unknown")}
    
    degradation_service.fallback_provider.register_fallback_generator(
        "generated_data_type", test_generator
    )
    
    fallback = degradation_service.fallback_provider.get_fallback_data(
        "generated_data_type", user_id="test_user"
    )
    assert fallback is not None
    assert fallback.data["test"] == "generated_fallback"
    assert fallback.data["user_id"] == "test_user"
    assert fallback.source == "generated_fallback"
    print("   ✓ Generator fallback works")
    
    # 3. Test minimal dashboard data
    print("3. Testing minimal dashboard data...")
    summary = degradation_service.fallback_provider.get_minimal_dashboard_summary("test_user")
    assert summary["total_experiments"] == 0
    assert summary["fallback_data"] is True
    assert "message" in summary
    print("   ✓ Minimal dashboard summary works")
    
    print("✅ Fallback data test passed!\n")


def test_service_failure_handling():
    """Test service failure handling with fallback."""
    print("Testing service failure handling...")
    
    degradation_service = get_degradation_service()
    service_name = "failure_test_service"
    
    # 1. Register fallback data
    print("1. Registering fallback data...")
    fallback_data = {"fallback": True, "message": "Service unavailable"}
    degradation_service.fallback_provider.register_static_fallback(
        "test_failure_data", fallback_data, confidence=0.7
    )
    
    # 2. Simulate database failure
    print("2. Simulating database failure...")
    error = DatabaseError("Connection timeout")
    response = degradation_service.handle_service_failure(
        service_name, "test_failure_data", error
    )
    
    assert "data" in response
    assert response["service_degraded"] is True
    assert "fallback_info" in response
    assert response["fallback_info"]["confidence"] == 0.7
    print("   ✓ Database failure handled with fallback")
    
    # 3. Simulate circuit breaker failure
    print("3. Simulating circuit breaker failure...")
    error = CircuitBreakerOpenError("Circuit breaker open")
    response = degradation_service.handle_service_failure(
        service_name, "test_failure_data", error
    )
    
    # Should update service health to unavailable
    health = degradation_service.health_monitor.get_service_health(service_name)
    assert health.status == ServiceStatus.UNAVAILABLE
    print("   ✓ Circuit breaker failure handled")
    
    print("✅ Service failure handling test passed!\n")


def test_overall_system_health():
    """Test overall system health calculation."""
    print("Testing overall system health...")
    
    degradation_service = get_degradation_service()
    
    # 1. Set up multiple services with different health states
    print("1. Setting up multiple services...")
    degradation_service.health_monitor.update_service_health(
        "service_healthy", ServiceStatus.HEALTHY, error_count=0
    )
    degradation_service.health_monitor.update_service_health(
        "service_degraded", ServiceStatus.DEGRADED, error_count=5
    )
    degradation_service.health_monitor.update_service_health(
        "service_unavailable", ServiceStatus.UNAVAILABLE, error_count=50
    )
    
    # 2. Check overall health
    print("2. Checking overall health...")
    overall_health = degradation_service.health_monitor.get_overall_health()
    
    assert overall_health["overall_status"] == ServiceStatus.UNAVAILABLE.value
    assert overall_health["degradation_level"] == DegradationLevel.CRITICAL.value
    # Don't check exact count since other tests may have added services
    assert len(overall_health["services"]) >= 3
    print("   ✓ Overall health correctly reflects worst service state")
    
    # 3. Recover the specific services we're testing
    print("3. Recovering test services...")
    for service in ["service_healthy", "service_degraded", "service_unavailable"]:
        degradation_service.health_monitor.update_service_health(
            service, ServiceStatus.HEALTHY, error_count=0
        )
    
    # Check that our specific services are healthy
    for service in ["service_healthy", "service_degraded", "service_unavailable"]:
        health = degradation_service.health_monitor.get_service_health(service)
        assert health.status == ServiceStatus.HEALTHY
        assert health.degradation_level == DegradationLevel.NONE
    
    print("   ✓ Test services recovered to healthy state")
    
    print("✅ Overall system health test passed!\n")


def main():
    """Run all degradation integration tests."""
    print("🚀 Starting Degradation Service Integration Tests\n")
    
    try:
        test_basic_degradation_flow()
        test_maintenance_mode()
        test_fallback_data()
        test_service_failure_handling()
        test_overall_system_health()
        
        print("🎉 All degradation integration tests passed!")
        print("\nKey features verified:")
        print("  ✓ Service health monitoring and degradation levels")
        print("  ✓ Maintenance mode with service-specific control")
        print("  ✓ Fallback data providers (static and generated)")
        print("  ✓ Service failure handling with graceful degradation")
        print("  ✓ Overall system health calculation")
        print("  ✓ Service recovery scenarios")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        raise


if __name__ == "__main__":
    main()