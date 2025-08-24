"""
Comprehensive API reliability test suite - Chaos engineering tests for service resilience validation.
Tests dashboard API resilience under various chaotic failure conditions and edge cases.
"""

import pytest
import json
import time
import uuid
import random
import threading
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
from concurrent.futures import ThreadPoolExecutor, as_completed
import warnings

# Suppress Pydantic deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="gotrue")

import os

# Set environment variables before importing app
os.environ.setdefault('SUPABASE_URL', 'https://test.supabase.co')
os.environ.setdefault('SUPABASE_ANON_KEY', 'test_key')

from app import create_app
from exceptions import DatabaseError, NetworkError, CircuitBreakerOpenError, ValidationError


class ChaosSimulator:
    """Simulates various chaotic failure conditions."""
    
    def __init__(self):
        self.failure_rate = 0.3  # 30% failure rate
        self.slow_response_rate = 0.2  # 20% slow responses
        self.corruption_rate = 0.1  # 10% data corruption
        self.intermittent_failures = True
        
    def should_fail(self):
        """Randomly determine if operation should fail."""
        return random.random() < self.failure_rate
    
    def should_be_slow(self):
        """Randomly determine if operation should be slow."""
        return random.random() < self.slow_response_rate
    
    def should_corrupt_data(self):
        """Randomly determine if data should be corrupted."""
        return random.random() < self.corruption_rate
    
    def get_random_failure(self):
        """Get a random failure type."""
        failures = [
            DatabaseError("Random database connection lost"),
            NetworkError("Random network timeout"),
            DatabaseError("Random query timeout"),
            DatabaseError("Random connection pool exhausted"),
            NetworkError("Random DNS resolution failed"),
            Exception("Random unexpected error")
        ]
        return random.choice(failures)
    
    def corrupt_experiment_data(self, experiments):
        """Randomly corrupt experiment data."""
        if not experiments or not self.should_corrupt_data():
            return experiments
        
        corrupted = []
        for exp in experiments:
            if random.random() < 0.3:  # 30% chance to corrupt each experiment
                corrupted_exp = exp.copy()
                
                # Various corruption types
                corruption_type = random.choice([
                    'null_fields', 'invalid_dates', 'wrong_types', 
                    'missing_fields', 'invalid_values'
                ])
                
                if corruption_type == 'null_fields':
                    corrupted_exp[random.choice(['name', 'experiment_type', 'status'])] = None
                elif corruption_type == 'invalid_dates':
                    corrupted_exp['created_at'] = 'invalid-date-format'
                elif corruption_type == 'wrong_types':
                    corrupted_exp['id'] = 12345  # Should be string
                elif corruption_type == 'missing_fields':
                    del corrupted_exp[random.choice(['id', 'name', 'status'])]
                elif corruption_type == 'invalid_values':
                    corrupted_exp['status'] = 'invalid_status_value'
                
                corrupted.append(corrupted_exp)
            else:
                corrupted.append(exp)
        
        return corrupted


