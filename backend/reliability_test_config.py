"""
Configuration for API reliability tests.
Defines test parameters, benchmarks, and environment settings.
"""

import os
from typing import Dict, Any


class ReliabilityTestConfig:
    """Configuration class for reliability tests."""
    
    # Test environment settings
    TEST_TIMEOUT = int(os.getenv('RELIABILITY_TEST_TIMEOUT', '300'))  # 5 minutes default
    PARALLEL_WORKERS = int(os.getenv('RELIABILITY_PARALLEL_WORKERS', '10'))
    
    # Database failure test settings
    DATABASE_FAILURE_TESTS = {
        'max_retries': 3,
        'retry_delay': 1.0,
        'circuit_breaker_threshold': 5,
        'circuit_breaker_timeout': 60,
        'cache_fallback_enabled': True
    }
    
    # Load test settings
    LOAD_TESTS = {
        'concurrent_requests': {
            'light': 10,
            'medium': 20,
            'heavy': 50
        },
        'sustained_load_duration': 30,  # seconds
        'burst_size': 50,
        'requests_per_second': 20,
        'memory_limit_mb': 500
    }
    
    # Chaos engineering settings
    CHAOS_TESTS = {
        'failure_rate': 0.3,           # 30% failure rate
        'slow_response_rate': 0.2,     # 20% slow responses
        'corruption_rate': 0.1,        # 10% data corruption
        'intermittent_failures': True,
        'max_consecutive_failures': 5,
        'chaos_duration': 60           # seconds
    }
    
    # Performance benchmark settings
    PERFORMANCE_BENCHMARKS = {
        'summary_endpoint': {
            'p50_ms': 1000,    # 1 second
            'p95_ms': 2500,    # 2.5 seconds
            'p99_ms': 5000,    # 5 seconds
            'max_ms': 10000    # 10 seconds
        },
        'charts_endpoint': {
            'p50_ms': 1500,
            'p95_ms': 3000,
            'p99_ms': 6000,
            'max_ms': 12000
        },
        'recent_endpoint': {
            'p50_ms': 800,
            'p95_ms': 2000,
            'p99_ms': 4000,
            'max_ms': 8000
        },
        'throughput': {
            'min_rps': 10,
            'target_rps': 50,
            'max_rps': 100
        },
        'memory': {
            'max_growth_mb': 50,
            'max_total_mb': 500
        }
    }
    
    # Test data settings
    TEST_DATA = {
        'small_dataset_size': 10,
        'medium_dataset_size': 50,
        'large_dataset_size': 200,
        'performance_dataset_size': 500,
        'results_per_experiment': 100,
        'data_points_per_result': 100
    }
    
    # Reporting settings
    REPORTING = {
        'output_file': 'reliability_test_results.json',
        'detailed_logging': True,
        'performance_charts': False,  # Requires matplotlib
        'export_metrics': True
    }
    
    @classmethod
    def get_config(cls) -> Dict[str, Any]:
        """Get complete configuration as dictionary."""
        return {
            'test_timeout': cls.TEST_TIMEOUT,
            'parallel_workers': cls.PARALLEL_WORKERS,
            'database_failure_tests': cls.DATABASE_FAILURE_TESTS,
            'load_tests': cls.LOAD_TESTS,
            'chaos_tests': cls.CHAOS_TESTS,
            'performance_benchmarks': cls.PERFORMANCE_BENCHMARKS,
            'test_data': cls.TEST_DATA,
            'reporting': cls.REPORTING
        }
    
    @classmethod
    def validate_environment(cls) -> bool:
        """Validate test environment is properly configured."""
        required_env_vars = [
            'SUPABASE_URL',
            'SUPABASE_ANON_KEY'
        ]
        
        missing_vars = []
        for var in required_env_vars:
            if not os.getenv(var):
                missing_vars.append(var)
        
        if missing_vars:
            print(f"Missing required environment variables: {missing_vars}")
            return False
        
        return True
    
    @classmethod
    def get_test_markers(cls) -> Dict[str, str]:
        """Get pytest markers for different test categories."""
        return {
            'integration': 'integration: Database failure integration tests',
            'load': 'load: Concurrent load and stress tests',
            'chaos': 'chaos: Chaos engineering and resilience tests',
            'performance': 'performance: Performance regression and benchmark tests',
            'smoke': 'smoke: Quick smoke tests for critical functionality',
            'slow': 'slow: Tests that take longer than 30 seconds'
        }


# Global configuration instance
config = ReliabilityTestConfig()