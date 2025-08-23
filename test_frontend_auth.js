#!/usr/bin/env node
/**
 * Frontend Authentication Test
 * Tests the React/JavaScript authentication setup
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'frontend/.env' });

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

console.log('🌐 Frontend Authentication Test');
console.log('='.repeat(50));
console.log();

// Check environment variables
console.log('📋 Environment Check:');
if (!supabaseUrl || !supabaseKey) {
  console.log('❌ Missing environment variables');
  console.log(`   REACT_APP_SUPABASE_URL: ${supabaseUrl ? '✅' : '❌'}`);
  console.log(`   REACT_APP_SUPABASE_ANON_KEY: ${supabaseKey ? '✅' : '❌'}`);
  process.exit(1);
}

console.log('✅ Environment variables loaded');
console.log(`   URL: ${supabaseUrl}`);
console.log(`   Key: ${supabaseKey.substring(0, 20)}...`);
console.log();

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

async function testFrontendAuth() {
  console.log('🔑 Testing Frontend Authentication:');
  
  const testEmail = 'demo@outlook.com';
  const testPassword = 'testpass123';
  
  try {
    // Test signup (user might already exist)
    console.log(`   Attempting signup with ${testEmail}...`);
    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword
    });
    
    if (signupError) {
      if (signupError.message.includes('already been registered')) {
        console.log('   ℹ️  User already exists, testing login...');
      } else {
        console.log(`   ❌ Signup error: ${signupError.message}`);
      }
    } else if (signupData.user) {
      console.log('   ✅ Signup successful');
      console.log(`   User ID: ${signupData.user.id}`);
    }
    
    // Test signin
    console.log(`   Attempting signin with ${testEmail}...`);
    const { data: signinData, error: signinError } = await supabase.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });
    
    if (signinError) {
      console.log(`   ❌ Signin error: ${signinError.message}`);
      
      if (signinError.message.includes('Email not confirmed')) {
        console.log();
        console.log('   🔧 Fix required:');
        console.log('   1. Go to Supabase Dashboard > Authentication > Settings');
        console.log('   2. Disable "Enable email confirmations"');
        console.log('   OR');
        console.log('   3. Go to Authentication > Users > Find user > Confirm email');
      }
      
      return false;
    }
    
    if (signinData.user && signinData.session) {
      console.log('   ✅ Signin successful');
      console.log(`   User ID: ${signinData.user.id}`);
      console.log(`   Session: ${signinData.session.access_token.substring(0, 20)}...`);
      
      // Test authenticated request
      console.log('   Testing authenticated database access...');
      
      const testExperiment = {
        user_id: signinData.user.id,
        name: 'Frontend Auth Test',
        experiment_type: 'heart_rate',
        parameters: { test: true },
        status: 'pending'
      };
      
      const { data: expData, error: expError } = await supabase
        .table('experiments')
        .insert(testExperiment);
      
      if (expError) {
        console.log(`   ❌ Database access error: ${expError.message}`);
        return false;
      }
      
      if (expData && expData.length > 0) {
        console.log('   ✅ Database access successful');
        
        // Clean up test data
        await supabase
          .table('experiments')
          .delete()
          .eq('id', expData[0].id);
        
        console.log('   ✅ Test data cleaned up');
      }
      
      // Test signout
      const { error: signoutError } = await supabase.auth.signOut();
      if (signoutError) {
        console.log(`   ⚠️  Signout error: ${signoutError.message}`);
      } else {
        console.log('   ✅ Signout successful');
      }
      
      return true;
    }
    
    return false;
    
  } catch (error) {
    console.log(`   ❌ Unexpected error: ${error.message}`);
    return false;
  }
}

async function main() {
  const success = await testFrontendAuth();
  
  console.log();
  console.log('📊 Test Results:');
  
  if (success) {
    console.log('🟢 Frontend authentication is working correctly!');
    console.log();
    console.log('🎉 Ready to use:');
    console.log('   1. Start frontend: cd frontend && npm start');
    console.log('   2. Go to: http://localhost:3000/login');
    console.log('   3. Login with: demo@outlook.com / testpass123');
  } else {
    console.log('🔴 Frontend authentication needs configuration');
    console.log();
    console.log('🔧 Next steps:');
    console.log('   1. Follow the Supabase Dashboard instructions above');
    console.log('   2. Re-run this test: node test_frontend_auth.js');
  }
  
  console.log();
  console.log('='.repeat(50));
}

main().catch(console.error);