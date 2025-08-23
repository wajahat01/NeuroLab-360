"""
Tests for data validation and sanitization functionality.
Tests edge cases, malformed data, and validation rules.
"""

import pytest
import uuid
from datetime import datetime, timedelta
from data_validator import DataValidator, ValidationError, sanitize_input

class TestDataValidator:
    """Test cases for DataValidator class."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.validator = DataValidator()
    
    def test_validate_uuid_valid(self):
        """Test UUID validation with valid UUIDs."""
        valid_uuid = str(uuid.uuid4())
        result = self.validator.validate_uuid(valid_uuid)
        assert result == valid_uuid.lower()
    
    def test_validate_uuid_invalid_format(self):
        """Test UUID validation with invalid formats."""
        invalid_uuids = [
            ("not-a-uuid", "Invalid id format"),
            ("12345678-1234-1234-1234-12345678901", "Invalid id format"),  # Too short
            ("12345678-1234-1234-1234-1234567890123", "Invalid id format"),  # Too long
            ("xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", "Invalid id format"),  # Invalid characters
            ("", "Missing required field"),
            (None, "Missing required field"),
            (123, "Invalid id format")
        ]
        
        for invalid_uuid, expected_error in invalid_uuids:
            with pytest.raises(ValidationError) as exc_info:
                self.validator.validate_uuid(invalid_uuid)
            assert expected_error in str(exc_info.value)
    
    def test_validate_string_valid(self):
        """Test string validation with valid inputs."""
        test_cases = [
            ("Hello World", "Hello World"),
            ("  Trimmed  ", "Trimmed"),
            ("Multiple   spaces", "Multiple spaces"),
            ("", None)  # Empty string when not required
        ]
        
        for input_str, expected in test_cases:
            if expected is None:
                result = self.validator.validate_string(input_str, "test", required=False)
                assert result is None
            else:
                result = self.validator.validate_string(input_str, "test")
                assert result == expected
    
    def test_validate_string_invalid(self):
        """Test string validation with invalid inputs."""
        # Test required field missing
        with pytest.raises(ValidationError) as exc_info:
            self.validator.validate_string(None, "test", required=True)
        assert "Missing required field" in str(exc_info.value)
        
        # Test non-string input
        with pytest.raises(ValidationError) as exc_info:
            self.validator.validate_string(123, "test")
        assert "must be string" in str(exc_info.value)
        
        # Test length constraints
        with pytest.raises(ValidationError) as exc_info:
            self.validator.validate_string("a" * 1001, "test", max_length=1000)
        assert "maximum length" in str(exc_info.value)
        
        with pytest.raises(ValidationError) as exc_info:
            self.validator.validate_string("ab", "test", min_length=5)
        assert "minimum length" in str(exc_info.value)
    
    def test_validate_integer_valid(self):
        """Test integer validation with valid inputs."""
        test_cases = [
            (42, 42),
            ("42", 42),
            (0, 0),
            (-10, -10)
        ]
        
        for input_val, expected in test_cases:
            result = self.validator.validate_integer(input_val, "test")
            assert result == expected
    
    def test_validate_integer_invalid(self):
        """Test integer validation with invalid inputs."""
        # Test non-integer input
        with pytest.raises(ValidationError) as exc_info:
            self.validator.validate_integer("not-a-number", "test")
        assert "must be integer" in str(exc_info.value)
        
        # Test range constraints
        with pytest.raises(ValidationError) as exc_info:
            self.validator.validate_integer(5, "test", min_value=10)
        assert "minimum value" in str(exc_info.value)
        
        with pytest.raises(ValidationError) as exc_info:
            self.validator.validate_integer(15, "test", max_value=10)
        assert "maximum value" in str(exc_info.value)
    
    def test_validate_datetime_valid(self):
        """Test datetime validation with valid formats."""
        now = datetime.utcnow()
        test_cases = [
            now.isoformat(),
            now.isoformat() + "Z",
            "2023-12-01T10:30:00",
            "2023-12-01T10:30:00+00:00"
        ]
        
        for date_str in test_cases:
            result = self.validator.validate_datetime(date_str, "test")
            assert isinstance(result, str)
            # Should be able to parse the result
            datetime.fromisoformat(result)
    
    def test_validate_datetime_invalid(self):
        """Test datetime validation with invalid formats."""
        invalid_dates = [
            ("not-a-date", "Invalid test format"),
            ("2023-13-01T10:30:00", "Invalid test format"),  # Invalid month
            ("2023-12-32T10:30:00", "Invalid test format"),  # Invalid day
            ("1900-01-01T00:00:00", "date must be within reasonable range"),  # Too far in past
            ("2030-01-01T00:00:00", "date must be within reasonable range"),  # Too far in future
            ("", "Missing required field"),
            (None, "Missing required field")
        ]
        
        for invalid_date, expected_error in invalid_dates:
            if invalid_date is None:
                with pytest.raises(ValidationError) as exc_info:
                    self.validator.validate_datetime(invalid_date, "test", required=True)
                assert expected_error in str(exc_info.value)
            else:
                with pytest.raises(ValidationError) as exc_info:
                    self.validator.validate_datetime(invalid_date, "test")
                assert expected_error in str(exc_info.value)
    
    def test_validate_experiment_type_valid(self):
        """Test experiment type validation with valid types."""
        for exp_type in self.validator.VALID_EXPERIMENT_TYPES:
            result = self.validator.validate_experiment_type(exp_type)
            assert result == exp_type.lower()
            
            # Test case insensitive
            result = self.validator.validate_experiment_type(exp_type.upper())
            assert result == exp_type.lower()
    
    def test_validate_experiment_type_invalid(self):
        """Test experiment type validation with invalid types."""
        invalid_types = [
            ("invalid_type", "must be one of"),
            ("unknown", "must be one of"),
            ("", "Missing required field"),
            (None, "Missing required field"),
            (123, "must be string")
        ]
        
        for invalid_type, expected_error in invalid_types:
            with pytest.raises(ValidationError) as exc_info:
                self.validator.validate_experiment_type(invalid_type)
            assert expected_error in str(exc_info.value)
    
    def test_validate_status_valid(self):
        """Test status validation with valid statuses."""
        for status in self.validator.VALID_STATUSES:
            result = self.validator.validate_status(status)
            assert result == status.lower()
    
    def test_validate_status_invalid(self):
        """Test status validation with invalid statuses."""
        invalid_statuses = [
            "invalid_status",
            "unknown",
            "",
            None
        ]
        
        for invalid_status in invalid_statuses:
            with pytest.raises(ValidationError) as exc_info:
                self.validator.validate_status(invalid_status)
            assert "Invalid status" in str(exc_info.value) or "Missing required field" in str(exc_info.value)
    
    def test_validate_period_valid(self):
        """Test period validation with valid periods."""
        for period in self.validator.VALID_PERIODS:
            result = self.validator.validate_period(period)
            assert result == period.lower()
        
        # Test default value
        result = self.validator.validate_period(None)
        assert result == '30d'
    
    def test_validate_period_invalid(self):
        """Test period validation with invalid periods."""
        invalid_periods = [
            "invalid_period",
            "1y",
            "100d"
        ]
        
        for invalid_period in invalid_periods:
            with pytest.raises(ValidationError) as exc_info:
                self.validator.validate_period(invalid_period)
            assert "must be one of" in str(exc_info.value)
    
    def test_validate_experiment_complete(self):
        """Test complete experiment validation."""
        valid_experiment = {
            'id': str(uuid.uuid4()),
            'name': 'Test Experiment',
            'experiment_type': 'eeg',
            'status': 'active',
            'created_at': datetime.utcnow().isoformat(),
            'user_id': str(uuid.uuid4()),
            'description': 'A test experiment',
            'parameters': {'param1': 'value1'}
        }
        
        result = self.validator.validate_experiment(valid_experiment)
        assert result['id'] == valid_experiment['id'].lower()
        assert result['name'] == valid_experiment['name']
        assert result['experiment_type'] == 'eeg'
        assert result['status'] == 'active'
    
    def test_validate_experiment_missing_required(self):
        """Test experiment validation with missing required fields."""
        incomplete_experiment = {
            'name': 'Test Experiment'
            # Missing id, experiment_type, status, created_at
        }
        
        with pytest.raises(ValidationError) as exc_info:
            self.validator.validate_experiment(incomplete_experiment)
        assert "Missing required field" in str(exc_info.value)
    
    def test_validate_dashboard_query_params(self):
        """Test dashboard query parameters validation."""
        valid_params = {
            'period': '30d',
            'limit': '10',
            'days': '7',
            'experiment_type': 'eeg',
            'force_refresh': 'true'
        }
        
        result = self.validator.validate_dashboard_query_params(valid_params)
        assert result['period'] == '30d'
        assert result['limit'] == 10
        assert result['days'] == 7
        assert result['experiment_type'] == 'eeg'
        assert result['force_refresh'] is True
    
    def test_validate_dashboard_query_params_invalid(self):
        """Test dashboard query parameters with invalid values."""
        invalid_params = {
            'limit': '1000',  # Too high
            'days': '500',    # Too high
            'period': 'invalid'
        }
        
        with pytest.raises(ValidationError):
            self.validator.validate_dashboard_query_params(invalid_params)

class TestSanitizeInput:
    """Test cases for input sanitization."""
    
    def test_sanitize_string_basic(self):
        """Test basic string sanitization."""
        test_cases = [
            ("Hello World", "Hello World"),
            ("  Multiple   spaces  ", "Multiple spaces"),
            ("Line\nBreaks\rRemoved", "Line Breaks Removed"),
            ("Tab\tCharacters", "Tab Characters")
        ]
        
        for input_str, expected in test_cases:
            result = sanitize_input(input_str)
            assert result == expected
    
    def test_sanitize_string_security(self):
        """Test security-related sanitization."""
        test_cases = [
            ("<script>alert('xss')</script>", ""),  # Script tags completely removed
            ("<div>content</div>", "content"),
            ("SQL injection; DROP TABLE users;--", "SQL injection\\; DROP TABLE users\\;\\--"),
            ("Comment -- attack", "Comment \\-- attack")
        ]
        
        for input_str, expected in test_cases:
            result = sanitize_input(input_str)
            assert result == expected
    
    def test_sanitize_dict(self):
        """Test dictionary sanitization."""
        input_dict = {
            'name': '<script>alert("xss")</script>Test',
            'description': '  Multiple   spaces  ',
            'nested': {
                'value': 'SQL; DROP TABLE;--'
            }
        }
        
        result = sanitize_input(input_dict)
        assert result['name'] == 'Test'  # Script tag completely removed
        assert result['description'] == 'Multiple spaces'
        assert result['nested']['value'] == 'SQL\\; DROP TABLE\\;\\--'
    
    def test_sanitize_list(self):
        """Test list sanitization."""
        input_list = [
            '<script>test</script>',
            '  spaces  ',
            {'nested': 'SQL; attack--'}
        ]
        
        result = sanitize_input(input_list)
        assert result[0] == ''  # Script tag completely removed
        assert result[1] == 'spaces'
        assert result[2]['nested'] == 'SQL\\; attack\\--'
    
    def test_sanitize_non_string(self):
        """Test sanitization of non-string types."""
        test_cases = [
            (42, 42),
            (3.14, 3.14),
            (True, True),
            (None, None)
        ]
        
        for input_val, expected in test_cases:
            result = sanitize_input(input_val)
            assert result == expected

class TestValidationEdgeCases:
    """Test edge cases and error conditions."""
    
    def setup_method(self):
        """Set up test fixtures."""
        self.validator = DataValidator()
    
    def test_empty_values(self):
        """Test handling of empty values."""
        empty_values = [None, "", [], {}]
        
        for empty_val in empty_values:
            # Should handle gracefully when not required
            result = self.validator.validate_string(empty_val, "test", required=False)
            assert result is None
    
    def test_unicode_handling(self):
        """Test Unicode character handling."""
        unicode_strings = [
            "Hello 世界",
            "Café ñoño",
            "🚀 Rocket",
            "Ελληνικά"
        ]
        
        for unicode_str in unicode_strings:
            result = self.validator.validate_string(unicode_str, "test")
            assert isinstance(result, str)
            assert len(result) > 0
    
    def test_malformed_json(self):
        """Test malformed JSON handling."""
        malformed_json_strings = [
            '{"incomplete": ',
            '{"invalid": "json"',
            '{invalid_json}',
            'not json at all'
        ]
        
        for malformed_json in malformed_json_strings:
            with pytest.raises(ValidationError) as exc_info:
                self.validator.validate_json(malformed_json, "test")
            assert "Invalid test format" in str(exc_info.value)
    
    def test_boundary_values(self):
        """Test boundary value conditions."""
        # Test maximum string length
        max_string = "a" * self.validator.MAX_STRING_LENGTH
        result = self.validator.validate_string(max_string, "test")
        assert len(result) == self.validator.MAX_STRING_LENGTH
        
        # Test string too long
        too_long_string = "a" * (self.validator.MAX_STRING_LENGTH + 1)
        with pytest.raises(ValidationError):
            self.validator.validate_string(too_long_string, "test")
        
        # Test maximum integer values
        result = self.validator.validate_integer(self.validator.MAX_LIMIT, "test", max_value=self.validator.MAX_LIMIT)
        assert result == self.validator.MAX_LIMIT
    
    def test_sql_injection_patterns(self):
        """Test SQL injection pattern detection and sanitization."""
        sql_patterns = [
            "'; DROP TABLE users; --",
            "1' OR '1'='1",
            "admin'--",
            "1; DELETE FROM experiments;",
            "UNION SELECT * FROM users"
        ]
        
        for pattern in sql_patterns:
            sanitized = sanitize_input(pattern)
            # Should escape dangerous characters
            assert '--' not in sanitized or '\\--' in sanitized
            assert ';' not in sanitized or '\\;' in sanitized
    
    def test_xss_patterns(self):
        """Test XSS pattern detection and sanitization."""
        xss_patterns = [
            "<script>alert('xss')</script>",
            "<img src=x onerror=alert('xss')>",
            "javascript:alert('xss')",
            "<iframe src='javascript:alert(1)'></iframe>",
            "<svg onload=alert('xss')>"
        ]
        
        for pattern in xss_patterns:
            sanitized = sanitize_input(pattern)
            # Should remove script tags and HTML
            assert '<script>' not in sanitized.lower()
            assert '<img' not in sanitized.lower()
            assert '<iframe' not in sanitized.lower()
            assert '<svg' not in sanitized.lower()

if __name__ == '__main__':
    pytest.main([__file__])