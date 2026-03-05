# CI/CD Setup Guide

This guide explains how to set up the automated testing and deployment pipeline.

## Overview

The CI/CD pipeline automatically:
1. ✅ Runs all tests on every push
2. ✅ Deploys to production when tests pass (main branch only)
3. ✅ Applies database migrations automatically
4. ✅ Performs health checks after deployment

## Setup Instructions

### Step 1: Generate SSH Key for GitHub Actions

On your **local machine**, generate a dedicated SSH key:

```bash
# Generate deployment key (no passphrase)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy

# Display public key
cat ~/.ssh/github_actions_deploy.pub
```

**Copy the public key** (starts with `ssh-ed25519`).

---

### Step 2: Add Public Key to Hetzner Server

SSH to your production server and add the public key:

```bash
# SSH to server
ssh root@attendance-api.kotoio.fi

# Add the public key to authorized_keys
nano ~/.ssh/authorized_keys
# Paste the public key on a new line, save and exit

# Verify permissions
chmod 600 ~/.ssh/authorized_keys
```

**Test the connection** from your local machine:

```bash
ssh -i ~/.ssh/github_actions_deploy root@attendance-api.kotoio.fi
# Should connect without password
```

---

### Step 3: Add Secrets to GitHub Repository

1. Go to your repository: https://github.com/student-attendance-tracker/student-attendance-tracker-api
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

#### Secret 1: SSH_PRIVATE_KEY

```bash
# Copy the PRIVATE key (entire contents)
cat ~/.ssh/github_actions_deploy
```

- Name: `SSH_PRIVATE_KEY`
- Value: Paste the **entire private key** including:
  ```
  -----BEGIN OPENSSH PRIVATE KEY-----
  ... (all the key content) ...
  -----END OPENSSH PRIVATE KEY-----
  ```

#### Secret 2: SERVER_HOST

- Name: `SERVER_HOST`
- Value: `attendance-api.kotoio.fi`

#### Secret 3: SERVER_USER

- Name: `SERVER_USER`
- Value: `root`

#### Secret 4: PROJECT_PATH

- Name: `PROJECT_PATH`
- Value: `/opt/attendance-tracker`

---

### Step 4: Commit and Push the Workflow

```bash
cd ~/code/personal/student-attendance-tracker/student-attendance-tracker-api

# Check the workflow file was created
ls -la .github/workflows/deploy.yml

# Commit and push
git add .github/
git commit -m "ci: add GitHub Actions workflow for automated testing and deployment"
git push origin main
```

---

### Step 5: Verify the Pipeline

1. Go to: https://github.com/student-attendance-tracker/student-attendance-tracker-api/actions
2. You should see the workflow running
3. Click on the workflow to see logs

**Expected workflow stages:**
1. **Test** - Runs pytest with PostgreSQL
2. **Deploy** - SSHs to server, pulls code, rebuilds, restarts
3. **Notify** - Shows deployment summary

---

## How It Works

### On Every Push/PR:
- ✅ Tests run automatically
- ❌ Deployment does NOT happen (PRs are for testing only)

### On Push to `main` Branch:
- ✅ Tests run
- ✅ If tests pass → Deploy to production
- ✅ Migrations run automatically on container start
- ✅ Health check verifies deployment
- ❌ If tests fail → Deployment is skipped

---

## Manual Deployment

You can trigger deployment manually from GitHub:

1. Go to: https://github.com/student-attendance-tracker/student-attendance-tracker-api/actions
2. Click **Test and Deploy Backend** workflow
3. Click **Run workflow** → Select `main` branch → **Run workflow**

---

## Troubleshooting

### Tests Fail in CI but Pass Locally

**Cause:** Environment differences

**Fix:** Check the workflow environment variables match your local `.env`

### Deployment Fails with "Permission Denied"

**Cause:** SSH key not properly added to server

**Fix:**
1. Verify public key is in `/root/.ssh/authorized_keys` on server
2. Verify private key is correctly pasted in GitHub Secrets (no extra spaces)
3. Test SSH connection manually: `ssh -i ~/.ssh/github_actions_deploy root@attendance-api.kotoio.fi`

### Health Check Fails After Deployment

**Cause:** Backend didn't start properly

**Fix:**
1. Check workflow logs for error messages
2. SSH to server manually and check: `docker compose -f deployment/production/docker-compose.yml logs backend`
3. Verify migrations ran successfully

### Container Build Fails

**Cause:** Docker build error or missing dependencies

**Fix:**
1. Check workflow logs for build errors
2. Test build locally: `docker compose -f deployment/production/docker-compose.yml build backend`
3. Verify `requirements.txt` is up to date

---

## Viewing Deployment History

All deployments are logged in GitHub Actions:
- https://github.com/student-attendance-tracker/student-attendance-tracker-api/actions

Each deployment shows:
- ✅ Test results
- ✅ Deployment logs
- ✅ Health check status
- ✅ Commit that triggered the deployment

---

## Rollback

If a deployment breaks production:

```bash
# SSH to server
ssh root@attendance-api.kotoio.fi

cd /opt/attendance-tracker/student-attendance-tracker-api

# Revert to previous commit
git log --oneline -5  # Find the previous working commit
git reset --hard <commit-hash>

# Rebuild and restart
cd ..
docker compose -f deployment/production/docker-compose.yml down
docker compose -f deployment/production/docker-compose.yml build --no-cache backend
docker compose -f deployment/production/docker-compose.yml up -d
```

Or trigger a redeployment of a previous commit from GitHub Actions.

---

## Security Notes

- ✅ SSH private key is encrypted in GitHub Secrets
- ✅ Never commit private keys to the repository
- ✅ Use a dedicated SSH key (not your personal key)
- ✅ The deployment key only has access to the server, not your local machine
- ✅ Revoke the key from server's `authorized_keys` if compromised

---

## Cost

**$0** - GitHub Actions is free:
- Public repos: Unlimited minutes
- Private repos: 2,000 minutes/month (plenty for this project)

---

## Next Steps

After setting up CI/CD:
1. Test by making a small code change and pushing to `main`
2. Watch the workflow run in GitHub Actions
3. Verify deployment succeeded
4. Check https://attendance-api.kotoio.fi/health

**Enjoy automated deployments!** 🚀
