# NeuroLab 360 Backend

Flask-based REST API backend for the NeuroLab 360 neurological experiment platform.

## Features

- **Flask Application**: RESTful API with CORS support
- **Supabase Integration**: Database and authentication via Supabase
- **Blueprint Architecture**: Modular route organization
- **Authentication Middleware**: JWT token validation
- **Error Handling**: Comprehensive error handling and logging
- **Environment Configuration**: Secure configuration via environment variables

## Setup

1. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Environment Configuration**:
   - Copy `.env.example` to `.env` (already configured)
   - Update Supabase credentials if needed

3. **Test Setup**:
   ```bash
   python test_setup.py
   ```

4. **Run Development Server**:
   ```bash
   python run.py
   ```

## API Endpoints

### Health & Info
- `GET /health` - Health check endpoint
- `GET /api` - API information

### Experiments (Coming in Task 4)
- `POST /api/experiments` - Create and run experiment
- `GET /api/experiments` - Get user's experiments
- `GET /api/experiments/<id>` - Get specific experiment
- `DELETE /api/experiments/<id>` - Delete experiment

### Dashboard (Coming in Task 5)
- `GET /api/dashboard/summary` - Get experiment summary
- `GET /api/dashboard/charts` - Get chart data
- `GET /api/dashboard/recent` - Get recent results

## Project Structure

```
backend/
├── app.py                 # Main Flask application
├── supabase_client.py     # Supabase client and utilities
├── routes/
│   ├── __init__.py
│   ├── experiments.py     # Experiment endpoints
│   └── dashboard.py       # Dashboard endpoints
├── requirements.txt       # Python dependencies
├── .env                   # Environment variables
├── test_setup.py         # Setup verification script
└── run.py                # Development server runner
```

## Authentication

The API uses JWT tokens from Supabase Auth. Protected endpoints require:

```
Authorization: Bearer <jwt_token>
```

## Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error type",
  "message": "Human-readable error message"
}
```

## Development

- **Debug Mode**: Enabled in development environment
- **CORS**: Configured for frontend development servers
- **Logging**: Comprehensive logging for debugging
- **Testing**: Unit tests with pytest (coming in later tasks)

## Next Steps

- Task 4: Implement experiment API endpoints
- Task 5: Implement dashboard API endpoints
- Later tasks: Add comprehensive testing and frontend integration