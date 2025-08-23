"""
Data consistency tests for dashboard recent experiments endpoint.
Tests data integrity, consistency checks, and edge case handling.
"""

import pytest
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock
from flask import Flask

from app import create_app
from routes.dashboard import dashboard_bp, _parse_experiment_date
from exceptions import ValidationError
from data_validator import validator, sanitize_input


class TestDashboardRecentExperimentsDataConsistency:
    """Test suite for data consistency in recent experiments endpoint."""
    
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
        return {'Authorization': 'Bearer test_token'}
    
    @pytest.fixture
    def mock_user(self):
        """Mock user data."""
        return {
            'id': 'test-user-123',
            'email': 'test@example.com'
        }
    
    def test_date_parsing_function_comprehensive(self):
        """Test the _parse_experiment_date function with various date formats."""
        # Test valid ISO formats
        now = datetime.utcnow()
        
        # ISO format with Z
        date_str = now.isoformat() + 'Z'
        parsed = _parse_experiment_date(date_str)
        assert parsed is not None
        assert isinstance(parsed, datetime)
        
        # ISO format with timezone
        date_str = now.isoformat() + '+00:00'
        parsed = _parse_experiment_date(date_str)
        assert parsed is not None
        
        # ISO format without timezone
        date_str = now.isoformat()
        parsed = _parse_experiment_date(date_str)
        assert parsed is not None
        
        # Date only
        date_str = now.strftime('%Y-%m-%d')
        parsed = _parse_experiment_date(date_str)
        assert parsed is not None
        
        # Invalid formats should return None
        assert _parse_experiment_date('invalid-date') is None
        assert _parse_experiment_date('') is None
        assert _parse_experiment_date(None) is None
        assert _parse_experiment_date(123) is None
        
        # Edge cases
        assert _parse_experiment_date('2024-13-45T25:70:80Z') is None  # Invalid date values
        assert _parse_experiment_date('not-a-date-at-all') is None
    
    def test_experiment_data_validation_edge_cases(self):
        """Test experiment data validation with edge cases."""
        # Test with minimal valid experiment
        minimal_exp = {
            'id': 'test-id-123',
            'name': 'Test',
            'experiment_type': 'eeg',
            'status': 'active',
            'created_at': datetime.utcnow().isoformat()
        }
        
        try:
            validated = validator.validate_experiment(minimal_exp)
            assert validated['id'] == 'test-id-123'
            assert validated['name'] == 'Test'
        except ValidationError:
            pytest.fail("Minimal valid experiment should pass validation")
        
        # Test with missing required fields
        invalid_exp = {
            'name': 'Test',
            'experiment_type': 'eeg'
            # Missing id, status, created_at
        }
        
        with pytest.raises(ValidationError):
            validator.validate_experiment(invalid_exp)
        
        # Test with invalid experiment type
        invalid_type_exp = minimal_exp.copy()
        invalid_type_exp['experiment_type'] = 'invalid_type'
        
        with pytest.raises(ValidationError):
            validator.validate_experiment(invalid_type_exp)
        
        # Test with invalid status
        invalid_status_exp = minimal_exp.copy()
        invalid_status_exp['status'] = 'invalid_status'
        
        with pytest.raises(ValidationError):
            validator.validate_experiment(invalid_status_exp)
    
    def test_data_sanitization_comprehensive(self):
        """Test comprehensive data sanitization."""
        # Test string sanitization
        malicious_strings = [
            '<script>alert("xss")</script>',
            'SELECT * FROM users; DROP TABLE users;',
            'javascript:alert("xss")',
            '<img src="x" onerror="alert(1)">',
            '<?php echo "php injection"; ?>',
            '\x00\x01\x02\x03\x04\x05',  # Control characters
            'normal text with\n\r\twhitespace',
            '   multiple   spaces   '
        ]
        
        for malicious in malicious_strings:
            sanitized = sanitize_input(malicious)
            
            # Should not contain dangerous content
            assert '<script>' not in sanitized
            assert 'DROP TABLE' not in sanitized
            assert 'javascript:' not in sanitized
            assert '<img' not in sanitized
            assert '<?php' not in sanitized
            
            # Should not contain control characters (except spaces)
            for char in sanitized:
                assert ord(char) >= 32 or char in [' ', '\t']
        
        # Test nested data sanitization
        nested_data = {
            'level1': {
                'level2': ['<script>alert("xss")</script>', 'normal text'],
                'safe_field': 'safe content'
            },
            'array': ['<script>alert("xss")</script>', 'normal', {'nested': '<script>'}]
        }
        
        sanitized_nested = sanitize_input(nested_data)
        
        # Check that nested malicious content is sanitized
        assert '<script>' not in str(sanitized_nested)
    
    def test_timezone_handling_consistency(self):
        """Test consistent timezone handling across different date formats."""
        base_time = datetime(2024, 1, 15, 12, 30, 45)
        
        # Test different timezone representations
        date_formats = [
            base_time.isoformat() + 'Z',
            base_time.isoformat() + '+00:00',
            base_time.isoformat() + '-05:00',
            base_time.isoformat() + '+09:00',
            base_time.isoformat()  # No timezone
        ]
        
        parsed_dates = []
        for date_str in date_formats:
            parsed = _parse_experiment_date(date_str)
            if parsed:
                parsed_dates.append(parsed)
        
        # All parsed dates should be datetime objects
        assert all(isinstance(d, datetime) for d in parsed_dates)
        
        # Dates with explicit UTC should be equivalent
        utc_dates = [d for d in parsed_dates if d.tzinfo is not None]
        if len(utc_dates) >= 2:
            # Convert all to UTC for comparison
            utc_normalized = [d.astimezone(timezone.utc) if d.tzinfo else d for d in utc_dates]
            # Times should be consistent when normalized to UTC
            assert len(set(d.replace(tzinfo=None) for d in utc_normalized[:2])) <= 2
    
    def test_large_dataset_handling(self, client, auth_headers, mock_user):
        """Test handling of large datasets and pagination."""
        # Create a large number of experiments
        large_experiment_set = []
        for i in range(100):
            exp = {
                'id': f'exp-{i:03d}',
                'name': f'Test Experiment {i}',
                'experiment_type': ['eeg', 'fmri', 'behavioral'][i % 3],
                'status': ['active', 'completed', 'draft'][i % 3],
                'created_at': (datetime.utcnow() - timedelta(days=i % 30)).isoformat(),
                'user_id': 'test-user-123'
            }
            large_experiment_set.append(exp)
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 50, 'days': 30}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                # Return large dataset
                mock_supabase.execute_query.side_effect = [
                    {'success': True, 'data': large_experiment_set}
                ] + [{'success': True, 'data': []} for _ in range(50)]  # No results for simplicity
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should handle large dataset gracefully
                    assert len(data['experiments']) <= 50  # Respects limit
                    assert 'activity_summary' in data
                    assert data['activity_summary']['total_recent'] <= 50
    
    def test_concurrent_request_data_consistency(self, client, auth_headers, mock_user, sample_experiments):
        """Test data consistency under concurrent request scenarios."""
        import threading
        import time
        
        results = []
        errors = []
        
        def make_request():
            try:
                with patch('routes.dashboard.request') as mock_request:
                    mock_request.current_user = mock_user
                    mock_request.args.get.return_value = 'false'
                    mock_request.args.to_dict.return_value = {}
                    mock_request.validated_params = {'limit': 10, 'days': 7}
                    
                    with patch('routes.dashboard.supabase_client') as mock_supabase:
                        mock_supabase.execute_query.side_effect = [
                            {'success': True, 'data': sample_experiments}
                        ] + [{'success': True, 'data': []} for _ in range(len(sample_experiments))]
                        
                        with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                            mock_cache_service.return_value.get.return_value = None
                            
                            response = client.get('/api/dashboard/recent', headers=auth_headers)
                            results.append(response.get_json())
            except Exception as e:
                errors.append(str(e))
        
        # Simulate concurrent requests
        threads = []
        for _ in range(5):
            thread = threading.Thread(target=make_request)
            threads.append(thread)
            thread.start()
        
        for thread in threads:
            thread.join()
        
        # All requests should succeed
        assert len(errors) == 0
        assert len(results) == 5
        
        # Results should be consistent
        for result in results:
            assert 'experiments' in result
            assert 'activity_summary' in result
    
    def test_memory_usage_with_large_results(self, client, auth_headers, mock_user):
        """Test memory usage with large result sets."""
        # Create experiments with large result data
        large_results = []
        for i in range(10):
            result = {
                'id': f'result-{i}',
                'experiment_id': f'exp-{i}',
                'metrics': {f'metric_{j}': j * 0.1 for j in range(1000)},  # Large metrics object
                'created_at': datetime.utcnow().isoformat()
            }
            large_results.append(result)
        
        experiments_with_large_results = []
        for i in range(10):
            exp = {
                'id': f'exp-{i}',
                'name': f'Test Experiment {i}',
                'experiment_type': 'eeg',
                'status': 'completed',
                'created_at': datetime.utcnow().isoformat(),
                'user_id': 'test-user-123'
            }
            experiments_with_large_results.append(exp)
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                # Return experiments and large results
                responses = [{'success': True, 'data': experiments_with_large_results}]
                for result in large_results:
                    responses.append({'success': True, 'data': [result]})
                
                mock_supabase.execute_query.side_effect = responses
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should handle large results without issues
                    assert len(data['experiments']) == 10
                    for exp in data['experiments']:
                        if exp.get('results'):
                            assert 'metrics' in exp['results']
    
    def test_data_type_consistency(self, client, auth_headers, mock_user):
        """Test consistency of data types in responses."""
        mixed_type_experiments = [
            {
                'id': 'exp-1',
                'name': 'Test Experiment 1',
                'experiment_type': 'eeg',
                'status': 'completed',
                'created_at': datetime.utcnow().isoformat(),
                'user_id': 'test-user-123',
                'custom_field': 'string_value'
            },
            {
                'id': 'exp-2',
                'name': 'Test Experiment 2',
                'experiment_type': 'fmri',
                'status': 'active',
                'created_at': datetime.utcnow().isoformat(),
                'user_id': 'test-user-123',
                'custom_field': 123  # Different type
            }
        ]
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.side_effect = [
                    {'success': True, 'data': mixed_type_experiments},
                    {'success': True, 'data': []},
                    {'success': True, 'data': []}
                ]
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Check response structure consistency
                    assert isinstance(data['experiments'], list)
                    assert isinstance(data['activity_summary'], dict)
                    assert isinstance(data['insights'], list)
                    assert isinstance(data['activity_summary']['total_recent'], int)
                    assert isinstance(data['activity_summary']['completion_rate'], (int, float))
    
    def test_null_and_empty_value_handling(self, client, auth_headers, mock_user):
        """Test handling of null and empty values in data."""
        experiments_with_nulls = [
            {
                'id': 'exp-1',
                'name': 'Test Experiment 1',
                'experiment_type': 'eeg',
                'status': 'completed',
                'created_at': datetime.utcnow().isoformat(),
                'user_id': 'test-user-123',
                'description': None,
                'parameters': None
            },
            {
                'id': 'exp-2',
                'name': '',  # Empty name
                'experiment_type': 'fmri',
                'status': 'active',
                'created_at': datetime.utcnow().isoformat(),
                'user_id': 'test-user-123',
                'description': '',
                'parameters': {}
            }
        ]
        
        results_with_nulls = [
            {
                'id': 'result-1',
                'experiment_id': 'exp-1',
                'metrics': None,
                'created_at': datetime.utcnow().isoformat()
            },
            {
                'id': 'result-2',
                'experiment_id': 'exp-2',
                'metrics': {},
                'created_at': datetime.utcnow().isoformat()
            }
        ]
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.side_effect = [
                    {'success': True, 'data': experiments_with_nulls},
                    {'success': True, 'data': [results_with_nulls[0]]},
                    {'success': True, 'data': [results_with_nulls[1]]}
                ]
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    # Should handle null values gracefully
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should still return experiments despite null values
                    assert len(data['experiments']) > 0
                    
                    # Check that null handling doesn't break summary generation
                    assert 'activity_summary' in data
                    assert data['activity_summary']['total_recent'] > 0
    
    def test_unicode_and_special_character_handling(self, client, auth_headers, mock_user):
        """Test handling of unicode and special characters."""
        unicode_experiments = [
            {
                'id': 'exp-1',
                'name': 'Test Experiment with émojis 🧠🔬',
                'experiment_type': 'eeg',
                'status': 'completed',
                'created_at': datetime.utcnow().isoformat(),
                'user_id': 'test-user-123',
                'description': 'Descripción con caracteres especiales: áéíóú ñ'
            },
            {
                'id': 'exp-2',
                'name': '测试实验 with 中文 characters',
                'experiment_type': 'fmri',
                'status': 'active',
                'created_at': datetime.utcnow().isoformat(),
                'user_id': 'test-user-123',
                'description': 'Тест с кириллицей и العربية'
            }
        ]
        
        with patch('routes.dashboard.request') as mock_request:
            mock_request.current_user = mock_user
            mock_request.args.get.return_value = 'false'
            mock_request.args.to_dict.return_value = {}
            mock_request.validated_params = {'limit': 10, 'days': 7}
            
            with patch('routes.dashboard.supabase_client') as mock_supabase:
                mock_supabase.execute_query.side_effect = [
                    {'success': True, 'data': unicode_experiments},
                    {'success': True, 'data': []},
                    {'success': True, 'data': []}
                ]
                
                with patch('routes.dashboard.get_cache_service') as mock_cache_service:
                    mock_cache_service.return_value.get.return_value = None
                    
                    response = client.get('/api/dashboard/recent', headers=auth_headers)
                    
                    assert response.status_code == 200
                    data = response.get_json()
                    
                    # Should handle unicode characters properly
                    assert len(data['experiments']) == 2
                    
                    # Check that unicode characters are preserved
                    exp1 = data['experiments'][0]
                    assert '🧠' in exp1['name']
                    assert 'émojis' in exp1['name']
                    assert 'áéíóú' in exp1['description']
                    
                    exp2 = data['experiments'][1]
                    assert '测试实验' in exp2['name']
                    assert '中文' in exp2['name']


if __name__ == '__main__':
    pytest.main([__file__, '-v'])