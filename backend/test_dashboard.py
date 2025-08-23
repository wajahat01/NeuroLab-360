"""
Unit tests for dashboard API routes.
Tests data aggregation and visualization endpoints for the NeuroLab 360 dashboard.
"""

import pytest
import json
import uuid
import os
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock

# Set environment variables before importing
os.environ['SUPABASE_URL'] = 'https://test.supabase.co'
os.environ['SUPABASE_ANON_KEY'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTY0NjA2ODQwMCwiZXhwIjoxOTYxNjQ0NDAwfQ.test'

from app import create_app
from supabase_client import get_supabase_client


class TestDashboardRoutes:
    """Test suite for dashboard API endpoints."""
    
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
    
    @pytest.fixture
    def sample_experiments(self, mock_user):
        """Sample experiment data for testing."""
        base_time = datetime.utcnow()
        return [
            {
                'id': str(uuid.uuid4()),
                'user_id': mock_user['id'],
                'name': 'Heart Rate Test 1',
                'experiment_type': 'heart_rate',
                'parameters': {'duration_minutes': 5, 'baseline_bpm': 75},
                'status': 'completed',
                'created_at': base_time.isoformat(),
                'updated_at': base_time.isoformat()
            },
            {
                'id': str(uuid.uuid4()),
                'user_id': mock_user['id'],
                'name': 'Reaction Time Test',
                'experiment_type': 'reaction_time',
                'parameters': {'trials': 10},
                'status': 'completed',
                'created_at': (base_time - timedelta(days=2)).isoformat(),
                'updated_at': (base_time - timedelta(days=2)).isoformat()
            },
            {
                'id': str(uuid.uuid4()),
                'user_id': mock_user['id'],
                'name': 'Memory Test',
                'experiment_type': 'memory',
                'parameters': {'items_count': 10},
                'status': 'pending',
                'created_at': (base_time - timedelta(days=5)).isoformat(),
                'updated_at': (base_time - timedelta(days=5)).isoformat()
            }
        ]
    
    @pytest.fixture
    def sample_results(self, sample_experiments):
        """Sample results data for testing."""
        return [
            {
                'id': str(uuid.uuid4()),
                'experiment_id': sample_experiments[0]['id'],
                'data_points': [
                    {'timestamp': 0, 'value': 75.5, 'metadata': {'unit': 'bpm'}},
                    {'timestamp': 1, 'value': 76.2, 'metadata': {'unit': 'bpm'}}
                ],
                'metrics': {'mean': 75.85, 'std_dev': 0.35, 'min': 75.5, 'max': 76.2},
                'analysis_summary': 'Heart rate monitoring completed',
                'created_at': datetime.utcnow().isoformat()
            },
            {
                'id': str(uuid.uuid4()),
                'experiment_id': sample_experiments[1]['id'],
                'data_points': [
                    {'timestamp': 0, 'value': 250.0, 'metadata': {'unit': 'ms'}},
                    {'timestamp': 1, 'value': 275.0, 'metadata': {'unit': 'ms'}}
                ],
                'metrics': {'mean': 262.5, 'std_dev': 12.5, 'min': 250.0, 'max': 275.0},
                'analysis_summary': 'Reaction time test completed',
                'created_at': (datetime.utcnow() - timedelta(days=2)).isoformat()
            }
        ]

    def test_dashboard_summary_success(self, client, auth_headers, mock_user, sample_experiments, sample_results):
        """Test successful dashboard summary retrieval."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                # Mock experiments query
                mock_query.side_effect = [
                    {'success': True, 'data': sample_experiments},  # experiments query
                    {'success': True, 'data': [sample_results[0]]},  # results for exp 1
                    {'success': True, 'data': [sample_results[1]]},  # results for exp 2
                    {'success': True, 'data': []},  # results for exp 3 (no results)
                ]
                
                response = client.get('/api/dashboard/summary', headers=auth_headers)
                
                assert response.status_code == 200
                data = json.loads(response.data)
                
                # Check summary structure
                assert 'total_experiments' in data
                assert 'experiments_by_type' in data
                assert 'experiments_by_status' in data
                assert 'recent_activity' in data
                assert 'average_metrics' in data
                assert 'last_updated' in data
                
                # Check values
                assert data['total_experiments'] == 3
                assert data['experiments_by_type']['heart_rate'] == 1
                assert data['experiments_by_type']['reaction_time'] == 1
                assert data['experiments_by_type']['memory'] == 1
                assert data['experiments_by_status']['completed'] == 2
                assert data['experiments_by_status']['pending'] == 1
                
                # Check average metrics calculation
                assert 'mean' in data['average_metrics']
                assert data['average_metrics']['mean'] == 169.18  # (75.85 + 262.5) / 2 rounded

    def test_dashboard_summary_no_experiments(self, client, auth_headers, mock_user):
        """Test dashboard summary with no experiments."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query', return_value={'success': True, 'data': []}):
                response = client.get('/api/dashboard/summary', headers=auth_headers)
                
                assert response.status_code == 200
                data = json.loads(response.data)
                
                assert data['total_experiments'] == 0
                assert data['experiments_by_type'] == {}
                assert data['experiments_by_status'] == {}
                assert data['recent_activity']['completion_rate'] == 0

    def test_dashboard_summary_unauthorized(self, client):
        """Test dashboard summary without authentication."""
        response = client.get('/api/dashboard/summary')
        assert response.status_code == 401

    def test_dashboard_summary_database_error(self, client, auth_headers, mock_user):
        """Test dashboard summary with database error - now handles gracefully with fallback."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query', return_value={'success': False, 'error': 'DB Error'}):
                response = client.get('/api/dashboard/summary', headers=auth_headers)
                
                # Enhanced implementation now handles database errors gracefully
                # Returns 200 with fallback data structure instead of 500 error
                assert response.status_code == 200
                data = json.loads(response.data)
                
                # Should have basic structure with empty/default values
                assert 'total_experiments' in data
                assert 'experiments_by_type' in data
                assert 'experiments_by_status' in data
                assert 'recent_activity' in data
                assert 'failed_operations' in data
                assert data['total_experiments'] == 0  # No experiments due to DB error

    def test_dashboard_charts_success(self, client, auth_headers, mock_user, sample_experiments, sample_results):
        """Test successful dashboard charts data retrieval."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                # Mock experiments query
                mock_query.side_effect = [
                    {'success': True, 'data': sample_experiments},  # experiments query
                    {'success': True, 'data': [sample_results[0]]},  # results for exp 1
                    {'success': True, 'data': [sample_results[1]]},  # results for exp 2
                    {'success': True, 'data': []},  # results for exp 3
                ]
                
                response = client.get('/api/dashboard/charts', headers=auth_headers)
                
                assert response.status_code == 200
                data = json.loads(response.data)
                
                # Check chart data structure
                assert 'activity_timeline' in data
                assert 'experiment_type_distribution' in data
                assert 'performance_trends' in data
                assert 'metric_comparisons' in data
                assert 'period' in data
                assert 'total_experiments' in data
                assert 'date_range' in data
                
                # Check default period
                assert data['period'] == '30d'
                
                # Check distribution data
                distribution = {item['type']: item['count'] for item in data['experiment_type_distribution']}
                assert distribution['heart_rate'] == 1
                assert distribution['reaction_time'] == 1
                assert distribution['memory'] == 1

    def test_dashboard_charts_with_period_filter(self, client, auth_headers, mock_user, sample_experiments):
        """Test dashboard charts with period filter."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                # Mock experiments query and results queries
                mock_query.side_effect = [
                    {'success': True, 'data': sample_experiments},  # experiments query
                    {'success': True, 'data': []},  # results for exp 1
                    {'success': True, 'data': []},  # results for exp 2
                    {'success': True, 'data': []},  # results for exp 3
                ]
                
                response = client.get('/api/dashboard/charts?period=7d', headers=auth_headers)
                
                assert response.status_code == 200
                data = json.loads(response.data)
                assert data['period'] == '7d'

    def test_dashboard_charts_with_experiment_type_filter(self, client, auth_headers, mock_user, sample_experiments):
        """Test dashboard charts with experiment type filter."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                # Mock experiments query and results queries
                mock_query.side_effect = [
                    {'success': True, 'data': [sample_experiments[0]]},  # experiments query (filtered)
                    {'success': True, 'data': []},  # results for exp 1
                ]
                
                response = client.get('/api/dashboard/charts?experiment_type=heart_rate', headers=auth_headers)
                
                assert response.status_code == 200
                data = json.loads(response.data)
                
                # Verify the filter was applied by checking the first call
                first_call = mock_query.call_args_list[0]
                assert first_call[1]['filters'] == [
                    {'column': 'user_id', 'value': mock_user['id']},
                    {'column': 'experiment_type', 'value': 'heart_rate'}
                ]

    def test_dashboard_charts_unauthorized(self, client):
        """Test dashboard charts without authentication."""
        response = client.get('/api/dashboard/charts')
        assert response.status_code == 401

    def test_dashboard_recent_success(self, client, auth_headers, mock_user, sample_experiments, sample_results):
        """Test successful recent experiments retrieval."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                # Mock experiments query and results queries
                mock_query.side_effect = [
                    {'success': True, 'data': sample_experiments},  # experiments query
                    {'success': True, 'data': [sample_results[0]]},  # results for exp 1
                    {'success': True, 'data': [sample_results[1]]},  # results for exp 2
                    {'success': True, 'data': []},  # results for exp 3
                ]
                
                response = client.get('/api/dashboard/recent', headers=auth_headers)
                
                assert response.status_code == 200
                data = json.loads(response.data)
                
                # Check structure
                assert 'experiments' in data
                assert 'activity_summary' in data
                assert 'insights' in data
                assert 'period' in data
                assert 'last_updated' in data
                
                # Check activity summary
                summary = data['activity_summary']
                assert 'total_recent' in summary
                assert 'by_type' in summary
                assert 'by_status' in summary
                assert 'completion_rate' in summary
                
                # Check insights generation
                assert isinstance(data['insights'], list)

    def test_dashboard_recent_with_limit(self, client, auth_headers, mock_user, sample_experiments):
        """Test recent experiments with limit parameter."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                mock_query.side_effect = [
                    {'success': True, 'data': sample_experiments[:2]},  # experiments query
                    {'success': True, 'data': []},  # results for exp 1
                    {'success': True, 'data': []},  # results for exp 2
                ]
                
                response = client.get('/api/dashboard/recent?limit=2', headers=auth_headers)
                
                assert response.status_code == 200
                data = json.loads(response.data)
                assert data['period']['limit'] == 2

    def test_dashboard_recent_with_days_filter(self, client, auth_headers, mock_user, sample_experiments):
        """Test recent experiments with days parameter."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                mock_query.side_effect = [
                    {'success': True, 'data': sample_experiments},  # experiments query
                    {'success': True, 'data': []},  # results for exp 1
                    {'success': True, 'data': []},  # results for exp 2
                    {'success': True, 'data': []},  # results for exp 3
                ]
                
                response = client.get('/api/dashboard/recent?days=14', headers=auth_headers)
                
                assert response.status_code == 200
                data = json.loads(response.data)
                assert data['period']['days'] == 14

    def test_dashboard_recent_max_limit_enforcement(self, client, auth_headers, mock_user):
        """Test that recent experiments enforces maximum limit."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query', return_value={'success': True, 'data': []}):
                response = client.get('/api/dashboard/recent?limit=100', headers=auth_headers)
                
                assert response.status_code == 200
                data = json.loads(response.data)
                assert data['period']['limit'] == 50  # Should be capped at 50

    def test_dashboard_recent_unauthorized(self, client):
        """Test recent experiments without authentication."""
        response = client.get('/api/dashboard/recent')
        assert response.status_code == 401

    def test_dashboard_recent_database_error(self, client, auth_headers, mock_user):
        """Test recent experiments with database error."""
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query', return_value={'success': False, 'error': 'DB Error'}):
                response = client.get('/api/dashboard/recent', headers=auth_headers)
                
                assert response.status_code == 500
                data = json.loads(response.data)
                assert 'error' in data

    def test_dashboard_health_endpoint(self, client):
        """Test dashboard health check endpoint."""
        response = client.get('/api/dashboard/health')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert data['service'] == 'dashboard'
        assert data['status'] == 'healthy'
        assert 'timestamp' in data

    def test_insights_generation_logic(self, client, auth_headers, mock_user):
        """Test the insights generation logic with different scenarios."""
        # Create experiments that should trigger different insights
        recent_experiments = []
        base_time = datetime.utcnow()
        
        # Create 4 experiments (should trigger streak insight)
        for i in range(4):
            exp = {
                'id': str(uuid.uuid4()),
                'user_id': mock_user['id'],
                'name': f'Test Experiment {i}',
                'experiment_type': ['heart_rate', 'reaction_time', 'memory', 'eeg'][i],
                'status': 'completed',
                'created_at': (base_time - timedelta(hours=i)).isoformat(),
                'results': {
                    'metrics': {'mean': 100 + i}
                }
            }
            recent_experiments.append(exp)
        
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                mock_query.side_effect = [
                    {'success': True, 'data': recent_experiments},
                    {'success': True, 'data': [{'metrics': {'mean': 100}}]},
                    {'success': True, 'data': [{'metrics': {'mean': 101}}]},
                    {'success': True, 'data': [{'metrics': {'mean': 102}}]},
                    {'success': True, 'data': [{'metrics': {'mean': 103}}]},
                ]
                
                response = client.get('/api/dashboard/recent', headers=auth_headers)
                
                assert response.status_code == 200
                data = json.loads(response.data)
                
                insights = data['insights']
                insight_types = [insight['type'] for insight in insights]
                
                # Should have streak insight (4 experiments)
                assert 'streak' in insight_types
                
                # Should have variety insight (4 different types)
                assert 'variety' in insight_types
                
                # Should have completion insight (100% completion rate)
                assert 'completion' in insight_types

    def test_metric_calculations_accuracy(self, client, auth_headers, mock_user):
        """Test accuracy of metric calculations in dashboard summary."""
        experiments = [
            {
                'id': str(uuid.uuid4()),
                'user_id': mock_user['id'],
                'experiment_type': 'heart_rate',
                'status': 'completed',
                'created_at': datetime.utcnow().isoformat()
            }
        ]
        
        results = [
            {
                'experiment_id': experiments[0]['id'],
                'metrics': {
                    'mean': 75.5,
                    'std_dev': 5.2,
                    'min': 70.0,
                    'max': 80.0
                }
            }
        ]
        
        with patch.object(get_supabase_client(), 'get_user_from_token', return_value=mock_user):
            with patch.object(get_supabase_client(), 'execute_query') as mock_query:
                mock_query.side_effect = [
                    {'success': True, 'data': experiments},
                    {'success': True, 'data': results}
                ]
                
                response = client.get('/api/dashboard/summary', headers=auth_headers)
                
                assert response.status_code == 200
                data = json.loads(response.data)
                
                avg_metrics = data['average_metrics']
                assert avg_metrics['mean'] == 75.5
                assert avg_metrics['std_dev'] == 5.2
                assert avg_metrics['min'] == 70.0
                assert avg_metrics['max'] == 80.0


if __name__ == '__main__':
    pytest.main([__file__])