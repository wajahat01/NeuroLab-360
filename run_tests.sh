#!/bin/bash

# NeuroLab 360 Comprehensive Test Runner
# This script runs all tests for the NeuroLab 360 application

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to run frontend tests
run_frontend_tests() {
    print_status "Running frontend tests..."
    
    cd frontend
    
    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        npm ci
    fi
    
    # Run linting
    print_status "Running ESLint..."
    if npm run lint; then
        print_success "Frontend linting passed"
    else
        print_warning "Frontend linting issues found"
    fi
    
    # Run unit tests with coverage
    print_status "Running frontend unit tests..."
    if npm run test:coverage; then
        print_success "Frontend unit tests passed"
    else
        print_error "Frontend unit tests failed"
        return 1
    fi
    
    # Run performance tests
    print_status "Running frontend performance tests..."
    if npm test -- --testPathPattern=performance.test.js --watchAll=false; then
        print_success "Frontend performance tests passed"
    else
        print_warning "Frontend performance tests had issues"
    fi
    
    cd ..
}

# Function to run backend tests
run_backend_tests() {
    print_status "Running backend tests..."
    
    cd backend
    
    # Check if virtual environment should be activated
    if [ -d "venv" ]; then
        print_status "Activating virtual environment..."
        source venv/bin/activate
    fi
    
    # Install dependencies if needed
    print_status "Installing backend dependencies..."
    pip install -r requirements.txt
    
    # Run linting
    print_status "Running backend linting..."
    if flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics; then
        print_success "Backend linting passed"
    else
        print_warning "Backend linting issues found"
    fi
    
    # Check code formatting
    print_status "Checking code formatting..."
    if black --check .; then
        print_success "Code formatting is correct"
    else
        print_warning "Code formatting issues found"
    fi
    
    # Run unit tests
    print_status "Running backend unit tests..."
    if pytest test_experiments.py test_dashboard.py -v --cov=. --cov-report=term-missing; then
        print_success "Backend unit tests passed"
    else
        print_error "Backend unit tests failed"
        return 1
    fi
    
    # Run performance tests
    print_status "Running backend performance tests..."
    if pytest test_performance.py -v --tb=short; then
        print_success "Backend performance tests passed"
    else
        print_warning "Backend performance tests had issues"
    fi
    
    # Run integration tests
    print_status "Running backend integration tests..."
    if python test_experiments_integration.py; then
        print_success "Backend integration tests passed"
    else
        print_warning "Backend integration tests had issues"
    fi
    
    cd ..
}

# Function to run end-to-end tests
run_e2e_tests() {
    print_status "Running end-to-end tests..."
    
    # Check if both frontend and backend are available
    if ! command_exists node || ! command_exists python3; then
        print_error "Node.js and Python are required for E2E tests"
        return 1
    fi
    
    # Start backend server in background
    print_status "Starting backend server..."
    cd backend
    export FLASK_ENV=testing
    export SUPABASE_URL=${SUPABASE_URL:-"https://test.supabase.co"}
    export SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY:-"test-key"}
    
    python app.py &
    BACKEND_PID=$!
    cd ..
    
    # Wait for backend to start
    sleep 10
    
    # Start frontend server in background
    print_status "Starting frontend server..."
    cd frontend
    npm start &
    FRONTEND_PID=$!
    cd ..
    
    # Wait for frontend to start
    sleep 30
    
    # Run Cypress tests
    print_status "Running Cypress E2E tests..."
    cd frontend
    if npm run test:e2e; then
        print_success "E2E tests passed"
        E2E_SUCCESS=true
    else
        print_error "E2E tests failed"
        E2E_SUCCESS=false
    fi
    cd ..
    
    # Clean up background processes
    print_status "Cleaning up test servers..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    
    if [ "$E2E_SUCCESS" = false ]; then
        return 1
    fi
}

# Function to run security checks
run_security_checks() {
    print_status "Running security checks..."
    
    # Frontend security check
    cd frontend
    if npm audit --audit-level=high; then
        print_success "Frontend security audit passed"
    else
        print_warning "Frontend security vulnerabilities found"
    fi
    cd ..
    
    # Backend security check
    cd backend
    if safety check -r requirements.txt; then
        print_success "Backend security check passed"
    else
        print_warning "Backend security vulnerabilities found"
    fi
    cd ..
}

