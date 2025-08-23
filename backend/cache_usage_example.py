"""
Example usage of the multi-level caching service in dashboard routes.

This file demonstrates how to integrate the cache service with
dashboard API endpoints for improved performance and reliability.
"""

from flask import Blueprint, jsonify, request
from functools import wraps
import time
import logging

from cache_service import get_cache_service, cached
from supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

# Example blueprint for dashboard routes with caching
dashboard_cache_example_bp = Blueprint('dashboard_cache_example', __name__)


def cache_with_fallback(cache_key_func, ttl=300, stale_fallback=True):
    """
    Decorator that provides caching with stale data fallback.
    
    Args:
        cache_key_func: Function to generate cache key from request
        ttl: Time to live for cache entries
        stale_fallback: Whether to return stale data on service errors
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            cache_service = get_cache_service()
            if not cache_service:
                # No cache service available, execute function directly
                return func(*args, **kwargs)
            
            # Generate cache key
            cache_key = cache_key_func(*args, **kwargs)
            
            # Try to get from cache first
            cached_data = cache_service.get(cache_key)
            if cached_data is not None:
                logger.debug(f"Cache hit for key: {cache_key}")
                # Add cache metadata to response
                if isinstance(cached_data, dict):
                    cached_data['_cache_hit'] = True
                    cached_data['_cached_at'] = time.time()
                return cached_data
            
            try:
                # Execute function
                result = func(*args, **kwargs)
                
                # Cache the result
                cache_service.set(cache_key, result, ttl)
                logger.debug(f"Cached result for key: {cache_key}")
                
                # Add cache metadata
                if isinstance(result, dict):
                    result['_cache_hit'] = False
                    result['_cached_at'] = time.time()
                
                return result
                
            except Exception as e:
                logger.error(f"Error in cached function {func.__name__}: {e}")
                
                if stale_fallback:
                    # Try to get stale data as fallback
                    stale_data = cache_service.get_stale(cache_key)
                    if stale_data is not None:
                        logger.info(f"Returning stale data for key: {cache_key}")
                        if isinstance(stale_data, dict):
                            stale_data['_cache_hit'] = True
                            stale_data['_stale_data'] = True
                            stale_data['_cached_at'] = time.time()
                        return stale_data
                
                # Re-raise the exception if no fallback available
                raise e
        
        return wrapper
    return decorator


@dashboard_cache_example_bp.route('/dashboard/summary', methods=['GET'])
@cache_with_fallback(
    cache_key_func=lambda: f"dashboard_summary_{request.current_user['id'] if hasattr(request, 'current_user') else 'anonymous'}",
    ttl=300,  # 5 minutes
    stale_fallback=True
)
def get_dashboard_summary_cached():
    """
    Example dashboard summary endpoint with caching.
    
    This demonstrates:
    - Cache-first data retrieval
    - Automatic cache key generation based on user
    - Stale data fallback for service degradation
    - Cache metadata in responses
    """
    try:
        # Simulate getting user ID (in real implementation, this would come from auth middleware)
        user_id = getattr(request, 'current_user', {}).get('id', 'test_user')
        
        # Simulate database operations that might fail
        supabase_client = get_supabase_client()
        
        # Fetch experiments (this would be the actual database call)
        experiments_result = supabase_client.execute_query(
            'experiments',
            'select',
            columns='id, name, experiment_type, status, created_at',
            filters=[{'column': 'user_id', 'value': user_id}]
        )
        
        if not experiments_result['success']:
            raise Exception(f"Database error: {experiments_result['error']}")
        
        experiments = experiments_result['data'] or []
        
        # Process and aggregate data
        summary = {
            'total_experiments': len(experiments),
            'experiments_by_type': {},
            'experiments_by_status': {},
            'recent_activity': {
                'last_7_days': 0,
                'completion_rate': 0
            },
            'user_id': user_id,
            'timestamp': time.time()
        }
        
        # Aggregate by type and status
        for exp in experiments:
            exp_type = exp.get('experiment_type', 'unknown')
            exp_status = exp.get('status', 'unknown')
            
            summary['experiments_by_type'][exp_type] = summary['experiments_by_type'].get(exp_type, 0) + 1
            summary['experiments_by_status'][exp_status] = summary['experiments_by_status'].get(exp_status, 0) + 1
        
        # Calculate completion rate
        completed = summary['experiments_by_status'].get('completed', 0)
        if summary['total_experiments'] > 0:
            summary['recent_activity']['completion_rate'] = completed / summary['total_experiments']
        
        return jsonify(summary)
        
    except Exception as e:
        logger.error(f"Error in dashboard summary: {e}")
        # The decorator will handle fallback to stale data
        raise e


@dashboard_cache_example_bp.route('/dashboard/charts', methods=['GET'])
def get_dashboard_charts_cached():
    """
    Example dashboard charts endpoint with manual caching.
    
    This demonstrates manual cache management for more complex scenarios.
    """
    cache_service = get_cache_service()
    user_id = getattr(request, 'current_user', {}).get('id', 'test_user')
    
    # Get date range from query parameters
    days = request.args.get('days', 30, type=int)
    cache_key = f"dashboard_charts_{user_id}_{days}"
    
    # Try cache first
    if cache_service:
        cached_data = cache_service.get(cache_key)
        if cached_data:
            return jsonify({
                **cached_data,
                '_cache_hit': True,
                '_cached_at': time.time()
            })
    
    try:
        # Simulate chart data generation (expensive operation)
        time.sleep(0.1)  # Simulate processing time
        
        chart_data = {
            'experiment_trends': {
                'labels': [f'Day {i}' for i in range(1, days + 1)],
                'datasets': [{
                    'label': 'Experiments Created',
                    'data': [i % 5 + 1 for i in range(days)]  # Mock data
                }]
            },
            'completion_rates': {
                'labels': ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                'datasets': [{
                    'label': 'Completion Rate %',
                    'data': [85, 92, 78, 95]  # Mock data
                }]
            },
            'user_id': user_id,
            'days': days,
            'generated_at': time.time()
        }
        
        # Cache the result
        if cache_service:
            cache_service.set(cache_key, chart_data, ttl=600)  # 10 minutes
        
        return jsonify({
            **chart_data,
            '_cache_hit': False,
            '_cached_at': time.time()
        })
        
    except Exception as e:
        logger.error(f"Error generating chart data: {e}")
        
        # Try to get stale data as fallback
        if cache_service:
            stale_data = cache_service.get_stale(cache_key)
            if stale_data:
                return jsonify({
                    **stale_data,
                    '_cache_hit': True,
                    '_stale_data': True,
                    '_cached_at': time.time(),
                    'error': 'Service temporarily unavailable, showing cached data'
                })
        
        return jsonify({
            'error': 'Chart data temporarily unavailable',
            'message': 'Please try again in a few moments'
        }), 503


@dashboard_cache_example_bp.route('/dashboard/recent', methods=['GET'])
@cached(ttl=180, key_prefix="dashboard_recent_")  # 3 minutes with decorator
def get_recent_experiments_cached():
    """
    Example recent experiments endpoint using the @cached decorator.
    
    This demonstrates the simplest way to add caching to a function.
    """
    user_id = getattr(request, 'current_user', {}).get('id', 'test_user')
    limit = request.args.get('limit', 10, type=int)
    
    # Simulate database query
    supabase_client = get_supabase_client()
    
    result = supabase_client.execute_query(
        'experiments',
        'select',
        columns='id, name, experiment_type, status, created_at, updated_at',
        filters=[{'column': 'user_id', 'value': user_id}],
        order_by='created_at',
        order_direction='desc',
        limit=limit
    )
    
    if not result['success']:
        raise Exception(f"Database error: {result['error']}")
    
    experiments = result['data'] or []
    
    return jsonify({
        'experiments': experiments,
        'count': len(experiments),
        'user_id': user_id,
        'limit': limit,
        'timestamp': time.time()
    })


@dashboard_cache_example_bp.route('/cache/stats', methods=['GET'])
def get_cache_stats():
    """Get cache service statistics."""
    cache_service = get_cache_service()
    if not cache_service:
        return jsonify({'error': 'Cache service not available'}), 503
    
    stats = cache_service.get_stats()
    return jsonify(stats)


@dashboard_cache_example_bp.route('/cache/health', methods=['GET'])
def get_cache_health():
    """Get cache service health status."""
    cache_service = get_cache_service()
    if not cache_service:
        return jsonify({'error': 'Cache service not available'}), 503
    
    health = cache_service.health_check()
    
    # Determine overall health status
    overall_status = 'healthy'
    if health['memory_cache']['status'] != 'healthy':
        overall_status = 'degraded'
    if health['redis_cache']['status'] == 'error':
        overall_status = 'degraded'
    
    return jsonify({
        **health,
        'overall_status': overall_status,
        'timestamp': time.time()
    })


@dashboard_cache_example_bp.route('/cache/clear', methods=['POST'])
def clear_cache():
    """Clear cache entries (for testing/admin purposes)."""
    cache_service = get_cache_service()
    if not cache_service:
        return jsonify({'error': 'Cache service not available'}), 503
    
    pattern = request.json.get('pattern', '*') if request.is_json else '*'
    
    try:
        cache_service.clear_pattern(pattern)
        return jsonify({
            'message': f'Cache cleared for pattern: {pattern}',
            'timestamp': time.time()
        })
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        return jsonify({'error': str(e)}), 500


# Example of using cache service in a service class
class DashboardCacheService:
    """Service class demonstrating cache integration patterns."""
    
    def __init__(self):
        self.cache_service = get_cache_service()
        self.supabase_client = get_supabase_client()
    
    def get_user_experiments_cached(self, user_id: str, force_refresh: bool = False):
        """Get user experiments with caching."""
        cache_key = f"user_experiments_{user_id}"
        
        # Check cache unless force refresh is requested
        if not force_refresh and self.cache_service:
            cached_data = self.cache_service.get(cache_key)
            if cached_data:
                return cached_data
        
        # Fetch from database
        result = self.supabase_client.execute_query(
            'experiments',
            'select',
            columns='*',
            filters=[{'column': 'user_id', 'value': user_id}]
        )
        
        if result['success']:
            experiments = result['data'] or []
            
            # Cache the result
            if self.cache_service:
                self.cache_service.set(cache_key, experiments, ttl=300)
            
            return experiments
        else:
            # Try stale data on error
            if self.cache_service:
                stale_data = self.cache_service.get_stale(cache_key)
                if stale_data:
                    logger.warning(f"Returning stale data for user {user_id} due to database error")
                    return stale_data
            
            raise Exception(f"Failed to fetch experiments: {result['error']}")
    
    def invalidate_user_cache(self, user_id: str):
        """Invalidate all cache entries for a user."""
        if self.cache_service:
            patterns = [
                f"user_experiments_{user_id}",
                f"dashboard_summary_{user_id}",
                f"dashboard_charts_{user_id}_*",
                f"dashboard_recent_{user_id}_*"
            ]
            
            for pattern in patterns:
                self.cache_service.clear_pattern(pattern)
            
            logger.info(f"Invalidated cache for user {user_id}")


# Example usage in a Flask app
def register_cache_example_routes(app):
    """Register the cache example routes with a Flask app."""
    app.register_blueprint(dashboard_cache_example_bp, url_prefix='/api/cache-example')
    
    # Add cache service to app context
    @app.before_request
    def add_cache_to_context():
        from flask import g
        g.cache_service = get_cache_service()
    
    logger.info("Cache example routes registered")


if __name__ == '__main__':
    # Example of testing the cache service
    from cache_service import init_cache_service
    
    # Initialize cache service
    cache_service = init_cache_service()
    
    # Test basic functionality
    cache_service.set('test_key', {'message': 'Hello, Cache!'}, ttl=60)
    result = cache_service.get('test_key')
    print(f"Cache test result: {result}")
    
    # Test cache service
    dashboard_service = DashboardCacheService()
    print("Dashboard cache service initialized successfully")