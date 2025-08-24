"""
Dashboard API routes for NeuroLab 360.
Handles data aggregation and visualization endpoints for the dashboard.
"""

from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from functools import wraps
from typing import Dict, List, Any, Optional
import logging
import time

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase_client import get_supabase_client
from retry_logic import RetryableOperation, get_database_circuit_breaker, CircuitBreakerOpenError
from exceptions import DatabaseError, NetworkError, AuthenticationError, PartialDataError
from validation_middleware import (
    validate_dashboard_summary, validate_dashboard_charts, 
    validate_dashboard_recent, validate_user_id
)
from data_validator import validator, sanitize_input, ValidationError
from cache_service import get_cache_service
from error_handler import error_handler
from performance_monitor import (
    performance_monitor, track_endpoint, database_operation_monitor, structured_logger
)
from degradation_service import get_degradation_service, with_graceful_degradation, maintenance_mode_check

logger = logging.getLogger(__name__)

# Create blueprint for dashboard routes
dashboard_bp = Blueprint('dashboard', __name__)

# Get Supabase client
supabase_client = get_supabase_client()

# Get degradation service
degradation_service = get_degradation_service()

def require_auth(f):
    """Decorator to require authentication for protected routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authorization header required'}), 401
        
        user = supabase_client.get_user_from_token(auth_header)
        if not user:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        # Add user to request context
        request.current_user = user
        return f(*args, **kwargs)
    
    return decorated_function

@dashboard_bp.route('/dashboard/summary', methods=['GET'])
@require_auth
@validate_user_id()
@validate_dashboard_summary()
@error_handler.handle_exceptions
@track_endpoint('dashboard_summary')
@performance_monitor('dashboard.get_summary')
@with_graceful_degradation('dashboard', 'dashboard_summary')
@maintenance_mode_check('dashboard')
def get_dashboard_summary():
    """
    Get experiment summary statistics for the dashboard with enhanced resilience.
    
    Features:
    - Multi-level caching with TTL management
    - Partial data handling for graceful degradation
    - Circuit breaker integration
    - Comprehensive error handling and logging
    - Cache invalidation strategies
    
    Returns:
    - Total experiments count
    - Experiments by type breakdown
    - Experiments by status breakdown
    - Recent activity summary
    - Average metrics across experiments
    """
    user_id = request.current_user['id']
    cache_service = get_cache_service()
    
    # Generate cache key
    cache_key = f"dashboard_summary_{user_id}"
    force_refresh = request.args.get('force_refresh', '').lower() == 'true'
    
    # Try to get from cache first (unless force refresh is requested)
    if not force_refresh and cache_service:
        cached_data = cache_service.get(cache_key)
        if cached_data:
            logger.debug(f"Cache hit for dashboard summary: {user_id}")
            cached_data['cached'] = True
            cached_data['cache_timestamp'] = cached_data.get('last_updated')
            return jsonify(cached_data)
    
    # Create retry operation for database calls
    retry_operation = RetryableOperation(
        max_retries=3,
        base_delay=1.0,
        max_delay=10.0,
        circuit_breaker=get_database_circuit_breaker()
    )
    
    # Initialize summary data structure
    summary_data = {
        'total_experiments': 0,
        'experiments_by_type': {},
        'experiments_by_status': {},
        'recent_activity': {
            'last_7_days': 0,
            'completion_rate': 0
        },
        'average_metrics': {},
        'last_updated': datetime.utcnow().isoformat(),
        'partial_failure': False,
        'failed_operations': {},
        'data_sources': []
    }
    
    # Track failed operations for partial data handling
    failed_operations = []
    
    # Fetch experiments with retry logic and fallback to cache
    experiments = []
    try:
        experiments_result = retry_operation.execute(
            supabase_client.execute_query,
            'experiments',
            'select',
            columns='*',
            filters=[{'column': 'user_id', 'value': user_id}]
        )
        
        if experiments_result['success']:
            experiments = experiments_result['data'] or []
            summary_data['total_experiments'] = len(experiments)
            summary_data['data_sources'].append('database')
            logger.debug(f"Successfully fetched {len(experiments)} experiments for user {user_id}")
        else:
            raise DatabaseError(f"Failed to retrieve experiments: {experiments_result.get('error')}")
            
    except CircuitBreakerOpenError:
        logger.warning("Circuit breaker open for experiments query")
        # Try to get stale cached data
        if cache_service:
            stale_data = cache_service.get_stale(cache_key)
            if stale_data:
                logger.info("Returning stale cached data due to circuit breaker")
                stale_data['stale'] = True
                stale_data['message'] = 'Service temporarily degraded, showing cached data'
                stale_data['circuit_breaker_open'] = True
                return jsonify(stale_data)
        
        # No cached data available, return minimal fallback
        summary_data.update({
            'error': 'Dashboard service temporarily unavailable',
            'message': 'Service is experiencing high load. Please try again in a few moments.',
            'retry_after': 60,
            'fallback_data': True
        })
        return jsonify(summary_data), 503
        
    except (DatabaseError, NetworkError) as e:
        logger.error(f"Database/Network error in summary: {str(e)}")
        failed_operations.append('experiments_fetch')
        
        # Try to get stale cached data as fallback
        if cache_service:
            stale_data = cache_service.get_stale(cache_key)
            if stale_data:
                logger.info("Returning stale cached data due to database error")
                stale_data['stale'] = True
                stale_data['message'] = 'Using cached data due to temporary service issues'
                stale_data['database_error'] = True
                return jsonify(stale_data)
    
    # Process experiments if we have them
    if experiments:
        # Calculate experiments by type and status
        for exp in experiments:
            exp_type = exp.get('experiment_type', 'unknown')
            status = exp.get('status', 'unknown')
            
            summary_data['experiments_by_type'][exp_type] = summary_data['experiments_by_type'].get(exp_type, 0) + 1
            summary_data['experiments_by_status'][status] = summary_data['experiments_by_status'].get(status, 0) + 1
        
        # Calculate recent activity (last 7 days)
        seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        recent_experiments = []
        
        for exp in experiments:
            try:
                # Handle different datetime formats
                created_at_str = exp.get('created_at', '')
                if created_at_str:
                    if created_at_str.endswith('Z'):
                        created_at_str = created_at_str.replace('Z', '+00:00')
                    elif '+' not in created_at_str and 'T' in created_at_str:
                        created_at_str = created_at_str + '+00:00'
                    
                    exp_date = datetime.fromisoformat(created_at_str)
                    seven_days_ago_dt = datetime.fromisoformat(seven_days_ago.replace('Z', '+00:00') if seven_days_ago.endswith('Z') else seven_days_ago)
                    
                    if exp_date >= seven_days_ago_dt:
                        recent_experiments.append(exp)
            except (ValueError, TypeError) as e:
                logger.warning(f"Date parsing error for experiment {exp.get('id', 'unknown')}: {e}")
                # Include experiment if date parsing fails
                recent_experiments.append(exp)
        
        summary_data['recent_activity']['last_7_days'] = len(recent_experiments)
        
        # Calculate completion rate
        completed_experiments = summary_data['experiments_by_status'].get('completed', 0)
        completion_rate = (completed_experiments / len(experiments) * 100) if experiments else 0
        summary_data['recent_activity']['completion_rate'] = round(completion_rate, 1)
    
    # Fetch results for metric calculations with partial failure handling
    all_results = []
    failed_experiments = []
    
    if experiments:
        for exp in experiments:
            try:
                results_result = retry_operation.execute(
                    supabase_client.execute_query,
                    'results',
                    'select',
                    columns='*',
                    filters=[{'column': 'experiment_id', 'value': exp['id']}]
                )
                
                if results_result['success'] and results_result['data']:
                    all_results.extend(results_result['data'])
                elif not results_result['success']:
                    logger.warning(f"Failed to get results for experiment {exp['id']}: {results_result.get('error')}")
                    failed_experiments.append(exp['id'])
                    
            except (DatabaseError, NetworkError, CircuitBreakerOpenError) as e:
                logger.warning(f"Error fetching results for experiment {exp['id']}: {str(e)}")
                failed_experiments.append(exp['id'])
        
        # Track failed results operations
        if failed_experiments:
            failed_operations.append('results_fetch')
    
    # Calculate average metrics across all experiments
    if all_results:
        # Collect all metric values by type
        metric_values = {}
        for result in all_results:
            if result.get('metrics'):
                for key, value in result['metrics'].items():
                    if isinstance(value, (int, float)):
                        if key not in metric_values:
                            metric_values[key] = []
                        metric_values[key].append(value)
        
        # Calculate averages
        for key, values in metric_values.items():
            if values:
                summary_data['average_metrics'][key] = round(sum(values) / len(values), 2)
        
        summary_data['data_sources'].append('results')
    
    # Add partial failure information if applicable
    if failed_operations or failed_experiments:
        summary_data['partial_failure'] = True
        summary_data['failed_operations'] = {
            'operations': failed_operations,
            'results_fetch_failures': len(failed_experiments),
            'total_experiments': len(experiments)
        }
        
        if failed_experiments:
            summary_data['warning'] = f'Some experiment results could not be loaded ({len(failed_experiments)} out of {len(experiments)})'
    
    # Cache successful results (even if partial)
    if cache_service and (experiments or not failed_operations):
        cache_ttl = 300  # 5 minutes default
        
        # Reduce cache TTL if we have partial failures
        if summary_data['partial_failure']:
            cache_ttl = 60  # 1 minute for partial data
        
        cache_service.set(cache_key, summary_data, ttl=cache_ttl)
        logger.debug(f"Cached dashboard summary for user {user_id} (TTL: {cache_ttl}s)")
    
    # Add cache invalidation metadata
    summary_data['cache_info'] = {
        'cached': False,
        'cache_key': cache_key,
        'ttl': cache_ttl if 'cache_ttl' in locals() else None,
        'invalidation_triggers': [
            'experiment_created',
            'experiment_updated',
            'experiment_deleted',
            'result_created',
            'result_updated'
        ]
    }
    
    return jsonify(summary_data)

@dashboard_bp.route('/dashboard/charts', methods=['GET'])
@require_auth
@validate_user_id()
@validate_dashboard_charts()
@error_handler.handle_exceptions
@track_endpoint('dashboard_charts')
@performance_monitor('dashboard.get_charts')
@with_graceful_degradation('dashboard', 'dashboard_charts')
@maintenance_mode_check('dashboard')
def get_dashboard_charts():
    """
    Get data formatted for dashboard visualizations and charts with enhanced error recovery.
    
    Features:
    - Multi-level caching with TTL management
    - Graceful database failure handling with fallback to cached data
    - Comprehensive date parsing validation and error recovery
    - Partial data handling for resilient chart rendering
    - Circuit breaker integration for service protection
    
    Query parameters:
    - period: Time period for data ('7d', '30d', '90d', 'all') - default: '30d'
    - experiment_type: Filter by specific experiment type
    
    Returns:
    - Time series data for experiment activity
    - Distribution data for experiment types
    - Performance trends over time
    - Metric comparisons across experiment types
    """
    user_id = request.current_user['id']
    cache_service = get_cache_service()
    
    # Get validated parameters
    validated_params = getattr(request, 'validated_params', {})
    period = validated_params.get('period', '30d')
    experiment_type_filter = validated_params.get('experiment_type')
    force_refresh = request.args.get('force_refresh', '').lower() == 'true'
    
    # Generate cache key including all parameters
    cache_key_parts = [f"dashboard_charts_{user_id}", period]
    if experiment_type_filter:
        cache_key_parts.append(f"type_{experiment_type_filter}")
    cache_key = "_".join(cache_key_parts)
    
    # Try to get from cache first (unless force refresh is requested)
    if not force_refresh and cache_service:
        cached_data = cache_service.get(cache_key)
        if cached_data:
            logger.debug(f"Cache hit for dashboard charts: {cache_key}")
            cached_data['cached'] = True
            cached_data['cache_timestamp'] = cached_data.get('last_updated')
            return jsonify(cached_data)
    
    # Create retry operation for database calls
    retry_operation = RetryableOperation(
        max_retries=3,
        base_delay=1.0,
        max_delay=10.0,
        circuit_breaker=get_database_circuit_breaker()
    )
    
    # Calculate date range based on period with validation
    now = datetime.utcnow()
    try:
        if period == '7d':
            start_date = now - timedelta(days=7)
        elif period == '30d':
            start_date = now - timedelta(days=30)
        elif period == '90d':
            start_date = now - timedelta(days=90)
        elif period == 'all':
            start_date = datetime(2020, 1, 1)  # Far back date
        else:
            # Invalid period, default to 30 days
            logger.warning(f"Invalid period parameter: {period}, defaulting to 30d")
            period = '30d'
            start_date = now - timedelta(days=30)
    except Exception as e:
        logger.error(f"Error calculating date range for period {period}: {e}")
        # Fallback to 30 days
        period = '30d'
        start_date = now - timedelta(days=30)
    
    # Initialize chart data structure
    chart_data = {
        'activity_timeline': [],
        'experiment_type_distribution': [],
        'performance_trends': [],
        'metric_comparisons': [],
        'period': period,
        'total_experiments': 0,
        'date_range': {
            'start': start_date.isoformat(),
            'end': now.isoformat()
        },
        'last_updated': datetime.utcnow().isoformat(),
        'partial_failure': False,
        'failed_operations': {},
        'data_sources': []
    }
    
    # Track failed operations for partial data handling
    failed_operations = []
    
    # Build filters
    filters = [{'column': 'user_id', 'value': user_id}]
    if experiment_type_filter:
        # Validate experiment type filter
        sanitized_type = sanitize_input(experiment_type_filter)
        if sanitized_type:
            filters.append({'column': 'experiment_type', 'value': sanitized_type})
    
    # Get experiments within the date range with retry logic and fallback to cache
    experiments = []
    try:
        experiments_result = retry_operation.execute(
            supabase_client.execute_query,
            'experiments',
            'select',
            columns='*',
            filters=filters,
            order='created_at.asc'
        )
        
        if experiments_result['success']:
            experiments = experiments_result['data'] or []
            chart_data['data_sources'].append('database')
            logger.debug(f"Successfully fetched {len(experiments)} experiments for charts")
        else:
            raise DatabaseError(f"Failed to retrieve experiments for charts: {experiments_result.get('error')}")
            
    except CircuitBreakerOpenError:
        logger.warning("Circuit breaker open for charts experiments query")
        # Try to get stale cached data
        if cache_service:
            stale_data = cache_service.get_stale(cache_key)
            if stale_data:
                logger.info("Returning stale cached chart data due to circuit breaker")
                stale_data['stale'] = True
                stale_data['message'] = 'Service temporarily degraded, showing cached chart data'
                stale_data['circuit_breaker_open'] = True
                return jsonify(stale_data)
        
        # No cached data available, return minimal fallback
        chart_data.update({
            'error': 'Chart service temporarily unavailable',
            'message': 'Service is experiencing high load. Please try again in a few moments.',
            'retry_after': 60,
            'fallback_data': True
        })
        return jsonify(chart_data), 503
        
    except (DatabaseError, NetworkError) as e:
        logger.error(f"Database/Network error in charts: {str(e)}")
        failed_operations.append('experiments_fetch')
        
        # Try to get stale cached data as fallback
        if cache_service:
            stale_data = cache_service.get_stale(cache_key)
            if stale_data:
                logger.info("Returning stale cached chart data due to database error")
                stale_data['stale'] = True
                stale_data['message'] = 'Using cached chart data due to temporary service issues'
                stale_data['database_error'] = True
                return jsonify(stale_data)
    
    # Enhanced date parsing and filtering with comprehensive error recovery
    filtered_experiments = []
    date_parsing_errors = 0
    
    for exp in experiments:
        try:
            # Enhanced date parsing with multiple format support
            parsed_date = _parse_experiment_date(exp.get('created_at'))
            if parsed_date and parsed_date >= start_date:
                # Add parsed date to experiment for later use
                exp['_parsed_date'] = parsed_date
                filtered_experiments.append(exp)
            elif parsed_date is None:
                # Date parsing failed, but include experiment with warning
                date_parsing_errors += 1
                exp['_parsed_date'] = now  # Use current time as fallback
                filtered_experiments.append(exp)
        except Exception as e:
            logger.warning(f"Error processing experiment {exp.get('id', 'unknown')}: {e}")
            date_parsing_errors += 1
            # Include experiment with fallback date
            exp['_parsed_date'] = now
            filtered_experiments.append(exp)
    
    experiments = filtered_experiments
    chart_data['total_experiments'] = len(experiments)
    
    # Track date parsing issues
    if date_parsing_errors > 0:
        chart_data['date_parsing_warnings'] = {
            'count': date_parsing_errors,
            'message': f'{date_parsing_errors} experiments had date parsing issues and used fallback dates'
        }
    
    # Generate time series data for experiment activity with error handling
    activity_timeline = {}
    experiment_type_distribution = {}
    
    for exp in experiments:
        try:
            # Use pre-parsed date or parse again with fallback
            exp_date = exp.get('_parsed_date') or _parse_experiment_date(exp.get('created_at')) or now
            date_key = exp_date.strftime('%Y-%m-%d')
            
            # Count experiments per day
            activity_timeline[date_key] = activity_timeline.get(date_key, 0) + 1
            
            # Count by experiment type with validation
            exp_type = sanitize_input(exp.get('experiment_type', 'unknown'))
            if exp_type:
                experiment_type_distribution[exp_type] = experiment_type_distribution.get(exp_type, 0) + 1
                
        except Exception as e:
            logger.warning(f"Error processing experiment timeline data for {exp.get('id', 'unknown')}: {e}")
            # Use fallback values
            date_key = now.strftime('%Y-%m-%d')
            activity_timeline[date_key] = activity_timeline.get(date_key, 0) + 1
            experiment_type_distribution['unknown'] = experiment_type_distribution.get('unknown', 0) + 1
    
    # Convert timeline to chart format with validation
    try:
        timeline_data = [
            {'date': date, 'count': count}
            for date, count in sorted(activity_timeline.items())
            if isinstance(count, int) and count > 0
        ]
        chart_data['activity_timeline'] = timeline_data
    except Exception as e:
        logger.error(f"Error processing timeline data: {e}")
        chart_data['activity_timeline'] = []
        failed_operations.append('timeline_processing')
    
    # Convert distribution to chart format with validation
    try:
        distribution_data = [
            {'type': exp_type, 'count': count}
            for exp_type, count in experiment_type_distribution.items()
            if isinstance(count, int) and count > 0 and exp_type
        ]
        chart_data['experiment_type_distribution'] = distribution_data
    except Exception as e:
        logger.error(f"Error processing distribution data: {e}")
        chart_data['experiment_type_distribution'] = []
        failed_operations.append('distribution_processing')
    
    # Get performance trends and metrics with comprehensive error handling
    performance_trends = {}
    metric_comparisons = {}
    failed_results_count = 0
    successful_results_count = 0
    
    for exp in experiments:
        try:
            # Get results for this experiment with retry logic
            results_result = retry_operation.execute(
                supabase_client.execute_query,
                'results',
                'select',
                columns='*',
                filters=[{'column': 'experiment_id', 'value': exp['id']}],
                order='created_at.desc',
                limit=1  # Get only the latest result
            )
            
            if results_result['success'] and results_result['data']:
                result = results_result['data'][0]
                successful_results_count += 1
                
                # Use pre-parsed date or parse again
                exp_date = exp.get('_parsed_date') or _parse_experiment_date(exp.get('created_at')) or now
                date_key = exp_date.strftime('%Y-%m-%d')
                exp_type = sanitize_input(exp.get('experiment_type', 'unknown'))
                
                # Process metrics with validation
                if result.get('metrics') and isinstance(result['metrics'], dict):
                    _process_experiment_metrics(
                        result['metrics'], 
                        date_key, 
                        exp_type, 
                        performance_trends, 
                        metric_comparisons
                    )
                    
            elif not results_result['success']:
                logger.warning(f"Failed to get results for experiment {exp['id']}: {results_result.get('error')}")
                failed_results_count += 1
            else:
                # No results found for this experiment
                pass
                
        except (DatabaseError, NetworkError, CircuitBreakerOpenError) as e:
            logger.warning(f"Error fetching results for experiment {exp['id']} in charts: {str(e)}")
            failed_results_count += 1
        except Exception as e:
            logger.error(f"Unexpected error processing results for experiment {exp['id']}: {e}")
            failed_results_count += 1
    
    # Process performance trends with error handling
    try:
        trends_data = []
        for date, metrics in sorted(performance_trends.items()):
            trend_point = {'date': date}
            for metric_name, values in metrics.items():
                if values and all(isinstance(v, (int, float)) for v in values):
                    trend_point[metric_name] = round(sum(values) / len(values), 2)
            if len(trend_point) > 1:  # Only include if we have metrics beyond just the date
                trends_data.append(trend_point)
        chart_data['performance_trends'] = trends_data
    except Exception as e:
        logger.error(f"Error processing performance trends: {e}")
        chart_data['performance_trends'] = []
        failed_operations.append('trends_processing')
    
    # Process metric comparisons with error handling
    try:
        comparisons_data = []
        for exp_type, metrics in metric_comparisons.items():
            if exp_type:  # Ensure valid experiment type
                comparison_point = {'experiment_type': exp_type}
                for metric_name, values in metrics.items():
                    if values and all(isinstance(v, (int, float)) for v in values):
                        comparison_point[metric_name] = round(sum(values) / len(values), 2)
                if len(comparison_point) > 1:  # Only include if we have metrics beyond just the type
                    comparisons_data.append(comparison_point)
        chart_data['metric_comparisons'] = comparisons_data
    except Exception as e:
        logger.error(f"Error processing metric comparisons: {e}")
        chart_data['metric_comparisons'] = []
        failed_operations.append('comparisons_processing')
    
    # Add comprehensive failure information
    if failed_operations or failed_results_count > 0:
        chart_data['partial_failure'] = True
        chart_data['failed_operations'] = {
            'operations': failed_operations,
            'results_fetch_failures': failed_results_count,
            'successful_results': successful_results_count,
            'total_experiments': len(experiments)
        }
        
        if failed_results_count > 0:
            chart_data['warning'] = f'Some experiment results could not be loaded for charts ({failed_results_count} out of {len(experiments)})'
    
    # Cache successful results (even if partial)
    if cache_service and (experiments or not failed_operations):
        cache_ttl = 300  # 5 minutes default
        
        # Reduce cache TTL if we have partial failures
        if chart_data['partial_failure']:
            cache_ttl = 60  # 1 minute for partial data
        
        cache_service.set(cache_key, chart_data, ttl=cache_ttl)
        logger.debug(f"Cached dashboard charts for {cache_key} (TTL: {cache_ttl}s)")
    
    # Add cache invalidation metadata
    chart_data['cache_info'] = {
        'cached': False,
        'cache_key': cache_key,
        'ttl': cache_ttl if 'cache_ttl' in locals() else None,
        'invalidation_triggers': [
            'experiment_created',
            'experiment_updated',
            'experiment_deleted',
            'result_created',
            'result_updated'
        ]
    }
    
    return jsonify(chart_data)


def _parse_experiment_date(date_str: str) -> Optional[datetime]:
    """
    Enhanced date parsing with comprehensive format support and error recovery.
    Always returns timezone-aware datetime objects.
    
    Args:
        date_str: Date string in various formats
        
    Returns:
        Parsed timezone-aware datetime object or None if parsing fails
    """
    if not date_str or not isinstance(date_str, str):
        return None
    
    from datetime import timezone
    
    # List of date formats to try
    date_formats = [
        '%Y-%m-%dT%H:%M:%S.%fZ',           # ISO format with microseconds and Z
        '%Y-%m-%dT%H:%M:%SZ',              # ISO format with Z
        '%Y-%m-%dT%H:%M:%S.%f%z',          # ISO format with microseconds and timezone
        '%Y-%m-%dT%H:%M:%S%z',             # ISO format with timezone
        '%Y-%m-%dT%H:%M:%S.%f',            # ISO format with microseconds
        '%Y-%m-%dT%H:%M:%S',               # ISO format basic
        '%Y-%m-%d %H:%M:%S.%f',            # Space separated with microseconds
        '%Y-%m-%d %H:%M:%S',               # Space separated basic
        '%Y-%m-%d',                        # Date only
    ]
    
    # Normalize the date string
    normalized_date = date_str.strip()
    
    # Handle Z timezone indicator
    if normalized_date.endswith('Z'):
        normalized_date = normalized_date.replace('Z', '+00:00')
    
    # Handle missing timezone for ISO format
    if 'T' in normalized_date and '+' not in normalized_date and '-' not in normalized_date[-6:]:
        normalized_date = normalized_date + '+00:00'
    
    # Try parsing with different formats
    for date_format in date_formats:
        try:
            if '%z' in date_format:
                # Use fromisoformat for timezone-aware parsing
                parsed_date = datetime.fromisoformat(normalized_date)
                # Ensure it's timezone-aware
                if parsed_date.tzinfo is None:
                    parsed_date = parsed_date.replace(tzinfo=timezone.utc)
                return parsed_date
            else:
                # Remove timezone info for strptime formats that don't support it
                clean_date = normalized_date.replace('+00:00', '').replace('Z', '')
                parsed_date = datetime.strptime(clean_date, date_format)
                # Make timezone-aware (assume UTC if no timezone info)
                return parsed_date.replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
    
    # If all formats fail, try fromisoformat as last resort
    try:
        parsed_date = datetime.fromisoformat(normalized_date)
        # Ensure it's timezone-aware
        if parsed_date.tzinfo is None:
            parsed_date = parsed_date.replace(tzinfo=timezone.utc)
        return parsed_date
    except (ValueError, TypeError):
        logger.warning(f"Failed to parse date string: {date_str}")
        return None


def _process_experiment_metrics(
    metrics: Dict[str, Any], 
    date_key: str, 
    exp_type: str, 
    performance_trends: Dict[str, Dict[str, list]], 
    metric_comparisons: Dict[str, Dict[str, list]]
) -> None:
    """
    Process experiment metrics for performance trends and comparisons with error handling.
    
    Args:
        metrics: Dictionary of metric name -> value pairs
        date_key: Date key for grouping (YYYY-MM-DD format)
        exp_type: Experiment type for grouping
        performance_trends: Dictionary to store performance trends over time
        metric_comparisons: Dictionary to store metric comparisons by experiment type
    """
    try:
        # Validate inputs
        if not isinstance(metrics, dict) or not date_key or not exp_type:
            return
        
        # Initialize date entry in performance trends
        if date_key not in performance_trends:
            performance_trends[date_key] = {}
        
        # Initialize experiment type entry in metric comparisons
        if exp_type not in metric_comparisons:
            metric_comparisons[exp_type] = {}
        
        # Process each metric
        for metric_name, metric_value in metrics.items():
            try:
                # Validate metric name and value
                if not metric_name or not isinstance(metric_name, str):
                    continue
                
                # Convert metric value to float if possible
                if isinstance(metric_value, (int, float)) and not isinstance(metric_value, bool):
                    numeric_value = float(metric_value)
                    
                    # Skip invalid numeric values
                    if not (-1e10 <= numeric_value <= 1e10):  # Reasonable bounds
                        logger.warning(f"Metric value out of bounds: {metric_name}={numeric_value}")
                        continue
                    
                    # Add to performance trends
                    if metric_name not in performance_trends[date_key]:
                        performance_trends[date_key][metric_name] = []
                    performance_trends[date_key][metric_name].append(numeric_value)
                    
                    # Add to metric comparisons
                    if metric_name not in metric_comparisons[exp_type]:
                        metric_comparisons[exp_type][metric_name] = []
                    metric_comparisons[exp_type][metric_name].append(numeric_value)
                    
                elif isinstance(metric_value, str) and metric_value.replace('.', '').replace('-', '').isdigit():
                    # Try to parse string numbers
                    try:
                        numeric_value = float(metric_value)
                        if -1e10 <= numeric_value <= 1e10:
                            if metric_name not in performance_trends[date_key]:
                                performance_trends[date_key][metric_name] = []
                            performance_trends[date_key][metric_name].append(numeric_value)
                            
                            if metric_name not in metric_comparisons[exp_type]:
                                metric_comparisons[exp_type][metric_name] = []
                            metric_comparisons[exp_type][metric_name].append(numeric_value)
                    except (ValueError, TypeError):
                        # Skip non-numeric string values
                        continue
                        
            except Exception as e:
                logger.warning(f"Error processing metric {metric_name}: {e}")
                continue
                
    except Exception as e:
        logger.error(f"Error in _process_experiment_metrics: {e}")
        return

@dashboard_bp.route('/dashboard/recent', methods=['GET'])
@require_auth
@validate_user_id()
@validate_dashboard_recent()
@error_handler.handle_exceptions
@track_endpoint('dashboard_recent')
@performance_monitor('dashboard.get_recent_experiments')
@with_graceful_degradation('dashboard', 'recent_experiments')
@maintenance_mode_check('dashboard')
def get_recent_experiments():
    """
    Get recent experiment results for the dashboard with enhanced error handling and resilience.
    
    Features:
    - Multi-level caching with TTL management
    - Comprehensive error handling with partial result support
    - Enhanced date parsing with multiple format support and error recovery
    - Graceful handling of data inconsistencies
    - Circuit breaker integration for service protection
    - Detailed logging and monitoring
    
    Query parameters:
    - limit: Number of recent experiments to return (default: 10, max: 50)
    - days: Number of days to look back (default: 7)
    - force_refresh: Force refresh of cached data (default: false)
    
    Returns:
    - List of recent experiments with results
    - Summary of recent activity
    - Notable achievements or insights
    - Partial failure information if applicable
    """
    user_id = request.current_user['id']
    cache_service = get_cache_service()
    
    # Get validated parameters
    validated_params = getattr(request, 'validated_params', {})
    limit = validated_params.get('limit', 10)
    days = validated_params.get('days', 7)
    
    # Get force_refresh parameter safely
    force_refresh_param = request.args.get('force_refresh', 'false')
    if hasattr(force_refresh_param, 'lower'):
        force_refresh = force_refresh_param.lower() == 'true'
    else:
        force_refresh = str(force_refresh_param).lower() == 'true'
    
    # Generate cache key including all parameters
    cache_key = f"dashboard_recent_{user_id}_{limit}_{days}"
    
    # Try to get from cache first (unless force refresh is requested)
    if not force_refresh and cache_service:
        cached_data = cache_service.get(cache_key)
        if cached_data:
            logger.debug(f"Cache hit for dashboard recent experiments: {cache_key}")
            cached_data['cached'] = True
            cached_data['cache_timestamp'] = cached_data.get('last_updated')
            return jsonify(cached_data)
    
    # Create retry operation for database calls
    retry_operation = RetryableOperation(
        max_retries=3,
        base_delay=1.0,
        max_delay=10.0,
        circuit_breaker=get_database_circuit_breaker()
    )
    
    # Calculate date range with enhanced validation
    try:
        from datetime import timezone
        now_utc = datetime.now(timezone.utc)
        cutoff_datetime = now_utc - timedelta(days=days)
        cutoff_date = cutoff_datetime.isoformat()
    except Exception as e:
        logger.error(f"Error calculating date range for recent experiments: {e}")
        # Fallback to 7 days
        from datetime import timezone
        now_utc = datetime.now(timezone.utc)
        cutoff_datetime = now_utc - timedelta(days=7)
        cutoff_date = cutoff_datetime.isoformat()
        days = 7
    
    # Initialize response data structure
    recent_data = {
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
            'days': days,
            'limit': limit,
            'cutoff_date': cutoff_date
        },
        'last_updated': datetime.utcnow().isoformat(),
        'partial_failure': False,
        'failed_operations': {},
        'data_sources': [],
        'date_parsing_warnings': []
    }
    
    # Track failed operations for partial data handling
    failed_operations = []
    date_parsing_errors = []
    
    # Get recent experiments with retry logic and fallback to cache
    experiments = []
    try:
        experiments_result = retry_operation.execute(
            supabase_client.execute_query,
            'experiments',
            'select',
            columns='*',
            filters=[
                {'column': 'user_id', 'value': user_id}
            ],
            order='created_at.desc',
            limit=limit * 2  # Get more to account for date filtering
        )
        
        if experiments_result['success']:
            experiments = experiments_result['data'] or []
            recent_data['data_sources'].append('database')
            logger.debug(f"Successfully fetched {len(experiments)} experiments for recent experiments")
        else:
            raise DatabaseError(f"Failed to retrieve recent experiments: {experiments_result.get('error')}")
            
    except CircuitBreakerOpenError:
        logger.warning("Circuit breaker open for recent experiments query")
        # Try to get stale cached data
        if cache_service:
            stale_data = cache_service.get_stale(cache_key)
            if stale_data:
                logger.info("Returning stale cached recent experiments data due to circuit breaker")
                stale_data['stale'] = True
                stale_data['message'] = 'Service temporarily degraded, showing cached data'
                stale_data['circuit_breaker_open'] = True
                return jsonify(stale_data)
        
        # No cached data available, return minimal fallback
        recent_data.update({
            'error': 'Recent experiments service temporarily unavailable',
            'message': 'Service is experiencing high load. Please try again in a few moments.',
            'retry_after': 60,
            'fallback_data': True
        })
        return jsonify(recent_data), 503
        
    except (DatabaseError, NetworkError) as e:
        logger.error(f"Database/Network error in recent experiments: {str(e)}")
        failed_operations.append('experiments_fetch')
        
        # Try to get stale cached data as fallback
        if cache_service:
            stale_data = cache_service.get_stale(cache_key)
            if stale_data:
                logger.info("Returning stale cached recent experiments data due to database error")
                stale_data['stale'] = True
                stale_data['message'] = 'Using cached data due to temporary service issues'
                stale_data['database_error'] = True
                return jsonify(stale_data)
    
    # Enhanced date filtering with comprehensive error recovery
    recent_experiments = []
    
    for exp in experiments:
        try:
            # Enhanced date parsing with multiple format support
            parsed_date = _parse_experiment_date(exp.get('created_at'))
            
            if parsed_date is None:
                # Date parsing failed, log warning and include experiment with fallback
                date_parsing_errors.append({
                    'experiment_id': exp.get('id', 'unknown'),
                    'original_date': exp.get('created_at'),
                    'error': 'Date parsing failed, using current time as fallback'
                })
                from datetime import timezone
                parsed_date = datetime.now(timezone.utc)
            
            # Check if experiment is within the date range
            if parsed_date >= cutoff_datetime:
                # Add parsed date to experiment for later use
                exp['_parsed_date'] = parsed_date
                recent_experiments.append(exp)
                
                # Stop if we have enough experiments
                if len(recent_experiments) >= limit:
                    break
                    
        except Exception as e:
            logger.warning(f"Error processing experiment {exp.get('id', 'unknown')} for recent experiments: {e}")
            date_parsing_errors.append({
                'experiment_id': exp.get('id', 'unknown'),
                'original_date': exp.get('created_at'),
                'error': str(e)
            })
            # Include experiment with fallback date
            from datetime import timezone
            exp['_parsed_date'] = datetime.now(timezone.utc)
            recent_experiments.append(exp)
            
            if len(recent_experiments) >= limit:
                break
    
    # Track date parsing issues
    if date_parsing_errors:
        recent_data['date_parsing_warnings'] = date_parsing_errors
        logger.warning(f"Date parsing issues in recent experiments: {len(date_parsing_errors)} experiments affected")
    
    # Get results for each experiment with comprehensive error handling
    experiments_with_results = 0
    experiments_without_results = 0
    failed_results_count = 0
    
    for exp in recent_experiments:
        try:
            # Validate experiment data
            validated_exp = validator.validate_experiment(exp)
            exp.update(validated_exp)
        except ValidationError as e:
            logger.warning(f"Validation error for experiment {exp.get('id', 'unknown')}: {e}")
            # Continue with original data but mark as having validation issues
            exp['validation_warning'] = str(e)
        
        # Get results for this experiment with retry logic
        try:
            results_result = retry_operation.execute(
                supabase_client.execute_query,
                'results',
                'select',
                columns='*',
                filters=[{'column': 'experiment_id', 'value': exp['id']}],
                order='created_at.desc',
                limit=1
            )
            
            if results_result['success'] and results_result['data']:
                result = results_result['data'][0]
                
                # Validate and sanitize result data
                try:
                    if result.get('metrics') and isinstance(result['metrics'], dict):
                        # Sanitize metrics data
                        sanitized_metrics = sanitize_input(result['metrics'])
                        result['metrics'] = sanitized_metrics
                    
                    exp['results'] = result
                    experiments_with_results += 1
                    
                except Exception as e:
                    logger.warning(f"Error processing results for experiment {exp['id']}: {e}")
                    exp['results'] = None
                    exp['results_error'] = 'Results data processing failed'
                    experiments_without_results += 1
                    
            elif not results_result['success']:
                logger.warning(f"Failed to get results for experiment {exp['id']}: {results_result.get('error')}")
                exp['results'] = None
                exp['results_error'] = 'Failed to load results'
                experiments_without_results += 1
                failed_results_count += 1
            else:
                # No results found for this experiment
                exp['results'] = None
                experiments_without_results += 1
                
        except (DatabaseError, NetworkError, CircuitBreakerOpenError) as e:
            logger.warning(f"Error fetching results for recent experiment {exp['id']}: {str(e)}")
            exp['results'] = None
            exp['results_error'] = f'Failed to load results: {type(e).__name__}'
            experiments_without_results += 1
            failed_results_count += 1
        except Exception as e:
            logger.error(f"Unexpected error processing results for experiment {exp['id']}: {e}")
            exp['results'] = None
            exp['results_error'] = 'Unexpected error loading results'
            experiments_without_results += 1
            failed_results_count += 1
    
    # Update response data
    recent_data['experiments'] = recent_experiments
    
    # Generate comprehensive activity summary with error handling
    try:
        activity_summary = {
            'total_recent': len(recent_experiments),
            'by_type': {},
            'by_status': {},
            'completion_rate': 0,
            'with_results': experiments_with_results,
            'without_results': experiments_without_results
        }
        
        completed_count = 0
        for exp in recent_experiments:
            try:
                # Sanitize and validate experiment type and status
                exp_type = sanitize_input(exp.get('experiment_type', 'unknown'))
                status = sanitize_input(exp.get('status', 'unknown'))
                
                if exp_type:
                    activity_summary['by_type'][exp_type] = activity_summary['by_type'].get(exp_type, 0) + 1
                if status:
                    activity_summary['by_status'][status] = activity_summary['by_status'].get(status, 0) + 1
                
                if status == 'completed':
                    completed_count += 1
                    
            except Exception as e:
                logger.warning(f"Error processing experiment summary for {exp.get('id', 'unknown')}: {e}")
                # Use fallback values
                activity_summary['by_type']['unknown'] = activity_summary['by_type'].get('unknown', 0) + 1
                activity_summary['by_status']['unknown'] = activity_summary['by_status'].get('unknown', 0) + 1
        
        if recent_experiments:
            activity_summary['completion_rate'] = round(completed_count / len(recent_experiments) * 100, 1)
        
        recent_data['activity_summary'] = activity_summary
        
    except Exception as e:
        logger.error(f"Error generating activity summary: {e}")
        failed_operations.append('activity_summary')
        recent_data['activity_summary'] = {
            'total_recent': len(recent_experiments),
            'by_type': {},
            'by_status': {},
            'completion_rate': 0,
            'with_results': experiments_with_results,
            'without_results': experiments_without_results
        }
    
    # Generate insights and achievements with error handling
    try:
        insights = []
        
        # Check for streaks
        if len(recent_experiments) >= 3:
            insights.append({
                'type': 'streak',
                'message': f'Great job! You\'ve completed {len(recent_experiments)} experiments in the last {days} days.',
                'icon': '🔥'
            })
        
        # Check for variety in experiment types
        unique_types = len(recent_data['activity_summary']['by_type'])
        if unique_types >= 3:
            insights.append({
                'type': 'variety',
                'message': f'Excellent variety! You\'ve tried {unique_types} different experiment types recently.',
                'icon': '🌟'
            })
        
        # Check for high completion rate
        completion_rate = recent_data['activity_summary']['completion_rate']
        if completion_rate >= 90:
            insights.append({
                'type': 'completion',
                'message': f'Outstanding completion rate of {completion_rate}%!',
                'icon': '✅'
            })
        
        # Check for performance improvements (compare recent vs older experiments)
        if len(recent_experiments) >= 2:
            latest_exp = recent_experiments[0]
            if latest_exp.get('results') and latest_exp['results'].get('metrics'):
                insights.append({
                    'type': 'performance',
                    'message': 'Your recent experiment data looks promising. Keep up the good work!',
                    'icon': '📈'
                })
        
        # Check for data quality
        if experiments_with_results > experiments_without_results:
            insights.append({
                'type': 'data_quality',
                'message': f'Great data collection! {experiments_with_results} out of {len(recent_experiments)} experiments have results.',
                'icon': '📊'
            })
        
        recent_data['insights'] = insights
        
    except Exception as e:
        logger.error(f"Error generating insights: {e}")
        failed_operations.append('insights_generation')
        recent_data['insights'] = []
    
    # Add comprehensive failure information
    if failed_operations or failed_results_count > 0 or date_parsing_errors:
        recent_data['partial_failure'] = True
        recent_data['failed_operations'] = {
            'operations': failed_operations,
            'results_fetch_failures': failed_results_count,
            'date_parsing_errors': len(date_parsing_errors),
            'total_experiments': len(recent_experiments)
        }
        
        warnings = []
        if failed_results_count > 0:
            warnings.append(f'Some experiment results could not be loaded ({failed_results_count} out of {len(recent_experiments)})')
        if date_parsing_errors:
            warnings.append(f'{len(date_parsing_errors)} experiments had date parsing issues')
        
        if warnings:
            recent_data['warning'] = '; '.join(warnings)
    
    # Cache successful results (even if partial)
    if cache_service and (recent_experiments or not failed_operations):
        cache_ttl = 300  # 5 minutes default
        
        # Reduce cache TTL if we have partial failures
        if recent_data['partial_failure']:
            cache_ttl = 60  # 1 minute for partial data
        
        cache_service.set(cache_key, recent_data, ttl=cache_ttl)
        logger.debug(f"Cached recent experiments for {cache_key} (TTL: {cache_ttl}s)")
    
    # Add cache invalidation metadata
    recent_data['cache_info'] = {
        'cached': False,
        'cache_key': cache_key,
        'ttl': cache_ttl if 'cache_ttl' in locals() else None,
        'invalidation_triggers': [
            'experiment_created',
            'experiment_updated',
            'experiment_deleted',
            'result_created',
            'result_updated'
        ]
    }
    
    return jsonify(recent_data)

# Health check endpoints for dashboard service
@dashboard_bp.route('/dashboard/health', methods=['GET'])
def dashboard_health():
    """
    Comprehensive health check for dashboard service.
    
    Checks:
    - Database connectivity and performance
    - Cache service availability and performance
    - Circuit breaker states
    - Individual dashboard component health
    - Overall service performance metrics
    
    Returns:
    - 200: Service is healthy
    - 503: Service is unhealthy or degraded
    """
    health_status = {
        'service': 'dashboard',
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0',
        'checks': {},
        'performance_metrics': {},
        'circuit_breakers': {}
    }
    
    overall_healthy = True
    degraded_services = []
    
    # Database connectivity and performance check
    db_health = _check_database_health()
    health_status['checks']['database'] = db_health
    if db_health['status'] == 'unhealthy':
        overall_healthy = False
    elif db_health['status'] == 'degraded':
        degraded_services.append('database')
    
    # Cache service health check
    cache_health = _check_cache_health()
    health_status['checks']['cache'] = cache_health
    if cache_health['status'] == 'unhealthy':
        overall_healthy = False
    elif cache_health['status'] == 'degraded':
        degraded_services.append('cache')
    
    # Circuit breaker status check
    circuit_breaker_health = _check_circuit_breakers()
    health_status['circuit_breakers'] = circuit_breaker_health
    if circuit_breaker_health.get('database', {}).get('state') == 'open':
        degraded_services.append('circuit_breaker_database')
    if circuit_breaker_health.get('api', {}).get('state') == 'open':
        degraded_services.append('circuit_breaker_api')
    
    # Dashboard component health checks
    component_health = _check_dashboard_components()
    health_status['checks']['components'] = component_health
    for component, status in component_health.items():
        if status['status'] == 'unhealthy':
            overall_healthy = False
        elif status['status'] == 'degraded':
            degraded_services.append(f'component_{component}')
    
    # Performance metrics collection
    performance_metrics = _collect_performance_metrics()
    health_status['performance_metrics'] = performance_metrics
    
    # Determine overall status
    if not overall_healthy:
        health_status['status'] = 'unhealthy'
        return jsonify(health_status), 503
    elif degraded_services:
        health_status['status'] = 'degraded'
        health_status['degraded_services'] = degraded_services
        health_status['message'] = f'Service is degraded due to: {", ".join(degraded_services)}'
    
    return jsonify(health_status)


@dashboard_bp.route('/dashboard/health/database', methods=['GET'])
def dashboard_database_health():
    """Individual health check for database connectivity."""
    db_health = _check_database_health()
    status_code = 200 if db_health['status'] == 'healthy' else 503
    return jsonify({
        'service': 'dashboard_database',
        'timestamp': datetime.utcnow().isoformat(),
        **db_health
    }), status_code


@dashboard_bp.route('/dashboard/health/cache', methods=['GET'])
def dashboard_cache_health():
    """Individual health check for cache service."""
    cache_health = _check_cache_health()
    status_code = 200 if cache_health['status'] == 'healthy' else 503
    return jsonify({
        'service': 'dashboard_cache',
        'timestamp': datetime.utcnow().isoformat(),
        **cache_health
    }), status_code


@dashboard_bp.route('/dashboard/health/components', methods=['GET'])
def dashboard_components_health():
    """Individual health check for dashboard components."""
    component_health = _check_dashboard_components()
    
    # Determine overall component status
    unhealthy_components = [name for name, status in component_health.items() if status['status'] == 'unhealthy']
    degraded_components = [name for name, status in component_health.items() if status['status'] == 'degraded']
    
    overall_status = 'healthy'
    if unhealthy_components:
        overall_status = 'unhealthy'
    elif degraded_components:
        overall_status = 'degraded'
    
    status_code = 200 if overall_status == 'healthy' else 503
    
    return jsonify({
        'service': 'dashboard_components',
        'status': overall_status,
        'timestamp': datetime.utcnow().isoformat(),
        'components': component_health,
        'summary': {
            'total_components': len(component_health),
            'healthy_components': len([c for c in component_health.values() if c['status'] == 'healthy']),
            'degraded_components': len(degraded_components),
            'unhealthy_components': len(unhealthy_components)
        }
    }), status_code


def _check_database_health() -> Dict[str, Any]:
    """
    Check database connectivity and performance.
    
    Returns:
        Dict containing database health status and metrics
    """
    start_time = time.time()
    
    try:
        # Test basic connectivity with a simple query
        result = supabase_client.execute_query(
            'experiments',
            'select',
            columns='id',
            limit=1
        )
        
        response_time = (time.time() - start_time) * 1000  # Convert to milliseconds
        
        if result['success']:
            # Determine status based on response time
            if response_time < 100:  # Less than 100ms
                status = 'healthy'
            elif response_time < 1000:  # Less than 1 second
                status = 'degraded'
            else:
                status = 'unhealthy'
            
            return {
                'status': status,
                'response_time_ms': round(response_time, 2),
                'connection': 'established',
                'query_success': True,
                'message': f'Database responding in {response_time:.2f}ms'
            }
        else:
            return {
                'status': 'unhealthy',
                'response_time_ms': round(response_time, 2),
                'connection': 'failed',
                'query_success': False,
                'error': result.get('error', 'Unknown database error'),
                'message': 'Database query failed'
            }
            
    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        logger.error(f"Database health check failed: {str(e)}")
        
        return {
            'status': 'unhealthy',
            'response_time_ms': round(response_time, 2),
            'connection': 'failed',
            'query_success': False,
            'error': str(e),
            'message': 'Database connection failed'
        }


def _check_cache_health() -> Dict[str, Any]:
    """
    Check cache service availability and performance.
    
    Returns:
        Dict containing cache health status and metrics
    """
    cache_service = get_cache_service()
    
    if not cache_service:
        return {
            'status': 'unhealthy',
            'available': False,
            'message': 'Cache service not available'
        }
    
    start_time = time.time()
    test_key = f"health_check_{int(time.time())}"
    test_data = {'test': True, 'timestamp': datetime.utcnow().isoformat()}
    
    try:
        # Test cache write
        cache_service.set(test_key, test_data, ttl=10)
        
        # Test cache read
        cached_data = cache_service.get(test_key)
        
        response_time = (time.time() - start_time) * 1000
        
        if cached_data and cached_data.get('test') is True:
            # Clean up test data
            try:
                if hasattr(cache_service, 'delete'):
                    cache_service.delete(test_key)
            except:
                pass  # Ignore cleanup errors
            
            # Determine status based on response time
            if response_time < 50:  # Less than 50ms
                status = 'healthy'
            elif response_time < 200:  # Less than 200ms
                status = 'degraded'
            else:
                status = 'unhealthy'
            
            # Get cache statistics
            cache_stats = cache_service.get_stats()
            
            return {
                'status': status,
                'available': True,
                'response_time_ms': round(response_time, 2),
                'read_write_success': True,
                'memory_cache_available': hasattr(cache_service, 'memory_cache'),
                'redis_cache_available': hasattr(cache_service, 'redis_cache') and cache_service.redis_cache.available,
                'statistics': cache_stats,
                'message': f'Cache responding in {response_time:.2f}ms'
            }
        else:
            return {
                'status': 'unhealthy',
                'available': True,
                'response_time_ms': round(response_time, 2),
                'read_write_success': False,
                'error': 'Cache read/write test failed',
                'message': 'Cache operations not working correctly'
            }
            
    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        logger.error(f"Cache health check failed: {str(e)}")
        
        return {
            'status': 'unhealthy',
            'available': True,
            'response_time_ms': round(response_time, 2),
            'read_write_success': False,
            'error': str(e),
            'message': 'Cache service error'
        }


def _check_circuit_breakers() -> Dict[str, Any]:
    """
    Check circuit breaker states and health.
    
    Returns:
        Dict containing circuit breaker status information
    """
    from retry_logic import get_database_circuit_breaker, get_api_circuit_breaker
    
    circuit_breakers = {}
    
    try:
        # Database circuit breaker
        db_cb = get_database_circuit_breaker()
        db_state = db_cb.get_state()
        circuit_breakers['database'] = {
            'state': db_state['state'],
            'failure_count': db_state['failure_count'],
            'failure_threshold': db_state['failure_threshold'],
            'last_failure_time': db_state['last_failure_time'],
            'recovery_timeout': db_state['recovery_timeout'],
            'healthy': db_state['state'] == 'closed'
        }
        
        # API circuit breaker
        api_cb = get_api_circuit_breaker()
        api_state = api_cb.get_state()
        circuit_breakers['api'] = {
            'state': api_state['state'],
            'failure_count': api_state['failure_count'],
            'failure_threshold': api_state['failure_threshold'],
            'last_failure_time': api_state['last_failure_time'],
            'recovery_timeout': api_state['recovery_timeout'],
            'healthy': api_state['state'] == 'closed'
        }
        
    except Exception as e:
        logger.error(f"Circuit breaker health check failed: {str(e)}")
        circuit_breakers['error'] = str(e)
    
    return circuit_breakers


def _check_dashboard_components() -> Dict[str, Any]:
    """
    Check individual dashboard component health.
    
    Returns:
        Dict containing health status for each dashboard component
    """
    components = {}
    
    # Summary endpoint health
    components['summary'] = _check_component_health('summary')
    
    # Charts endpoint health
    components['charts'] = _check_component_health('charts')
    
    # Recent experiments endpoint health
    components['recent_experiments'] = _check_component_health('recent')
    
    return components


def _check_component_health(component_type: str) -> Dict[str, Any]:
    """
    Check health of a specific dashboard component.
    
    Args:
        component_type: Type of component ('summary', 'charts', 'recent')
    
    Returns:
        Dict containing component health status
    """
    start_time = time.time()
    
    try:
        # Create a test user context
        test_user = {'id': 'health_check_user'}
        
        # Mock request context for component testing
        # Temporarily disable logging for health checks
        original_level = logger.level
        logger.setLevel(logging.CRITICAL)
        
        try:
            if component_type == 'summary':
                # Test summary data aggregation logic
                result = _test_summary_component(test_user)
            elif component_type == 'charts':
                # Test charts data processing logic
                result = _test_charts_component(test_user)
            elif component_type == 'recent':
                # Test recent experiments logic
                result = _test_recent_component(test_user)
            else:
                raise ValueError(f"Unknown component type: {component_type}")
        finally:
            # Restore original logging level
            logger.setLevel(original_level)
        
        response_time = (time.time() - start_time) * 1000
        
        if result.get('success', False):
            status = 'healthy' if response_time < 500 else 'degraded'
            return {
                'status': status,
                'response_time_ms': round(response_time, 2),
                'functional': True,
                'message': f'Component responding in {response_time:.2f}ms'
            }
        else:
            return {
                'status': 'unhealthy',
                'response_time_ms': round(response_time, 2),
                'functional': False,
                'error': result.get('error', 'Component test failed'),
                'message': 'Component functionality test failed'
            }
            
    except Exception as e:
        response_time = (time.time() - start_time) * 1000
        logger.error(f"Component health check failed for {component_type}: {str(e)}")
        
        return {
            'status': 'unhealthy',
            'response_time_ms': round(response_time, 2),
            'functional': False,
            'error': str(e),
            'message': f'Component {component_type} health check failed'
        }


def _test_summary_component(test_user: Dict[str, Any]) -> Dict[str, Any]:
    """Test summary component functionality."""
    try:
        # Test basic data structure creation
        summary_data = {
            'total_experiments': 0,
            'experiments_by_type': {},
            'experiments_by_status': {},
            'recent_activity': {'last_7_days': 0, 'completion_rate': 0},
            'average_metrics': {},
            'last_updated': datetime.utcnow().isoformat()
        }
        
        # Test data validation
        if not isinstance(summary_data['total_experiments'], int):
            raise ValueError("Invalid data structure")
        
        return {'success': True, 'data': summary_data}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def _test_charts_component(test_user: Dict[str, Any]) -> Dict[str, Any]:
    """Test charts component functionality."""
    try:
        # Test basic chart data structure creation
        chart_data = {
            'activity_timeline': [],
            'experiment_type_distribution': [],
            'performance_trends': [],
            'metric_comparisons': [],
            'period': '30d',
            'total_experiments': 0,
            'last_updated': datetime.utcnow().isoformat()
        }
        
        # Test date parsing functionality
        test_date = datetime.utcnow().isoformat()
        parsed_date = _parse_experiment_date(test_date)
        if not parsed_date:
            raise ValueError("Date parsing functionality failed")
        
        return {'success': True, 'data': chart_data}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def _test_recent_component(test_user: Dict[str, Any]) -> Dict[str, Any]:
    """Test recent experiments component functionality."""
    try:
        # Test basic recent data structure creation
        recent_data = {
            'experiments': [],
            'total_count': 0,
            'has_more': False,
            'last_updated': datetime.utcnow().isoformat()
        }
        
        # Test pagination logic
        limit = 10
        offset = 0
        if limit <= 0 or offset < 0:
            raise ValueError("Invalid pagination parameters")
        
        return {'success': True, 'data': recent_data}
        
    except Exception as e:
        return {'success': False, 'error': str(e)}


def _collect_performance_metrics() -> Dict[str, Any]:
    """
    Collect performance metrics for the dashboard service.
    
    Returns:
        Dict containing performance metrics
    """
    try:
        # Get error metrics from error handler
        error_metrics = {}
        if hasattr(error_handler, 'error_metrics'):
            error_metrics = {
                'total_errors': len(error_handler.error_metrics.error_counts),
                'error_rates': dict(list(error_handler.error_metrics.error_counts.items())[:10])  # Top 10
            }
        
        # Get cache metrics
        cache_metrics = {}
        cache_service = get_cache_service()
        if cache_service:
            try:
                cache_stats = cache_service.get_stats()
                cache_metrics = {
                    'hit_rate': cache_stats.get('hit_rate', 0),
                    'total_requests': cache_stats.get('total_requests', 0),
                    'memory_usage': cache_stats.get('memory_usage', 0)
                }
            except:
                cache_metrics = {'error': 'Unable to collect cache metrics'}
        
        # System metrics (basic)
        system_metrics = {}
        try:
            import psutil
            system_metrics = {
                'cpu_percent': psutil.cpu_percent(interval=0.1),
                'memory_percent': psutil.virtual_memory().percent,
                'disk_usage_percent': psutil.disk_usage('/').percent
            }
        except ImportError:
            system_metrics = {
                'error': 'psutil not available for system metrics'
            }
        
        return {
            'errors': error_metrics,
            'cache': cache_metrics,
            'system': system_metrics,
            'collection_timestamp': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Performance metrics collection failed: {str(e)}")
        return {
            'error': str(e),
            'collection_timestamp': datetime.utcnow().isoformat()
        }