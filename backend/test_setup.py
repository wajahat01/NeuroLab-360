#!/usr/bin/env python3
"""
Simple test script to verify the Flask backend setup.
"""

import os
import sys
sys.path.append(os.path.dirname(__file__))

def test_imports():
    """Test that all modules can be imported."""
    try:
        from supabase_client import get_supabase_client
        print("✓ Supabase client import successful")
        
        from app import create_app
        print("✓ Flask app import successful")
        
        from routes.experiments import experiments_bp
        print("✓ Experiments blueprint import successful")
        
        from routes.dashboard import dashboard_bp
        print("✓ Dashboard blueprint import successful")
        
        return True
    except Exception as e:
        print(f"✗ Import failed: {e}")
        return False

def test_app_creation():
    """Test that the Flask app can be created."""
    try:
        from app import create_app
        app = create_app()
        print("✓ Flask app creation successful")
        print(f"✓ App debug mode: {app.config['DEBUG']}")
        print(f"✓ App environment: {app.config['ENV']}")
        return True
    except Exception as e:
        print(f"✗ App creation failed: {e}")
        return False

def test_environment():
    """Test environment variables."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
        
        supabase_url = os.getenv('SUPABASE_URL')
        supabase_key = os.getenv('SUPABASE_ANON_KEY')
        
        if supabase_url and supabase_key:
            print("✓ Environment variables loaded successfully")
            print(f"✓ Supabase URL: {supabase_url[:30]}...")
            return True
        else:
            print("✗ Missing required environment variables")
            return False
    except Exception as e:
        print(f"✗ Environment test failed: {e}")
        return False

if __name__ == '__main__':
    print("Testing NeuroLab 360 Backend Setup")
    print("=" * 40)
    
    success = True
    success &= test_environment()
    success &= test_imports()
    success &= test_app_creation()
    
    print("=" * 40)
    if success:
        print("✓ All tests passed! Backend setup is complete.")
    else:
        print("✗ Some tests failed. Check the errors above.")
    
    sys.exit(0 if success else 1)