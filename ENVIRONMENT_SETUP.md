# Environment Setup Guide

This guide provides detailed instructions for setting up NeuroLab 360 in different environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Development Environment](#development-environment)
- [Production Environment](#production-environment)
- [Environment Variables](#environment-variables)
- [Database Configuration](#database-configuration)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements

**Minimum Requirements:**
- **Node.js**: v16.0.0 or higher
- **Python**: v3.8.0 or higher
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 2GB free space
- **OS**: macOS, Linux, or Windows 10/11

**Recommended Tools:**
- **Git**: Latest version for version control
- **VS Code**: With recommended extensions
- **Docker**: For containerized deployment (optional)
- **Postman**: For API testing (optional)

### Account Setup

1. **Supabase Account**
   - Sign up at [supabase.com](https://supabase.com)
   - Create a new project
   - Note your project URL and API keys

2. **GitHub Account** (for deployment)
   - Required for version control and CI/CD

## Development Environment

### 1. Project Setup

```bash
# Clone the repository
git clone <repository-url>
cd neurolab-360

# Verify Node.js and Python versions
node --version  # Should be v16+
python --version  # Should be v3.8+
```

### 2. Backend Development Setup

```bash
# Navigate to backend directory
cd backend

# Create Python virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
venv\Scripts\activate

# Upgrade pip
pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env
```

**Configure Backend Environment (.env):**
```env
# Flask Configuration
FLASK_ENV=development
FLASK_DEBUG=True
FLASK_APP=app.py
HOST=127.0.0.1
PORT=5000

# Supabase Configuration
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Development Settings
LOG_LEVEL=DEBUG
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### 3. Frontend Development Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

**Configure Frontend Environment (.env):**
```env
# React Configuration
REACT_APP_API_URL=http://localhost:5000
REACT_APP_ENVIRONMENT=development

# Supabase Configuration
REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key

# Development Settings
GENERATE_SOURCEMAP=true
REACT_APP_LOG_LEVEL=debug
```

### 4. Database Development Setup

```bash
# Navigate to supabase directory
cd supabase

# Install Supabase CLI (optional, for local development)
npm install -g @supabase/cli

# Initialize local Supabase (optional)
supabase init
supabase start
```

**Manual Database Setup:**
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Execute the following files in order:
   - `schema.sql` - Creates tables and indexes
   - `rls_policies.sql` - Sets up Row Level Security
   - `functions.sql` - Creates database functions
   - `seed_data.sql` - Adds sample data (optional)

### 5. Development Workflow

**Start Development Servers:**

```bash
# Terminal 1: Backend
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
python app.py

# Terminal 2: Frontend
cd frontend
npm start
```

**Access Points:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000
- API Documentation: http://localhost:5000/api

**Development Commands:**
```bash
# Backend
cd backend
python -m pytest                    # Run tests
python -m flake8 .                  # Lint code
python -m black .                   # Format code

# Frontend
cd frontend
npm test                            # Run tests
npm run lint                        # Lint code
npm run build                       # Build for production
npm run cypress:open                # E2E tests
```

## Production Environment

### 1. Server Requirements

**Minimum Production Server:**
- **CPU**: 2 cores
- **RAM**: 4GB
- **Storage**: 20GB SSD
- **Network**: Stable internet connection
- **OS**: Ubuntu 20.04 LTS or similar

### 2. Production Environment Variables

**Backend Production (.env):**
```env
# Flask Configuration
FLASK_ENV=production
FLASK_DEBUG=False
FLASK_APP=app.py
HOST=0.0.0.0
PORT=5000

# Supabase Configuration
SUPABASE_URL=https://your-production-project.supabase.co
SUPABASE_ANON_KEY=your-production-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key

# Production Settings
LOG_LEVEL=INFO
CORS_ORIGINS=https://your-domain.com
SECRET_KEY=your-super-secret-production-key

# Security Settings
SECURE_SSL_REDIRECT=True
SESSION_COOKIE_SECURE=True
CSRF_COOKIE_SECURE=True
```

**Frontend Production (.env.production):**
```env
# React Configuration
REACT_APP_API_URL=https://api.your-domain.com
REACT_APP_ENVIRONMENT=production

# Supabase Configuration
REACT_APP_SUPABASE_URL=https://your-production-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-production-anon-key

# Production Settings
GENERATE_SOURCEMAP=false
REACT_APP_LOG_LEVEL=error
```

### 3. Production Deployment Options

#### Option A: Cloud Platform Deployment

**Vercel (Frontend) + Railway (Backend):**

1. **Frontend on Vercel:**
   ```bash
   # Install Vercel CLI
   npm install -g vercel
   
   # Deploy from frontend directory
   cd frontend
   vercel --prod
   ```

2. **Backend on Railway:**
   - Connect GitHub repository to Railway
   - Set start command: `cd backend && python app.py`
   - Configure environment variables in Railway dashboard

#### Option B: Docker Deployment

**Create Docker Configuration:**

```dockerfile
# Dockerfile.backend
FROM python:3.9-slim

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/ .
EXPOSE 5000

CMD ["python", "app.py"]
```

```dockerfile
# Dockerfile.frontend
FROM node:16-alpine as build

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --only=production

COPY frontend/ .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Docker Compose:**
```yaml
version: '3.8'
services:
  backend:
    build:
      context: .
      dockerfile: Dockerfile.backend
    ports:
      - "5000:5000"
    environment:
      - FLASK_ENV=production
    env_file:
      - backend/.env

  frontend:
    build:
      context: .
      dockerfile: Dockerfile.frontend
    ports:
      - "80:80"
    depends_on:
      - backend
```

#### Option C: Traditional VPS Deployment

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y python3 python3-pip python3-venv nodejs npm nginx

# Clone repository
git clone <repository-url>
cd neurolab-360

# Setup backend
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Setup frontend
cd ../frontend
npm install
npm run build

# Configure Nginx
sudo cp nginx.conf /etc/nginx/sites-available/neurolab360
sudo ln -s /etc/nginx/sites-available/neurolab360 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Setup systemd service for backend
sudo cp neurolab360.service /etc/systemd/system/
sudo systemctl enable neurolab360
sudo systemctl start neurolab360
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Supabase project URL | `https://abc123.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJ0eXAiOiJKV1QiLCJhbGc...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJ0eXAiOiJKV1QiLCJhbGc...` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FLASK_ENV` | `production` | Flask environment |
| `FLASK_DEBUG` | `False` | Enable Flask debug mode |
| `HOST` | `127.0.0.1` | Server host address |
| `PORT` | `5000` | Server port |
| `LOG_LEVEL` | `INFO` | Logging level |
| `CORS_ORIGINS` | `*` | Allowed CORS origins |

### Security Considerations

**Development:**
- Use `.env` files (never commit to version control)
- Use different Supabase projects for dev/prod
- Enable debug mode for easier troubleshooting

**Production:**
- Use environment variables or secure secret management
- Disable debug mode
- Use HTTPS for all communications
- Implement proper CORS policies
- Use strong, unique secret keys

## Database Configuration

### Development Database

```sql
-- Enable Row Level Security
ALTER TABLE experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;

-- Create policies for development
CREATE POLICY "Users can view own experiments" ON experiments
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own experiments" ON experiments
    FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### Production Database

```sql
-- Additional production optimizations
CREATE INDEX CONCURRENTLY idx_experiments_user_created 
    ON experiments(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_results_experiment_created 
    ON results(experiment_id, created_at DESC);

-- Enable connection pooling
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
```

### Database Migrations

```bash
# Create migration
supabase migration new add_new_feature

# Apply migrations
supabase db push

# Reset database (development only)
supabase db reset
```

## Troubleshooting

### Common Issues

**1. Node.js Version Conflicts**
```bash
# Use nvm to manage Node.js versions
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 16
nvm use 16
```

**2. Python Virtual Environment Issues**
```bash
# Remove and recreate virtual environment
rm -rf venv
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

**3. Database Connection Errors**
- Verify Supabase credentials in `.env`
- Check network connectivity
- Ensure RLS policies are properly configured
- Verify database URL format

**4. CORS Errors**
- Check `CORS_ORIGINS` environment variable
- Verify frontend URL in backend CORS configuration
- Ensure proper protocol (http/https) matching

**5. Build Errors**
```bash
# Clear npm cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# Clear Python cache
find . -type d -name __pycache__ -delete
find . -name "*.pyc" -delete
```

### Performance Optimization

**Development:**
- Use hot reloading for faster development
- Enable source maps for debugging
- Use development builds for faster compilation

**Production:**
- Enable gzip compression
- Use CDN for static assets
- Implement caching strategies
- Optimize database queries
- Use production builds with minification

### Monitoring and Logging

**Development:**
```bash
# Backend logs
tail -f backend/logs/app.log

# Frontend logs
# Check browser console for client-side logs
```

**Production:**
- Set up centralized logging (e.g., ELK stack)
- Monitor application performance
- Set up error tracking (e.g., Sentry)
- Configure health checks and alerts

### Getting Help

1. **Check Logs**: Always check application and server logs first
2. **Environment Variables**: Verify all required variables are set
3. **Dependencies**: Ensure all dependencies are installed and up-to-date
4. **Documentation**: Refer to framework-specific documentation
5. **Community**: Check GitHub issues or create a new issue

## Security Checklist

### Development Security
- [ ] Use `.env` files for sensitive data
- [ ] Never commit secrets to version control
- [ ] Use different credentials for dev/prod
- [ ] Enable HTTPS in production

### Production Security
- [ ] Use environment variables for secrets
- [ ] Enable HTTPS/SSL certificates
- [ ] Configure proper CORS policies
- [ ] Implement rate limiting
- [ ] Use secure session configuration
- [ ] Regular security updates
- [ ] Database backup strategy
- [ ] Monitor for security vulnerabilities

## Maintenance

### Regular Tasks
- Update dependencies monthly
- Monitor database performance
- Review and rotate API keys quarterly
- Backup database regularly
- Monitor application logs
- Update security patches promptly

### Scaling Considerations
- Monitor resource usage
- Implement horizontal scaling when needed
- Consider database read replicas
- Use load balancers for high availability
- Implement caching layers
- Monitor and optimize API performance