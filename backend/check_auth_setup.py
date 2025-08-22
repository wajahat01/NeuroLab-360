#!/usr/bin/env python3
"""
Check Supabase authentication setup and create user properly.
"""

import os
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def check_supabase_auth():
    """Check Supabase authentication setup."""
    
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_ANON_KEY')
    
    if not url or not key:
        print("❌ Missing Supabase credentials")
        return False
    
    print("🔍 Checking Supabase authentication setup...")
    print(f"📍 URL: {url}")
    print(f"🔑 Key: {key[:20]}...")
    print()
    
    try:
        supabase = create_client(url, key)
        
        # Check if we can access auth
        print("✅ Supabase client created successfully")
        
        # Try to list users (this will fail with anon key, but that's expected)
        try:
            response = supabase.table('auth.users').select('*').execute()
            print("✅ Can access auth tables")
        except Exception as e:
            print("ℹ️  Cannot access auth tables directly (expected with anon key)")
            print(f"   Error: {str(e)}")
        
        return True
        
    except Exception as e:
        print(f"❌ Supabase setup error: {str(e)}")
        return False

def create_user_via_signup():
    """Create user using Supabase's signup method."""
    
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_ANON_KEY')
    
    test_email = "test@neurolab360.com"
    test_password = "testpassword123"
    
    print("👤 Creating user via Supabase Auth signup...")
    print(f"📧 Email: {test_email}")
    print()
    
    try:
        supabase = create_client(url, key)
        
        # Use sign_up method (this is the correct way)
        response = supabase.auth.sign_up({
            "email": test_email,
            "password": test_password
        })
        
        if response.user:
            print("✅ User created successfully!")
            print(f"   User ID: {response.user.id}")
            print(f"   Email: {response.user.email}")
            print(f"   Created: {response.user.created_at}")
            
            # Check confirmation status
            if response.user.email_confirmed_at:
                print("   ✅ Email confirmed")
                print()
                print("🎉 Ready to use! Login with:")
                print(f"   Email: {test_email}")
                print(f"   Password: {test_password}")
            else:
                print("   ⏳ Email confirmation pending")
                print()
                print("🔧 To enable login, you need to:")
                print("   1. Go to Supabase Dashboard")
                print("   2. Authentication > Settings")
                print("   3. Disable 'Enable email confirmations' for development")
                print("   OR")
                print("   4. Authentication > Users > Find user > Confirm email")
            
            return True
            
        else:
            print("❌ No user returned from signup")
            return False
            
    except Exception as e:
        error_msg = str(e)
        
        if "already been registered" in error_msg.lower():
            print("ℹ️  User already exists!")
            print()
            print("🔍 Checking if user can login...")
            
            # Try to sign in
            try:
                signin_response = supabase.auth.sign_in_with_password({
                    "email": test_email,
                    "password": test_password
                })
                
                if signin_response.user:
                    print("✅ User can login successfully!")
                    print(f"   User ID: {signin_response.user.id}")
                    print()
                    print("🎉 Use these credentials:")
                    print(f"   Email: {test_email}")
                    print(f"   Password: {test_password}")
                    return True
                    
            except Exception as signin_error:
                signin_msg = str(signin_error)
                if "email not confirmed" in signin_msg.lower():
                    print("⚠️  User exists but email not confirmed")
                    print()
                    print("🔧 Fix by:")
                    print("   1. Supabase Dashboard > Authentication > Settings")
                    print("   2. Disable 'Enable email confirmations'")
                    print("   OR")
                    print("   3. Authentication > Users > Confirm the user")
                else:
                    print(f"❌ Login failed: {signin_msg}")
                    
        else:
            print(f"❌ Signup error: {error_msg}")
            
        return False

def provide_dashboard_instructions():
    """Provide Supabase dashboard instructions."""
    print()
    print("🛠️  Manual Setup via Supabase Dashboard:")
    print("=" * 50)
    print()
    print("1. Go to: https://app.supabase.com/project/fdkjoykhsdwigwjtxdxa")
    print()
    print("2. Navigate to Authentication > Users")
    print()
    print("3. Click 'Add User'")
    print()
    print("4. Fill the form:")
    print("   • Email: test@neurolab360.com")
    print("   • Password: testpassword123")
    print("   • ✅ Check 'Auto Confirm User'")
    print()
    print("5. Click 'Create User'")
    print()
    print("6. The user will be created in Supabase's auth system")
    print("   (No password column needed in your regular tables)")

if __name__ == "__main__":
    print("=" * 60)
    print("🔐 NeuroLab 360 - Supabase Auth Check")
    print("=" * 60)
    print()
    
    if check_supabase_auth():
        print()
        if not create_user_via_signup():
            provide_dashboard_instructions()
    
    print()
    print("=" * 60)
    print("💡 Remember: Supabase handles auth separately from your app tables")
    print("=" * 60)