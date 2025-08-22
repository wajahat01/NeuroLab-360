#!/usr/bin/env python3
"""
Script to help with test user email confirmation or provide setup instructions.
"""

import os
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def check_user_status():
    """Check the status of the test user."""
    
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_ANON_KEY')
    
    test_email = "test@neurolab360.com"
    test_password = "testpassword123"
    
    print("🔍 Checking test user status...")
    print()
    
    try:
        supabase = create_client(url, key)
        
        # Try to sign in to check if user is confirmed
        response = supabase.auth.sign_in_with_password({
            "email": test_email,
            "password": test_password
        })
        
        if response.user:
            print("✅ Test user is active and confirmed!")
            print(f"   User ID: {response.user.id}")
            print(f"   Email: {response.user.email}")
            print(f"   Confirmed: {response.user.email_confirmed_at is not None}")
            print()
            print("🎉 Ready to use! Login credentials:")
            print(f"   Email: {test_email}")
            print(f"   Password: {test_password}")
            return True
            
    except Exception as e:
        error_message = str(e)
        print(f"❌ Cannot sign in: {error_message}")
        
        if "email not confirmed" in error_message.lower() or "confirm" in error_message.lower():
            print()
            print("📧 Email confirmation required!")
            print()
            print("🔧 To fix this for development, you have two options:")
            print()
            print("Option 1: Disable email confirmation (Recommended for development)")
            print("   1. Go to your Supabase Dashboard")
            print("   2. Navigate to Authentication > Settings")
            print("   3. Find 'Enable email confirmations'")
            print("   4. Turn it OFF for development")
            print("   5. Save the settings")
            print()
            print("Option 2: Manually confirm the user")
            print("   1. Go to Supabase Dashboard")
            print("   2. Navigate to Authentication > Users")
            print(f"   3. Find user: {test_email}")
            print("   4. Click on the user")
            print("   5. Set 'Email Confirmed' to true")
            print()
            print("After either option, the test credentials will work:")
            print(f"   Email: {test_email}")
            print(f"   Password: {test_password}")
            
        return False

def provide_manual_instructions():
    """Provide manual setup instructions."""
    print()
    print("🛠️  Manual Setup Instructions:")
    print("=" * 40)
    print()
    print("If the automatic setup didn't work, you can create a test user manually:")
    print()
    print("1. Go to your Supabase Dashboard:")
    print("   https://app.supabase.com/project/fdkjoykhsdwigwjtxdxa")
    print()
    print("2. Navigate to Authentication > Users")
    print()
    print("3. Click 'Add User' button")
    print()
    print("4. Fill in the form:")
    print("   Email: test@neurolab360.com")
    print("   Password: testpassword123")
    print("   ✅ Check 'Auto Confirm User' (important!)")
    print()
    print("5. Click 'Create User'")
    print()
    print("6. Test the login in your application")

if __name__ == "__main__":
    print("=" * 50)
    print("🔧 NeuroLab 360 - User Status Check")
    print("=" * 50)
    print()
    
    if not check_user_status():
        provide_manual_instructions()
    
    print()
    print("=" * 50)
    print("💡 Need help? Check the Supabase Dashboard")
    print("=" * 50)