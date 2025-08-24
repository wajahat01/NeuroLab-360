#!/usr/bin/env python3
"""
Simple test runner for API reliability tests.
Handles environment setup and runs tests with proper configuration.
"""

import os
import sys
import subprocess
from pathlib import Path

def setup_test_environment():
    """Setup test environment variables."""
    test_env = os.environ.copy()
    
    # Set required environment variables for testing
    test_env.update({
        'SUPABASE_URL': 'https://test.supabase.co',
        'SUPABASE_ANON_KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        'FLASK_ENV': 'testing',
        'TESTING': 'true'
    })
    
    return test_env

def run_single_test():
    """Run a single test to verify setup."""
    env = setup_test_environment()
    
    cmd = [
        sys.executable, '-m', 'pytest',
        'test_api_reliability_integration.py::TestDatabaseFailureScenarios::test_database_connection_failure',
        '-v', '--tb=short', '--disable-warnings'
    ]
    
    print("Running single reliability test...")
    print(f"Command: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=60)
        
        print(f"Exit code: {result.returncode}")
        print(f"STDOUT:\n{result.stdout}")
        if result.stderr:
            print(f"STDERR:\n{result.stderr}")
        
        return result.returncode == 0
        
    except subprocess.TimeoutExpired:
        print("Test timed out after 60 seconds")
        return False
    except Exception as e:
        print(f"Error running test: {e}")
        return False

def run_smoke_tests():
    """Run smoke tests for all reliability categories."""
    env = setup_test_environment()
    
    smoke_tests = [
        'test_api_reliability_integration.py::TestDatabaseFailureScenarios::test_database_connection_failure',
        'test_api_reliability_load.py::TestConcurrentRequestHandling::test_concurrent_summary_requests',
        'test_api_reliability_chaos.py::TestChaosEngineering::test_random_database_failures',
        'test_api_reliability_performance.py::TestPerformanceRegression::test_summary_endpoint_performance'
    ]
    
    results = []
    
    for test in smoke_tests:
        print(f"\nRunning smoke test: {test}")
        
        cmd = [
            sys.executable, '-m', 'pytest',
            test,
            '-v', '--tb=short', '--disable-warnings'
        ]
        
        try:
            result = subprocess.run(cmd, env=env, capture_output=True, text=True, timeout=120)
            success = result.returncode == 0
            results.append((test, success))
            
            print(f"Result: {'PASSED' if success else 'FAILED'}")
            if not success:
                print(f"STDOUT:\n{result.stdout}")
                if result.stderr:
                    print(f"STDERR:\n{result.stderr}")
                    
        except subprocess.TimeoutExpired:
            print("Test timed out")
            results.append((test, False))
        except Exception as e:
            print(f"Error: {e}")
            results.append((test, False))
    
    # Summary
    passed = sum(1 for _, success in results if success)
    total = len(results)
    
    print(f"\n{'='*60}")
    print(f"SMOKE TEST SUMMARY: {passed}/{total} passed")
    print(f"{'='*60}")
    
    for test, success in results:
        status = "✓ PASSED" if success else "✗ FAILED"
        test_name = test.split("::")[-1]
        print(f"  {status} {test_name}")
    
    return passed == total

def main():
    """Main entry point."""
    if len(sys.argv) > 1 and sys.argv[1] == 'smoke':
        success = run_smoke_tests()
    else:
        success = run_single_test()
    
    return 0 if success else 1

if __name__ == '__main__':
    sys.exit(main())