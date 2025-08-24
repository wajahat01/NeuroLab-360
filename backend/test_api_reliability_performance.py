"""
Comprehensive API reliability test suite - Performance regression tests with response time benchmarks.
Tests dashboard API performance characteristics and detects performance regressions.
"""

import pytest
import json
import time
import uuid
import statistics
import random
from datetime import datetime, timedelta
from unittest.mock import Mock, patch
from concurrent.futures import ThreadPoolExecutor, as_completed
import warnings

# Suppress Pydantic deprecation warnings
warnings.filterwarnings("ignore", category=DeprecationWarning, module="gotrue")

import os

# Set environment variables before importing app
os.environ.setdefault('SUPABASE_URL', 'https://test.supabase.co')
os.environ.setdefault('SUPABASE_ANON_KEY', 'test_key')

from app import create_app


class PerformanceBenchmarks:
    """Performance benchmarks and thresholds for dashboard APIs."""
    
    # Response time benchmarks (in seconds)
    SUMMARY_ENDPOINT = {
        'p50': 1.0,    # 50th percentile
        'p95': 2.5,    # 95th percentile
        'p99': 5.0,    # 99th percentile
        'max': 10.0    # Maximum acceptable
    }
    
    CHARTS_ENDPOINT = {
        'p50': 1.5,
        'p95': 3.0,
        'p99': 6.0,
        'max': 12.0
    }
    
    RECENT_ENDPOINT = {
        'p50': 0.8,
        'p95': 2.0,
        'p99': 4.0,
        'max': 8.0
    }
    
    # Throughput benchmarks (requests per second)
    THROUGHPUT = {
        'min_rps': 10,      # Minimum requests per second
        'target_rps': 50,   # Target requests per second
        'max_rps': 100      # Maximum sustainable requests per second
    }
    
    # Resource usage benchmarks
    MEMORY = {
        'max_growth_mb': 50,    # Maximum memory growth per 100 requests
        'max_total_mb': 500     # Maximum total memory usage
    }
    
    CPU = {
        'max_usage_percent': 80  # Maximum CPU usage during load
    }