# Function to generate test report
generate_test_report() {
    print_status "Generating test report..."
    
    REPORT_FILE="test_report_$(date +%Y%m%d_%H%M%S).md"
    
    cat > "$REPORT_FILE" << EOF
# NeuroLab 360 Test Report

**Generated:** $(date)

## Test Results Summary

| Test Suite | Status | Coverage |
|------------|--------|----------|
| Frontend Unit Tests | $FRONTEND_STATUS | $([ -f "frontend/coverage/lcov-report/index.html" ] && echo "Available" || echo "N/A") |
| Backend Unit Tests | $BACKEND_STATUS | $([ -f "backend/htmlcov/index.html" ] && echo "Available" || echo "N/A") |
| End-to-End Tests | $E2E_STATUS | N/A |
| Security Checks | $SECURITY_STATUS | N/A |

## Coverage Reports

- Frontend Coverage: \`frontend/coverage/lcov-report/index.html\`
- Backend Coverage: \`backend/htmlcov/index.html\`

## Test Artifacts

- Frontend Test Results: \`frontend/test-results/\`
- Backend Test Results: \`backend/test-results/\`
- E2E Screenshots: \`frontend/cypress/screenshots/\`
- E2E Videos: \`frontend/cypress/videos/\`

## Performance Metrics

Performance test results are included in the respective test suites.

## Next Steps

$([ "$OVERALL_STATUS" = "PASSED" ] && echo "✅ All tests passed! Ready for deployment." || echo "❌ Some tests failed. Please review and fix issues before deployment.")

EOF

    print_success "Test report generated: $REPORT_FILE"
}

# Main execution
main() {
    print_status "Starting NeuroLab 360 comprehensive test suite..."
    print_status "=================================================="
    
    # Initialize status variables
    FRONTEND_STATUS="❌ FAILED"
    BACKEND_STATUS="❌ FAILED"
    E2E_STATUS="❌ FAILED"
    SECURITY_STATUS="❌ FAILED"
    OVERALL_STATUS="FAILED"
    
    # Parse command line arguments
    RUN_FRONTEND=true
    RUN_BACKEND=true
    RUN_E2E=true
    RUN_SECURITY=true
    GENERATE_REPORT=true
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --frontend-only)
                RUN_BACKEND=false
                RUN_E2E=false
                RUN_SECURITY=false
                shift
                ;;
            --backend-only)
                RUN_FRONTEND=false
                RUN_E2E=false
                RUN_SECURITY=false
                shift
                ;;
            --e2e-only)
                RUN_FRONTEND=false
                RUN_BACKEND=false
                RUN_SECURITY=false
                shift
                ;;
            --no-e2e)
                RUN_E2E=false
                shift
                ;;
            --no-security)
                RUN_SECURITY=false
                shift
                ;;
            --no-report)
                GENERATE_REPORT=false
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo "Options:"
                echo "  --frontend-only    Run only frontend tests"
                echo "  --backend-only     Run only backend tests"
                echo "  --e2e-only         Run only E2E tests"
                echo "  --no-e2e           Skip E2E tests"
                echo "  --no-security      Skip security checks"
                echo "  --no-report        Skip test report generation"
                echo "  --help             Show this help message"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                exit 1
                ;;
        esac
    done
    
    # Run tests based on flags
    if [ "$RUN_FRONTEND" = true ]; then
        if run_frontend_tests; then
            FRONTEND_STATUS="✅ PASSED"
        fi
    else
        FRONTEND_STATUS="⏭️ SKIPPED"
    fi
    
    if [ "$RUN_BACKEND" = true ]; then
        if run_backend_tests; then
            BACKEND_STATUS="✅ PASSED"
        fi
    else
        BACKEND_STATUS="⏭️ SKIPPED"
    fi
    
    if [ "$RUN_E2E" = true ]; then
        if run_e2e_tests; then
            E2E_STATUS="✅ PASSED"
        fi
    else
        E2E_STATUS="⏭️ SKIPPED"
    fi
    
    if [ "$RUN_SECURITY" = true ]; then
        if run_security_checks; then
            SECURITY_STATUS="✅ PASSED"
        fi
    else
        SECURITY_STATUS="⏭️ SKIPPED"
    fi
    
    # Determine overall status
    if [[ "$FRONTEND_STATUS" =~ "PASSED|SKIPPED" ]] && \
       [[ "$BACKEND_STATUS" =~ "PASSED|SKIPPED" ]] && \
       [[ "$E2E_STATUS" =~ "PASSED|SKIPPED" ]] && \
       [[ "$SECURITY_STATUS" =~ "PASSED|SKIPPED" ]]; then
        OVERALL_STATUS="PASSED"
    fi
    
    # Print summary
    print_status "=================================================="
    print_status "Test Results Summary:"
    echo -e "Frontend Tests: $FRONTEND_STATUS"
    echo -e "Backend Tests: $BACKEND_STATUS"
    echo -e "E2E Tests: $E2E_STATUS"
    echo -e "Security Checks: $SECURITY_STATUS"
    echo -e "Overall Status: $([ "$OVERALL_STATUS" = "PASSED" ] && echo -e "${GREEN}✅ PASSED${NC}" || echo -e "${RED}❌ FAILED${NC}")"
    
    # Generate report if requested
    if [ "$GENERATE_REPORT" = true ]; then
        generate_test_report
    fi
    
    # Exit with appropriate code
    if [ "$OVERALL_STATUS" = "PASSED" ]; then
        print_success "All tests completed successfully!"
        exit 0
    else
        print_error "Some tests failed. Please review the output above."
        exit 1
    fi
}

# Run main function with all arguments
main "$@"