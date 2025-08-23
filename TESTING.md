# NeuroLab 360 Testing Guide

This document provides comprehensive information about the testing infrastructure and practices for NeuroLab 360.

## Overview

NeuroLab 360 implements a multi-layered testing strategy that includes:

- **Unit Tests**: Test individual components and functions in isolation
- **Integration Tests**: Test interactions between different parts of the system
- **End-to-End Tests**: Test complete user workflows from frontend to backend
- **Performance Tests**: Ensure the application meets performance requirements
- **Security Tests**: Validate security measures and identify vulnerabilities

## Test Structure

```
NeuroLab-360/
├── frontend/
│   ├── src/
│   │   ├── components/__tests__/     # Component unit tests
│   │   ├── contexts/__tests__/       # Context unit tests
│   │   ├── hooks/__tests__/          # Custom hooks tests
│   │   ├── pages/__tests__/          # Page component tests
│   │   ├── utils/__tests__/          # Utility function tests
│   │   ├── tests/
│   │   │   ├── fixtures/             # Test data and mocks
│   │   │   ├── performance.test.js   # Performance tests
│   │   │   └── visual-regression.test.js
│   │   └── __tests__/                # Integration tests
│   ├── cypress/
│   │   ├── e2e/                      # End-to-end tests
│   │   ├── support/                  # Cypress utilities
│   │   └── fixtures/                 # Test data
│   └── jest.config.js                # Jest configuration
├── backend/
│   ├── test_experiments.py           # Experiments API tests
│   ├── test_dashboard.py             # Dashboard API tests
│   ├── test_performance.py           # Backend performance tests
│   ├── test_experiments_integration.py # Integration tests
│   ├── test_fixtures.py              # Test utilities and fixtures
│   └── pytest.ini                    # Pytest configuration
├── .github/workflows/ci.yml          # CI/CD pipeline
├── run_tests.sh                      # Test runner script
└── TESTING.md                        # This file
```

## Running Tests

### Quick Start

Run all tests with the comprehensive test runner:

```bash
./run_tests.sh
```

### Specific Test Suites

Run only frontend tests:
```bash
./run_tests.sh --frontend-only
```

Run only backend tests:
```bash
./run_tests.sh --backend-only
```

Run without E2E tests (faster):
```bash
./run_tests.sh --no-e2e
```

### Manual Test Execution

#### Frontend Tests

```bash
cd frontend

# Install dependencies
npm ci

# Run unit tests
npm test

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e

# Run E2E tests interactively
npm run test:e2e:open

# Run performance tests
npm test -- --testPathPattern=performance.test.js --watchAll=false
```

#### Backend Tests

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test file
pytest test_experiments.py -v

# Run performance tests
pytest test_performance.py

# Run integration tests
python test_experiments_integration.py
```

## Test Categories

### Unit Tests

**Frontend Unit Tests**
- Located in `__tests__` directories alongside source files
- Use Jest and React Testing Library
- Test individual components, hooks, and utilities
- Mock external dependencies

**Backend Unit Tests**
- Located in `test_*.py` files
- Use pytest framework
- Test individual functions and API endpoints
- Mock database and external services

### Integration Tests

**Frontend Integration Tests**
- Test component interactions and data flow
- Located in `src/__tests__/`
- Test API integration with mocked responses

**Backend Integration Tests**
- Test complete API workflows
- Test database interactions
- Located in `test_*_integration.py` files

### End-to-End Tests

**Cypress E2E Tests**
- Test complete user workflows
- Located in `frontend/cypress/e2e/`
- Test authentication, experiment creation, dashboard viewing
- Run against real application instances

### Performance Tests

**Frontend Performance Tests**
- Component rendering performance
- Memory usage monitoring
- Bundle size analysis
- Located in `frontend/src/tests/performance.test.js`

**Backend Performance Tests**
- API response time benchmarks
- Database query performance
- Concurrent request handling
- Located in `backend/test_performance.py`

## Test Data and Fixtures

### Frontend Fixtures

Located in `frontend/src/tests/fixtures/index.js`:

```javascript
import { fixtures } from './tests/fixtures';

// Use mock user data
const mockUser = fixtures.user;

// Create mock experiment
const experiment = fixtures.createExperiment({
  name: 'Custom Test Experiment',
  experiment_type: 'heart_rate'
});
```

### Backend Fixtures

Located in `backend/test_fixtures.py`:

```python
from test_fixtures import TestDataGenerator, MockSupabaseClient

# Generate test user
user = TestDataGenerator.create_user()

