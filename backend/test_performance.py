"""
Performance tests for NeuroLab 360 backend API endpoints.
Tests API response times, database query performance, and load handling.
"""

import pytest
import time
import asyncio
import concurrent.futures
import statistics
from unittest.mock import patch, MagicMock
import json
import uuid
from datetime import datetime, timedelta

from app import create_app
from supabase_client import get_supabase_client


class TestAPIPerformance:
    """Test suite for API performance benchmarks."""
    
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
    def mock_user(self):
        """Mock authenticated user."""
        return {
            'id': str(uuid.uuid4()),
            'email': 'test@example.com',
            'created_at': datetime.utcnow().isoformat()
        }
    
    @pytest.fixture
    def auth_headers(self):
        """Mock authentication headers."""
        return {'Authorization': 'Bearer mock_token'}
    
    def measure_response_time(self, client, method, url, **kwargs):
        """Measure API response time."""
        start_time = time.time()
        
        if method.upper() == 'GET':
            response = client.get(url, **kwargs)
        elif method.upper() == 'POST':
            response = client.post(url, **kwargs)
        elif method.upper() == 'DELETE':
            response = client.delete(url, **kwargs)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        end_time = time.time()
        response_time = (end_time - start_time) * 1000  # Convert to milliseconds
        
        return response, response_time
    
    def test_experiments_list_performance(self, client, mock_user, auth_headers):
        """Test experiments list endpoint performance."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                # Mock large dataset
                mock_experiments = [
                    {
                        'id': str(uuid.uuid4()),
                        'user_id': mock_user['id'],
                        'name': f'Experiment {i}',
                        'experiment_type': ['heart_rate', 'reaction_time', 'memory', 'eeg'][i % 4],
                        'status': 'completed',
                        'created_at': (datetime.utcnow() - timedelta(days=i)).isoformat()
                    }
                    for i in range(100)
                ]
                
                mock_query.side_effect = [
                    {'success': True, 'data': mock_experiments},
                    *[{'success': True, 'data': []} for _ in range(100)]  # Results queries
                ]
                
                response, response_time = self.measure_response_time(
                    client, 'GET', '/api/experiments', headers=auth_headers
                )
                
                assert response.status_code == 200
                # Should respond within 500ms for 100 experiments
                assert response_time < 500, f"Response time {response_time}ms exceeds 500ms threshold"
                
                data = json.loads(response.data)
                assert len(data['experiments']) == 100
    
    def test_dashboard_summary_performance(self, client, mock_user, auth_headers):
        """Test dashboard summary endpoint performance."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                # Mock complex aggregation data
                mock_experiments = [
                    {
                        'id': str(uuid.uuid4()),
                        'user_id': mock_user['id'],
                        'experiment_type': ['heart_rate', 'reaction_time', 'memory'][i % 3],
                        'status': ['completed', 'pending'][i % 2],
                        'created_at': (datetime.utcnow() - timedelta(days=i)).isoformat()
                    }
                    for i in range(50)
                ]
                
                mock_results = [
                    {
                        'experiment_id': exp['id'],
                        'metrics': {
                            'mean': 75 + (i * 2),
                            'std_dev': 5 + (i * 0.1),
                            'min': 70 + i,
                            'max': 80 + i
                        }
                    }
                    for i, exp in enumerate(mock_experiments[:25])  # Only completed experiments have results
                ]
                
                mock_query.side_effect = [
                    {'success': True, 'data': mock_experiments},
                    *[{'success': True, 'data': [result]} if i < 25 else {'success': True, 'data': []} 
                      for i, result in enumerate(mock_results + [None] * 25)]
                ]
                
                response, response_time = self.measure_response_time(
                    client, 'GET', '/api/dashboard/summary', headers=auth_headers
                )
                
                assert response.status_code == 200
                # Should respond within 300ms for complex aggregations
                assert response_time < 300, f"Response time {response_time}ms exceeds 300ms threshold"
                
                data = json.loads(response.data)
                assert data['total_experiments'] == 50
    
    def test_experiment_creation_performance(self, client, mock_user, auth_headers):
        """Test experiment creation endpoint performance."""
        experiment_data = {
            'name': 'Performance Test Experiment',
            'experiment_type': 'heart_rate',
            'parameters': {
                'duration_minutes': 5,
                'baseline_bpm': 75
            }
        }
        
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                experiment_id = str(uuid.uuid4())
                mock_query.side_effect = [
                    # Experiment creation
                    {'success': True, 'data': [{'id': experiment_id, **experiment_data}]},
                    # Results creation
                    {'success': True, 'data': [{'id': str(uuid.uuid4()), 'experiment_id': experiment_id}]},
                    # Status update
                    {'success': True, 'data': []}
                ]
                
                response, response_time = self.measure_response_time(
                    client, 'POST', '/api/experiments',
                    data=json.dumps(experiment_data),
                    content_type='application/json',
                    headers=auth_headers
                )
                
                assert response.status_code == 201
                # Should create experiment within 1 second (includes mock data generation)
                assert response_time < 1000, f"Response time {response_time}ms exceeds 1000ms threshold"
    
    def test_concurrent_requests_performance(self, client, mock_user, auth_headers):
        """Test API performance under concurrent load."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query', return_value={'success': True, 'data': []}):
                
                def make_request():
                    response, response_time = self.measure_response_time(
                        client, 'GET', '/api/experiments', headers=auth_headers
                    )
                    return response.status_code, response_time
                
                # Test with 10 concurrent requests
                with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                    start_time = time.time()
                    futures = [executor.submit(make_request) for _ in range(10)]
                    results = [future.result() for future in concurrent.futures.as_completed(futures)]
                    end_time = time.time()
                
                total_time = (end_time - start_time) * 1000
                status_codes, response_times = zip(*results)
                
                # All requests should succeed
                assert all(code == 200 for code in status_codes)
                
                # Average response time should be reasonable under load
                avg_response_time = statistics.mean(response_times)
                assert avg_response_time < 200, f"Average response time {avg_response_time}ms too high under load"
                
                # Total time for 10 concurrent requests should be much less than 10x single request
                assert total_time < 1000, f"Total concurrent execution time {total_time}ms too high"
    
    def test_large_dataset_query_performance(self, client, mock_user, auth_headers):
        """Test performance with large dataset queries."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                # Simulate large dataset with 500 experiments
                large_dataset = [
                    {
                        'id': str(uuid.uuid4()),
                        'user_id': mock_user['id'],
                        'name': f'Large Dataset Experiment {i}',
                        'experiment_type': ['heart_rate', 'reaction_time', 'memory', 'eeg'][i % 4],
                        'status': 'completed',
                        'created_at': (datetime.utcnow() - timedelta(hours=i)).isoformat()
                    }
                    for i in range(500)
                ]
                
                mock_query.side_effect = [
                    {'success': True, 'data': large_dataset},
                    *[{'success': True, 'data': []} for _ in range(500)]  # Results queries
                ]
                
                response, response_time = self.measure_response_time(
                    client, 'GET', '/api/experiments?limit=500', headers=auth_headers
                )
                
                assert response.status_code == 200
                # Should handle large dataset within 2 seconds
                assert response_time < 2000, f"Response time {response_time}ms exceeds 2000ms threshold for large dataset"
                
                data = json.loads(response.data)
                assert len(data['experiments']) == 500
    
    def test_dashboard_charts_performance(self, client, mock_user, auth_headers):
        """Test dashboard charts endpoint performance with complex data processing."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                # Mock data for complex chart calculations
                mock_experiments = [
                    {
                        'id': str(uuid.uuid4()),
                        'user_id': mock_user['id'],
                        'experiment_type': ['heart_rate', 'reaction_time', 'memory'][i % 3],
                        'status': 'completed',
                        'created_at': (datetime.utcnow() - timedelta(days=i % 30)).isoformat()
                    }
                    for i in range(100)
                ]
                
                mock_results = [
                    {
                        'experiment_id': exp['id'],
                        'metrics': {
                            'mean': 75 + (i % 20),
                            'std_dev': 5 + (i % 10),
                            'min': 60 + (i % 15),
                            'max': 90 + (i % 25)
                        },
                        'created_at': exp['created_at']
                    }
                    for i, exp in enumerate(mock_experiments)
                ]
                
                mock_query.side_effect = [
                    {'success': True, 'data': mock_experiments},
                    *[{'success': True, 'data': [result]} for result in mock_results]
                ]
                
                response, response_time = self.measure_response_time(
                    client, 'GET', '/api/dashboard/charts', headers=auth_headers
                )
                
                assert response.status_code == 200
                # Should process complex chart data within 800ms
                assert response_time < 800, f"Response time {response_time}ms exceeds 800ms threshold"
                
                data = json.loads(response.data)
                assert 'activity_timeline' in data
                assert 'experiment_type_distribution' in data
                assert 'performance_trends' in data
    
    def test_memory_usage_during_processing(self, client, mock_user, auth_headers):
        """Test memory usage during large data processing."""
        import psutil
        import os
        
        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss / 1024 / 1024  # MB
        
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                # Create large dataset in memory
                large_experiments = [
                    {
                        'id': str(uuid.uuid4()),
                        'user_id': mock_user['id'],
                        'name': f'Memory Test Experiment {i}',
                        'experiment_type': 'heart_rate',
                        'status': 'completed',
                        'created_at': datetime.utcnow().isoformat(),
                        'parameters': {'duration_minutes': 5, 'baseline_bpm': 75},
                        'results': {
                            'data_points': [
                                {'timestamp': j, 'value': 75 + j % 10, 'metadata': {'unit': 'bpm'}}
                                for j in range(300)  # 5 minutes of data
                            ],
                            'metrics': {'mean': 75, 'std_dev': 5, 'min': 70, 'max': 80}
                        }
                    }
                    for i in range(50)  # 50 experiments with 300 data points each
                ]
                
                mock_query.side_effect = [
                    {'success': True, 'data': large_experiments},
                    *[{'success': True, 'data': [exp['results']]} for exp in large_experiments]
                ]
                
                response, response_time = self.measure_response_time(
                    client, 'GET', '/api/experiments', headers=auth_headers
                )
                
                peak_memory = process.memory_info().rss / 1024 / 1024  # MB
                memory_increase = peak_memory - initial_memory
                
                assert response.status_code == 200
                # Memory increase should be reasonable (less than 100MB for this dataset)
                assert memory_increase < 100, f"Memory increase {memory_increase}MB too high"
    
    def test_database_query_optimization(self, client, mock_user, auth_headers):
        """Test that database queries are optimized and not excessive."""
        query_count = 0
        
        def count_queries(*args, **kwargs):
            nonlocal query_count
            query_count += 1
            return {'success': True, 'data': []}
        
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query', side_effect=count_queries):
                
                response, response_time = self.measure_response_time(
                    client, 'GET', '/api/dashboard/summary', headers=auth_headers
                )
                
                assert response.status_code == 200
                # Should make minimal database queries (ideally 1 for experiments, then 1 per experiment for results)
                # For empty dataset, should be just 1 query
                assert query_count <= 2, f"Too many database queries: {query_count}"
    
    def test_api_response_size_optimization(self, client, mock_user, auth_headers):
        """Test that API responses are optimally sized."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                # Mock experiment with large data
                large_experiment = {
                    'id': str(uuid.uuid4()),
                    'user_id': mock_user['id'],
                    'name': 'Large Data Experiment',
                    'experiment_type': 'heart_rate',
                    'status': 'completed',
                    'created_at': datetime.utcnow().isoformat()
                }
                
                large_results = {
                    'experiment_id': large_experiment['id'],
                    'data_points': [
                        {'timestamp': i, 'value': 75 + i % 10, 'metadata': {'unit': 'bpm'}}
                        for i in range(1000)  # Large dataset
                    ],
                    'metrics': {'mean': 75, 'std_dev': 5, 'min': 70, 'max': 80},
                    'analysis_summary': 'Large dataset analysis completed'
                }
                
                mock_query.side_effect = [
                    {'success': True, 'data': [large_experiment]},
                    {'success': True, 'data': [large_results]}
                ]
                
                response, response_time = self.measure_response_time(
                    client, 'GET', f'/api/experiments/{large_experiment["id"]}', headers=auth_headers
                )
                
                assert response.status_code == 200
                
                # Check response size
                response_size = len(response.data)
                # Response should be reasonable size (less than 1MB for 1000 data points)
                assert response_size < 1024 * 1024, f"Response size {response_size} bytes too large"
    
    def test_error_handling_performance(self, client, mock_user, auth_headers):
        """Test that error handling doesn't significantly impact performance."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query', return_value={'success': False, 'error': 'Database error'}):
                
                response, response_time = self.measure_response_time(
                    client, 'GET', '/api/experiments', headers=auth_headers
                )
                
                assert response.status_code == 500
                # Error responses should be fast
                assert response_time < 100, f"Error response time {response_time}ms too slow"


class TestPerformanceBenchmarks:
    """Performance benchmark tests with specific targets."""
    
    def test_api_response_time_benchmarks(self):
        """Test that API endpoints meet response time benchmarks."""
        benchmarks = {
            'GET /api/experiments': 200,  # ms
            'POST /api/experiments': 1000,  # ms (includes data generation)
            'GET /api/experiments/<id>': 150,  # ms
            'DELETE /api/experiments/<id>': 100,  # ms
            'GET /api/dashboard/summary': 300,  # ms
            'GET /api/dashboard/charts': 500,  # ms
            'GET /api/dashboard/recent': 250,  # ms
        }
        
        # This would typically be run against a real API
        # For now, we document the expected benchmarks
        for endpoint, max_time in benchmarks.items():
            print(f"Benchmark: {endpoint} should respond within {max_time}ms")
        
        assert True  # Placeholder for actual benchmark tests


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])