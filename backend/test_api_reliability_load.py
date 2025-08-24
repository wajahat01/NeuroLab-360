"""
Comprehensive API reliability test suite - Load testing for concurrent request handling.
Tests dashboard API performance and reliability under concurrent load conditions.
"""

import pytest
import json
import time
import uuid
import threading
from datetime import datetime, timedelta
from unittest.mock import Mock, patch
from concurrent.futures import ThreadPoolExecutor, as_completed
import statistics
import warnings

# Suppress Pydantic deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="gotrue")

import os

# Set environment variables before importing app
os.environ.setdefault('SUPABASE_URL', 'https://test.supabase.co')
os.environ.setdefault('SUPABASE_ANON_KEY', 'test_key')

from app import create_app


class TestConcurrentRequestHandling:
    """Load tests for concurrent request handling."""
    
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
        """Sample experiment data for load testing."""
        base_time = datetime.utcnow()
        experiments = []
        
        for i in range(50):  # Create 50 experiments for realistic load
            experiments.append({
                'id': str(uuid.uuid4()),
                'user_id': mock_user['id'],
                'name': f'Load Test Experiment {i}',
                'experiment_type': ['cognitive', 'memory', 'reaction_time', 'eeg'][i % 4],
                'status': ['completed', 'pending', 'running'][i % 3],
                'created_at': (base_time - timedelta(days=i % 30)).isoformat(),
                'updated_at': (base_time - timedelta(days=i % 30)).isoformat()
            })
        
        return experiments
    
    def make_request(self, client, endpoint, headers, request_id=None):
        """Make a single request and return timing and result data."""
        start_time = time.time()
        try:
            response = client.get(endpoint, headers=headers)
            end_time = time.time()
            
            return {
                'request_id': request_id,
                'status_code': response.status_code,
                'response_time': end_time - start_time,
                'success': response.status_code == 200,
                'data_size': len(response.data) if response.data else 0,
                'error': None
            }
        except Exception as e:
            end_time = time.time()
            return {
                'request_id': request_id,
                'status_code': 500,
                'response_time': end_time - start_time,
                'success': False,
                'data_size': 0,
                'error': str(e)
            }
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_concurrent_summary_requests(self, mock_execute, mock_get_user, client, auth_headers, mock_user, sample_experiments):
        """Test concurrent requests to dashboard summary endpoint."""
        mock_get_user.return_value = mock_user
        mock_execute.side_effect = [
            {'success': True, 'data': sample_experiments}
        ] * 100  # Enough responses for all requests
        
        num_concurrent_requests = 20
        results = []
        
        # Use ThreadPoolExecutor for concurrent requests
        with ThreadPoolExecutor(max_workers=num_concurrent_requests) as executor:
            futures = [
                executor.submit(
                    self.make_request, 
                    client, 
                    '/api/dashboard/summary', 
                    auth_headers, 
                    i
                )
                for i in range(num_concurrent_requests)
            ]
            
            for future in as_completed(futures):
                results.append(future.result())
        
        # Analyze results
        successful_requests = [r for r in results if r['success']]
        failed_requests = [r for r in results if not r['success']]
        response_times = [r['response_time'] for r in results]
        
        # Assertions
        success_rate = len(successful_requests) / len(results)
        assert success_rate >= 0.95, f"Success rate {success_rate:.2%} below 95%"
        
        avg_response_time = statistics.mean(response_times)
        assert avg_response_time < 5.0, f"Average response time {avg_response_time:.2f}s exceeds 5s"
        
        max_response_time = max(response_times)
        assert max_response_time < 10.0, f"Max response time {max_response_time:.2f}s exceeds 10s"
        
        # Log performance metrics
        print(f"\nConcurrent Summary Requests Performance:")
        print(f"  Total requests: {len(results)}")
        print(f"  Success rate: {success_rate:.2%}")
        print(f"  Average response time: {avg_response_time:.3f}s")
        print(f"  Max response time: {max_response_time:.3f}s")
        print(f"  Min response time: {min(response_times):.3f}s")
        print(f"  Failed requests: {len(failed_requests)}")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_mixed_endpoint_load(self, mock_execute, mock_get_user, client, auth_headers, mock_user, sample_experiments):
        """Test concurrent requests across multiple dashboard endpoints."""
        mock_get_user.return_value = mock_user
        mock_execute.side_effect = [
            {'success': True, 'data': sample_experiments}
        ] * 200  # Enough responses for all requests
        
        endpoints = [
            '/api/dashboard/summary',
            '/api/dashboard/charts',
            '/api/dashboard/recent'
        ]
        
        num_requests_per_endpoint = 10
        results = []
        
        # Create mixed load across endpoints
        with ThreadPoolExecutor(max_workers=30) as executor:
            futures = []
            
            for endpoint in endpoints:
                for i in range(num_requests_per_endpoint):
                    future = executor.submit(
                        self.make_request,
                        client,
                        endpoint,
                        auth_headers,
                        f"{endpoint}_{i}"
                    )
                    futures.append(future)
            
            for future in as_completed(futures):
                results.append(future.result())
        
        # Analyze results by endpoint
        endpoint_results = {}
        for result in results:
            endpoint = result['request_id'].split('_')[0]
            if endpoint not in endpoint_results:
                endpoint_results[endpoint] = []
            endpoint_results[endpoint].append(result)
        
        # Verify performance for each endpoint
        for endpoint, endpoint_results_list in endpoint_results.items():
            successful = [r for r in endpoint_results_list if r['success']]
            success_rate = len(successful) / len(endpoint_results_list)
            avg_response_time = statistics.mean([r['response_time'] for r in endpoint_results_list])
            
            assert success_rate >= 0.90, f"Endpoint {endpoint} success rate {success_rate:.2%} below 90%"
            assert avg_response_time < 5.0, f"Endpoint {endpoint} avg response time {avg_response_time:.2f}s exceeds 5s"
            
            print(f"\n{endpoint} Performance:")
            print(f"  Requests: {len(endpoint_results_list)}")
            print(f"  Success rate: {success_rate:.2%}")
            print(f"  Avg response time: {avg_response_time:.3f}s")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_sustained_load(self, mock_execute, mock_get_user, client, auth_headers, mock_user, sample_experiments):
        """Test sustained load over time to check for memory leaks and degradation."""
        mock_get_user.return_value = mock_user
        mock_execute.side_effect = [
            {'success': True, 'data': sample_experiments}
        ] * 500  # Enough responses for sustained test
        
        duration_seconds = 30  # Run for 30 seconds
        requests_per_second = 5
        total_expected_requests = duration_seconds * requests_per_second
        
        results = []
        start_time = time.time()
        
        def make_sustained_requests():
            """Make requests at a sustained rate."""
            request_count = 0
            while time.time() - start_time < duration_seconds:
                result = self.make_request(
                    client,
                    '/api/dashboard/summary',
                    auth_headers,
                    request_count
                )
                results.append(result)
                request_count += 1
                
                # Control request rate
                time.sleep(1.0 / requests_per_second)
        
        # Run sustained load test
        thread = threading.Thread(target=make_sustained_requests)
        thread.start()
        thread.join()
        
        # Analyze sustained performance
        if results:
            response_times = [r['response_time'] for r in results]
            success_rate = len([r for r in results if r['success']]) / len(results)
            
            # Check for performance degradation over time
            first_half = response_times[:len(response_times)//2]
            second_half = response_times[len(response_times)//2:]
            
            if first_half and second_half:
                first_half_avg = statistics.mean(first_half)
                second_half_avg = statistics.mean(second_half)
                degradation_ratio = second_half_avg / first_half_avg
                
                assert degradation_ratio < 2.0, f"Performance degraded by {degradation_ratio:.2f}x over time"
                assert success_rate >= 0.95, f"Sustained success rate {success_rate:.2%} below 95%"
                
                print(f"\nSustained Load Performance:")
                print(f"  Duration: {duration_seconds}s")
                print(f"  Total requests: {len(results)}")
                print(f"  Success rate: {success_rate:.2%}")
                print(f"  First half avg: {first_half_avg:.3f}s")
                print(f"  Second half avg: {second_half_avg:.3f}s")
                print(f"  Performance ratio: {degradation_ratio:.2f}")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_burst_load_handling(self, mock_execute, mock_get_user, client, auth_headers, mock_user, sample_experiments):
        """Test handling of sudden burst loads."""
        mock_get_user.return_value = mock_user
        mock_execute.side_effect = [
            {'success': True, 'data': sample_experiments}
        ] * 100
        
        # Create burst of 50 simultaneous requests
        burst_size = 50
        results = []
        
        with ThreadPoolExecutor(max_workers=burst_size) as executor:
            # Submit all requests at once to create burst
            futures = [
                executor.submit(
                    self.make_request,
                    client,
                    '/api/dashboard/summary',
                    auth_headers,
                    i
                )
                for i in range(burst_size)
            ]
            
            # Collect results as they complete
            for future in as_completed(futures):
                results.append(future.result())
        
        # Analyze burst handling
        successful_requests = [r for r in results if r['success']]
        response_times = [r['response_time'] for r in results]
        
        success_rate = len(successful_requests) / len(results)
        avg_response_time = statistics.mean(response_times)
        p95_response_time = statistics.quantiles(response_times, n=20)[18]  # 95th percentile
        
        # Burst load should still maintain reasonable performance
        assert success_rate >= 0.90, f"Burst success rate {success_rate:.2%} below 90%"
        assert avg_response_time < 8.0, f"Burst avg response time {avg_response_time:.2f}s exceeds 8s"
        assert p95_response_time < 15.0, f"Burst P95 response time {p95_response_time:.2f}s exceeds 15s"
        
        print(f"\nBurst Load Performance:")
        print(f"  Burst size: {burst_size}")
        print(f"  Success rate: {success_rate:.2%}")
        print(f"  Avg response time: {avg_response_time:.3f}s")
        print(f"  P95 response time: {p95_response_time:.3f}s")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_concurrent_users_simulation(self, mock_execute, mock_get_user, client, auth_headers, sample_experiments):
        """Test concurrent requests from multiple simulated users."""
        # Create multiple mock users
        mock_users = [
            {'id': f'user_{i}', 'email': f'user{i}@example.com'}
            for i in range(10)
        ]
        
        def get_user_for_token(token):
            # Extract user index from token for simulation
            if 'user_' in token:
                try:
                    user_idx = int(token.split('user_')[1].split('_')[0])
                    return mock_users[user_idx % len(mock_users)]
                except:
                    pass
            return mock_users[0]  # Default user
        
        mock_get_user.side_effect = get_user_for_token
        mock_execute.side_effect = [
            {'success': True, 'data': sample_experiments}
        ] * 200
        
        # Create requests from different users
        results = []
        requests_per_user = 5
        
        with ThreadPoolExecutor(max_workers=50) as executor:
            futures = []
            
            for user_idx, user in enumerate(mock_users):
                user_headers = {
                    'Authorization': f'Bearer user_{user_idx}_token',
                    'Content-Type': 'application/json'
                }
                
                for req_idx in range(requests_per_user):
                    future = executor.submit(
                        self.make_request,
                        client,
                        '/api/dashboard/summary',
                        user_headers,
                        f"user_{user_idx}_req_{req_idx}"
                    )
                    futures.append(future)
            
            for future in as_completed(futures):
                results.append(future.result())
        
        # Analyze multi-user performance
        successful_requests = [r for r in results if r['success']]
        success_rate = len(successful_requests) / len(results)
        avg_response_time = statistics.mean([r['response_time'] for r in results])
        
        assert success_rate >= 0.95, f"Multi-user success rate {success_rate:.2%} below 95%"
        assert avg_response_time < 5.0, f"Multi-user avg response time {avg_response_time:.2f}s exceeds 5s"
        
        print(f"\nMulti-User Concurrent Performance:")
        print(f"  Users: {len(mock_users)}")
        print(f"  Requests per user: {requests_per_user}")
        print(f"  Total requests: {len(results)}")
        print(f"  Success rate: {success_rate:.2%}")
        print(f"  Avg response time: {avg_response_time:.3f}s")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_load_with_database_slowdown(self, mock_execute, mock_get_user, client, auth_headers, mock_user, sample_experiments):
        """Test load handling when database responses are slow."""
        mock_get_user.return_value = mock_user
        
        def slow_database_response(*args, **kwargs):
            time.sleep(0.5)  # Simulate slow database
            return {'success': True, 'data': sample_experiments}
        
        mock_execute.side_effect = slow_database_response
        
        num_concurrent_requests = 10
        results = []
        
        with ThreadPoolExecutor(max_workers=num_concurrent_requests) as executor:
            futures = [
                executor.submit(
                    self.make_request,
                    client,
                    '/api/dashboard/summary',
                    auth_headers,
                    i
                )
                for i in range(num_concurrent_requests)
            ]
            
            for future in as_completed(futures):
                results.append(future.result())
        
        # With slow database, requests should still complete but take longer
        successful_requests = [r for r in results if r['success']]
        success_rate = len(successful_requests) / len(results)
        avg_response_time = statistics.mean([r['response_time'] for r in results])
        
        # Should still succeed but with longer response times
        assert success_rate >= 0.90, f"Slow DB success rate {success_rate:.2%} below 90%"
        assert avg_response_time >= 0.5, f"Response time {avg_response_time:.2f}s should reflect DB slowdown"
        assert avg_response_time < 10.0, f"Response time {avg_response_time:.2f}s too slow even for slow DB"
        
        print(f"\nSlow Database Load Performance:")
        print(f"  Concurrent requests: {num_concurrent_requests}")
        print(f"  Success rate: {success_rate:.2%}")
        print(f"  Avg response time: {avg_response_time:.3f}s")
    
    def test_memory_usage_under_load(self, client, auth_headers, mock_user, sample_experiments):
        """Test memory usage doesn't grow excessively under load."""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        with patch('routes.dashboard.supabase_client.get_user_from_token', return_value=mock_user):
            with patch('routes.dashboard.supabase_client.execute_query') as mock_execute:
                mock_execute.side_effect = [
                    {'success': True, 'data': sample_experiments}
                ] * 100
                
                # Make many requests to check memory growth
                for i in range(100):
                    response = client.get('/api/dashboard/summary', headers=auth_headers)
                    assert response.status_code in [200, 503]  # Should not crash
                
                final_memory = process.memory_info().rss / 1024 / 1024  # MB
                memory_growth = final_memory - initial_memory
                
                # Memory growth should be reasonable (less than 100MB for 100 requests)
                assert memory_growth < 100, f"Memory grew by {memory_growth:.1f}MB, possible memory leak"
                
                print(f"\nMemory Usage:")
                print(f"  Initial: {initial_memory:.1f}MB")
                print(f"  Final: {final_memory:.1f}MB")
                print(f"  Growth: {memory_growth:.1f}MB")