# Generate test experiment
experiment = TestDataGenerator.create_experiment(
    user_id=user['id'],
    experiment_type='heart_rate'
)

# Use mock Supabase client
mock_client = MockSupabaseClient()
```

## Coverage Requirements

### Coverage Thresholds

- **Frontend**: 80% minimum coverage for branches, functions, lines, and statements
- **Backend**: 80% minimum coverage for all metrics

### Viewing Coverage Reports

**Frontend Coverage**:
```bash
cd frontend
npm run test:coverage
open coverage/lcov-report/index.html
```

**Backend Coverage**:
```bash
cd backend
pytest --cov=. --cov-report=html
open htmlcov/index.html
```

## Performance Benchmarks

### Frontend Performance Targets

- Component rendering: < 100ms for simple components
- Page load: < 2 seconds for initial render
- Bundle size: < 500KB for main bundle
- Memory usage: No memory leaks in component lifecycle

### Backend Performance Targets

- API response time: < 200ms for simple queries
- Database queries: < 100ms for indexed queries
- Concurrent requests: Handle 50+ concurrent requests
- Memory usage: < 100MB increase for large datasets

## Continuous Integration

### GitHub Actions Workflow

The CI pipeline (`.github/workflows/ci.yml`) runs:

1. **Frontend Tests**
   - ESLint code quality checks
   - Unit tests with coverage
   - Performance tests
   - Build verification

2. **Backend Tests**
   - Code formatting checks (Black, Flake8)
   - Unit tests with coverage
   - Performance benchmarks
   - Integration tests

3. **End-to-End Tests**
   - Full application testing
   - Cross-browser compatibility
   - User workflow validation

4. **Security Checks**
   - Dependency vulnerability scanning
   - Code security analysis
   - SAST (Static Application Security Testing)

5. **Performance Monitoring**
   - Lighthouse performance audits
   - Bundle size analysis
   - Performance regression detection

### Quality Gates

Tests must pass these quality gates:

- ✅ All unit tests pass
- ✅ Coverage thresholds met (80%+)
- ✅ No high-severity security vulnerabilities
- ✅ Performance benchmarks met
- ✅ Code quality standards met
- ✅ E2E tests pass

## Writing Tests

### Frontend Test Guidelines

**Component Tests**:
```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import { ExperimentCard } from '../ExperimentCard';
import { fixtures } from '../../tests/fixtures';

describe('ExperimentCard', () => {
  it('should display experiment information', () => {
    const experiment = fixtures.createExperiment();
    
    render(<ExperimentCard experiment={experiment} />);
    
    expect(screen.getByText(experiment.name)).toBeInTheDocument();
    expect(screen.getByText(experiment.experiment_type)).toBeInTheDocument();
  });
  
  it('should handle delete action', () => {
    const onDelete = jest.fn();
    const experiment = fixtures.createExperiment();
    
    render(<ExperimentCard experiment={experiment} onDelete={onDelete} />);
    
    fireEvent.click(screen.getByTestId('delete-button'));
    
    expect(onDelete).toHaveBeenCalledWith(experiment.id);
  });
});
```

**Hook Tests**:
```javascript
import { renderHook, act } from '@testing-library/react';
import { useExperiments } from '../useExperiments';

