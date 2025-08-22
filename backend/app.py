"""
NeuroLab 360 Flask Backend Application.
Main Flask app with CORS configuration, route registration, and error handling.
"""

import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import logging
from functools import wraps
from typing import Optional, Dict, Any

from supabase_client import get_supabase_client

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def create_app() -> Flask:
    """Create and configure the Flask application."""
    app = Flask(__name__)
    
    # Configuration
    app.config['DEBUG'] = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'
    app.config['ENV'] = os.getenv('FLASK_ENV', 'production')
    
    # CORS configuration
    CORS(app, origins=['http://localhost:3000', 'http://localhost:5173'], 
         supports_credentials=True)
    
    # Initialize Supabase client
    supabase_client = get_supabase_client()
    
    # Authentication middleware
    def require_auth(f):
        """Decorator to require authentication for protected routes."""
        @wraps(f)
        def decorated_function(*args, **kwargs):
            auth_header = request.headers.get('Authorization')
            if not auth_header:
                return jsonify({'error': 'Authorization header required'}), 401
            
            user = supabase_client.get_user_from_token(auth_header)
            if not user:
                return jsonify({'error': 'Invalid or expired token'}), 401
            
            # Add user to request context
            request.current_user = user
            return f(*args, **kwargs)
        
        return decorated_function
    
    # Global error handlers
    @app.errorhandler(400)
    def bad_request(error):
        """Handle bad request errors."""
        return jsonify({
            'error': 'Bad request',
            'message': str(error.description) if hasattr(error, 'description') else 'Invalid request'
        }), 400
    
    @app.errorhandler(401)
    def unauthorized(error):
        """Handle unauthorized errors."""
        return jsonify({
            'error': 'Unauthorized',
            'message': 'Authentication required'
        }), 401
    
    @app.errorhandler(403)
    def forbidden(error):
        """Handle forbidden errors."""
        return jsonify({
            'error': 'Forbidden',
            'message': 'Access denied'
        }), 403
    
    @app.errorhandler(404)
    def not_found(error):
        """Handle not found errors."""
        return jsonify({
            'error': 'Not found',
            'message': 'Resource not found'
        }), 404
    
    @app.errorhandler(500)
    def internal_error(error):
        """Handle internal server errors."""
        logger.error(f"Internal server error: {str(error)}")
        return jsonify({
            'error': 'Internal server error',
            'message': 'An unexpected error occurred'
        }), 500
    
    @app.errorhandler(Exception)
    def handle_exception(error):
        """Handle all other exceptions."""
        logger.error(f"Unhandled exception: {str(error)}")
        return jsonify({
            'error': 'Internal server error',
            'message': 'An unexpected error occurred'
        }), 500
    
    # Health check endpoint
    @app.route('/health', methods=['GET'])
    def health_check():
        """Health check endpoint."""
        return jsonify({
            'status': 'healthy',
            'message': 'NeuroLab 360 API is running'
        })
    
    # API info endpoint
    @app.route('/api', methods=['GET'])
    def api_info():
        """API information endpoint."""
        return jsonify({
            'name': 'NeuroLab 360 API',
            'version': '1.0.0',
            'description': 'Backend API for NeuroLab 360 neurological experiment platform'
        })
    
    # Register blueprints (will be created in subsequent tasks)
    try:
        from routes.experiments import experiments_bp
        app.register_blueprint(experiments_bp, url_prefix='/api')
        logger.info("Experiments blueprint registered")
    except ImportError:
        logger.warning("Experiments blueprint not found - will be created in task 4")
    
    try:
        from routes.dashboard import dashboard_bp
        app.register_blueprint(dashboard_bp, url_prefix='/api')
        logger.info("Dashboard blueprint registered")
    except ImportError:
        logger.warning("Dashboard blueprint not found - will be created in task 5")
    
    return app

# Create the Flask app
app = create_app()

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    host = os.getenv('HOST', '127.0.0.1')
    
    logger.info(f"Starting NeuroLab 360 API on {host}:{port}")
    app.run(host=host, port=port, debug=app.config['DEBUG'])