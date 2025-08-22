#!/usr/bin/env python3
"""
Simple script to create test user using regular signup flow.
"""

import os
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def create_test_user_simple():
    """Create test user using regular signup."""
    
    # Get Supabase credentials
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_ANON_KEY')
    
    if not url or not key:
        print("❌ Missing Supabase credentials in .env file")
        return False
    
    # Test credentials
    test_email = "test@neurolab360.com"
    test_password = "testpassword123"
    
    print("🧪 Creating test user account...")
    print(f"📧 Email: {test_email}")
    print(f"🔐 Password: {test_password}")
    print()
    
    try:
        # Create Supabase client
        supabase = create_client(url, key)
        
        # Try to sign up the test user
        response = supabase.auth.sign_up({
            "email": test_email,
            "password": test_password
        })
        
        if response.user:
            print("✅ Test user created successfully!")
            print(f"   User ID: {response.user.id}")
            print(f"   Email: {response.user.email}")
            
            if response.user.email_confirmed_at:
                print("   ✅ Email confirmed")
            else:
                print("   ⏳ Email confirmation pending")
                print("   💡 Check your email or enable auto-confirm in Supabase settings")
            
            print()
            print("🎉 Login credentials:")
            print(f"   Email: {test_email}")
            print(f"   Password: {test_password}")
            return True
            
        else:
            print("❌ Failed to create test user")
            if response.session:
                print(f"   Session created but no user returned")
            return False
            
    except Exception as e:
        error_message = str(e)
        print(f"❌ Error: {error_message}")
        
        # Check for common errors
        if "already been registered" in error_message.lower():
            print()
            print("ℹ️  Test user already exists!")
            print("🎉 You can use these credentials:")
            print(f"   Email: {test_email}")
            print(f"   Password: {test_password}")
            return True
        elif "email" in error_message.lower() and "confirm" in error_message.lower():
            print()
            print("💡 Email confirmation may be required.")
            print("   Check Supabase Dashboard > Authentication > Settings")
            print("   Consider disabling email confirmation for development")
            return False
        else:
            print()
            print("💡 You can also create a user manually:")
            print("   1. Go to Supabase Dashboard")
            print("   2. Authentication > Users > Add User")
            print(f"   3. Use email: {test_email}")
            print(f"   4. Use password: {test_password}")
            return False

if __name__ == "__main__":
    print("=" * 50)
    print("🚀 NeuroLab 360 - Test User Setup")
    print("=" * 50)
    print()
    
    success = create_test_user_simple()
    
    print()
    print("=" * 50)
    if success:
        print("✨ Setup Complete!")
        print()
        print("Next steps:")
        print("1. cd frontend && npm start")
        print("2. Go to http://localhost:3000")
        print("3. Log in with test credentials")
    else:
        print("⚠️  Manual setup may be required")
        print("Check the Supabase Dashboard")
    print("=" * 50)