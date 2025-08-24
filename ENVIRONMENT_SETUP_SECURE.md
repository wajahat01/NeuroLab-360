# Secure Environment Setup

## ⚠️ IMPORTANT SECURITY NOTICE

This project uses Supabase for database and authentication. The API keys have been removed from the repository for security reasons.

## Setting Up Your Environment

### 1. Backend Environment Setup

1. Copy the local environment template:
   ```bash
   cp backend/.env.local backend/.env
   ```

2. Edit `backend/.env` and replace the placeholder values with your actual Supabase credentials:
   ```env
   SUPABASE_URL=your_actual_supabase_url
   SUPABASE_ANON_KEY=your_actual_supabase_anon_key
   SUPABASE_SERVICE_KEY=your_actual_supabase_service_key
   ```

### 2. Frontend Environment Setup

1. Copy the local environment template:
   ```bash
   cp frontend/.env.local frontend/.env
   ```

2. Edit `frontend/.env` and replace the placeholder values:
   ```env
   REACT_APP_SUPABASE_URL=your_actual_supabase_url
   REACT_APP_SUPABASE_ANON_KEY=your_actual_supabase_anon_key
   ```

### 3. Getting Your Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to Settings → API
4. Copy the following:
   - **Project URL** → Use as `SUPABASE_URL`
   - **anon public** key → Use as `SUPABASE_ANON_KEY`
   - **service_role secret** key → Use as `SUPABASE_SERVICE_KEY` (⚠️ Keep this secret!)

### 4. Security Best Practices

- ✅ **DO**: Keep your `.env` files local and never commit them
- ✅ **DO**: Use different keys for development and production
- ✅ **DO**: Rotate your keys regularly
- ❌ **DON'T**: Share your service role key
- ❌ **DON'T**: Commit API keys to version control
- ❌ **DON'T**: Use production keys in development

### 5. File Structure

```
├── backend/
│   ├── .env              # Your actual keys (not committed)
│   └── .env.local        # Template with real keys (not committed)
├── frontend/
│   ├── .env              # Your actual keys (not committed)
│   ├── .env.local        # Template with real keys (not committed)
│   └── .env.production   # Production template (sanitized)
└── .env.example          # Example template (sanitized)
```

### 6. Troubleshooting

If you see errors like "Missing Supabase environment variables":
1. Check that your `.env` files exist in the correct locations
2. Verify that the keys are correctly formatted (no extra spaces)
3. Restart your development servers after changing environment variables

### 7. Production Deployment

For production deployment:
1. Set environment variables in your hosting platform (Heroku, Vercel, etc.)
2. Never use the same keys for development and production
3. Use your hosting platform's secret management system

## Need Help?

If you need access to the development Supabase project:
1. Contact the project maintainer
2. They will invite you to the Supabase project
3. You can then get your own set of API keys

Remember: **Never commit real API keys to version control!**