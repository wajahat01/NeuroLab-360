"""
Example usage of the centralized error handling infrastructure.
Demonstrates how to integrate the error handler with dashboard routes.
"""

from flask import Blueprint, request, jsonify
from error_handler import error_handler
from exceptions import DatabaseError, ValidationError, AuthenticationError

# Example blueprint using the error handler
example_bp = Blueprint('example', __name__)


@example_bp.route('/example/protected', methods=['GET'])
@error_handler.handle_exceptions
def protected_endpoint():
    """Example of a protected endpoint with error handling."""
    
    # Simulate authentication check
    auth_header = request.headers.get('Authorization')
    if not auth_header:
        raise AuthenticationError("Authorization header required")
    
    # Simulate validation
    limit = request.args.get('limit', '10')
    try:
        limit = int(limit)
        if limit < 1 or limit > 100:
            raise ValidationError("Limit must be between 1 and 100", field="limit")
    except ValueError:
        raise ValidationError("Limit must be a valid integer", field="limit")
    
    # Simulate database operation that might fail
    if request.args.get('simulate_db_error'):
        raise DatabaseError("Simulated database connection failure")
    
    return jsonify({
        'message': 'Success!',
        'limit': limit,
        'data': [f'item_{i}' for i in range(limit)]
    })


@example_bp.route('/example/manual-error-handling', methods=['POST'])
def manual_error_handling():
    """Example of manual error handling without decorator."""
    
    try:
        data = request.get_json()
        if not data:
            raise ValidationError("JSON data required")
        
        # Simulate some processing
        result = {'processed': True, 'data': data}
        return jsonify(result)
        
    except Exception as e:
        # Manual error handling
        context = {
            'user_id': getattr(request, 'current_user', {}).get('id', 'anonymous'),
            'endpoint': request.endpoint,
            'method': request.method,
            'params': {
                'json': request.get_json(silent=True) or {},
                'args': request.args.to_dict()
            }
        }
        
        error_response, status_code = error_handler.handle_error(e, context)
        return jsonify(error_response), status_code


@example_bp.route('/example/error-stats', methods=['GET'])
def get_error_stats():
    """Get current error statistics."""
    stats = error_handler.get_error_stats()
    return jsonify(stats)


if __name__ == '__main__':
    # Example of how to test the error handling
    from flask import Flask
    
    app = Flask(__name__)
    app.register_blueprint(example_bp, url_prefix='/api')
    
    with app.test_client() as client:
        print("Testing error handling examples...")
        
        # Test successful request
        print("\n1. Testing successful request:")
        response = client.get('/api/example/protected?limit=5')
        print(f"Status: {response.status_code}")
        print(f"Response: {response.get_json()}")
        
        # Test authentication error
        print("\n2. Testing authentication error:")
        response = client.get('/api/example/protected')
        print(f"Status: {response.status_code}")
        print(f"Response: {response.get_json()}")
        
        # Test validation error
        print("\n3. Testing validation error:")
        response = client.get('/api/example/protected?limit=invalid&Authorization=Bearer token')
        print(f"Status: {response.status_code}")
        print(f"Response: {response.get_json()}")
        
        # Test database error
        print("\n4. Testing database error:")
        response = client.get('/api/example/protected?simulate_db_error=true&Authorization=Bearer token')
        print(f"Status: {response.status_code}")
        print(f"Response: {response.get_json()}")
        
        # Test error stats
        print("\n5. Testing error stats:")
        response = client.get('/api/example/error-stats')
        print(f"Status: {response.status_code}")
        print(f"Response: {response.get_json()}")