"""
Integration test for cache invalidation functionality.
Tests the cache invalidation manager and its integration with dashboard endpoints.
"""

import pytest
from unittest.mock import patch, MagicMock

from cache_invalidation import CacheInvalidationManager, get_cache_invalidation_manager
from cache_service import CacheService


class TestCacheInvalidationIntegration:
    """Test cache invalidation integration."""
    
    def test_cache_invalidation_manager_initialization(self):
        """Test that cache invalidation manager initializes correctly."""
        manager = CacheInvalidationManager()
        assert manager is not None
        
        # Test global instance
        global_manager = get_cache_invalidation_manager()
        assert global_manager is not None
    
    def test_user_dashboard_cache_invalidation(self):
        """Test invalidation of user dashboard cache."""
        with patch('cache_invalidation.get_cache_service') as mock_cache_service:
            mock_cache = MagicMock()
            mock_cache_service.return_value = mock_cache
            
            manager = CacheInvalidationManager()
            user_id = 'test_user_123'
            
            # Test invalidation
            manager.invalidate_user_dashboard_cache(user_id, 'test_operation')
            
            # Verify cache.clear_pattern was called for each expected pattern
            expected_patterns = [
                f"dashboard_summary_{user_id}",
                f"dashboard_charts_{user_id}*",
                f"dashboard_recent_{user_id}*",
                f"experiments_list_{user_id}*",
                f"experiment_results_{user_id}*"
            ]
            
            assert mock_cache.clear_pattern.call_count == len(expected_patterns)
            
            # Verify all expected patterns were called
            called_patterns = [call[0][0] for call in mock_cache.clear_pattern.call_args_list]
            for pattern in expected_patterns:
                assert pattern in called_patterns
    
    def test_experiment_cache_invalidation(self):
        """Test invalidation of experiment-specific cache."""
        with patch('cache_invalidation.get_cache_service') as mock_cache_service:
            mock_cache = MagicMock()
            mock_cache_service.return_value = mock_cache
            
            manager = CacheInvalidationManager()
            user_id = 'test_user_123'
            experiment_id = 'exp_456'
            
            # Test invalidation
            manager.invalidate_experiment_cache(user_id, experiment_id, 'experiment_updated')
            
            # Should call clear_pattern multiple times for experiment and dashboard patterns
            assert mock_cache.clear_pattern.call_count > 3
            
            # Verify experiment-specific patterns were called
            called_patterns = [call[0][0] for call in mock_cache.clear_pattern.call_args_list]
            
            expected_experiment_patterns = [
                f"experiment_{experiment_id}*",
                f"experiment_results_{experiment_id}*",
                f"experiment_details_{experiment_id}*"
            ]
            
            for pattern in expected_experiment_patterns:
                assert pattern in called_patterns
            
            # Should also invalidate dashboard cache
            assert f"dashboard_summary_{user_id}" in called_patterns
    
    def test_results_cache_invalidation(self):
        """Test invalidation of results-specific cache."""
        with patch('cache_invalidation.get_cache_service') as mock_cache_service:
            mock_cache = MagicMock()
            mock_cache_service.return_value = mock_cache
            
            manager = CacheInvalidationManager()
            user_id = 'test_user_123'
            experiment_id = 'exp_456'
            result_id = 'result_789'
            
            # Test invalidation with specific result ID
            manager.invalidate_results_cache(user_id, experiment_id, result_id, 'result_created')
            
            # Should call clear_pattern multiple times
            assert mock_cache.clear_pattern.call_count > 5
            
            # Verify result-specific patterns were called
            called_patterns = [call[0][0] for call in mock_cache.clear_pattern.call_args_list]
            
            expected_result_patterns = [
                f"experiment_results_{experiment_id}*",
                f"results_list_{experiment_id}*",
                f"result_{result_id}*",
                f"result_details_{result_id}*"
            ]
            
            for pattern in expected_result_patterns:
                assert pattern in called_patterns
            
            # Should also invalidate dashboard cache
            assert f"dashboard_summary_{user_id}" in called_patterns
    
    def test_selective_invalidation(self):
        """Test selective cache invalidation based on affected data types."""
        with patch('cache_invalidation.get_cache_service') as mock_cache_service:
            mock_cache = MagicMock()
            mock_cache_service.return_value = mock_cache
            
            manager = CacheInvalidationManager()
            user_id = 'test_user_123'
            
            # Test selective invalidation for experiments and results
            affected_data = ['experiments', 'results']
            manager.selective_invalidation(user_id, affected_data, 'bulk_update')
            
            # Should call clear_pattern for patterns related to experiments and results
            assert mock_cache.clear_pattern.call_count > 0
            
            called_patterns = [call[0][0] for call in mock_cache.clear_pattern.call_args_list]
            
            # Should include dashboard patterns since both experiments and results affect dashboard
            assert f"dashboard_summary_{user_id}" in called_patterns
            assert any(f"dashboard_charts_{user_id}" in pattern for pattern in called_patterns)
    
    def test_cache_service_unavailable_handling(self):
        """Test graceful handling when cache service is unavailable."""
        with patch('cache_invalidation.get_cache_service') as mock_cache_service:
            mock_cache_service.return_value = None  # Cache service unavailable
            
            manager = CacheInvalidationManager()
            user_id = 'test_user_123'
            
            # Should not raise exception when cache service is unavailable
            try:
                manager.invalidate_user_dashboard_cache(user_id, 'test_operation')
                manager.invalidate_experiment_cache(user_id, 'exp_123', 'test_operation')
                manager.invalidate_results_cache(user_id, 'exp_123', 'result_456', 'test_operation')
                manager.selective_invalidation(user_id, ['experiments'], 'test_operation')
            except Exception as e:
                pytest.fail(f"Should handle unavailable cache service gracefully, but raised: {e}")
    
    def test_invalidation_stats(self):
        """Test getting invalidation statistics."""
        with patch('cache_invalidation.get_cache_service') as mock_cache_service:
            mock_cache = MagicMock()
            mock_cache_service.return_value = mock_cache
            
            # Mock cache stats
            mock_cache.get_stats.return_value = {
                'memory_cache': {'total_entries': 10},
                'redis_cache': {'available': True}
            }
            
            manager = CacheInvalidationManager()
            stats = manager.get_invalidation_stats()
            
            assert stats['available'] is True
            assert 'cache_stats' in stats
            assert 'invalidation_strategies' in stats
            assert len(stats['invalidation_strategies']) == 4
    
    def test_invalidation_stats_unavailable_cache(self):
        """Test getting stats when cache service is unavailable."""
        with patch('cache_invalidation.get_cache_service') as mock_cache_service:
            mock_cache_service.return_value = None
            
            manager = CacheInvalidationManager()
            stats = manager.get_invalidation_stats()
            
            assert stats['available'] is False


if __name__ == '__main__':
    pytest.main([__file__, '-v'])