#!/bin/bash

# NeuroLab 360 Deployment Script
# Supports multiple deployment targets

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

# Check deployment target
DEPLOY_TARGET=${1:-"help"}

case $DEPLOY_TARGET in
    "docker")
        print_header "Deploying with Docker..."
        
        # Build first
        ./scripts/build.sh
        
        # Check if .env.production exists
        if [ ! -f "build/.env.production" ]; then
            print_error "Production environment file not found!"
            print_warning "Copy build/.env.production.example to build/.env.production and configure"
            exit 1
        fi
        
        # Deploy with docker-compose
        cd build
        docker-compose -f docker-compose.prod.yml down
        docker-compose -f docker-compose.prod.yml up --build -d
        
        print_status "Docker deployment completed!"
        print_status "Frontend: http://localhost"
        print_status "Backend: http://localhost:5000"
        ;;
        
    "vercel")
        print_header "Deploying frontend to Vercel..."
        
        cd frontend
        
        # Check if vercel is installed
        if ! command -v vercel &> /dev/null; then
            print_status "Installing Vercel CLI..."
            npm install -g vercel
        fi
        
        # Deploy to Vercel
        vercel --prod
        
        print_status "Vercel deployment completed!"
        ;;
        
    "railway")
        print_header "Deploying backend to Railway..."
        
        # Check if railway CLI is installed
        if ! command -v railway &> /dev/null; then
            print_error "Railway CLI not found. Install from: https://railway.app/cli"
            exit 1
        fi
        
        cd backend
        railway up
        
        print_status "Railway deployment completed!"
        ;;
        
    "vps")
        print_header "Deploying to VPS..."
        
        # Check if SSH config is provided
        if [ -z "$2" ]; then
            print_error "Please provide SSH connection string: ./scripts/deploy.sh vps user@server"
            exit 1
        fi
        
        SSH_TARGET=$2
        
        # Build locally
        ./scripts/build.sh
        
        # Upload build to server
        print_status "Uploading files to server..."
        rsync -avz --delete build/ $SSH_TARGET:~/neurolab360/
        
        # Run deployment commands on server
        ssh $SSH_TARGET << 'EOF'
            cd ~/neurolab360
            
            # Stop existing services
            sudo systemctl stop neurolab360 || true
            sudo systemctl stop nginx || true
            
            # Update backend
            cd backend
            source venv/bin/activate
            pip install -r requirements.txt
            
            # Update frontend
            sudo cp -r ../frontend/* /var/www/neurolab360/
            
            # Restart services
            sudo systemctl start neurolab360
            sudo systemctl start nginx
            
            echo "VPS deployment completed!"
EOF
        
        print_status "VPS deployment completed!"
        ;;
        
    "help"|*)
        echo "NeuroLab 360 Deployment Script"
        echo ""
        echo "Usage: ./scripts/deploy.sh [target]"
        echo ""
        echo "Available targets:"
        echo "  docker    - Deploy using Docker Compose"
        echo "  vercel    - Deploy frontend to Vercel"
        echo "  railway   - Deploy backend to Railway"
        echo "  vps       - Deploy to VPS (requires SSH target)"
        echo "  help      - Show this help message"
        echo ""
        echo "Examples:"
        echo "  ./scripts/deploy.sh docker"
        echo "  ./scripts/deploy.sh vercel"
        echo "  ./scripts/deploy.sh vps user@your-server.com"
        ;;
esac