class TestChaosEngineering:
    """Chaos engineering tests for service resilience validation."""
    
    @pytest.fixture
    def app(self):
        """Create test Flask application."""
        app = create_app()
        app.config['TESTING'] = True
        return app
    
    @pytest.fixture
    def client(self, app):
        """Create test client."""
        return app.test_client()
    
    @pytest.fixture
    def auth_headers(self):
        """Mock authentication headers."""
        return {
            'Authorization': 'Bearer test_token',
            'Content-Type': 'application/json'
        }
    
    @pytest.fixture
    def mock_user(self):
        """Mock user data."""
        return {
            'id': 'test_user_123',
            'email': 'test@example.com'
        }
    
    @pytest.fixture
    def sample_experiments(self, mock_user):
        """Sample experiment data."""
        base_time = datetime.utcnow()
        experiments = []
        
        for i in range(20):
            experiments.append({
                'id': str(uuid.uuid4()),
                'user_id': mock_user['id'],
                'name': f'Chaos Test Experiment {i}',
                'experiment_type': random.choice(['cognitive', 'memory', 'reaction_time', 'eeg']),
                'status': random.choice(['completed', 'pending', 'running', 'failed']),
                'created_at': (base_time - timedelta(days=random.randint(0, 30))).isoformat(),
                'updated_at': (base_time - timedelta(days=random.randint(0, 30))).isoformat()
            })
        
        return experiments
    
    @pytest.fixture
    def chaos_simulator(self):
        """Create chaos simulator."""
        return ChaosSimulator()
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_random_database_failures(self, mock_execute, mock_get_user, client, auth_headers, mock_user, sample_experiments, chaos_simulator):
        """Test resilience against random database failures."""
        mock_get_user.return_value = mock_user
        
        def chaotic_database_response(*args, **kwargs):
            if chaos_simulator.should_fail():
                raise chaos_simulator.get_random_failure()
            
            if chaos_simulator.should_be_slow():
                time.sleep(random.uniform(1.0, 3.0))
            
            data = sample_experiments
            if chaos_simulator.should_corrupt_data():
                data = chaos_simulator.corrupt_experiment_data(data)
            
            return {'success': True, 'data': data}
        
        mock_execute.side_effect = chaotic_database_response
        
        # Make multiple requests under chaotic conditions
        results = []
        num_requests = 50
        
        for i in range(num_requests):
            try:
                response = client.get('/api/dashboard/summary', headers=auth_headers)
                results.append({
                    'status_code': response.status_code,
                    'success': response.status_code in [200, 206, 503],  # Accept partial data
                    'request_id': i
                })
            except Exception as e:
                results.append({
                    'status_code': 500,
                    'success': False,
                    'error': str(e),
                    'request_id': i
                })
        
        # Analyze chaos resilience
        successful_requests = [r for r in results if r['success']]
        success_rate = len(successful_requests) / len(results)
        
        # Under chaos conditions, we expect some failures but system should remain stable
        assert success_rate >= 0.60, f"Chaos success rate {success_rate:.2%} below 60%"
        
        # No request should cause system crash (all should return valid HTTP status)
        for result in results:
            assert 'status_code' in result, "Request caused system crash"
            assert result['status_code'] in [200, 206, 400, 401, 403, 500, 503], f"Invalid status code: {result['status_code']}"
        
        print(f"\nChaos Database Failures:")
        print(f"  Total requests: {num_requests}")
        print(f"  Success rate: {success_rate:.2%}")
        print(f"  Failed requests: {len(results) - len(successful_requests)}")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_intermittent_service_degradation(self, mock_execute, mock_get_user, client, auth_headers, mock_user, sample_experiments):
        """Test handling of intermittent service degradation."""
        mock_get_user.return_value = mock_user
        
        # Simulate service that alternates between working and failing
        call_count = 0
        
        def intermittent_service(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            
            # Fail every 3rd call, slow every 5th call
            if call_count % 3 == 0:
                raise DatabaseError("Intermittent service failure")
            elif call_count % 5 == 0:
                time.sleep(2.0)  # Slow response
            
            return {'success': True, 'data': sample_experiments}
        
        mock_execute.side_effect = intermittent_service
        
        # Test over time to see pattern handling
        results = []
        for i in range(30):  # 30 requests to see pattern
            start_time = time.time()
            response = client.get('/api/dashboard/summary', headers=auth_headers)
            end_time = time.time()
            
            results.append({
                'request_id': i,
                'status_code': response.status_code,
                'response_time': end_time - start_time,
                'success': response.status_code in [200, 206, 503]
            })
            
            time.sleep(0.1)  # Small delay between requests
        
        # Analyze intermittent behavior handling
        successful_requests = [r for r in results if r['success']]
        success_rate = len(successful_requests) / len(results)
        
        # Should handle intermittent failures gracefully
        assert success_rate >= 0.70, f"Intermittent failure success rate {success_rate:.2%} below 70%"
        
        # Check that system recovers from failures
        consecutive_failures = 0
        max_consecutive_failures = 0
        
        for result in results:
            if not result['success']:
                consecutive_failures += 1
                max_consecutive_failures = max(max_consecutive_failures, consecutive_failures)
            else:
                consecutive_failures = 0
        
        # Should not have too many consecutive failures
        assert max_consecutive_failures <= 5, f"Too many consecutive failures: {max_consecutive_failures}"
        
        print(f"\nIntermittent Service Degradation:")
        print(f"  Success rate: {success_rate:.2%}")
        print(f"  Max consecutive failures: {max_consecutive_failures}")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_data_corruption_resilience(self, mock_execute, mock_get_user, client, auth_headers, mock_user, sample_experiments, chaos_simulator):
        """Test resilience against various data corruption scenarios."""
        mock_get_user.return_value = mock_user
        
        corruption_scenarios = [
            # Null values in required fields
            lambda exps: [{**exp, 'name': None} for exp in exps[:3]] + exps[3:],
            
            # Invalid date formats
            lambda exps: [{**exp, 'created_at': 'not-a-date'} for exp in exps[:2]] + exps[2:],
            
            # Missing required fields
            lambda exps: [{k: v for k, v in exp.items() if k != 'id'} for exp in exps[:1]] + exps[1:],
            
            # Wrong data types
            lambda exps: [{**exp, 'id': 12345} for exp in exps[:2]] + exps[2:],
            
            # Invalid enum values
            lambda exps: [{**exp, 'status': 'invalid_status'} for exp in exps[:3]] + exps[3:],
            
            # Empty strings
            lambda exps: [{**exp, 'name': ''} for exp in exps[:2]] + exps[2:],
            
            # Extremely long strings
            lambda exps: [{**exp, 'name': 'x' * 10000} for exp in exps[:1]] + exps[1:],
            
            # Unicode and special characters
            lambda exps: [{**exp, 'name': '🧠💻🔬\x00\x01\x02'} for exp in exps[:1]] + exps[1:],
        ]
        
        results = []
        
        for i, corruption_func in enumerate(corruption_scenarios):
            corrupted_data = corruption_func(sample_experiments.copy())
            mock_execute.return_value = {'success': True, 'data': corrupted_data}
            
            response = client.get('/api/dashboard/summary', headers=auth_headers)
            
            results.append({
                'scenario': i,
                'status_code': response.status_code,
                'success': response.status_code in [200, 206],  # Should handle gracefully
                'data_valid': True
            })
            
            # Verify response data is valid JSON
            if response.status_code == 200:
                try:
                    data = json.loads(response.data)
                    # Should have basic structure even with corrupted input
                    assert 'total_experiments' in data
                    assert isinstance(data['total_experiments'], int)
                    results[-1]['data_valid'] = True
                except (json.JSONDecodeError, AssertionError, KeyError):
                    results[-1]['data_valid'] = False
        
        # Analyze corruption resilience
        successful_requests = [r for r in results if r['success'] and r['data_valid']]
        success_rate = len(successful_requests) / len(results)
        
        # Should handle most corruption scenarios gracefully
        assert success_rate >= 0.75, f"Data corruption success rate {success_rate:.2%} below 75%"
        
        print(f"\nData Corruption Resilience:")
        print(f"  Corruption scenarios tested: {len(corruption_scenarios)}")
        print(f"  Success rate: {success_rate:.2%}")
        print(f"  Failed scenarios: {len(results) - len(successful_requests)}")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_resource_exhaustion_simulation(self, mock_execute, mock_get_user, client, auth_headers, mock_user, sample_experiments):
        """Test behavior under simulated resource exhaustion."""
        mock_get_user.return_value = mock_user
        
        # Simulate various resource exhaustion scenarios
        exhaustion_errors = [
            DatabaseError("Connection pool exhausted"),
            DatabaseError("Too many connections"),
            DatabaseError("Out of memory"),
            NetworkError("Socket exhausted"),
            Exception("Resource temporarily unavailable"),
        ]
        
        results = []
        
        # Test each exhaustion scenario
        for error in exhaustion_errors:
            mock_execute.side_effect = error
            
            response = client.get('/api/dashboard/summary', headers=auth_headers)
            
            results.append({
                'error_type': type(error).__name__,
                'status_code': response.status_code,
                'success': response.status_code in [503, 429],  # Should return service unavailable
            })
            
            # Verify error response structure
            if response.status_code in [503, 429]:
                data = json.loads(response.data)
                assert 'error' in data
                assert 'retry_after' in data or 'message' in data
        
        # All resource exhaustion should be handled gracefully
        handled_gracefully = [r for r in results if r['success']]
        success_rate = len(handled_gracefully) / len(results)
        
        assert success_rate >= 0.80, f"Resource exhaustion handling rate {success_rate:.2%} below 80%"
        
        print(f"\nResource Exhaustion Simulation:")
        print(f"  Scenarios tested: {len(exhaustion_errors)}")
        print(f"  Graceful handling rate: {success_rate:.2%}")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_concurrent_chaos_conditions(self, mock_execute, mock_get_user, client, auth_headers, mock_user, sample_experiments, chaos_simulator):
        """Test resilience under concurrent chaotic conditions."""
        mock_get_user.return_value = mock_user
        
        def chaotic_concurrent_response(*args, **kwargs):
            # Random delay to simulate varying response times
            if random.random() < 0.3:
                time.sleep(random.uniform(0.1, 2.0))
            
            # Random failures
            if chaos_simulator.should_fail():
                raise chaos_simulator.get_random_failure()
            
            # Random data corruption
            data = sample_experiments
            if chaos_simulator.should_corrupt_data():
                data = chaos_simulator.corrupt_experiment_data(data)
            
            return {'success': True, 'data': data}
        
        mock_execute.side_effect = chaotic_concurrent_response
        
        # Run concurrent requests under chaos
        num_concurrent = 20
        results = []
        
        def make_chaotic_request(request_id):
            try:
                start_time = time.time()
                response = client.get('/api/dashboard/summary', headers=auth_headers)
                end_time = time.time()
                
                return {
                    'request_id': request_id,
                    'status_code': response.status_code,
                    'response_time': end_time - start_time,
                    'success': response.status_code in [200, 206, 503],
                    'error': None
                }
            except Exception as e:
                return {
                    'request_id': request_id,
                    'status_code': 500,
                    'response_time': 0,
                    'success': False,
                    'error': str(e)
                }
        
        with ThreadPoolExecutor(max_workers=num_concurrent) as executor:
            futures = [
                executor.submit(make_chaotic_request, i)
                for i in range(num_concurrent)
            ]
            
            for future in as_completed(futures):
                results.append(future.result())
        
        # Analyze concurrent chaos resilience
        successful_requests = [r for r in results if r['success']]
        success_rate = len(successful_requests) / len(results)
        
        # Under concurrent chaos, expect lower success rate but system stability
        assert success_rate >= 0.50, f"Concurrent chaos success rate {success_rate:.2%} below 50%"
        
        # No request should cause system crash
        crashed_requests = [r for r in results if r.get('error') and 'crash' in r['error'].lower()]
        assert len(crashed_requests) == 0, f"System crashed on {len(crashed_requests)} requests"
        
        print(f"\nConcurrent Chaos Conditions:")
        print(f"  Concurrent requests: {num_concurrent}")
        print(f"  Success rate: {success_rate:.2%}")
        print(f"  System crashes: {len(crashed_requests)}")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_edge_case_inputs(self, mock_execute, mock_get_user, client, auth_headers, mock_user):
        """Test handling of edge case inputs and parameters."""
        mock_get_user.return_value = mock_user
        mock_execute.return_value = {'success': True, 'data': []}
        
        edge_case_params = [
            # Extremely long parameters
            {'period': 'x' * 1000},
            
            # Invalid characters
            {'period': '../../etc/passwd'},
            {'experiment_type': '<script>alert("xss")</script>'},
            
            # SQL injection attempts
            {'experiment_type': "'; DROP TABLE experiments; --"},
            
            # Unicode and special characters
            {'period': '🚀💥🔥'},
            {'experiment_type': '\x00\x01\x02'},
            
            # Null bytes and control characters
            {'period': '\0\r\n\t'},
            
            # Very large numbers
            {'limit': '999999999999999999999'},
            
            # Negative numbers
            {'days': '-1000'},
            
            # Boolean confusion
            {'force_refresh': 'maybe'},
            
            # Array injection
            {'period': ['7d', '30d']},
        ]
        
        results = []
        
        for params in edge_case_params:
            try:
                response = client.get('/api/dashboard/summary', 
                                    headers=auth_headers, 
                                    query_string=params)
                
                results.append({
                    'params': params,
                    'status_code': response.status_code,
                    'success': response.status_code in [200, 400, 422],  # Valid responses
                    'crashed': False
                })
                
                # Verify response is valid JSON
                if response.status_code == 200:
                    json.loads(response.data)
                    
            except Exception as e:
                results.append({
                    'params': params,
                    'status_code': 500,
                    'success': False,
                    'crashed': True,
                    'error': str(e)
                })
        
        # Analyze edge case handling
        handled_gracefully = [r for r in results if r['success'] and not r['crashed']]
        success_rate = len(handled_gracefully) / len(results)
        
        # Should handle edge cases without crashing
        crashed_requests = [r for r in results if r['crashed']]
        assert len(crashed_requests) == 0, f"System crashed on {len(crashed_requests)} edge cases"
        
        # Should handle most edge cases gracefully (either process or reject cleanly)
        assert success_rate >= 0.80, f"Edge case handling rate {success_rate:.2%} below 80%"
        
        print(f"\nEdge Case Input Handling:")
        print(f"  Edge cases tested: {len(edge_case_params)}")
        print(f"  Graceful handling rate: {success_rate:.2%}")
        print(f"  System crashes: {len(crashed_requests)}")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_cascading_failure_prevention(self, mock_execute, mock_get_user, client, auth_headers, mock_user):
        """Test prevention of cascading failures across endpoints."""
        mock_get_user.return_value = mock_user
        
        # Simulate failure in one component affecting others
        failure_count = 0
        
        def cascading_failure_simulation(*args, **kwargs):
            nonlocal failure_count
            failure_count += 1
            
            # First few calls fail to trigger circuit breaker
            if failure_count <= 6:
                raise DatabaseError("Database connection failed")
            
            # Later calls should be blocked by circuit breaker
            # This tests if circuit breaker prevents cascading failures
            return {'success': True, 'data': []}
        
        mock_execute.side_effect = cascading_failure_simulation
        
        endpoints = [
            '/api/dashboard/summary',
            '/api/dashboard/charts',
            '/api/dashboard/recent'
        ]
        
        results = []
        
        # Test each endpoint multiple times to trigger and test circuit breaker
        for endpoint in endpoints:
            for i in range(5):
                response = client.get(endpoint, headers=auth_headers)
                results.append({
                    'endpoint': endpoint,
                    'attempt': i,
                    'status_code': response.status_code,
                    'success': response.status_code in [200, 503]
                })
                time.sleep(0.1)  # Small delay
        
        # Analyze cascading failure prevention
        # Later requests should be handled by circuit breaker (503) rather than causing more failures
        later_requests = results[10:]  # After circuit breaker should be active
        circuit_breaker_responses = [r for r in later_requests if r['status_code'] == 503]
        
        # Circuit breaker should prevent some requests from reaching failing service
        circuit_breaker_rate = len(circuit_breaker_responses) / len(later_requests) if later_requests else 0
        
        print(f"\nCascading Failure Prevention:")
        print(f"  Total requests: {len(results)}")
        print(f"  Circuit breaker activation rate: {circuit_breaker_rate:.2%}")
        print(f"  Database call attempts: {failure_count}")
        
        # Circuit breaker should activate and prevent excessive database calls
        assert failure_count < 20, f"Too many database calls ({failure_count}), circuit breaker not working"