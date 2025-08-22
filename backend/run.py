#!/usr/bin/env python3
"""
Development server runner for NeuroLab 360 Flask backend.
"""

import os
from app import app

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    host = os.getenv('HOST', '127.0.0.1')
    
    print(f"Starting NeuroLab 360 API server...")
    print(f"Server running at: http://{host}:{port}")
    print(f"Health check: http://{host}:{port}/health")
    print(f"API info: http://{host}:{port}/api")
    print("Press Ctrl+C to stop the server")
    
    app.run(host=host, port=port, debug=True)