#!/usr/bin/env python3
"""
Integration test for experiments API.
Tests the full workflow of creating, retrieving, and deleting experiments.
"""

import json
import uuid
from unittest.mock import patch, MagicMock

from app import create_app

def test_experiments_integration():
    """Test the complete experiments workflow."""
    app = create_app()
    app.config['TESTING'] = True
    
    with app.test_client() as client:
        # Mock user for authentication
        mock_user = {
            'id': 'test-user-123',
            'email': 'test@example.com'
        }
        
        auth_headers = {'Authorization': 'Bearer mock-token'}
        
        # Test data
        experiment_data = {
            'name': 'Integration Test Experiment',
            'experiment_type': 'heart_rate',
            'parameters': {
                'duration_minutes': 3,
                'baseline_bpm': 70
            }
        }
        
        with patch('routes.experiments.supabase_client') as mock_supabase:
            # Mock authentication
            mock_supabase.get_user_from_token.return_value = mock_user
            
            experiment_id = str(uuid.uuid4())
            
            # Mock successful experiment creation
            mock_supabase.execute_query.side_effect = [
                # Create experiment
                {
                    'success': True,
                    'data': [{
                        'id': experiment_id,
                        'user_id': mock_user['id'],
                        'name': experiment_data['name'],
                        'experiment_type': experiment_data['experiment_type'],
                        'parameters': experiment_data['parameters'],
                        'status': 'running',
                        'created_at': '2024-01-01T00:00:00Z',
                        'updated_at': '2024-01-01T00:00:00Z'
                    }]
                },
                # Create results
                {
                    'success': True,
                    'data': [{
                        'id': str(uuid.uuid4()),
                        'experiment_id': experiment_id,
                        'data_points': [{'timestamp': 0, 'value': 75, 'metadata': {'unit': 'bpm'}}],
                        'metrics': {'mean': 75.0, 'std_dev': 5.2, 'min': 65, 'max': 85},
                        'analysis_summary': 'Heart rate test completed successfully',
                        'created_at': '2024-01-01T00:00:00Z'
                    }]
                },
                # Update status
                {'success': True, 'data': []}
            ]
            
            # 1. Create experiment
            print("1. Testing experiment creation...")
            response = client.post(
                '/api/experiments',
                data=json.dumps(experiment_data),
                content_type='application/json',
                headers=auth_headers
            )
            
            assert response.status_code == 201, f"Expected 201, got {response.status_code}"
            create_data = response.get_json()
            assert 'experiment' in create_data
            assert 'results' in create_data
            print("✓ Experiment created successfully")
            
            # Reset mock for next test
            mock_supabase.execute_query.side_effect = None
            
            # Mock get experiments
            mock_supabase.execute_query.side_effect = [
                # Get experiments list
                {
                    'success': True,
                    'data': [{
                        'id': experiment_id,
                        'user_id': mock_user['id'],
                        'name': experiment_data['name'],
                        'experiment_type': experiment_data['experiment_type'],
                        'status': 'completed',
                        'created_at': '2024-01-01T00:00:00Z'
                    }]
                },
                # Get results for the experiment
                {
                    'success': True,
                    'data': [{
                        'id': str(uuid.uuid4()),
                        'experiment_id': experiment_id,
                        'data_points': [],
                        'metrics': {},
                        'analysis_summary': 'Test summary'
                    }]
                }
            ]
            
            # 2. Get experiments list
            print("2. Testing experiments retrieval...")
            response = client.get('/api/experiments', headers=auth_headers)
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            list_data = response.get_json()
            assert 'experiments' in list_data
            assert len(list_data['experiments']) == 1
            print("✓ Experiments retrieved successfully")
            
            # Reset mock for next test
            mock_supabase.execute_query.side_effect = None
            
            # Mock get specific experiment
            mock_supabase.execute_query.side_effect = [
                # Get specific experiment
                {
                    'success': True,
                    'data': [{
                        'id': experiment_id,
                        'user_id': mock_user['id'],
                        'name': experiment_data['name'],
                        'experiment_type': experiment_data['experiment_type'],
                        'status': 'completed'
                    }]
                },
                # Get results
                {
                    'success': True,
                    'data': [{
                        'id': str(uuid.uuid4()),
                        'experiment_id': experiment_id,
                        'data_points': [],
                        'metrics': {},
                        'analysis_summary': 'Test summary'
                    }]
                }
            ]
            
            # 3. Get specific experiment
            print("3. Testing specific experiment retrieval...")
            response = client.get(f'/api/experiments/{experiment_id}', headers=auth_headers)
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            detail_data = response.get_json()
            assert detail_data['id'] == experiment_id
            assert 'results' in detail_data
            print("✓ Specific experiment retrieved successfully")
            
            # Reset mock for next test
            mock_supabase.execute_query.side_effect = None
            
            # Mock delete experiment
            mock_supabase.execute_query.side_effect = [
                # Check experiment exists
                {
                    'success': True,
                    'data': [{
                        'id': experiment_id,
                        'user_id': mock_user['id']
                    }]
                },
                # Delete experiment
                {'success': True, 'data': []}
            ]
            
            # 4. Delete experiment
            print("4. Testing experiment deletion...")
            response = client.delete(f'/api/experiments/{experiment_id}', headers=auth_headers)
            
            assert response.status_code == 200, f"Expected 200, got {response.status_code}"
            delete_data = response.get_json()
            assert 'deleted successfully' in delete_data['message']
            print("✓ Experiment deleted successfully")
        
        print("\n✓ All integration tests passed!")
        return True

if __name__ == '__main__':
    print("Running Experiments API Integration Test")
    print("=" * 50)
    
    try:
        test_experiments_integration()
        print("=" * 50)
        print("✓ Integration test completed successfully!")
    except Exception as e:
        print(f"✗ Integration test failed: {str(e)}")
        import traceback
        traceback.print_exc()
        exit(1)