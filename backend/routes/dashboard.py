"""
Dashboard API routes for NeuroLab 360.
Handles data aggregation and visualization endpoints for the dashboard.
"""

from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from functools import wraps
from typing import Dict, List, Any, Optional

from supabase_client import get_supabase_client

# Create blueprint for dashboard routes
dashboard_bp = Blueprint('dashboard', __name__)

# Get Supabase client
supabase_client = get_supabase_client()

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
def get_dashboard_summary():
    """
    Get experiment summary statistics for the dashboard.
    
    Returns:
    - Total experiments count
    - Experiments by type breakdown
    - Experiments by status breakdown
    - Recent activity summary
    - Average metrics across experiments
    """
    try:
        user_id = request.current_user['id']
        
        # Get all experiments for the user
        experiments_result = supabase_client.execute_query(
            'experiments',
            'select',
            columns='*',
            filters=[{'column': 'user_id', 'value': user_id}]
        )
        
        if not experiments_result['success']:
            return jsonify({'error': 'Failed to retrieve experiments'}), 500
        
        experiments = experiments_result['data']
        total_experiments = len(experiments)
        
        # Calculate experiments by type
        experiments_by_type = {}
        experiments_by_status = {}
        
        for exp in experiments:
            exp_type = exp['experiment_type']
            status = exp['status']
            
            experiments_by_type[exp_type] = experiments_by_type.get(exp_type, 0) + 1
            experiments_by_status[status] = experiments_by_status.get(status, 0) + 1
        
        # Get recent activity (last 7 days)
        seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        recent_experiments = [
            exp for exp in experiments 
            if exp['created_at'] >= seven_days_ago
        ]
        
        # Get all results for metric calculations
        all_results = []
        for exp in experiments:
            results_result = supabase_client.execute_query(
                'results',
                'select',
                columns='*',
                filters=[{'column': 'experiment_id', 'value': exp['id']}]
            )
            
            if results_result['success'] and results_result['data']:
                all_results.extend(results_result['data'])
        
        # Calculate average metrics across all experiments
        avg_metrics = {}
        if all_results:
            # Collect all metric values by type
            metric_values = {}
            for result in all_results:
                if result['metrics']:
                    for key, value in result['metrics'].items():
                        if isinstance(value, (int, float)):
                            if key not in metric_values:
                                metric_values[key] = []
                            metric_values[key].append(value)
            
            # Calculate averages
            for key, values in metric_values.items():
                if values:
                    avg_metrics[key] = round(sum(values) / len(values), 2)
        
        # Calculate completion rate
        completed_experiments = experiments_by_status.get('completed', 0)
        completion_rate = (completed_experiments / total_experiments * 100) if total_experiments > 0 else 0
        
        summary_data = {
            'total_experiments': total_experiments,
            'experiments_by_type': experiments_by_type,
            'experiments_by_status': experiments_by_status,
            'recent_activity': {
                'last_7_days': len(recent_experiments),
                'completion_rate': round(completion_rate, 1)
            },
            'average_metrics': avg_metrics,
            'last_updated': datetime.utcnow().isoformat()
        }
        
        return jsonify(summary_data)
        
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@dashboard_bp.route('/dashboard/charts', methods=['GET'])
@require_auth
def get_dashboard_charts():
    """
    Get data formatted for dashboard visualizations and charts.
    
    Query parameters:
    - period: Time period for data ('7d', '30d', '90d', 'all') - default: '30d'
    - experiment_type: Filter by specific experiment type
    
    Returns:
    - Time series data for experiment activity
    - Distribution data for experiment types
    - Performance trends over time
    - Metric comparisons across experiment types
    """
    try:
        user_id = request.current_user['id']
        
        # Parse query parameters
        period = request.args.get('period', '30d')
        experiment_type_filter = request.args.get('experiment_type')
        
        # Calculate date range based on period
        now = datetime.utcnow()
        if period == '7d':
            start_date = now - timedelta(days=7)
        elif period == '30d':
            start_date = now - timedelta(days=30)
        elif period == '90d':
            start_date = now - timedelta(days=90)
        else:  # 'all'
            start_date = datetime(2020, 1, 1)  # Far back date
        
        # Build filters
        filters = [{'column': 'user_id', 'value': user_id}]
        if experiment_type_filter:
            filters.append({'column': 'experiment_type', 'value': experiment_type_filter})
        
        # Get experiments within the date range
        experiments_result = supabase_client.execute_query(
            'experiments',
            'select',
            columns='*',
            filters=filters,
            order='created_at.asc'
        )
        
        if not experiments_result['success']:
            return jsonify({'error': 'Failed to retrieve experiments'}), 500
        
        # Filter experiments by date range
        filtered_experiments = []
        for exp in experiments_result['data']:
            try:
                # Handle different datetime formats
                created_at_str = exp['created_at']
                if created_at_str.endswith('Z'):
                    created_at_str = created_at_str.replace('Z', '+00:00')
                elif '+' not in created_at_str and 'T' in created_at_str:
                    # Add timezone if missing
                    created_at_str = created_at_str + '+00:00'
                
                exp_date = datetime.fromisoformat(created_at_str)
                if exp_date >= start_date:
                    filtered_experiments.append(exp)
            except (ValueError, TypeError):
                # If date parsing fails, include the experiment
                filtered_experiments.append(exp)
        
        experiments = filtered_experiments
        
        # Generate time series data for experiment activity
        activity_timeline = {}
        experiment_type_distribution = {}
        
        for exp in experiments:
            # Parse date and group by day
            try:
                created_at_str = exp['created_at']
                if created_at_str.endswith('Z'):
                    created_at_str = created_at_str.replace('Z', '+00:00')
                elif '+' not in created_at_str and 'T' in created_at_str:
                    created_at_str = created_at_str + '+00:00'
                
                exp_date = datetime.fromisoformat(created_at_str)
                date_key = exp_date.strftime('%Y-%m-%d')
            except (ValueError, TypeError):
                # Fallback to current date if parsing fails
                date_key = datetime.utcnow().strftime('%Y-%m-%d')
            
            # Count experiments per day
            activity_timeline[date_key] = activity_timeline.get(date_key, 0) + 1
            
            # Count by experiment type
            exp_type = exp['experiment_type']
            experiment_type_distribution[exp_type] = experiment_type_distribution.get(exp_type, 0) + 1
        
        # Convert timeline to chart format
        timeline_data = [
            {'date': date, 'count': count}
            for date, count in sorted(activity_timeline.items())
        ]
        
        # Convert distribution to chart format
        distribution_data = [
            {'type': exp_type, 'count': count}
            for exp_type, count in experiment_type_distribution.items()
        ]
        
        # Get performance trends (metrics over time)
        performance_trends = {}
        metric_comparisons = {}
        
        for exp in experiments:
            # Get results for this experiment
            results_result = supabase_client.execute_query(
                'results',
                'select',
                columns='*',
                filters=[{'column': 'experiment_id', 'value': exp['id']}]
            )
            
            if results_result['success'] and results_result['data']:
                result = results_result['data'][0]  # Get the latest result
                try:
                    created_at_str = exp['created_at']
                    if created_at_str.endswith('Z'):
                        created_at_str = created_at_str.replace('Z', '+00:00')
                    elif '+' not in created_at_str and 'T' in created_at_str:
                        created_at_str = created_at_str + '+00:00'
                    
                    exp_date = datetime.fromisoformat(created_at_str)
                    date_key = exp_date.strftime('%Y-%m-%d')
                except (ValueError, TypeError):
                    date_key = datetime.utcnow().strftime('%Y-%m-%d')
                
                exp_type = exp['experiment_type']
                
                if result['metrics']:
                    # Track performance trends over time
                    if date_key not in performance_trends:
                        performance_trends[date_key] = {}
                    
                    for metric_name, metric_value in result['metrics'].items():
                        if isinstance(metric_value, (int, float)):
                            if metric_name not in performance_trends[date_key]:
                                performance_trends[date_key][metric_name] = []
                            performance_trends[date_key][metric_name].append(metric_value)
                    
                    # Track metric comparisons by experiment type
                    if exp_type not in metric_comparisons:
                        metric_comparisons[exp_type] = {}
                    
                    for metric_name, metric_value in result['metrics'].items():
                        if isinstance(metric_value, (int, float)):
                            if metric_name not in metric_comparisons[exp_type]:
                                metric_comparisons[exp_type][metric_name] = []
                            metric_comparisons[exp_type][metric_name].append(metric_value)
        
        # Process performance trends (average metrics per day)
        trends_data = []
        for date, metrics in sorted(performance_trends.items()):
            trend_point = {'date': date}
            for metric_name, values in metrics.items():
                trend_point[metric_name] = round(sum(values) / len(values), 2)
            trends_data.append(trend_point)
        
        # Process metric comparisons (average metrics per experiment type)
        comparisons_data = []
        for exp_type, metrics in metric_comparisons.items():
            comparison_point = {'experiment_type': exp_type}
            for metric_name, values in metrics.items():
                comparison_point[metric_name] = round(sum(values) / len(values), 2)
            comparisons_data.append(comparison_point)
        
        chart_data = {
            'activity_timeline': timeline_data,
            'experiment_type_distribution': distribution_data,
            'performance_trends': trends_data,
            'metric_comparisons': comparisons_data,
            'period': period,
            'total_experiments': len(experiments),
            'date_range': {
                'start': start_date.isoformat(),
                'end': now.isoformat()
            }
        }
        
        return jsonify(chart_data)
        
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@dashboard_bp.route('/dashboard/recent', methods=['GET'])
@require_auth
def get_recent_experiments():
    """
    Get recent experiment results for the dashboard.
    
    Query parameters:
    - limit: Number of recent experiments to return (default: 10, max: 50)
    - days: Number of days to look back (default: 7)
    
    Returns:
    - List of recent experiments with results
    - Summary of recent activity
    - Notable achievements or insights
    """
    try:
        user_id = request.current_user['id']
        
        # Parse query parameters
        limit = min(int(request.args.get('limit', 10)), 50)
        days = int(request.args.get('days', 7))
        
        # Calculate date range
        cutoff_date = (datetime.utcnow() - timedelta(days=days)).isoformat()
        
        # Get recent experiments
        experiments_result = supabase_client.execute_query(
            'experiments',
            'select',
            columns='*',
            filters=[
                {'column': 'user_id', 'value': user_id}
            ],
            order='created_at.desc',
            limit=limit
        )
        
        if not experiments_result['success']:
            return jsonify({'error': 'Failed to retrieve recent experiments'}), 500
        
        experiments = experiments_result['data']
        
        # Filter by date and get results for each experiment
        recent_experiments = []
        for exp in experiments:
            try:
                # Handle different datetime formats
                created_at_str = exp['created_at']
                if created_at_str.endswith('Z'):
                    created_at_str = created_at_str.replace('Z', '+00:00')
                elif '+' not in created_at_str and 'T' in created_at_str:
                    created_at_str = created_at_str + '+00:00'
                
                exp_date = datetime.fromisoformat(created_at_str)
                cutoff_datetime = datetime.fromisoformat(cutoff_date.replace('Z', '+00:00') if cutoff_date.endswith('Z') else cutoff_date)
                
                if exp_date >= cutoff_datetime:
                    include_experiment = True
                else:
                    include_experiment = False
            except (ValueError, TypeError):
                # If date parsing fails, include the experiment
                include_experiment = True
            
            if include_experiment:
                # Get results for this experiment
                results_result = supabase_client.execute_query(
                    'results',
                    'select',
                    columns='*',
                    filters=[{'column': 'experiment_id', 'value': exp['id']}],
                    order='created_at.desc',
                    limit=1
                )
                
                if results_result['success'] and results_result['data']:
                    exp['results'] = results_result['data'][0]
                else:
                    exp['results'] = None
                
                recent_experiments.append(exp)
        
        # Generate activity summary
        activity_summary = {
            'total_recent': len(recent_experiments),
            'by_type': {},
            'by_status': {},
            'completion_rate': 0
        }
        
        completed_count = 0
        for exp in recent_experiments:
            exp_type = exp['experiment_type']
            status = exp['status']
            
            activity_summary['by_type'][exp_type] = activity_summary['by_type'].get(exp_type, 0) + 1
            activity_summary['by_status'][status] = activity_summary['by_status'].get(status, 0) + 1
            
            if status == 'completed':
                completed_count += 1
        
        if recent_experiments:
            activity_summary['completion_rate'] = round(completed_count / len(recent_experiments) * 100, 1)
        
        # Generate insights and achievements
        insights = []
        
        # Check for streaks
        if len(recent_experiments) >= 3:
            insights.append({
                'type': 'streak',
                'message': f'Great job! You\'ve completed {len(recent_experiments)} experiments in the last {days} days.',
                'icon': '🔥'
            })
        
        # Check for variety in experiment types
        unique_types = len(activity_summary['by_type'])
        if unique_types >= 3:
            insights.append({
                'type': 'variety',
                'message': f'Excellent variety! You\'ve tried {unique_types} different experiment types recently.',
                'icon': '🌟'
            })
        
        # Check for high completion rate
        if activity_summary['completion_rate'] >= 90:
            insights.append({
                'type': 'completion',
                'message': f'Outstanding completion rate of {activity_summary["completion_rate"]}%!',
                'icon': '✅'
            })
        
        # Check for performance improvements (compare recent vs older experiments)
        if len(recent_experiments) >= 2:
            # Simple check: if latest experiment has better metrics than previous
            latest_exp = recent_experiments[0]
            if latest_exp['results'] and latest_exp['results']['metrics']:
                insights.append({
                    'type': 'performance',
                    'message': 'Your recent experiment data looks promising. Keep up the good work!',
                    'icon': '📈'
                })
        
        recent_data = {
            'experiments': recent_experiments,
            'activity_summary': activity_summary,
            'insights': insights,
            'period': {
                'days': days,
                'limit': limit,
                'cutoff_date': cutoff_date
            },
            'last_updated': datetime.utcnow().isoformat()
        }
        
        return jsonify(recent_data)
        
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

# Health check endpoint for dashboard service
@dashboard_bp.route('/dashboard/health', methods=['GET'])
def dashboard_health():
    """Health check for dashboard service."""
    return jsonify({
        'service': 'dashboard',
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat()
    })