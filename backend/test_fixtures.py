"""
Test fixtures and mock data utilities for NeuroLab 360 backend tests.
Provides reusable test data and mocking utilities for consistent testing.
"""

import uuid
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from unittest.mock import Mock, MagicMock
import random


class TestDataGenerator:
    """Utility class for generating consistent test data."""
    
    @staticmethod
    def create_user(user_id: str = None, email: str = None) -> Dict[str, Any]:
        """Create a mock user object."""
        return {
            'id': user_id or str(uuid.uuid4()),
            'email': email or 'test@example.com',
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            'email_confirmed_at': datetime.utcnow().isoformat(),
            'user_metadata': {
                'name': 'Test User'
            }
        }
    
    @staticmethod
    def create_experiment(
        user_id: str,
        experiment_id: str = None,
        experiment_type: str = 'heart_rate',
        status: str = 'completed',
        **kwargs
    ) -> Dict[str, Any]:
        """Create a mock experiment object."""
        base_experiment = {
            'id': experiment_id or str(uuid.uuid4()),
            'user_id': user_id,
            'name': f'Test {experiment_type.replace("_", " ").title()} Experiment',
            'experiment_type': experiment_type,
            'status': status,
            'parameters': TestDataGenerator._get_default_parameters(experiment_type),
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        base_experiment.update(kwargs)
        return base_experiment
    
    @staticmethod
    def create_experiment_results(
        experiment_id: str,
        experiment_type: str = 'heart_rate',
        **kwargs
    ) -> Dict[str, Any]:
        """Create mock experiment results."""
        generators = {
            'heart_rate': TestDataGenerator._generate_heart_rate_results,
            'reaction_time': TestDataGenerator._generate_reaction_time_results,
            'memory': TestDataGenerator._generate_memory_results,
            'eeg': TestDataGenerator._generate_eeg_results
        }
        
        generator = generators.get(experiment_type, generators['heart_rate'])
        results = generator()
        
        base_results = {
            'id': str(uuid.uuid4()),
            'experiment_id': experiment_id,
            'created_at': datetime.utcnow().isoformat(),
            **results
        }
        
        base_results.update(kwargs)
        return base_results
    
    @staticmethod
    def create_multiple_experiments(
        user_id: str,
        count: int = 5,
        experiment_types: List[str] = None,
        date_range_days: int = 30
    ) -> List[Dict[str, Any]]:
        """Create multiple experiments with varied data."""
        if experiment_types is None:
            experiment_types = ['heart_rate', 'reaction_time', 'memory', 'eeg']
        
        experiments = []
        for i in range(count):
            experiment_type = experiment_types[i % len(experiment_types)]
            created_date = datetime.utcnow() - timedelta(
                days=random.randint(0, date_range_days),
                hours=random.randint(0, 23),
                minutes=random.randint(0, 59)
            )
            
            experiment = TestDataGenerator.create_experiment(
                user_id=user_id,
                experiment_type=experiment_type,
                name=f'{experiment_type.replace("_", " ").title()} Test {i + 1}',
                created_at=created_date.isoformat(),
                updated_at=created_date.isoformat()
            )
            
            experiments.append(experiment)
        
        return sorted(experiments, key=lambda x: x['created_at'], reverse=True)
    
    @staticmethod
    def _get_default_parameters(experiment_type: str) -> Dict[str, Any]:
        """Get default parameters for experiment type."""
        defaults = {
            'heart_rate': {
                'duration_minutes': 5,
                'baseline_bpm': 75
            },
            'reaction_time': {
                'trials': 20,
                'stimulus_type': 'visual'
            },
            'memory': {
                'test_type': 'visual',
                'items_count': 10
            },
            'eeg': {
                'duration_minutes': 10,
                'sampling_rate': 256
            }
        }
        
        return defaults.get(experiment_type, {})
    
    @staticmethod
    def _generate_heart_rate_results() -> Dict[str, Any]:
        """Generate heart rate experiment results."""
        duration = 300  # 5 minutes in seconds
        baseline = 75
        
        data_points = []
        for i in range(duration):
            # Simulate realistic heart rate with some variation
            variation = random.gauss(0, 3)  # Normal distribution with std dev of 3
            trend = 2 * (i / duration - 0.5)  # Slight trend over time
            value = baseline + variation + trend
            
            data_points.append({
                'timestamp': i,
                'value': round(max(50, min(120, value)), 1),  # Clamp to realistic range
                'metadata': {'unit': 'bpm'}
            })
        
        values = [dp['value'] for dp in data_points]
        
        return {
            'data_points': data_points,
            'metrics': {
                'mean': round(sum(values) / len(values), 2),
                'std_dev': round((sum((x - sum(values)/len(values))**2 for x in values) / len(values))**0.5, 2),
                'min': min(values),
                'max': max(values)
            },
            'analysis_summary': 'Heart rate monitoring completed successfully. Values remained within normal range.'
        }
    
    @staticmethod
    def _generate_reaction_time_results() -> Dict[str, Any]:
        """Generate reaction time experiment results."""
        trials = 20
        base_time = 280  # Base reaction time in ms
        
        data_points = []
        correct_responses = 0
        
        for i in range(trials):
            # Simulate reaction time with learning effect
            learning_factor = max(0.8, 1 - (i * 0.02))  # Slight improvement over trials
            variation = random.gauss(0, 30)  # Random variation
            reaction_time = base_time * learning_factor + variation
            
            # 95% accuracy rate
            is_correct = random.random() > 0.05
            if is_correct:
                correct_responses += 1
            
            data_points.append({
                'timestamp': i,
                'value': round(max(150, min(800, reaction_time)), 1),
                'metadata': {
                    'unit': 'ms',
                    'trial': i + 1,
                    'stimulus': 'visual',
                    'correct': is_correct
                }
            })
        
        values = [dp['value'] for dp in data_points]
        
        return {
            'data_points': data_points,
            'metrics': {
                'mean': round(sum(values) / len(values), 2),
                'std_dev': round((sum((x - sum(values)/len(values))**2 for x in values) / len(values))**0.5, 2),
                'min': min(values),
                'max': max(values),
                'accuracy': round((correct_responses / trials) * 100, 1)
            },
            'analysis_summary': f'Reaction time test completed with {correct_responses}/{trials} correct responses. Average reaction time within normal range.'
        }
    
    @staticmethod
    def _generate_memory_results() -> Dict[str, Any]:
        """Generate memory test results."""
        items_count = 10
        base_accuracy = 0.7  # 70% base accuracy
        
        data_points = []
        correct_responses = 0
        
        for i in range(items_count):
            # Simulate memory performance with position effects
            position_factor = 1.0
            if i < 2 or i >= items_count - 2:  # Primacy and recency effects
                position_factor = 1.2
            
            is_correct = random.random() < (base_accuracy * position_factor)
            if is_correct:
                correct_responses += 1
            
            response_time = random.gauss(2000, 500)  # Response time in ms
            
            data_points.append({
                'timestamp': i,
                'value': 1 if is_correct else 0,
                'metadata': {
                    'test_type': 'visual',
                    'item_id': i + 1,
                    'response_time': round(max(500, response_time), 0)
                }
            })
        
        accuracy = (correct_responses / items_count) * 100
        avg_response_time = sum(dp['metadata']['response_time'] for dp in data_points) / items_count
        
        return {
            'data_points': data_points,
            'metrics': {
                'accuracy': round(accuracy, 1),
                'correct_responses': correct_responses,
                'total_responses': items_count,
                'mean_response_time': round(avg_response_time, 0)
            },
            'analysis_summary': f'Memory test completed with {accuracy:.1f}% accuracy. Performance shows typical serial position effects.'
        }
    
    @staticmethod
    def _generate_eeg_results() -> Dict[str, Any]:
        """Generate EEG experiment results."""
        duration = 600  # 10 minutes in seconds (1 sample per second)
        
        data_points = []
        alpha_values = []
        beta_values = []
        theta_values = []
        delta_values = []
        
        for i in range(duration):
            # Simulate EEG frequency bands
            alpha = 8 + random.gauss(2, 1)  # Alpha: 8-12 Hz
            beta = 15 + random.gauss(5, 2)  # Beta: 13-30 Hz
            theta = 4 + random.gauss(2, 0.5)  # Theta: 4-8 Hz
            delta = 1 + random.gauss(1, 0.3)  # Delta: 0.5-4 Hz
            
            # Overall amplitude (simplified)
            amplitude = random.gauss(0, 50)
            
            data_points.append({
                'timestamp': i,
                'value': round(amplitude, 2),
                'metadata': {
                    'unit': 'μV',
                    'alpha': round(max(0, alpha), 2),
                    'beta': round(max(0, beta), 2),
                    'theta': round(max(0, theta), 2),
                    'delta': round(max(0, delta), 2)
                }
            })
            
            alpha_values.append(alpha)
            beta_values.append(beta)
            theta_values.append(theta)
            delta_values.append(delta)
        
        return {
            'data_points': data_points,
            'metrics': {
                'alpha_avg': round(sum(alpha_values) / len(alpha_values), 2),
                'beta_avg': round(sum(beta_values) / len(beta_values), 2),
                'theta_avg': round(sum(theta_values) / len(theta_values), 2),
                'delta_avg': round(sum(delta_values) / len(delta_values), 2),
                'dominant_frequency': round(sum(alpha_values) / len(alpha_values), 2)  # Simplified
            },
            'analysis_summary': 'EEG recording completed successfully. Frequency analysis shows normal brainwave patterns with good alpha activity.'
        }


class MockSupabaseClient:
    """Mock Supabase client for testing."""
    
    def __init__(self):
        self.users = {}
        self.experiments = {}
        self.results = {}
        self.query_log = []
    
    def get_user_from_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Mock user authentication."""
        if token == 'invalid_token':
            return None
        
        return TestDataGenerator.create_user()
    
    def execute_query(
        self,
        table: str,
        operation: str = 'select',
        data: Dict[str, Any] = None,
        filters: List[Dict[str, Any]] = None,
        order_by: str = None,
        limit: int = None,
        **kwargs
    ) -> Dict[str, Any]:
        """Mock database query execution."""
        self.query_log.append({
            'table': table,
            'operation': operation,
            'data': data,
            'filters': filters,
            'timestamp': datetime.utcnow().isoformat()
        })
        
        if operation == 'insert':
            return self._mock_insert(table, data)
        elif operation == 'select':
            return self._mock_select(table, filters, order_by, limit)
        elif operation == 'update':
            return self._mock_update(table, data, filters)
        elif operation == 'delete':
            return self._mock_delete(table, filters)
        else:
            return {'success': False, 'error': f'Unsupported operation: {operation}'}
    
    def _mock_insert(self, table: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Mock insert operation."""
        record_id = str(uuid.uuid4())
        record = {
            'id': record_id,
            'created_at': datetime.utcnow().isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            **data
        }
        
        if table == 'experiments':
            self.experiments[record_id] = record
        elif table == 'results':
            self.results[record_id] = record
        
        return {'success': True, 'data': [record]}
    
    def _mock_select(
        self,
        table: str,
        filters: List[Dict[str, Any]] = None,
        order_by: str = None,
        limit: int = None
    ) -> Dict[str, Any]:
        """Mock select operation."""
        if table == 'experiments':
            data = list(self.experiments.values())
        elif table == 'results':
            data = list(self.results.values())
        else:
            data = []
        
        # Apply filters
        if filters:
            for filter_item in filters:
                column = filter_item['column']
                value = filter_item['value']
                data = [item for item in data if item.get(column) == value]
        
        # Apply ordering
        if order_by:
            reverse = order_by.startswith('-')
            key = order_by.lstrip('-')
            data.sort(key=lambda x: x.get(key, ''), reverse=reverse)
        
        # Apply limit
        if limit:
            data = data[:limit]
        
        return {'success': True, 'data': data}
    
    def _mock_update(self, table: str, data: Dict[str, Any], filters: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Mock update operation."""
        # Simplified update logic
        return {'success': True, 'data': []}
    
    def _mock_delete(self, table: str, filters: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Mock delete operation."""
        # Simplified delete logic
        return {'success': True, 'data': []}
    
    def reset(self):
        """Reset mock data."""
        self.users.clear()
        self.experiments.clear()
        self.results.clear()
        self.query_log.clear()


class TestScenarios:
    """Pre-defined test scenarios for common testing patterns."""
    
    @staticmethod
    def empty_user_scenario(user_id: str = None) -> Dict[str, Any]:
        """Scenario: New user with no experiments."""
        user = TestDataGenerator.create_user(user_id)
        return {
            'user': user,
            'experiments': [],
            'dashboard_summary': {
                'total_experiments': 0,
                'experiments_by_type': {},
                'experiments_by_status': {},
                'recent_activity': {'completion_rate': 0},
                'average_metrics': {},
                'last_updated': datetime.utcnow().isoformat()
            }
        }
    
    @staticmethod
    def active_user_scenario(user_id: str = None, experiment_count: int = 10) -> Dict[str, Any]:
        """Scenario: Active user with multiple experiments."""
        user = TestDataGenerator.create_user(user_id)
        experiments = TestDataGenerator.create_multiple_experiments(
            user['id'], 
            count=experiment_count
        )
        
        # Generate results for completed experiments
        results = []
        for exp in experiments:
            if exp['status'] == 'completed':
                result = TestDataGenerator.create_experiment_results(
                    exp['id'], 
                    exp['experiment_type']
                )
                results.append(result)
        
        # Calculate dashboard summary
        type_counts = {}
        status_counts = {}
        for exp in experiments:
            type_counts[exp['experiment_type']] = type_counts.get(exp['experiment_type'], 0) + 1
            status_counts[exp['status']] = status_counts.get(exp['status'], 0) + 1
        
        completion_rate = (status_counts.get('completed', 0) / len(experiments)) * 100
        
        return {
            'user': user,
            'experiments': experiments,
            'results': results,
            'dashboard_summary': {
                'total_experiments': len(experiments),
                'experiments_by_type': type_counts,
                'experiments_by_status': status_counts,
                'recent_activity': {'completion_rate': completion_rate},
                'average_metrics': {'mean': 125.5, 'std_dev': 15.2},
                'last_updated': datetime.utcnow().isoformat()
            }
        }
    
    @staticmethod
    def error_scenario(error_type: str = 'database_error') -> Dict[str, Any]:
        """Scenario: Various error conditions."""
        scenarios = {
            'database_error': {
                'success': False,
                'error': 'Database connection failed',
                'code': 'DB_CONNECTION_ERROR'
            },
            'authentication_error': {
                'success': False,
                'error': 'Invalid authentication token',
                'code': 'AUTH_ERROR'
            },
            'validation_error': {
                'success': False,
                'error': 'Invalid experiment parameters',
                'code': 'VALIDATION_ERROR'
            },
            'not_found_error': {
                'success': False,
                'error': 'Experiment not found',
                'code': 'NOT_FOUND'
            }
        }
        
        return scenarios.get(error_type, scenarios['database_error'])


# Pytest fixtures
def pytest_configure():
    """Configure pytest with custom fixtures."""
    pass


# Export commonly used fixtures
__all__ = [
    'TestDataGenerator',
    'MockSupabaseClient', 
    'TestScenarios'
]