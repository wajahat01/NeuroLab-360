#!/bin/bash

# NeuroLab 360 Production Optimization Script
# Optimizes build artifacts for production deployment

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[OPTIMIZE]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_status "Starting production optimization..."

# Frontend optimizations
if [ -d "frontend" ]; then
    print_status "Optimizing frontend..."
    cd frontend
    
    # Install optimization dependencies
    npm install --save-dev webpack-bundle-analyzer terser-webpack-plugin
    
    # Analyze bundle size
    print_status "Analyzing bundle size..."
    npm run build
    npx webpack-bundle-analyzer build/static/js/*.js --mode server --port 8888 &
    ANALYZER_PID=$!
    
    # Wait a moment then kill analyzer
    sleep 3
    kill $ANALYZER_PID 2>/dev/null || true
    
    # Optimize images (if any)
    if command -v imagemin &> /dev/null; then
        print_status "Optimizing images..."
        find build -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" | xargs imagemin --out-dir=build/optimized
    fi
    
    cd ..
fi

# Backend optimizations
if [ -d "backend" ]; then
    print_status "Optimizing backend..."
    cd backend
    
    # Remove development dependencies from requirements
    if [ -f "requirements-dev.txt" ]; then
        print_status "Creating production requirements..."
        grep -v "pytest\|flake8\|black\|coverage" requirements.txt > requirements-prod.txt
    fi
    
    # Compile Python files
    python -m compileall .
    
    cd ..
fi

# Database optimizations
print_status "Creating database optimization scripts..."
cat > scripts/db-optimize.sql << EOF
-- Database optimization queries for production

-- Create indexes for better performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_experiments_user_created 
    ON experiments(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_experiments_type_status 
    ON experiments(experiment_type, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_results_experiment_created 
    ON results(experiment_id, created_at DESC);

-- Update table statistics
ANALYZE experiments;
ANALYZE results;

-- Vacuum tables to reclaim space
VACUUM ANALYZE experiments;
VACUUM ANALYZE results;
EOF

print_status "Optimization completed! ✅"
print_warning "Remember to run database optimizations on your production database"