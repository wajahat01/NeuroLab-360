# NeuroLab 360

A full-stack web application for conducting mock neurological experiments and visualizing experimental data through an intuitive dashboard interface.

## 🚀 Features

- **Secure Authentication**: Email/password authentication with Supabase Auth
- **Interactive Dashboard**: Real-time data visualizations and experiment summaries
- **Mock Experiments**: Configurable neurological experiment simulations
- **Data Persistence**: Reliable data storage with PostgreSQL and Row Level Security
- **Responsive Design**: Modern UI that works across all device sizes
- **Real-time Updates**: Live experiment status and result updates

## 🛠 Tech Stack

- **Frontend**: React 18 + TailwindCSS + React Router
- **Backend**: Flask (Python) + RESTful APIs
- **Database**: Supabase (PostgreSQL) with Row Level Security
- **Authentication**: Supabase Auth with JWT tokens
- **Testing**: Jest, React Testing Library, pytest, Cypress
- **Deployment**: Production-ready build scripts and configurations

## Project Structure

```
root/
├── backend/
│   ├── app.py                 # Flask entrypoint
│   ├── routes/
│   │   ├── experiments.py     # APIs to run mock experiments & store results
│   │   └── dashboard.py       # APIs to fetch data for visualization
│   ├── supabase_client.py     # Supabase connection helper
│   ├── requirements.txt
│   └── .env
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   └── Experiments.jsx
│   │   └── components/
│   │       ├── Navbar.jsx
│   │       ├── ExperimentCard.jsx
│   │       └── DataChart.jsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── .env
├── supabase/
│   └── schema.sql             # Table definitions
├── .env.example               # Environment variables template
└── README.md
```

## 📋 Prerequisites

- **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
- **Python** (v3.8 or higher) - [Download](https://python.org/)
- **Git** - [Download](https://git-scm.com/)
- **Supabase Account** - [Sign up](https://supabase.com/)

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <repository-url>
cd neurolab-360
```

### 2. Environment Setup

Copy the environment template and configure your variables:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:
```env
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Flask Configuration
FLASK_ENV=development
FLASK_DEBUG=True
```

### 3. Database Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Navigate to the SQL Editor in your Supabase dashboard
3. Run the database setup scripts:

```bash
# Run schema creation
cat supabase/schema.sql | supabase db reset --db-url "your_database_url"

# Or manually execute in Supabase SQL Editor:
# 1. Copy content from supabase/schema.sql
# 2. Copy content from supabase/rls_policies.sql
# 3. Copy content from supabase/functions.sql
```

### 4. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On macOS/Linux:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Run the Flask application
python app.py
```

Backend will be available at `http://localhost:5000`
API endpoints will be available at `http://localhost:5000/api`

### 5. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Start development server
npm start
```

Frontend will be available at `http://localhost:3000`

## 🧪 Development Workflow

### Running Tests

**Backend Tests:**
```bash
cd backend
python -m pytest
```

**Frontend Tests:**
```bash
cd frontend
npm test
```

**End-to-End Tests:**
```bash
cd frontend
npm run cypress:open
```

### Code Quality

**Linting:**
```bash
# Frontend
cd frontend
npm run lint

# Backend
cd backend
flake8 .
```

**Type Checking:**
```bash
cd frontend
npm run type-check
```

## 🚀 Production Deployment

### Build for Production

**Frontend Build:**
```bash
cd frontend
npm run build
```

**Backend Preparation:**
```bash
cd backend
pip install -r requirements.txt
export FLASK_ENV=production
```

### Environment Variables for Production

Create production environment files:

**Backend (.env):**
```env
FLASK_ENV=production
FLASK_DEBUG=False
SUPABASE_URL=your_production_supabase_url
SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key
```

**Frontend (.env.production):**
```env
REACT_APP_SUPABASE_URL=your_production_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_production_anon_key
```

### Deployment Options

#### Option 1: Vercel (Frontend) + Railway (Backend)

**Frontend (Vercel):**
1. Connect your GitHub repository to Vercel
2. Set build command: `cd frontend && npm run build`
3. Set output directory: `frontend/build`
4. Add environment variables in Vercel dashboard

**Backend (Railway):**
1. Connect your GitHub repository to Railway
2. Set start command: `cd backend && python app.py`
3. Add environment variables in Railway dashboard

#### Option 2: Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build
```

#### Option 3: Traditional VPS

```bash
# Install dependencies
sudo apt update
sudo apt install python3 python3-pip nodejs npm nginx

# Setup application
git clone <repository-url>
cd neurolab-360

# Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install
npm run build

# Configure Nginx (see deployment guide)
sudo systemctl start nginx
sudo systemctl enable nginx
```

## 📊 Monitoring and Maintenance

### Health Checks

**Backend Health Check:**
```bash
curl http://localhost:5000/health
```

**Database Connection Test:**
```bash
cd backend
python check_auth_setup.py
```

### Performance Monitoring

- Monitor API response times through Supabase dashboard
- Use browser dev tools for frontend performance
- Set up error tracking with Sentry (optional)

### Database Maintenance

```bash
# Run database migrations
cd supabase
supabase db reset

# Backup database
supabase db dump > backup.sql

# Restore database
supabase db reset --db-url "your_database_url" < backup.sql
```

## 🤝 Contributing

### Development Guidelines

1. Follow the implementation tasks in `.kiro/specs/neurolab-360/tasks.md`
2. Write tests for new features
3. Ensure all tests pass before submitting changes
4. Follow established code style and patterns
5. Update documentation for new features

### Code Style

- **Frontend**: ESLint + Prettier configuration
- **Backend**: PEP 8 Python style guide
- **Commits**: Conventional commit messages

### Pull Request Process

1. Create feature branch from `main`
2. Implement changes with tests
3. Run full test suite
4. Update documentation if needed
5. Submit pull request with clear description

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [React Documentation](https://reactjs.org/docs)
- [Flask Documentation](https://flask.palletsprojects.com/)
- [TailwindCSS Documentation](https://tailwindcss.com/docs)

## 🐛 Troubleshooting

### Common Issues

**Database Connection Errors:**
- Verify Supabase credentials in `.env`
- Check network connectivity
- Ensure RLS policies are properly configured

**Frontend Build Errors:**
- Clear node_modules: `rm -rf node_modules && npm install`
- Check Node.js version compatibility
- Verify environment variables

**Backend Import Errors:**
- Activate virtual environment
- Reinstall requirements: `pip install -r requirements.txt`
- Check Python version compatibility

### Getting Help

1. Check existing issues in the repository
2. Review the troubleshooting guide
3. Create a new issue with detailed error information

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.