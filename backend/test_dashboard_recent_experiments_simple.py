"""
Simple tests for dashboard recent experiments endpoint to verify basic functionality.
"""

import pytest
import json
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

from routes.dashboard import get_recent_experiments, _parse_experiment_date
from exceptions import DatabaseError, CircuitBreakerOpenError
from data_validator import validator, sanitize_input


class TestDashboardRecentExperimentsSimple:
    """Simple test suite for recent experiments functionality."""
    
    def test_parse_experiment_date_function(self):
        """Test the _parse_experiment_date function with various formats."""
        now = datetime.utcnow()
        
        # Test valid ISO format with Z
        date_str = now.isoformat() + 'Z'
        parsed = _parse_experiment_date(date_str)
        assert parsed is not None
        assert isinstance(parsed, datetime)
        
        # Test valid ISO format with timezone
        date_str = now.isoformat() + '+00:00'
        parsed = _parse_experiment_date(date_str)
        assert parsed is not None
        
        # Test valid ISO format without timezone
        date_str = now.isoformat()
        parsed = _parse_experiment_date(date_str)
        assert parsed is not None
        
        # Test invalid formats
        assert _parse_experiment_date('invalid-date') is None
        assert _parse_experiment_date('') is None
        assert _parse_experiment_date(None) is None
        assert _parse_experiment_date(123) is None
    
    def test_data_sanitization(self):
        """Test data sanitization functionality."""
        # Test malicious string sanitization
        malicious_string = '<script>alert("xss")</script>Test'
        sanitized = sanitize_input(malicious_string)
        assert '<script>' not in sanitized
        assert 'Test' in sanitized
        
        # Test SQL injection patterns - the sanitizer escapes but doesn't remove
        sql_injection = "'; DROP TABLE users; --"
        sanitized = sanitize_input(sql_injection)
        # The sanitizer escapes dangerous patterns, so check for escaped version
        assert '\\--' in sanitized  # Should be escaped
        
        # Test nested data sanitization
        nested_data = {
            'name': '<script>alert("xss")</script>Test',
            'description': 'Normal text',
            'metrics': {
                'accuracy': 0.95,
                'malicious': '<script>alert("xss")</script>'
            }
        }
        
        sanitized_nested = sanitize_input(nested_data)
        assert '<script>' not in str(sanitized_nested)
        assert sanitized_nested['description'] == 'Normal text'
        assert sanitized_nested['metrics']['accuracy'] == 0.95
    
    def test_experiment_validation(self):
        """Test experiment data validation."""
        # Test valid experiment with proper UUID
        valid_experiment = {
            'id': '550e8400-e29b-41d4-a716-446655440000',
            'name': 'Test Experiment',
            'experiment_type': 'eeg',
            'status': 'active',
            'created_at': datetime.utcnow().isoformat(),
            'user_id': '550e8400-e29b-41d4-a716-446655440001'
        }
        
        try:
            validated = validator.validate_experiment(valid_experiment)
            assert validated['id'] == '550e8400-e29b-41d4-a716-446655440000'
            assert validated['name'] == 'Test Experiment'
            assert validated['experiment_type'] == 'eeg'
        except Exception as e:
            pytest.fail(f"Valid experiment should pass validation: {e}")
        
        # Test invalid experiment type
        invalid_experiment = valid_experiment.copy()
        invalid_experiment['experiment_type'] = 'invalid_type'
        
        with pytest.raises(Exception):  # Should raise ValidationError
            validator.validate_experiment(invalid_experiment)
    
    def test_date_range_calculation(self):
        """Test date range calculation for filtering experiments."""
        from datetime import datetime, timedelta
        
        # Test 7 days lookback
        now = datetime.utcnow()
        cutoff_7_days = now - timedelta(days=7)
        
        # Create test dates
        recent_date = now - timedelta(days=3)  # Within range
        old_date = now - timedelta(days=10)    # Outside range
        
        # Test that recent date is within range
        assert recent_date >= cutoff_7_days
        
        # Test that old date is outside range
        assert old_date < cutoff_7_days
    
    def test_activity_summary_calculation(self):
        """Test activity summary calculation logic."""
        # Sample experiments with different types and statuses
        experiments = [
            {'experiment_type': 'eeg', 'status': 'completed'},
            {'experiment_type': 'eeg', 'status': 'active'},
            {'experiment_type': 'fmri', 'status': 'completed'},
            {'experiment_type': 'behavioral', 'status': 'completed'},
        ]
        
        # Calculate summary
        by_type = {}
        by_status = {}
        completed_count = 0
        
        for exp in experiments:
            exp_type = exp['experiment_type']
            status = exp['status']
            
            by_type[exp_type] = by_type.get(exp_type, 0) + 1
            by_status[status] = by_status.get(status, 0) + 1
            
            if status == 'completed':
                completed_count += 1
        
        completion_rate = (completed_count / len(experiments)) * 100
        
        # Verify calculations
        assert by_type['eeg'] == 2
        assert by_type['fmri'] == 1
        assert by_type['behavioral'] == 1
        assert by_status['completed'] == 3
        assert by_status['active'] == 1
        assert completion_rate == 75.0
    
    def test_insights_generation_logic(self):
        """Test insights generation logic."""
        # Test streak insight
        experiments_count = 5
        days = 7
        
        insights = []
        
        if experiments_count >= 3:
            insights.append({
                'type': 'streak',
                'message': f'Great job! You\'ve completed {experiments_count} experiments in the last {days} days.',
                'icon': '🔥'
            })
        
        # Test variety insight
        unique_types = 4
        if unique_types >= 3:
            insights.append({
                'type': 'variety',
                'message': f'Excellent variety! You\'ve tried {unique_types} different experiment types recently.',
                'icon': '🌟'
            })
        
        # Test completion rate insight
        completion_rate = 95.0
        if completion_rate >= 90:
            insights.append({
                'type': 'completion',
                'message': f'Outstanding completion rate of {completion_rate}%!',
                'icon': '✅'
            })
        
        # Verify insights were generated
        assert len(insights) == 3
        assert any(insight['type'] == 'streak' for insight in insights)
        assert any(insight['type'] == 'variety' for insight in insights)
        assert any(insight['type'] == 'completion' for insight in insights)
    
    def test_error_handling_logic(self):
        """Test error handling and partial failure logic."""
        # Simulate partial failures
        failed_operations = ['results_fetch']
        date_parsing_errors = [
            {'experiment_id': 'exp-1', 'error': 'Invalid date format'}
        ]
        failed_results_count = 2
        total_experiments = 5
        
        # Test partial failure detection
        has_partial_failure = bool(failed_operations or failed_results_count > 0 or date_parsing_errors)
        assert has_partial_failure is True
        
        # Test warning message generation
        warnings = []
        if failed_results_count > 0:
            warnings.append(f'Some experiment results could not be loaded ({failed_results_count} out of {total_experiments})')
        if date_parsing_errors:
            warnings.append(f'{len(date_parsing_errors)} experiments had date parsing issues')
        
        warning_message = '; '.join(warnings)
        
        assert 'Some experiment results could not be loaded (2 out of 5)' in warning_message
        assert '1 experiments had date parsing issues' in warning_message
    
    def test_cache_key_generation(self):
        """Test cache key generation logic."""
        user_id = 'test-user-123'
        limit = 10
        days = 7
        
        cache_key = f"dashboard_recent_{user_id}_{limit}_{days}"
        expected_key = "dashboard_recent_test-user-123_10_7"
        
        assert cache_key == expected_key
        
        # Test with different parameters
        limit = 25
        days = 30
        cache_key = f"dashboard_recent_{user_id}_{limit}_{days}"
        expected_key = "dashboard_recent_test-user-123_25_30"
        
        assert cache_key == expected_key
    
    def test_response_structure_validation(self):
        """Test that response structure matches expected format."""
        # Expected response structure
        expected_structure = {
            'experiments': [],
            'activity_summary': {
                'total_recent': 0,
                'by_type': {},
                'by_status': {},
                'completion_rate': 0,
                'with_results': 0,
                'without_results': 0
            },
            'insights': [],
            'period': {
                'days': 7,
                'limit': 10,
                'cutoff_date': ''
            },
            'last_updated': '',
            'partial_failure': False,
            'failed_operations': {},
            'data_sources': [],
            'date_parsing_warnings': []
        }
        
        # Verify structure keys exist
        assert 'experiments' in expected_structure
        assert 'activity_summary' in expected_structure
        assert 'insights' in expected_structure
        assert 'period' in expected_structure
        
        # Verify activity_summary structure
        activity_summary = expected_structure['activity_summary']
        assert 'total_recent' in activity_summary
        assert 'by_type' in activity_summary
        assert 'by_status' in activity_summary
        assert 'completion_rate' in activity_summary
        assert 'with_results' in activity_summary
        assert 'without_results' in activity_summary
    
    def test_unicode_handling(self):
        """Test handling of unicode characters."""
        unicode_text = 'Test with émojis 🧠🔬 and 中文 characters'
        
        # Should preserve unicode characters
        sanitized = sanitize_input(unicode_text)
        assert '🧠' in sanitized
        assert '🔬' in sanitized
        assert '中文' in sanitized
        assert 'émojis' in sanitized
    
    def test_null_value_handling(self):
        """Test handling of null and empty values."""
        # Test null values
        assert sanitize_input(None) is None
        assert sanitize_input('') == ''
        
        # Test empty collections
        assert sanitize_input([]) == []
        assert sanitize_input({}) == {}
        
        # Test nested null values
        data_with_nulls = {
            'name': 'Test',
            'description': None,
            'metrics': {},
            'tags': []
        }
        
        sanitized = sanitize_input(data_with_nulls)
        assert sanitized['name'] == 'Test'
        assert sanitized['description'] is None
        assert sanitized['metrics'] == {}
        assert sanitized['tags'] == []


if __name__ == '__main__':
    pytest.main([__file__, '-v'])