describe('useExperiments', () => {
  it('should fetch experiments on mount', async () => {
    const { result } = renderHook(() => useExperiments());
    
    expect(result.current.loading).toBe(true);
    
    await act(async () => {
      // Wait for async operations
    });
    
    expect(result.current.loading).toBe(false);
    expect(result.current.experiments).toBeDefined();
  });
});
```

### Backend Test Guidelines

**API Endpoint Tests**:
```python
def test_create_experiment_success(client, mock_user, auth_headers):
    """Test successful experiment creation."""
    experiment_data = {
        'name': 'Test Experiment',
        'experiment_type': 'heart_rate',
        'parameters': {'duration_minutes': 5}
    }
    
    with patch('routes.experiments.supabase_client') as mock_supabase:
        mock_supabase.get_user_from_token.return_value = mock_user
        mock_supabase.execute_query.return_value = {
            'success': True, 
            'data': [{'id': 'exp-123', **experiment_data}]
        }
        
        response = client.post(
            '/api/experiments',
            data=json.dumps(experiment_data),
            content_type='application/json',
            headers=auth_headers
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['experiment']['name'] == experiment_data['name']
```

**Performance Tests**:
```python
def test_api_response_time(client, auth_headers):
    """Test API response time benchmark."""
    start_time = time.time()
    
    response = client.get('/api/experiments', headers=auth_headers)
    
    end_time = time.time()
    response_time = (end_time - start_time) * 1000  # ms
    
    assert response.status_code == 200
    assert response_time < 200  # Should respond within 200ms
```

### E2E Test Guidelines

**Cypress Tests**:
```javascript
describe('Experiment Creation Flow', () => {
  beforeEach(() => {
    cy.mockAuth();
    cy.visit('/experiments');
  });

  it('should create a new experiment', () => {
    cy.get('[data-testid="create-experiment-button"]').click();
    
    cy.get('[data-testid="experiment-name-input"]')
      .type('E2E Test Experiment');
    
    cy.get('[data-testid="experiment-type-select"]')
      .select('heart_rate');
    
    cy.get('[data-testid="run-experiment-button"]').click();
    
    cy.shouldShowToast('Experiment created successfully');
    cy.get('[data-testid="experiment-results"]').should('be.visible');
  });
});
```

## Debugging Tests

### Frontend Test Debugging

**Debug Jest Tests**:
```bash
# Run tests in debug mode
npm test -- --runInBand --no-cache

# Debug specific test
npm test -- --testNamePattern="should create experiment" --runInBand
```

**Debug Cypress Tests**:
```bash
# Open Cypress in interactive mode
npm run test:e2e:open

# Run with debug output
DEBUG=cypress:* npm run test:e2e
```

### Backend Test Debugging

**Debug Pytest**:
```bash
# Run with verbose output
pytest -v -s

# Debug specific test
pytest test_experiments.py::test_create_experiment_success -v -s

# Run with pdb debugger
pytest --pdb
```

## Test Maintenance

### Updating Test Data

1. **Frontend Fixtures**: Update `frontend/src/tests/fixtures/index.js`
2. **Backend Fixtures**: Update `backend/test_fixtures.py`
3. **Cypress Fixtures**: Update `frontend/cypress/fixtures/`

### Adding New Tests

1. Follow the established naming conventions
2. Use appropriate test categories and markers
3. Include both positive and negative test cases
4. Add performance tests for new features
5. Update coverage thresholds if needed

### Test Environment Setup

**Environment Variables**:
```bash
# Frontend (.env.test)
REACT_APP_SUPABASE_URL=https://test.supabase.co
REACT_APP_SUPABASE_ANON_KEY=test-key

# Backend (.env.test)
SUPABASE_URL=https://test.supabase.co
SUPABASE_ANON_KEY=test-key
FLASK_ENV=testing
```

## Troubleshooting

### Common Issues

**Frontend Tests Failing**:
- Check if dependencies are installed: `npm ci`
- Clear Jest cache: `npm test -- --clearCache`
- Check for async/await issues in tests
- Verify mock implementations

**Backend Tests Failing**:
- Check Python environment: `python --version`
- Install test dependencies: `pip install -r requirements.txt`
- Check environment variables
- Verify database connections

**E2E Tests Failing**:
- Ensure both frontend and backend are running
- Check network connectivity
- Verify test data setup
- Check for timing issues (add waits)

**Performance Tests Failing**:
- Check system resources
- Verify performance thresholds are realistic
- Consider environmental factors
- Review code for performance regressions

### Getting Help

1. Check test output and error messages
2. Review this documentation
3. Check existing test examples
4. Run tests in isolation to identify issues
5. Use debugging tools and techniques described above

## Best Practices

### Test Writing Best Practices

1. **Write Clear Test Names**: Describe what the test does and expects
2. **Use AAA Pattern**: Arrange, Act, Assert
3. **Test One Thing**: Each test should verify one specific behavior
4. **Use Descriptive Assertions**: Make failures easy to understand
5. **Mock External Dependencies**: Keep tests isolated and fast
6. **Test Edge Cases**: Include boundary conditions and error scenarios

### Test Organization

1. **Group Related Tests**: Use describe blocks and test suites
2. **Use Consistent Naming**: Follow established conventions
3. **Keep Tests DRY**: Extract common setup to fixtures and utilities
4. **Document Complex Tests**: Add comments for complex test logic
5. **Maintain Test Data**: Keep fixtures up to date and realistic

### Performance Considerations

1. **Run Tests in Parallel**: Use appropriate test runners
2. **Mock Heavy Operations**: Avoid real network calls and file I/O
3. **Clean Up Resources**: Prevent memory leaks and resource exhaustion
4. **Use Test Databases**: Separate test data from production
5. **Monitor Test Performance**: Keep test suites fast and efficient

---

For more information about specific testing frameworks and tools, refer to their official documentation:

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Cypress Documentation](https://docs.cypress.io/)
- [Pytest Documentation](https://docs.pytest.org/)