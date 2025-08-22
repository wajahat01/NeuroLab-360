# 🧪 NeuroLab 360 - Test Credentials

## Quick Login Credentials

For development and testing purposes, use these credentials:

```
Email: test@neurolab360.com
Password: testpassword123
```

## Setup Status

✅ **Test user created successfully!**

⚠️ **Email confirmation required** - See setup instructions below.

## 🔧 Setup Instructions

The test user has been created but needs email confirmation. Choose one of these options:

### Option 1: Disable Email Confirmation (Recommended for Development)

1. Go to your [Supabase Dashboard](https://app.supabase.com/project/fdkjoykhsdwigwjtxdxa)
2. Navigate to **Authentication > Settings**
3. Find **"Enable email confirmations"**
4. Turn it **OFF** for development
5. Save the settings

### Option 2: Manually Confirm the User

1. Go to [Supabase Dashboard](https://app.supabase.com/project/fdkjoykhsdwigwjtxdxa)
2. Navigate to **Authentication > Users**
3. Find user: `test@neurolab360.com`
4. Click on the user
5. Set **"Email Confirmed"** to `true`

## 🚀 Testing the Login

1. Start the frontend:
   ```bash
   cd frontend
   npm start
   ```

2. Navigate to: http://localhost:3000

3. Use the test credentials:
   - **Email:** `test@neurolab360.com`
   - **Password:** `testpassword123`

## 🛠️ Troubleshooting

### If login still doesn't work:

1. **Check Supabase Dashboard:**
   - Verify the user exists in Authentication > Users
   - Ensure the user is confirmed (email_confirmed_at is not null)

2. **Check browser console:**
   - Open Developer Tools (F12)
   - Look for any authentication errors

3. **Verify environment variables:**
   - Check `frontend/.env` has correct Supabase URL and key
   - Check `backend/.env` has matching credentials

### Create a new test user manually:

If needed, you can create a fresh test user:

1. Go to Supabase Dashboard > Authentication > Users
2. Click **"Add User"**
3. Fill in:
   - Email: `test@neurolab360.com`
   - Password: `testpassword123`
   - ✅ Check **"Auto Confirm User"**
4. Click **"Create User"**

## 📝 Scripts Available

- `python3 backend/create_test_user_simple.py` - Create test user
- `python3 backend/confirm_test_user.py` - Check user status and get setup help

## 🔐 Security Note

These are **development credentials only**. Never use these in production!

---

**Happy testing! 🎉**