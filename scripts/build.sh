#!/bin/bash

# NeuroLab 360 Production Build Script
# This script builds both frontend and backend for production deployment

set -e  # Exit on any error

echo "🚀 Starting NeuroLab 360 production build..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the project root
if [ ! -f "package.json" ] && [ ! -f "frontend/package.json" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Create build directory
mkdir -p build

print_status "Building frontend..."
cd frontend

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    print_status "Installing frontend dependencies..."
    npm ci --only=production
fi

# Build frontend
print_status "Creating optimized production build..."
npm run build

# Copy build to main build directory
cp -r build ../build/frontend
print_status "Frontend build completed ✅"

cd ..

print_status "Preparing backend..."
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    print_status "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install/update dependencies
print_status "Installing backend dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Copy backend files to build directory
mkdir -p ../build/backend
cp -r . ../build/backend/
# Remove unnecessary files from build
rm -rf ../build/backend/venv
rm -rf ../build/backend/__pycache__
rm -rf ../build/backend/.pytest_cache
rm -f ../build/backend/.env

print_status "Backend preparation completed ✅"

cd ..

print_status "Creating deployment package..."
# Create deployment configuration files
cat > build/Dockerfile << EOF# M
ulti-stage Docker build for production
FROM node:16-alpine as frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --only=production
COPY frontend/ .
RUN npm run build

FROM python:3.9-slim as backend
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

FROM nginx:alpine as production
# Copy frontend build
COPY --from=frontend-build /app/build /usr/share/nginx/html
# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
EOF

# Create docker-compose for production
cat > build/docker-compose.prod.yml << EOF
version: '3.8'
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile
      target: backend
    ports:
      - "5000:5000"
    environment:
      - FLASK_ENV=production
      - FLASK_DEBUG=False
    env_file:
      - .env.production
    restart: unless-stopped

  frontend:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped
EOF

# Create production environment template
cat > build/.env.production.example << EOF
# Production Environment Variables
FLASK_ENV=production
FLASK_DEBUG=False
SUPABASE_URL=https://your-production-project.supabase.co
SUPABASE_ANON_KEY=your-production-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key
CORS_ORIGINS=https://your-domain.com
SECRET_KEY=your-super-secret-production-key
EOF

print_status "Build completed successfully! 🎉"
print_status "Build artifacts are in the 'build' directory"
print_warning "Don't forget to configure your production environment variables!"

echo ""
echo "Next steps:"
echo "1. Copy build/. env.production.example to .env.production and configure"
echo "2. Deploy using: docker-compose -f build/docker-compose.prod.yml up -d"
echo "3. Or deploy individual components to your preferred platform"