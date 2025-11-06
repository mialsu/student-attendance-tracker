# Vercel Deployment Guide

This guide walks you through deploying the Student Attendance Tracker frontend to Vercel.

## Prerequisites

- Git repository hosted on GitHub, GitLab, or Bitbucket
- Vercel account (free signup at [vercel.com](https://vercel.com))
- Backend deployed and accessible (see [README.md](README.md) for backend deployment)

## Architecture Overview

```
User Browser
    ↓
Vercel CDN (Global)
    ↓
React Frontend (yourproject.vercel.app)
    ↓
    API Calls
    ↓
Hetzner VM (Backend)
    ↓
PostgreSQL Database
```

## Step-by-Step Deployment

### 1. Prepare Your Repository

Ensure your code is pushed to a Git repository:

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Prepare for Vercel deployment"

# Push to GitHub
git remote add origin https://github.com/yourusername/student-attendance-tracker.git
git push -u origin main
```

### 2. Sign Up for Vercel

1. Go to [vercel.com/signup](https://vercel.com/signup)
2. Choose "Continue with GitHub" (or your Git provider)
3. Authorize Vercel to access your repositories

### 3. Import Your Project

1. Click **"Add New Project"** in Vercel dashboard
2. Select your Git provider (GitHub/GitLab/Bitbucket)
3. Find and select your `student-attendance-tracker` repository
4. Click **"Import"**

### 4. Configure Project Settings

Vercel will auto-detect the project. Verify these settings:

**Framework Preset:** `Vite`

**Root Directory:** `client-app`

**Build Command:** `npm run build` (auto-detected)

**Output Directory:** `dist` (auto-detected)

**Install Command:** `npm install` (auto-detected)

### 5. Set Environment Variables

Before deploying, add your backend API URL:

1. In the "Environment Variables" section, add:
   - **Key:** `VITE_API_URL`
   - **Value:** `http://YOUR_BACKEND_IP` or `https://api.yourdomain.com`
   - **Environment:** Production

2. Optionally add:
   - **Key:** `VITE_API_TIMEOUT`
   - **Value:** `30000`

**Important:** You need to deploy your backend first to get the API URL. See [README.md](README.md#production-deployment) for backend deployment instructions.

### 6. Deploy

1. Click **"Deploy"**
2. Wait 1-2 minutes for build to complete
3. Vercel will show your deployment URL: `https://yourproject.vercel.app`

🎉 Your frontend is now live!

### 7. Update Backend CORS

Your backend needs to allow requests from your Vercel domain:

```bash
# SSH into your Hetzner VM
ssh user@your-vm-ip

# Edit production environment file
cd student-attendance-tracker/deployment/production
nano .env

# Update CORS_ORIGINS to include your Vercel URL:
CORS_ORIGINS=https://yourproject.vercel.app,http://localhost:5173

# Restart backend
docker-compose restart backend
```

### 8. Test Your Deployment

1. Visit your Vercel URL: `https://yourproject.vercel.app`
2. Try signing up for a new account
3. Check browser console for any API errors
4. Verify authentication works (login/logout)
5. Test creating classes and attendance records

## Automatic Deployments

Vercel automatically deploys your app when you push to Git:

- **Production Branch** (main): Deploys to `yourproject.vercel.app`
- **Other Branches**: Creates preview deployments

```bash
# Make changes
git add .
git commit -m "Update frontend"
git push origin main

# Vercel automatically builds and deploys!
```

## Custom Domain (Optional)

### Add Your Own Domain

1. In Vercel dashboard, go to **Project Settings** → **Domains**
2. Click **"Add"**
3. Enter your domain (e.g., `app.yourdomain.com`)
4. Follow DNS configuration instructions:

**Option A: Use Vercel Nameservers (Recommended)**
```
Change nameservers at your domain registrar:
ns1.vercel-dns.com
ns2.vercel-dns.com
```

**Option B: Use CNAME Record**
```
Type: CNAME
Name: app (or @)
Value: cname.vercel-dns.com
```

5. Wait for DNS propagation (5 minutes - 48 hours)
6. Vercel automatically provisions SSL certificate

### Update Backend CORS for Custom Domain

```bash
# SSH into VM
ssh user@your-vm-ip

# Update CORS
cd student-attendance-tracker/deployment/production
nano .env

# Add your custom domain:
CORS_ORIGINS=https://app.yourdomain.com,https://yourproject.vercel.app,http://localhost:5173

# Restart backend
docker-compose restart backend
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://api.yourdomain.com` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_TIMEOUT` | API request timeout (ms) | `30000` |

### Managing Environment Variables

**Via Vercel Dashboard:**
1. Go to **Project Settings** → **Environment Variables**
2. Add/edit variables
3. Redeploy to apply changes

**Via Vercel CLI:**
```bash
# Install Vercel CLI
npm i -g vercel

# Link project
vercel link

# Add environment variable
vercel env add VITE_API_URL production

# Pull environment variables
vercel env pull
```

## Troubleshooting

### Frontend Loads But Can't Connect to Backend

**Symptoms:**
- Frontend loads successfully
- API requests fail with CORS errors
- Console shows `Access-Control-Allow-Origin` errors

**Solutions:**

1. **Verify VITE_API_URL is correct:**
   - Check Vercel dashboard → Project Settings → Environment Variables
   - Should point to your backend (e.g., `http://YOUR_VM_IP` or `https://api.yourdomain.com`)

2. **Update backend CORS configuration:**
   ```bash
   # SSH into VM
   ssh user@your-vm-ip

   # Check current CORS setting
   cd student-attendance-tracker/deployment/production
   cat .env | grep CORS_ORIGINS

   # Should include your Vercel URL:
   # CORS_ORIGINS=https://yourproject.vercel.app,http://localhost:5173

   # If not, update and restart:
   nano .env
   docker-compose restart backend
   ```

3. **Test backend CORS:**
   ```bash
   curl -H "Origin: https://yourproject.vercel.app" \
        -H "Access-Control-Request-Method: GET" \
        -I https://your-backend-url/api/health

   # Should see:
   # Access-Control-Allow-Origin: https://yourproject.vercel.app
   ```

### Build Fails on Vercel

**Symptoms:**
- Deployment fails during build step
- Error about missing dependencies or build errors

**Solutions:**

1. **Check build logs** in Vercel dashboard
2. **Test build locally:**
   ```bash
   cd client-app
   npm install
   npm run build
   ```
3. **Common issues:**
   - TypeScript errors: Fix type issues
   - Missing dependencies: Update `package.json`
   - Environment variables: Add to Vercel dashboard

### Route Not Found on Refresh

**Symptoms:**
- Clicking links works fine
- Refreshing on `/classes` or other routes shows 404

**Solutions:**

This should be handled by `vercel.json` configuration. Verify the file exists:

```bash
# Check if vercel.json exists
ls client-app/vercel.json

# Should contain:
# {
#   "rewrites": [
#     { "source": "/(.*)", "destination": "/index.html" }
#   ]
# }
```

If missing, the file has been created in `client-app/vercel.json`.

### Deployment is Slow

**Typical build times:**
- First deployment: 2-3 minutes
- Subsequent deployments: 1-2 minutes

**If consistently slow (>5 minutes):**
1. Check Vercel status page: [vercel-status.com](https://www.vercel-status.com/)
2. Optimize build:
   ```json
   // In package.json
   "scripts": {
     "build": "vite build --mode production"
   }
   ```

### Environment Variables Not Updating

**After changing env vars in Vercel dashboard:**
1. Environment variables only apply to NEW builds
2. You must **redeploy** to apply changes
3. Options:
   - Push a new commit (triggers auto-deploy)
   - Click "Redeploy" in Vercel dashboard
   - Run `vercel --prod` via CLI

## Performance Optimization

### Enable Vercel Speed Insights

1. Go to **Project Settings** → **Speed Insights**
2. Click **"Enable"**
3. Redeploy your app
4. View performance metrics in Vercel dashboard

### Enable Vercel Analytics

1. Go to **Project Settings** → **Analytics**
2. Click **"Enable"**
3. Adds page view tracking automatically

### Build Optimization

Already optimized in `vite.config.ts`:
- Code splitting
- Tree shaking
- Minification
- Compression

## Monitoring

### View Logs

**Real-time logs:**
1. Go to Vercel dashboard → Your project
2. Click **"Deployments"**
3. Select deployment → **"View Function Logs"**

**Via CLI:**
```bash
vercel logs yourproject.vercel.app
```

### Monitor Performance

**Vercel Dashboard:**
- Response times
- Cache hit rates
- Error rates
- Geographic distribution

**Browser DevTools:**
- Network tab: Check API response times
- Console: Look for errors
- Performance tab: Analyze load times

## Vercel Free Tier Limits

The Hobby (free) plan includes:

| Resource | Limit |
|----------|-------|
| Bandwidth | 100 GB/month |
| Build Minutes | 100 hours/month |
| Function Invocations | 1,000,000/month |
| Deployments | Unlimited |
| Team Members | 1 |

**Usage Guidelines:**
- Suitable for hobby projects and personal use
- **Non-commercial use only** (per Vercel ToS)
- Monitor bandwidth in Vercel dashboard
- Upgrade to Pro ($20/month) for commercial projects

## Next Steps

After deploying to Vercel:

1. ✅ Test all features end-to-end
2. ✅ Setup custom domain (optional)
3. ✅ Enable Vercel Analytics (optional)
4. ✅ Configure GitHub branch protection (recommended)
5. ✅ Setup monitoring/alerts (optional)

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html#vercel)
- [Vercel CLI Reference](https://vercel.com/docs/cli)
- [Vercel Status Page](https://www.vercel-status.com/)

## Support

### Getting Help

- **Vercel Issues:** [vercel.com/support](https://vercel.com/support)
- **Project Issues:** Check [deployment/README.md](README.md)
- **CORS Issues:** See backend configuration in [deployment/README.md](README.md#backend-deployment-prerequisites)

### Common Vercel CLI Commands

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project
vercel link

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# View logs
vercel logs

# List deployments
vercel ls

# Check project info
vercel inspect
```

---

**Last Updated:** 2025-11-06
**Deployment Architecture:** Vercel (Frontend) + Hetzner (Backend)