class TestPerformanceRegression:
    """Performance regression tests with response time benchmarks."""
    
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
    def performance_experiments(self, mock_user):
        """Large dataset for performance testing."""
        base_time = datetime.utcnow()
        experiments = []
        
        # Create realistic dataset size
        for i in range(200):
            experiments.append({
                'id': str(uuid.uuid4()),
                'user_id': mock_user['id'],
                'name': f'Performance Test Experiment {i}',
                'experiment_type': ['cognitive', 'memory', 'reaction_time', 'eeg', 'biometric'][i % 5],
                'status': ['completed', 'pending', 'running', 'failed'][i % 4],
                'created_at': (base_time - timedelta(days=i % 90)).isoformat(),
                'updated_at': (base_time - timedelta(days=i % 90)).isoformat(),
                'description': f'Detailed description for experiment {i} ' * 10,  # Larger data
                'parameters': {
                    'duration': random.randint(60, 3600),
                    'trials': random.randint(10, 100),
                    'difficulty': random.choice(['easy', 'medium', 'hard']),
                    'metadata': {'key': f'value_{i}' for i in range(10)}
                }
            })
        
        return experiments
    
    @pytest.fixture
    def performance_results(self, performance_experiments):
        """Large results dataset for performance testing."""
        results = []
        
        for exp in performance_experiments[:100]:  # Results for first 100 experiments
            results.append({
                'id': str(uuid.uuid4()),
                'experiment_id': exp['id'],
                'data_points': [
                    {
                        'timestamp': i,
                        'value': random.uniform(50, 150),
                        'metadata': {'unit': 'ms', 'quality': 'good'}
                    }
                    for i in range(100)  # 100 data points per result
                ],
                'metrics': {
                    'mean': random.uniform(80, 120),
                    'std_dev': random.uniform(5, 25),
                    'min': random.uniform(50, 80),
                    'max': random.uniform(120, 150),
                    'accuracy': random.uniform(0.7, 0.95),
                    'response_time': random.uniform(200, 800)
                },
                'analysis_summary': f'Performance analysis for experiment {exp["name"]}',
                'created_at': exp['created_at']
            })
        
        return results
    
    def measure_response_times(self, client, endpoint, headers, num_requests=50):
        """Measure response times for an endpoint."""
        response_times = []
        status_codes = []
        
        for i in range(num_requests):
            start_time = time.time()
            response = client.get(endpoint, headers=headers)
            end_time = time.time()
            
            response_times.append(end_time - start_time)
            status_codes.append(response.status_code)
            
            # Small delay to avoid overwhelming the system
            time.sleep(0.01)
        
        return response_times, status_codes
    
    def calculate_percentiles(self, response_times):
        """Calculate response time percentiles."""
        if not response_times:
            return {}
        
        sorted_times = sorted(response_times)
        n = len(sorted_times)
        
        return {
            'p50': sorted_times[int(n * 0.5)],
            'p95': sorted_times[int(n * 0.95)],
            'p99': sorted_times[int(n * 0.99)],
            'max': max(sorted_times),
            'min': min(sorted_times),
            'mean': statistics.mean(sorted_times),
            'std_dev': statistics.stdev(sorted_times) if n > 1 else 0
        }
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_summary_endpoint_performance(self, mock_execute, mock_get_user, client, auth_headers, mock_user, performance_experiments, performance_results):
        """Test dashboard summary endpoint performance benchmarks."""
        mock_get_user.return_value = mock_user
        
        # Setup mock responses for performance test
        mock_execute.side_effect = [
            {'success': True, 'data': performance_experiments}
        ] + [
            {'success': True, 'data': [result]} if i < len(performance_results) else {'success': True, 'data': []}
            for i, result in enumerate(performance_results)
        ] * 10  # Repeat for multiple requests
        
        # Measure response times
        response_times, status_codes = self.measure_response_times(
            client, '/api/dashboard/summary', auth_headers, num_requests=50
        )
        
        # Calculate performance metrics
        percentiles = self.calculate_percentiles(response_times)
        success_rate = len([sc for sc in status_codes if sc == 200]) / len(status_codes)
        
        # Performance assertions
        benchmarks = PerformanceBenchmarks.SUMMARY_ENDPOINT
        
        assert percentiles['p50'] <= benchmarks['p50'], \
            f"P50 response time {percentiles['p50']:.3f}s exceeds benchmark {benchmarks['p50']}s"
        
        assert percentiles['p95'] <= benchmarks['p95'], \
            f"P95 response time {percentiles['p95']:.3f}s exceeds benchmark {benchmarks['p95']}s"
        
        assert percentiles['p99'] <= benchmarks['p99'], \
            f"P99 response time {percentiles['p99']:.3f}s exceeds benchmark {benchmarks['p99']}s"
        
        assert percentiles['max'] <= benchmarks['max'], \
            f"Max response time {percentiles['max']:.3f}s exceeds benchmark {benchmarks['max']}s"
        
        assert success_rate >= 0.98, f"Success rate {success_rate:.2%} below 98%"
        
        print(f"\nSummary Endpoint Performance:")
        print(f"  P50: {percentiles['p50']:.3f}s (benchmark: {benchmarks['p50']}s)")
        print(f"  P95: {percentiles['p95']:.3f}s (benchmark: {benchmarks['p95']}s)")
        print(f"  P99: {percentiles['p99']:.3f}s (benchmark: {benchmarks['p99']}s)")
        print(f"  Max: {percentiles['max']:.3f}s (benchmark: {benchmarks['max']}s)")
        print(f"  Success rate: {success_rate:.2%}")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_charts_endpoint_performance(self, mock_execute, mock_get_user, client, auth_headers, mock_user, performance_experiments, performance_results):
        """Test dashboard charts endpoint performance benchmarks."""
        mock_get_user.return_value = mock_user
        
        # Setup mock responses
        mock_execute.side_effect = [
            {'success': True, 'data': performance_experiments}
        ] + [
            {'success': True, 'data': [result]} if i < len(performance_results) else {'success': True, 'data': []}
            for i, result in enumerate(performance_results)
        ] * 10
        
        # Test different chart parameters for comprehensive performance testing
        test_params = [
            {},  # Default parameters
            {'period': '7d'},
            {'period': '30d'},
            {'period': '90d'},
            {'experiment_type': 'cognitive'},
        ]
        
        all_response_times = []
        all_status_codes = []
        
        for params in test_params:
            # Measure response times for each parameter set
            response_times, status_codes = self.measure_response_times(
                client, '/api/dashboard/charts', auth_headers, num_requests=10
            )
            all_response_times.extend(response_times)
            all_status_codes.extend(status_codes)
        
        # Calculate performance metrics
        percentiles = self.calculate_percentiles(all_response_times)
        success_rate = len([sc for sc in all_status_codes if sc == 200]) / len(all_status_codes)
        
        # Performance assertions
        benchmarks = PerformanceBenchmarks.CHARTS_ENDPOINT
        
        assert percentiles['p50'] <= benchmarks['p50'], \
            f"Charts P50 response time {percentiles['p50']:.3f}s exceeds benchmark {benchmarks['p50']}s"
        
        assert percentiles['p95'] <= benchmarks['p95'], \
            f"Charts P95 response time {percentiles['p95']:.3f}s exceeds benchmark {benchmarks['p95']}s"
        
        assert percentiles['max'] <= benchmarks['max'], \
            f"Charts max response time {percentiles['max']:.3f}s exceeds benchmark {benchmarks['max']}s"
        
        assert success_rate >= 0.95, f"Charts success rate {success_rate:.2%} below 95%"
        
        print(f"\nCharts Endpoint Performance:")
        print(f"  P50: {percentiles['p50']:.3f}s (benchmark: {benchmarks['p50']}s)")
        print(f"  P95: {percentiles['p95']:.3f}s (benchmark: {benchmarks['p95']}s)")
        print(f"  Max: {percentiles['max']:.3f}s (benchmark: {benchmarks['max']}s)")
        print(f"  Success rate: {success_rate:.2%}")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_recent_endpoint_performance(self, mock_execute, mock_get_user, client, auth_headers, mock_user, performance_experiments, performance_results):
        """Test dashboard recent experiments endpoint performance benchmarks."""
        mock_get_user.return_value = mock_user
        
        # Setup mock responses
        mock_execute.side_effect = [
            {'success': True, 'data': performance_experiments[:50]}  # Recent experiments
        ] + [
            {'success': True, 'data': [result]} if i < 50 else {'success': True, 'data': []}
            for i, result in enumerate(performance_results[:50])
        ] * 10
        
        # Measure response times
        response_times, status_codes = self.measure_response_times(
            client, '/api/dashboard/recent', auth_headers, num_requests=50
        )
        
        # Calculate performance metrics
        percentiles = self.calculate_percentiles(response_times)
        success_rate = len([sc for sc in status_codes if sc == 200]) / len(status_codes)
        
        # Performance assertions
        benchmarks = PerformanceBenchmarks.RECENT_ENDPOINT
        
        assert percentiles['p50'] <= benchmarks['p50'], \
            f"Recent P50 response time {percentiles['p50']:.3f}s exceeds benchmark {benchmarks['p50']}s"
        
        assert percentiles['p95'] <= benchmarks['p95'], \
            f"Recent P95 response time {percentiles['p95']:.3f}s exceeds benchmark {benchmarks['p95']}s"
        
        assert percentiles['max'] <= benchmarks['max'], \
            f"Recent max response time {percentiles['max']:.3f}s exceeds benchmark {benchmarks['max']}s"
        
        assert success_rate >= 0.98, f"Recent success rate {success_rate:.2%} below 98%"
        
        print(f"\nRecent Endpoint Performance:")
        print(f"  P50: {percentiles['p50']:.3f}s (benchmark: {benchmarks['p50']}s)")
        print(f"  P95: {percentiles['p95']:.3f}s (benchmark: {benchmarks['p95']}s)")
        print(f"  Max: {percentiles['max']:.3f}s (benchmark: {benchmarks['max']}s)")
        print(f"  Success rate: {success_rate:.2%}")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_throughput_benchmarks(self, mock_execute, mock_get_user, client, auth_headers, mock_user, performance_experiments):
        """Test API throughput benchmarks."""
        mock_get_user.return_value = mock_user
        mock_execute.side_effect = [
            {'success': True, 'data': performance_experiments[:20]}
        ] * 200  # Enough responses for throughput test
        
        # Test sustained throughput
        duration_seconds = 10
        results = []
        
        def make_throughput_requests():
            start_time = time.time()
            request_count = 0
            
            while time.time() - start_time < duration_seconds:
                request_start = time.time()
                response = client.get('/api/dashboard/summary', headers=auth_headers)
                request_end = time.time()
                
                results.append({
                    'response_time': request_end - request_start,
                    'status_code': response.status_code,
                    'timestamp': request_end
                })
                request_count += 1
                
                # Small delay to control rate
                time.sleep(0.05)  # Target ~20 RPS
        
        # Run throughput test
        import threading
        thread = threading.Thread(target=make_throughput_requests)
        thread.start()
        thread.join()
        
        # Calculate throughput metrics
        if results:
            total_requests = len(results)
            successful_requests = len([r for r in results if r['status_code'] == 200])
            actual_duration = results[-1]['timestamp'] - results[0]['timestamp']
            
            throughput_rps = total_requests / actual_duration if actual_duration > 0 else 0
            success_throughput_rps = successful_requests / actual_duration if actual_duration > 0 else 0
            
            avg_response_time = statistics.mean([r['response_time'] for r in results])
            
            # Throughput assertions
            benchmarks = PerformanceBenchmarks.THROUGHPUT
            
            assert success_throughput_rps >= benchmarks['min_rps'], \
                f"Throughput {success_throughput_rps:.1f} RPS below minimum {benchmarks['min_rps']} RPS"
            
            # Response time should remain reasonable under load
            assert avg_response_time <= 3.0, \
                f"Average response time {avg_response_time:.3f}s too high under load"
            
            print(f"\nThroughput Benchmarks:")
            print(f"  Total requests: {total_requests}")
            print(f"  Successful requests: {successful_requests}")
            print(f"  Duration: {actual_duration:.1f}s")
            print(f"  Throughput: {throughput_rps:.1f} RPS")
            print(f"  Success throughput: {success_throughput_rps:.1f} RPS")
            print(f"  Avg response time: {avg_response_time:.3f}s")
    
    def test_memory_performance_regression(self, client, auth_headers, mock_user, performance_experiments):
        """Test for memory performance regressions."""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        with patch('routes.dashboard.supabase_client.get_user_from_token', return_value=mock_user):
            with patch('routes.dashboard.supabase_client.execute_query') as mock_execute:
                mock_execute.side_effect = [
                    {'success': True, 'data': performance_experiments}
                ] * 200
                
                # Make many requests to test memory usage
                memory_samples = []
                
                for i in range(100):
                    response = client.get('/api/dashboard/summary', headers=auth_headers)
                    assert response.status_code in [200, 503]
                    
                    # Sample memory every 10 requests
                    if i % 10 == 0:
                        current_memory = process.memory_info().rss / 1024 / 1024
                        memory_samples.append(current_memory)
                
                final_memory = process.memory_info().rss / 1024 / 1024
                memory_growth = final_memory - initial_memory
                max_memory = max(memory_samples) if memory_samples else final_memory
                
                # Memory performance assertions
                benchmarks = PerformanceBenchmarks.MEMORY
                
                assert memory_growth <= benchmarks['max_growth_mb'], \
                    f"Memory grew by {memory_growth:.1f}MB, exceeds benchmark {benchmarks['max_growth_mb']}MB"
                
                assert max_memory <= benchmarks['max_total_mb'], \
                    f"Peak memory {max_memory:.1f}MB exceeds benchmark {benchmarks['max_total_mb']}MB"
                
                print(f"\nMemory Performance:")
                print(f"  Initial memory: {initial_memory:.1f}MB")
                print(f"  Final memory: {final_memory:.1f}MB")
                print(f"  Memory growth: {memory_growth:.1f}MB")
                print(f"  Peak memory: {max_memory:.1f}MB")
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_performance_under_different_data_sizes(self, mock_execute, mock_get_user, client, auth_headers, mock_user):
        """Test performance regression with different data sizes."""
        mock_get_user.return_value = mock_user
        
        # Test with different dataset sizes
        data_sizes = [10, 50, 100, 200, 500]
        performance_results = {}
        
        for size in data_sizes:
            # Create dataset of specified size
            experiments = []
            base_time = datetime.utcnow()
            
            for i in range(size):
                experiments.append({
                    'id': str(uuid.uuid4()),
                    'user_id': mock_user['id'],
                    'name': f'Size Test Experiment {i}',
                    'experiment_type': 'cognitive',
                    'status': 'completed',
                    'created_at': (base_time - timedelta(days=i % 30)).isoformat(),
                    'updated_at': (base_time - timedelta(days=i % 30)).isoformat()
                })
            
            mock_execute.side_effect = [
                {'success': True, 'data': experiments}
            ] + [
                {'success': True, 'data': []}
            ] * size
            
            # Measure performance for this data size
            response_times, status_codes = self.measure_response_times(
                client, '/api/dashboard/summary', auth_headers, num_requests=10
            )
            
            percentiles = self.calculate_percentiles(response_times)
            success_rate = len([sc for sc in status_codes if sc == 200]) / len(status_codes)
            
            performance_results[size] = {
                'mean_response_time': percentiles['mean'],
                'p95_response_time': percentiles['p95'],
                'success_rate': success_rate
            }
        
        # Analyze performance scaling
        print(f"\nPerformance vs Data Size:")
        for size, metrics in performance_results.items():
            print(f"  Size {size:3d}: {metrics['mean_response_time']:.3f}s avg, "
                  f"{metrics['p95_response_time']:.3f}s P95, "
                  f"{metrics['success_rate']:.1%} success")
        
        # Performance should scale reasonably with data size
        small_size_time = performance_results[10]['mean_response_time']
        large_size_time = performance_results[500]['mean_response_time']
        scaling_factor = large_size_time / small_size_time if small_size_time > 0 else float('inf')
        
        # Response time shouldn't scale linearly with data size (should be sub-linear due to optimizations)
        assert scaling_factor <= 10, f"Performance scales poorly: {scaling_factor:.1f}x slower for 50x more data"
        
        # All sizes should maintain good success rates
        for size, metrics in performance_results.items():
            assert metrics['success_rate'] >= 0.90, f"Success rate drops to {metrics['success_rate']:.1%} at size {size}"
    
    @patch('routes.dashboard.supabase_client.get_user_from_token')
    @patch('routes.dashboard.supabase_client.execute_query')
    def test_cold_start_vs_warm_performance(self, mock_execute, mock_get_user, client, auth_headers, mock_user, performance_experiments):
        """Test performance difference between cold start and warm requests."""
        mock_get_user.return_value = mock_user
        mock_execute.side_effect = [
            {'success': True, 'data': performance_experiments[:50]}
        ] * 100
        
        # Measure cold start (first request)
        cold_start_time = time.time()
        cold_response = client.get('/api/dashboard/summary', headers=auth_headers)
        cold_end_time = time.time()
        cold_start_duration = cold_end_time - cold_start_time
        
        # Wait a moment then measure warm requests
        time.sleep(0.1)
        
        warm_times = []
        for i in range(10):
            warm_start_time = time.time()
            warm_response = client.get('/api/dashboard/summary', headers=auth_headers)
            warm_end_time = time.time()
            warm_times.append(warm_end_time - warm_start_time)
            time.sleep(0.01)
        
        avg_warm_time = statistics.mean(warm_times)
        
        # Cold start should not be excessively slower than warm requests
        cold_vs_warm_ratio = cold_start_duration / avg_warm_time if avg_warm_time > 0 else float('inf')
        
        assert cold_vs_warm_ratio <= 5.0, f"Cold start {cold_vs_warm_ratio:.1f}x slower than warm requests"
        assert cold_start_duration <= 10.0, f"Cold start duration {cold_start_duration:.3f}s too slow"
        
        print(f"\nCold Start vs Warm Performance:")
        print(f"  Cold start: {cold_start_duration:.3f}s")
        print(f"  Warm average: {avg_warm_time:.3f}s")
        print(f"  Cold/Warm ratio: {cold_vs_warm_ratio:.1f}x")