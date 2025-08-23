"""
Simple integration test for dashboard charts endpoint to verify core functionality.
"""

import pytest
from datetime import datetime
from routes.dashboard import _parse_experiment_date, _process_experiment_metrics


def test_parse_experiment_date_basic():
    """Test basic date parsing functionality."""
    # Test valid ISO format
    result = _parse_experiment_date('2024-01-15T10:30:00Z')
    assert result is not None
    assert result.year == 2024
    assert result.month == 1
    assert result.day == 15
    
    # Test invalid date
    result = _parse_experiment_date('invalid_date')
    assert result is None
    
    # Test None input
    result = _parse_experiment_date(None)
    assert result is None


def test_process_experiment_metrics_basic():
    """Test basic metrics processing functionality."""
    metrics = {
        'accuracy': 0.95,
        'precision': 0.88
    }
    
    performance_trends = {}
    metric_comparisons = {}
    
    _process_experiment_metrics(
        metrics, '2024-01-15', 'classification', 
        performance_trends, metric_comparisons
    )
    
    # Verify data was processed
    assert '2024-01-15' in performance_trends
    assert 'accuracy' in performance_trends['2024-01-15']
    assert performance_trends['2024-01-15']['accuracy'] == [0.95]
    
    assert 'classification' in metric_comparisons
    assert 'accuracy' in metric_comparisons['classification']
    assert metric_comparisons['classification']['accuracy'] == [0.95]


def test_process_experiment_metrics_invalid_data():
    """Test metrics processing with invalid data."""
    metrics = {
        'valid_metric': 0.95,
        'invalid_metric': 'not_a_number',
        'none_metric': None
    }
    
    performance_trends = {}
    metric_comparisons = {}
    
    _process_experiment_metrics(
        metrics, '2024-01-15', 'test', 
        performance_trends, metric_comparisons
    )
    
    # Should only process valid metrics
    assert '2024-01-15' in performance_trends
    assert 'valid_metric' in performance_trends['2024-01-15']
    assert 'invalid_metric' not in performance_trends['2024-01-15']
    assert 'none_metric' not in performance_trends['2024-01-15']


if __name__ == '__main__':
    pytest.main([__file__, '-v'])