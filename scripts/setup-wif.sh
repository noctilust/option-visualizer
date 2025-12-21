#!/bin/bash
# Setup Workload Identity Federation for GitHub Actions
# Run this script once to configure secure authentication

set -e

PROJECT_ID="gen-lang-client-0233172083"
#GITHUB_REPO="YOUR_GITHUB_USERNAME/option-visualizer"  # Update this!
GITHUB_REPO="noctilust/option-visualizer"

SERVICE_ACCOUNT_NAME="github-actions-deployer"
WORKLOAD_IDENTITY_POOL="github-pool"
WORKLOAD_IDENTITY_PROVIDER="github-provider"

echo "🔧 Setting up Workload Identity Federation..."
echo "Project: $PROJECT_ID"
echo "Repo: $GITHUB_REPO"
echo ""

# Enable required APIs
echo "📡 Enabling required APIs..."
gcloud services enable \
  iamcredentials.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  --project=$PROJECT_ID

# Create service account
echo "👤 Creating service account..."
gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
  --display-name="GitHub Actions Deployer" \
  --project=$PROJECT_ID 2>/dev/null || echo "Service account already exists"

SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Grant permissions to service account
echo "🔑 Granting permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/run.admin" \
  --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/cloudbuild.builds.builder" \
  --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/storage.admin" \
  --condition=None

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT_EMAIL" \
  --role="roles/iam.serviceAccountUser" \
  --condition=None

# Create Workload Identity Pool
echo "🏊 Creating Workload Identity Pool..."
gcloud iam workload-identity-pools create $WORKLOAD_IDENTITY_POOL \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --project=$PROJECT_ID 2>/dev/null || echo "Pool already exists"

# Create Workload Identity Provider
echo "🔗 Creating Workload Identity Provider..."
gcloud iam workload-identity-pools providers create-oidc $WORKLOAD_IDENTITY_PROVIDER \
  --location="global" \
  --workload-identity-pool=$WORKLOAD_IDENTITY_POOL \
  --display-name="GitHub Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='$GITHUB_REPO'" \
  --project=$PROJECT_ID 2>/dev/null || echo "Provider already exists"

# Allow service account impersonation
echo "🎭 Configuring service account impersonation..."
gcloud iam service-accounts add-iam-policy-binding $SERVICE_ACCOUNT_EMAIL \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')/locations/global/workloadIdentityPools/$WORKLOAD_IDENTITY_POOL/attribute.repository/$GITHUB_REPO" \
  --project=$PROJECT_ID

# Get the full provider name
PROVIDER_NAME="projects/$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')/locations/global/workloadIdentityPools/$WORKLOAD_IDENTITY_POOL/providers/$WORKLOAD_IDENTITY_PROVIDER"

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Add these secrets to your GitHub repository:"
echo "   Settings → Secrets and variables → Actions → New repository secret"
echo ""
echo "┌────────────────────────────────────────────────────────────────────────────────┐"
echo "│ Secret Name         │ Value                                                    │"
echo "├────────────────────────────────────────────────────────────────────────────────┤"
echo "│ WIF_PROVIDER        │ $PROVIDER_NAME"
echo "│ WIF_SERVICE_ACCOUNT │ $SERVICE_ACCOUNT_EMAIL"
echo "│ GEMINI_API_KEY      │ (your API key)"
echo "│ TASTYTRADE_CLIENT_SECRET │ (your secret)"
echo "│ TASTYTRADE_REFRESH_TOKEN │ (your token)"
echo "└────────────────────────────────────────────────────────────────────────────────┘"
echo ""
echo "🚀 After adding secrets, push to main branch to trigger deployment!"
