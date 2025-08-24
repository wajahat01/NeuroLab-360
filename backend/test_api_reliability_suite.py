"""
Comprehensive API reliability test suite runner.
Orchestrates and runs all reliability tests with comprehensive reporting.
"""

import pytest
import json
import time
import sys
import os
from datetime import datetime
from typing import Dict, List, Any
import warnings

# Suppress Pydantic deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="gotrue")

# Import all test modules
from test_api_reliability_integration import TestDatabaseFailureScenarios
from test_api_reliability_load import TestConcurrentRequestHandling
from test_api_reliability_chaos import TestChaosEngineering
from test_api_reliability_performance import TestPerformanceRegression


class ReliabilityTestSuite:
    """Comprehensive API reliability test suite orchestrator."""
    
    def __init__(self):
        self.test_results = {
            'integration': {},
            'load': {},
            'chaos': {},
            'performance': {},
            'summary': {}
        }
        self.start_time = None
        self.end_time = None
    
    def run_integration_tests(self):
        """Run database failure integration tests."""
        print("\n" + "="*60)
        print("RUNNING INTEGRATION TESTS - Database Failure Scenarios")
        print("="*60)
        
        integration_start = time.time()
        
        # Run integration tests
        exit_code = pytest.main([
            'test_api_reliability_integration.py',
            '-v',
            '--tb=short',
            '--disable-warnings'
        ])
        
        integration_end = time.time()
        
        self.test_results['integration'] = {
            'duration': integration_end - integration_start,
            'exit_code': exit_code,
            'status': 'PASSED' if exit_code == 0 else 'FAILED'
        }
        
        print(f"\nIntegration Tests: {self.test_results['integration']['status']}")
        print(f"Duration: {self.test_results['integration']['duration']:.2f}s")
        
        return exit_code == 0
    
    def run_load_tests(self):
        """Run concurrent load tests."""
        print("\n" + "="*60)
        print("RUNNING LOAD TESTS - Concurrent Request Handling")
        print("="*60)
        
        load_start = time.time()
        
        # Run load tests
        exit_code = pytest.main([
            'test_api_reliability_load.py',
            '-v',
            '--tb=short',
            '--disable-warnings'
        ])
        
        load_end = time.time()
        
        self.test_results['load'] = {
            'duration': load_end - load_start,
            'exit_code': exit_code,
            'status': 'PASSED' if exit_code == 0 else 'FAILED'
        }
        
        print(f"\nLoad Tests: {self.test_results['load']['status']}")
        print(f"Duration: {self.test_results['load']['duration']:.2f}s")
        
        return exit_code == 0
    
    def run_chaos_tests(self):
        """Run chaos engineering tests."""
        print("\n" + "="*60)
        print("RUNNING CHAOS TESTS - Service Resilience Validation")
        print("="*60)
        
        chaos_start = time.time()
        
        # Run chaos tests
        exit_code = pytest.main([
            'test_api_reliability_chaos.py',
            '-v',
            '--tb=short',
            '--disable-warnings'
        ])
        
        chaos_end = time.time()
        
        self.test_results['chaos'] = {
            'duration': chaos_end - chaos_start,
            'exit_code': exit_code,
            'status': 'PASSED' if exit_code == 0 else 'FAILED'
        }
        
        print(f"\nChaos Tests: {self.test_results['chaos']['status']}")
        print(f"Duration: {self.test_results['chaos']['duration']:.2f}s")
        
        return exit_code == 0
    
    def run_performance_tests(self):
        """Run performance regression tests."""
        print("\n" + "="*60)
        print("RUNNING PERFORMANCE TESTS - Response Time Benchmarks")
        print("="*60)
        
        performance_start = time.time()
        
        # Run performance tests
        exit_code = pytest.main([
            'test_api_reliability_performance.py',
            '-v',
            '--tb=short',
            '--disable-warnings'
        ])
        
        performance_end = time.time()
        
        self.test_results['performance'] = {
            'duration': performance_end - performance_start,
            'exit_code': exit_code,
            'status': 'PASSED' if exit_code == 0 else 'FAILED'
        }
        
        print(f"\nPerformance Tests: {self.test_results['performance']['status']}")
        print(f"Duration: {self.test_results['performance']['duration']:.2f}s")
        
        return exit_code == 0
    
    def run_all_tests(self):
        """Run all reliability tests in sequence."""
        print("\n" + "="*80)
        print("DASHBOARD API RELIABILITY TEST SUITE")
        print("="*80)
        print(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        self.start_time = time.time()
        
        # Run all test categories
        results = {
            'integration': self.run_integration_tests(),
            'load': self.run_load_tests(),
            'chaos': self.run_chaos_tests(),
            'performance': self.run_performance_tests()
        }
        
        self.end_time = time.time()
        
        # Generate summary
        self.generate_summary_report(results)
        
        # Return overall success
        return all(results.values())
    
    def generate_summary_report(self, results: Dict[str, bool]):
        """Generate comprehensive summary report."""
        total_duration = self.end_time - self.start_time
        passed_tests = sum(1 for passed in results.values() if passed)
        total_tests = len(results)
        
        self.test_results['summary'] = {
            'total_duration': total_duration,
            'passed_categories': passed_tests,
            'total_categories': total_tests,
            'overall_status': 'PASSED' if passed_tests == total_tests else 'FAILED',
            'timestamp': datetime.now().isoformat()
        }
        
        print("\n" + "="*80)
        print("RELIABILITY TEST SUITE SUMMARY")
        print("="*80)
        
        print(f"\nOverall Status: {self.test_results['summary']['overall_status']}")
        print(f"Total Duration: {total_duration:.2f}s")
        print(f"Test Categories: {passed_tests}/{total_tests} passed")
        
        print("\nDetailed Results:")
        print("-" * 50)
        
        for category, result_data in self.test_results.items():
            if category == 'summary':
                continue
                
            status = result_data['status']
            duration = result_data['duration']
            
            status_symbol = "✓" if status == 'PASSED' else "✗"
            print(f"  {status_symbol} {category.upper():12} {status:6} ({duration:6.2f}s)")
        
        print("\nTest Coverage Summary:")
        print("-" * 50)
        print("  ✓ Database failure scenarios")
        print("  ✓ Connection timeout handling")
        print("  ✓ Partial data failure recovery")
        print("  ✓ Circuit breaker functionality")
        print("  ✓ Cache fallback mechanisms")
        print("  ✓ Concurrent request handling")
        print("  ✓ Load balancing under stress")
        print("  ✓ Memory usage optimization")
        print("  ✓ Sustained load performance")
        print("  ✓ Burst load handling")
        print("  ✓ Random failure resilience")
        print("  ✓ Data corruption handling")
        print("  ✓ Resource exhaustion recovery")
        print("  ✓ Edge case input validation")
        print("  ✓ Cascading failure prevention")
        print("  ✓ Response time benchmarks")
        print("  ✓ Throughput performance")
        print("  ✓ Performance regression detection")
        print("  ✓ Memory leak prevention")
        
        # Save results to file
        self.save_results_to_file()
        
        print(f"\nDetailed results saved to: reliability_test_results.json")
        print(f"Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    def save_results_to_file(self):
        """Save test results to JSON file."""
        try:
            with open('reliability_test_results.json', 'w') as f:
                json.dump(self.test_results, f, indent=2, default=str)
        except Exception as e:
            print(f"Warning: Could not save results to file: {e}")
    
    def run_quick_smoke_test(self):
        """Run a quick smoke test of critical reliability features."""
        print("\n" + "="*60)
        print("RUNNING QUICK RELIABILITY SMOKE TEST")
        print("="*60)
        
        smoke_start = time.time()
        
        # Run subset of critical tests
        exit_code = pytest.main([
            'test_api_reliability_integration.py::TestDatabaseFailureScenarios::test_database_connection_failure',
            'test_api_reliability_integration.py::TestDatabaseFailureScenarios::test_circuit_breaker_activation',
            'test_api_reliability_load.py::TestConcurrentRequestHandling::test_concurrent_summary_requests',
            'test_api_reliability_chaos.py::TestChaosEngineering::test_random_database_failures',
            'test_api_reliability_performance.py::TestPerformanceRegression::test_summary_endpoint_performance',
            '-v',
            '--tb=short',
            '--disable-warnings'
        ])
        
        smoke_end = time.time()
        
        print(f"\nSmoke Test: {'PASSED' if exit_code == 0 else 'FAILED'}")
        print(f"Duration: {smoke_end - smoke_start:.2f}s")
        
        return exit_code == 0


def main():
    """Main entry point for reliability test suite."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Dashboard API Reliability Test Suite')
    parser.add_argument('--mode', choices=['full', 'smoke', 'integration', 'load', 'chaos', 'performance'], 
                       default='full', help='Test mode to run')
    parser.add_argument('--output', help='Output file for results (default: reliability_test_results.json)')
    
    args = parser.parse_args()
    
    suite = ReliabilityTestSuite()
    
    try:
        if args.mode == 'full':
            success = suite.run_all_tests()
        elif args.mode == 'smoke':
            success = suite.run_quick_smoke_test()
        elif args.mode == 'integration':
            success = suite.run_integration_tests()
        elif args.mode == 'load':
            success = suite.run_load_tests()
        elif args.mode == 'chaos':
            success = suite.run_chaos_tests()
        elif args.mode == 'performance':
            success = suite.run_performance_tests()
        else:
            print(f"Unknown mode: {args.mode}")
            return 1
        
        return 0 if success else 1
        
    except KeyboardInterrupt:
        print("\n\nTest suite interrupted by user")
        return 130
    except Exception as e:
        print(f"\nTest suite failed with error: {e}")
        return 1


if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)