"""
Cache invalidation strategies for NeuroLab 360 Dashboard API.
Provides intelligent cache invalidation based on data changes.
"""

import logging
from typing import List, Optional, Dict, Any
from cache_service import get_cache_service

logger = logging.getLogger(__name__)


class CacheInvalidationManager:
    """Manages cache invalidation strategies for dashboard data."""
    
    def __init__(self):
        self.cache_service = get_cache_service()
    
    def invalidate_user_dashboard_cache(self, user_id: str, operation: str = 'unknown') -> None:
        """
        Invalidate all dashboard-related cache entries for a user.
        
        Args:
            user_id: User ID whose cache should be invalidated
            operation: Description of the operation that triggered invalidation
        """
        if not self.cache_service:
            logger.warning("Cache service not available for invalidation")
            return
        
        cache_patterns = [
            f"dashboard_summary_{user_id}",
            f"dashboard_charts_{user_id}*",
            f"dashboard_recent_{user_id}*",
            f"experiments_list_{user_id}*",
            f"experiment_results_{user_id}*"
        ]
        
        for pattern in cache_patterns:
            try:
                self.cache_service.clear_pattern(pattern)
                logger.debug(f"Invalidated cache pattern: {pattern} (operation: {operation})")
            except Exception as e:
                logger.error(f"Failed to invalidate cache pattern {pattern}: {e}")
    
    def invalidate_experiment_cache(self, user_id: str, experiment_id: str, operation: str = 'unknown') -> None:
        """
        Invalidate cache entries related to a specific experiment.
        
        Args:
            user_id: User ID who owns the experiment
            experiment_id: Experiment ID that was modified
            operation: Description of the operation that triggered invalidation
        """
        if not self.cache_service:
            logger.warning("Cache service not available for invalidation")
            return
        
        # Invalidate specific experiment caches
        specific_patterns = [
            f"experiment_{experiment_id}*",
            f"experiment_results_{experiment_id}*",
            f"experiment_details_{experiment_id}*"
        ]
        
        for pattern in specific_patterns:
            try:
                self.cache_service.clear_pattern(pattern)
                logger.debug(f"Invalidated experiment cache pattern: {pattern} (operation: {operation})")
            except Exception as e:
                logger.error(f"Failed to invalidate experiment cache pattern {pattern}: {e}")
        
        # Also invalidate user dashboard cache since experiment data affects dashboard
        self.invalidate_user_dashboard_cache(user_id, f"experiment_{operation}")
    
    def invalidate_results_cache(self, user_id: str, experiment_id: str, result_id: Optional[str] = None, operation: str = 'unknown') -> None:
        """
        Invalidate cache entries related to experiment results.
        
        Args:
            user_id: User ID who owns the experiment
            experiment_id: Experiment ID whose results were modified
            result_id: Specific result ID (optional)
            operation: Description of the operation that triggered invalidation
        """
        if not self.cache_service:
            logger.warning("Cache service not available for invalidation")
            return
        
        # Invalidate result-specific caches
        result_patterns = [
            f"experiment_results_{experiment_id}*",
            f"results_list_{experiment_id}*"
        ]
        
        if result_id:
            result_patterns.extend([
                f"result_{result_id}*",
                f"result_details_{result_id}*"
            ])
        
        for pattern in result_patterns:
            try:
                self.cache_service.clear_pattern(pattern)
                logger.debug(f"Invalidated results cache pattern: {pattern} (operation: {operation})")
            except Exception as e:
                logger.error(f"Failed to invalidate results cache pattern {pattern}: {e}")
        
        # Invalidate dashboard cache since results affect dashboard metrics
        self.invalidate_user_dashboard_cache(user_id, f"results_{operation}")
    
    def selective_invalidation(self, user_id: str, affected_data: List[str], operation: str = 'unknown') -> None:
        """
        Perform selective cache invalidation based on affected data types.
        
        Args:
            user_id: User ID whose cache should be invalidated
            affected_data: List of data types that were affected (e.g., ['experiments', 'results'])
            operation: Description of the operation that triggered invalidation
        """
        if not self.cache_service:
            logger.warning("Cache service not available for selective invalidation")
            return
        
        invalidation_map = {
            'experiments': [
                f"dashboard_summary_{user_id}",
                f"dashboard_charts_{user_id}*",
                f"experiments_list_{user_id}*"
            ],
            'results': [
                f"dashboard_summary_{user_id}",
                f"dashboard_charts_{user_id}*",
                f"experiment_results_{user_id}*"
            ],
            'user_profile': [
                f"user_profile_{user_id}*",
                f"user_settings_{user_id}*"
            ],
            'dashboard': [
                f"dashboard_summary_{user_id}",
                f"dashboard_charts_{user_id}*",
                f"dashboard_recent_{user_id}*"
            ]
        }
        
        patterns_to_invalidate = set()
        
        for data_type in affected_data:
            if data_type in invalidation_map:
                patterns_to_invalidate.update(invalidation_map[data_type])
        
        for pattern in patterns_to_invalidate:
            try:
                self.cache_service.clear_pattern(pattern)
                logger.debug(f"Selectively invalidated cache pattern: {pattern} (operation: {operation})")
            except Exception as e:
                logger.error(f"Failed to selectively invalidate cache pattern {pattern}: {e}")
    
    def get_invalidation_stats(self) -> Dict[str, Any]:
        """Get statistics about cache invalidation operations."""
        if not self.cache_service:
            return {'available': False}
        
        try:
            cache_stats = self.cache_service.get_stats()
            return {
                'available': True,
                'cache_stats': cache_stats,
                'invalidation_strategies': [
                    'user_dashboard_cache',
                    'experiment_cache',
                    'results_cache',
                    'selective_invalidation'
                ]
            }
        except Exception as e:
            logger.error(f"Failed to get invalidation stats: {e}")
            return {'available': False, 'error': str(e)}


# Global cache invalidation manager instance
cache_invalidation_manager = CacheInvalidationManager()


def get_cache_invalidation_manager() -> CacheInvalidationManager:
    """Get the global cache invalidation manager instance."""
    return cache_invalidation_manager


# Decorator for automatic cache invalidation
def invalidate_cache(user_id_param: str = 'user_id', affected_data: List[str] = None, operation: str = 'unknown'):
    """
    Decorator to automatically invalidate cache after function execution.
    
    Args:
        user_id_param: Name of the parameter or attribute containing user_id
        affected_data: List of data types affected by the operation
        operation: Description of the operation
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            # Execute the original function
            result = func(*args, **kwargs)
            
            # Extract user_id from parameters
            user_id = None
            if user_id_param in kwargs:
                user_id = kwargs[user_id_param]
            elif hasattr(func, '__self__') and hasattr(func.__self__, user_id_param):
                user_id = getattr(func.__self__, user_id_param)
            
            # Perform cache invalidation if user_id is available
            if user_id and affected_data:
                try:
                    cache_invalidation_manager.selective_invalidation(
                        user_id=user_id,
                        affected_data=affected_data,
                        operation=f"{func.__name__}_{operation}"
                    )
                except Exception as e:
                    logger.error(f"Cache invalidation failed in decorator: {e}")
            
            return result
        
        return wrapper
    return decorator