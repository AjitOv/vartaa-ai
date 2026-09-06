#!/bin/bash
# Vartaa AI — deploy API to Cloud Run + app to Firebase Hosting.  Usage: bash deploy-gcp.sh <gcp-project-id>
set -e
PROJECT=${1:?"usage: bash deploy-gcp.sh <gcp-project-id>"}
REGION=asia-south1
cd "$(dirname "$0")"
gcloud config set project "$PROJECT"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com >/dev/null
gcloud firestore databases create --location="$REGION" --type=firestore-native 2>/dev/null || true
read -r -s -p "GEMINI_API_KEY (hidden, Enter to keep existing): " KEY; echo
read -r -s -p "SARVAM_API_KEY (optional, Enter to skip): " SKEY; echo
ENV="GEMINI_MODEL=gemini-3.6-flash"
[ -n "$KEY" ] && ENV="$ENV,GEMINI_API_KEY=$KEY"
[ -n "$SKEY" ] && ENV="$ENV,SARVAM_API_KEY=$SKEY"
echo "→ Deploying API to Cloud Run ($REGION)…"
gcloud run deploy vartaa-api --source . --region "$REGION" --allow-unauthenticated --set-env-vars "$ENV" --memory 512Mi --max-instances 3
API_URL=$(gcloud run services describe vartaa-api --region "$REGION" --format 'value(status.url)')
echo "API: $API_URL   (check: $API_URL/api/health)"
echo "→ Deploying app to Firebase Hosting…"
sed -i.bak "s/YOUR_FIREBASE_PROJECT_ID/$PROJECT/" .firebaserc && rm -f .firebaserc.bak
npx -y firebase-tools deploy --only hosting,firestore:rules --project "$PROJECT"
echo "Done → https://$PROJECT.web.app"
