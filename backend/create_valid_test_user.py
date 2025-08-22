#!/usr/bin/env python3
"""
Create test user with valid email format.
"""

import os
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def create_test_user():
    """Create test user with proper email format."""
    
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_ANON_KEY')
    
    # Use a more standard email format
    test_email = "test@example.com"
    test_password = "testpassword123"
    
    print("👤 Creating test user with standard email format...")
    print(f"📧 Email: {test_email}")
    print(f"🔐 Password: {test_password}")
    print()
    
    try:
        supabase = create_client(url, key)
        
        # Try signup
        response = supabase.auth.sign_up({
            "email": test_email,
            "password": test_password
        })
        
        if response.user:
            print("✅ Test user created successfully!")
            print(f"   User ID: {response.user.id}")
            print(f"   Email: {response.user.email}")
            
            if response.user.email_confirmed_at:
                print("   ✅ Email confirmed - Ready to use!")
            else:
                print("   ⏳ Email confirmation pending")
                print()
                print("🔧 To use immediately:")
                print("   1. Go to Supabase Dashboard > Authentication > Settings")
                print("   2. Turn OFF 'Enable email confirmations'")
                print("   3. Or manually confirm user in Users section")
            
            print()
            print("🎉 Login Credentials:")
            print(f"   Email: {test_email}")
            print(f"   Password: {test_password}")
            
            return True, test_email, test_password
            
        else:
            print("❌ No user returned")
            return False, test_email, test_password
            
    except Exception as e:
        error_msg = str(e)
        
        if "already been registered" in error_msg.lower():
            print("ℹ️  User already exists!")
            
            # Test login
            try:
                signin_response = supabase.auth.sign_in_with_password({
                    "email": test_email,
                    "password": test_password
                })
                
                if signin_response.user:
                    print("✅ Existing user can login!")
                    print()
                    print("🎉 Use these credentials:")
                    print(f"   Email: {test_email}")
                    print(f"   Password: {test_password}")
                    return True, test_email, test_password
                    
            except Exception as signin_error:
                if "email not confirmed" in str(signin_error).lower():
                    print("⚠️  User exists but needs email confirmation")
                    print()
                    print("🔧 Quick fix:")
                    print("   Supabase Dashboard > Authentication > Settings")
                    print("   Turn OFF 'Enable email confirmations'")
                else:
                    print(f"❌ Login test failed: {str(signin_error)}")
        else:
            print(f"❌ Signup failed: {error_msg}")
            
        return False, test_email, test_password

def test_alternative_emails():
    """Try different email formats."""
    
    emails_to_try = [
        "testuser@gmail.com",
        "demo@test.com", 
        "user@neurolab.dev"
    ]
    
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_ANON_KEY')
    password = "testpassword123"
    
    supabase = create_client(url, key)
    
    print("🔄 Trying alternative email formats...")
    print()
    
    for email in emails_to_try:
        print(f"📧 Trying: {email}")
        
        try:
            response = supabase.auth.sign_up({
                "email": email,
                "password": password
            })
            
            if response.user:
                print(f"✅ Success! Created user: {email}")
                print(f"   User ID: {response.user.id}")
                print()
                print("🎉 Login Credentials:")
                print(f"   Email: {email}")
                print(f"   Password: {password}")
                return True, email, password
                
        except Exception as e:
            if "already been registered" in str(e).lower():
                print(f"ℹ️  {email} already exists - trying login...")
                
                try:
                    signin_response = supabase.auth.sign_in_with_password({
                        "email": email,
                        "password": password
                    })
                    
                    if signin_response.user:
                        print(f"✅ Can login with: {email}")
                        print()
                        print("🎉 Use these credentials:")
                        print(f"   Email: {email}")
                        print(f"   Password: {password}")
                        return True, email, password
                        
                except Exception 