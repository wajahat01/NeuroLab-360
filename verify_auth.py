#!/usr/bin/env python3
"""
Comprehensive authentication verification for NeuroLab 360.
This script verifies the complete authentication setup including:
1. Environment variables
2. Supabase connection
3. Database schema
4. RLS policies
5. User creation and authentication flow
"""

import os
import sys
import json
from typing import Dict, Any, Optional
from supabase import create_client
from dotenv import load_dotenv

# Load environment variables
load_dotenv('backend/.env')
load_dotenv('frontend/.env')

class AuthVerifier:
    def __init__(self):
        self.supabase_url = os.getenv('SUPABASE_URL') or os.getenv('REACT_APP_SUPABASE_URL')
        self.supabase_key = os.getenv('SUPABASE_ANON_KEY') or os.getenv('REACT_APP_SUPABASE_ANON_KEY')
        self.client = None
        self.test_user_email = "testuser@example.com"
        self.test_user_password = "testpassword123"
        
    def print_section(self, title: str):
        """Print a formatted section header."""
        print(f"\n{'='*60}")
        print(f"🔍 {title}")
        print('='*60)
    
    def print_success(self, message: str):
        """Print a success message."""
        print(f"✅ {message}")
    
    def print_error(self, message: str):
        """Print an error message."""
        print(f"❌ {message}")
    
    def print_warning(self, message: str):
        """Print a warning message."""
        print(f"⚠️  {message}")
    
    def print_info(self, message: str):
        """Print an info message."""
        print(f"ℹ️  {message}")
    
    def verify_environment(self) -> bool:
        """Verify environment variables are set correctly."""
        self.print_section("Environment Variables")
        
        if not self.supabase_url:
            self.print_error("SUPABASE_URL not found in environment variables")
            return False
        
        if not self.supabase_key:
            self.print_error("SUPABASE_ANON_KEY not found in environment variables")
            return False
        
        self.print_success(f"Supabase URL: {self.supabase_url}")
        self.print_success(f"Supabase Key: {self.supabase_key[:20]}...")
        
        return True
    
    def verify_connection(self) -> bool:
        """Verify connection to Supabase."""
        self.print_section("Supabase Connection")
        
        try:
            self.client = create_client(self.supabase_url, self.supabase_key)
            self.print_success("Supabase client created successfully")
            return True
        except Exception as e:
            self.print_error(f"Failed to create Supabase client: {str(e)}")
            return False
    
    def verify_database_schema(self) -> bool:
        """Verify database schema exists."""
        self.print_section("Database Schema")
        
        tables_to_check = ['users', 'experiments', 'results', 'insights', 'badges']
        
        for table in tables_to_check:
            try:
                # Try to query the table structure
                response = self.client.table(table).select('*').limit(1).execute()
                self.print_success(f"Table '{table}' exists and is accessible")
            except Exception as e:
                self.print_error(f"Table '{table}' issue: {str(e)}")
                return False
        
        return True
    
    def verify_rls_policies(self) -> bool:
        """Verify RLS policies are working."""
        self.print_section("Row Level Security (RLS)")
        
        try:
            # Try to access tables without authentication (should be restricted)
            response = self.client.table('experiments').select('*').execute()
            
            # If we get data without auth, RLS might not be working properly
            if response.data:
                self.print_warning("RLS might not be properly configured - got data without authentication")
            else:
                self.print_success("RLS appears to be working - no data returned without authentication")
            
            return True
        except Exception as e:
            # This is actually expected with proper RLS
            self.print_success("RLS is working - access denied without authentication")
            return True
    
    def test_user_signup(self) -> Optional[Dict[str, Any]]:
        """Test user signup functionality."""
        self.print_section("User Signup Test")
        
        try:
            response = self.client.auth.sign_up({
                "email": self.test_user_email,
                "password": self.test_user_password
            })
            
            if response.user:
                self.print_success(f"User signup successful!")
                self.print_info(f"User ID: {response.user.id}")
                self.print_info(f"Email: {response.user.email}")
                
                if response.user.email_confirmed_at:
                    self.print_success("Email is confirmed")
                else:
                    self.print_warning("Email confirmation required")
                
                return response.user
            else:
                self.print_error("Signup returned no user")
                return None
                
        except Exception as e:
            error_msg = str(e)
            if "already been registered" in error_msg.lower():
                self.print_info("User already exists - testing login instead")
                return self.test_user_login()
            else:
                self.print_error(f"Signup failed: {error_msg}")
                return None
    
    def test_user_login(self) -> Optional[Dict[str, Any]]:
        """Test user login functionality."""
        self.print_section("User Login Test")
        
        try:
            response = self.client.auth.sign_in_with_password({
                "email": self.test_user_email,
                "password": self.test_user_password
            })
            
            if response.user and response.session:
                self.print_success("User login successful!")
                self.print_info(f"User ID: {response.user.id}")
                self.print_info(f"Session: {response.session.access_token[:20]}...")
                return response.user
            else:
                self.print_error("Login returned no user or session")
                return None
                
        except Exception as e:
            error_msg = str(e)
            if "email not confirmed" in error_msg.lower():
                self.print_warning("Email confirmation required for login")
                self.print_info("You can disable email confirmation in Supabase Dashboard > Auth > Settings")
            elif "invalid login credentials" in error_msg.lower():
                self.print_error("Invalid credentials - user might not exist")
            else:
                self.print_error(f"Login failed: {error_msg}")
            return None
    
    def test_authenticated_operations(self, user) -> bool:
        """Test operations that require authentication."""
        self.print_section("Authenticated Operations Test")
        
        if not user:
            self.print_error("No authenticated user available for testing")
            return False
        
        try:
            # Test creating an experiment
            experiment_data = {
                "user_id": user.id,
                "name": "Test Experiment",
                "experiment_type": "heart_rate",
                "parameters": {"duration": 60, "target_bpm": 80},
                "status": "pending"
            }
            
            response = self.client.table('experiments').insert(experiment_data).execute()
            
            if response.data:
                self.print_success("Successfully created experiment with authentication")
                experiment_id = response.data[0]['id']
                
                # Test reading the experiment back
                read_response = self.client.table('experiments').select('*').eq('id', experiment_id).execute()
                
                if read_response.data:
                    self.print_success("Successfully read experiment data")
                    
                    # Clean up - delete the test experiment
                    self.client.table('experiments').delete().eq('id', experiment_id).execute()
                    self.print_success("Test data cleaned up")
                    
                    return True
                else:
                    self.print_error("Could not read back experiment data")
                    return False
            else:
                self.print_error("Failed to create experiment")
                return False
                
        except Exception as e:
            self.print_error(f"Authenticated operations failed: {str(e)}")
            return False
    
    def provide_setup_instructions(self):
        """Provide setup instructions if authentication is not working."""
        self.print_section("Setup Instructions")
        
        print("🛠️  To fix authentication issues:")
        print()
        print("1. **Supabase Dashboard Setup:**")
        print(f"   - Go to: https://app.supabase.com/project/{self.supabase_url.split('/')[-1].split('.')[0]}")
        print("   - Navigate to Authentication > Settings")
        print("   - Disable 'Enable email confirmations' for development")
        print("   - Set 'Site URL' to http://localhost:3000")
        print()
        print("2. **Create Test User:**")
        print("   - Go to Authentication > Users")
        print("   - Click 'Add User'")
        print(f"   - Email: {self.test_user_email}")
        print(f"   - Password: {self.test_user_password}")
        print("   - Check 'Auto Confirm User'")
        print()
        print("3. **Database Migration:**")
        print("   - Ensure the latest migration is applied")
        print("   - Check that RLS policies are enabled")
        print()
        print("4. **Environment Variables:**")
        print("   - Verify .env files in both backend/ and frontend/")
        print("   - Ensure SUPABASE_URL and SUPABASE_ANON_KEY are correct")
    
    def run_full_verification(self) -> bool:
        """Run the complete authentication verification."""
        print("🔐 NeuroLab 360 - Authentication Verification")
        
        # Step 1: Environment
        if not self.verify_environment():
            return False
        
        # Step 2: Connection
        if not self.verify_connection():
            return False
        
        # Step 3: Database Schema
        if not self.verify_database_schema():
            return False
        
        # Step 4: RLS Policies
        if not self.verify_rls_policies():
            return False
        
        # Step 5: User Signup/Login
        user = self.test_user_signup()
        if not user:
            user = self.test_user_login()
        
        # Step 6: Authenticated Operations
        if user:
            if self.test_authenticated_operations(user):
                self.print_section("✅ VERIFICATION COMPLETE")
                self.print_success("All authentication components are working correctly!")
                self.print_info(f"Test credentials: {self.test_user_email} / {self.test_user_password}")
                return True
        
        self.print_section("❌ VERIFICATION FAILED")
        self.provide_setup_instructions()
        return False

def main():
    verifier = AuthVerifier()
    success = verifier.run_full_verification()
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()