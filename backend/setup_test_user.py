#!/usr/bin/env python3
"""
Script to create test user credentials for NeuroLab 360 development.
This script creates a test user account in Supabase for development and testing purposes.
"""

import os
import sys
from supabase_client import get_supabase_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def create_test_user():
    """Create a test user account for development."""
    
    # Test user credentials
    test_email = "test@neurolab360.com"
    test_password = "testpassword123"
    
    print("🧪 Setting up test user credentials for NeuroLab 360...")
    print(f"📧 Email: {test_email}")
    print(f"🔐 Password: {test_password}")
    print()
    
    try:
        # Get Supabase client
        supabase_client = get_supabase_client()
        client = supabase_client.client
        
        # Try to create the test user
        print("Creating test user account...")
        
        response = client.auth.admin.create_user({
            "email": test_email,
            "password": test_password,
            "email_confirm": True  # Auto-confirm email for testing
        })
        
        if response.user:
            print("✅ Test user created successfully!")
            print(f"   User ID: {response.user.id}")
            print(f"   Email: {response.user.email}")
            print()
            print("🎉 You can now log in with these credentials:")
            print(f"   Email: {test_email}")
            print(f"   Password: {test_password}")
            
        else:
            print("❌ Failed to create test user")
            return False
            
    except Exception as e:
        error_message = str(e)
        
        # Check if user already exists
        if "User already registered" in error_message or "already been registered" in error_message:
            print("ℹ️  Test user already exists!")
            print()
            print("🎉 You can log in with these existing credentials:")
            print(f"   Email: {test_email}")
            print(f"   Password: {test_password}")
            return True
            
        else:
            print(f"❌ Error creating test user: {error_message}")
            print()
            print("💡 Alternative: You can create a user manually through:")
            print("   1. Supabase Dashboard > Authentication > Users")
            print("   2. Or use the signup functionality in the app")
            return False
    
    return True

def verify_supabase_connection():
    """Verify that Supabase connection is working."""
    try:
        supabase_client = get_supabase_client()
        client = supabase_client.client
        
        # Try a simple query to verify connection
        response = client.table('auth.users').select('count').execute()
        print("✅ Supabase connection verified")
        return True
        
    except Exception as e:
        print(f"❌ Supabase connection failed: {str(e)}")
        print()
        print("🔧 Please check your environment variables:")
        print("   - SUPABASE_URL")
        print("   - SUPABASE_ANON_KEY")
        return False

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 NeuroLab 360 - Test User Setup")
    print("=" * 60)
    print()
    
    # Verify connection first
    if not verify_supabase_connection():
        sys.exit(1)
    
    # Create test user
    if create_test_user():
        print()
        print("=" * 60)
        print("✨ Setup Complete!")
        print("=" * 60)
        print()
        print("Next steps:")
        print("1. Start the frontend: cd frontend && npm start")
        print("2. Navigate to http://localhost:3000")
        print("3. Use the test credentials to log in")
        print()
    else:
        print()
        print("=" * 60)
        print("⚠️  Setup Incomplete")
        print("=" * 60)
        sys.exit(1)