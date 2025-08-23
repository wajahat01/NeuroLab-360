#!/usr/bin/env python3
"""
Simple authentication test to debug email validation issues.
"""

import os
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv('backend/.env')

def test_different_emails():
    """Test different email formats to see what works."""
    
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_ANON_KEY')
    
    if not url or not key:
        print("❌ Missing environment variables")
        return
    
    client = create_client(url, key)
    
    # Test different email formats
    test_emails = [
        "test@gmail.com",
        "user@yahoo.com", 
        "demo@outlook.com",
        "admin@test.org",
        "sample@domain.net"
    ]
    
    password = "testpass123"
    
    print("🧪 Testing different email formats...")
    print()
    
    for email in test_emails:
        try:
            print(f"Testing: {email}")
            response = client.auth.sign_up({
                "email": email,
                "password": password
            })
            
            if response.user:
                print(f"✅ SUCCESS: {email} - User created!")
                print(f"   User ID: {response.user.id}")
                print(f"   Confirmed: {bool(response.user.email_confirmed_at)}")
                
                # Try to sign in immediately
                try:
                    signin_response = client.auth.sign_in_with_password({
                        "email": email,
                        "password": password
                    })
                    if signin_response.user:
                        print(f"   ✅ Can sign in successfully")
                        return email, password  # Return working credentials
                    else:
                        print(f"   ❌ Cannot sign in")
                except Exception as signin_error:
                    print(f"   ⚠️  Sign in error: {str(signin_error)}")
                
            else:
                print(f"❌ FAILED: {email} - No user returned")
                
        except Exception as e:
            error_msg = str(e)
            if "already been registered" in error_msg.lower():
                print(f"ℹ️  EXISTS: {email} - Testing login...")
                try:
                    signin_response = client.auth.sign_in_with_password({
                        "email": email,
                        "password": password
                    })
                    if signin_response.user:
                        print(f"   ✅ Can sign in with existing account")
                        return email, password  # Return working credentials
                    else:
                        print(f"   ❌ Cannot sign in with existing account")
                except Exception as signin_error:
                    print(f"   ⚠️  Sign in error: {str(signin_error)}")
            else:
                print(f"❌ ERROR: {email} - {error_msg}")
        
        print()
    
    return None, None

def test_auth_settings():
    """Check authentication settings."""
    
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_ANON_KEY')
    
    client = create_client(url, key)
    
    print("🔧 Checking authentication configuration...")
    
    # Try to get auth settings (this might not work with anon key)
    try:
        # This is just to test if we can make any auth-related calls
        response = client.auth.get_session()
        print("✅ Auth service is accessible")
    except Exception as e:
        print(f"ℹ️  Auth service response: {str(e)}")

if __name__ == "__main__":
    print("🔐 Simple Authentication Test")
    print("=" * 50)
    print()
    
    test_auth_settings()
    print()
    
    working_email, working_password = test_different_emails()
    
    if working_email:
        print("🎉 SUCCESS!")
        print(f"Working credentials found:")
        print(f"Email: {working_email}")
        print(f"Password: {working_password}")
        print()
        print("You can now use these credentials to test the application!")
    else:
        print("❌ No working email format found.")
        print()
        print("🛠️  Manual setup required:")
        print("1. Go to Supabase Dashboard")
        print("2. Authentication > Settings")
        print("3. Check email validation settings")
        print("4. Disable email confirmations for development")
        print("5. Manually create a user in Authentication > Users")