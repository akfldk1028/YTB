#!/bin/bash

# ============================================================================
# GCP Cloud Run Deployment Script
# ============================================================================
# This script automates the deployment of Short Video Maker to GCP Cloud Run
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored messages
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# ============================================================================
# Configuration
# ============================================================================

# Load from environment or use defaults
PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-short-video-maker}"
MEMORY="${MEMORY:-4Gi}"
CPU="${CPU:-2}"
MAX_INSTANCES="${MAX_INSTANCES:-10}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
TIMEOUT="${TIMEOUT:-3600}"

# ============================================================================
# Pre-flight Checks
# ============================================================================

log_info "Starting GCP Cloud Run deployment..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    log_error "gcloud CLI is not installed. Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install it from: https://docs.docker.com/get-docker/"
    exit 1
fi

# Get project ID if not set
if [ -z "$PROJECT_ID" ]; then
    PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
    if [ -z "$PROJECT_ID" ]; then
        log_error "GCP project not set. Set it with: gcloud config set project YOUR_PROJECT_ID"
        log_error "Or export GCP_PROJECT_ID=YOUR_PROJECT_ID"
        exit 1
    fi
fi

log_success "Using GCP Project: $PROJECT_ID"
log_info "Region: $REGION"
log_info "Service Name: $SERVICE_NAME"

# ============================================================================
# Enable Required APIs
# ============================================================================

log_info "Checking required GCP APIs..."

REQUIRED_APIS=(
    "cloudbuild.googleapis.com"
    "run.googleapis.com"
    "secretmanager.googleapis.com"
    "containerregistry.googleapis.com"
)

for api in "${REQUIRED_APIS[@]}"; do
    if gcloud services list --enabled --project="$PROJECT_ID" --filter="NAME:$api" --format="value(NAME)" | grep -q "$api"; then
        log_success "API $api is already enabled"
    else
        log_warning "Enabling API: $api"
        gcloud services enable "$api" --project="$PROJECT_ID"
    fi
done

# ============================================================================
# Build and Push Docker Image using Cloud Build
# ============================================================================

log_info "Building Docker image using Cloud Build..."

IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"
IMAGE_TAG=$(date +%Y%m%d-%H%M%S)
IMAGE_FULL="$IMAGE_NAME:$IMAGE_TAG"
IMAGE_LATEST="$IMAGE_NAME:latest"

# Create a temporary cloudbuild.yaml for this deployment
cat > /tmp/cloudbuild-deploy.yaml <<EOF
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['buildx', 'build', '-f', 'gcp.Dockerfile', '-t', '$IMAGE_FULL', '-t', '$IMAGE_LATEST', '--push', '.']
    env:
      - 'DOCKER_BUILDKIT=1'
images:
  - '$IMAGE_FULL'
  - '$IMAGE_LATEST'
options:
  machineType: 'N1_HIGHCPU_8'
  diskSizeGb: 100
timeout: '600s'
EOF

# Use Cloud Build to build and push the image
gcloud builds submit \
    --config=/tmp/cloudbuild-deploy.yaml \
    --project="$PROJECT_ID" \
    .

log_success "Docker image built and pushed: $IMAGE_FULL and $IMAGE_LATEST"

# ============================================================================
# Check Secrets
# ============================================================================

log_info "Checking required secrets..."

REQUIRED_SECRETS=(
    "PEXELS_API_KEY"
    "GOOGLE_GEMINI_API_KEY"
    "GOOGLE_CLOUD_PROJECT_ID"
)

for secret in "${REQUIRED_SECRETS[@]}"; do
    if gcloud secrets describe "$secret" --project="$PROJECT_ID" &>/dev/null; then
        log_success "Secret $secret exists"
    else
        log_warning "Secret $secret does not exist!"
        log_warning "Create it with: echo -n 'YOUR_VALUE' | gcloud secrets create $secret --data-file=-"
    fi
done

# ============================================================================
# Deploy to Cloud Run
# ============================================================================

log_info "Deploying to Cloud Run..."

gcloud run deploy "$SERVICE_NAME" \
    --image "$IMAGE_FULL" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --memory "$MEMORY" \
    --cpu "$CPU" \
    --timeout "$TIMEOUT" \
    --concurrency 80 \
    --min-instances "$MIN_INSTANCES" \
    --max-instances "$MAX_INSTANCES" \
    --port 3123 \
    --set-env-vars "DOCKER=true,LOG_LEVEL=info,CONCURRENCY=1,VIDEO_CACHE_SIZE_IN_BYTES=2097152000,WHISPER_MODEL=base.en,TTS_PROVIDER=google,VIDEO_SOURCE=veo,VEO3_USE_NATIVE_AUDIO=false,VEO_MODEL=veo-3.0-fast-generate-001,GCS_BUCKET_NAME=dkdk-474008-short-videos,GCS_REGION=us-central1,GCS_SIGNED_URL_EXPIRY_HOURS=24,GCS_AUTO_DELETE_DAYS=30" \
    --set-secrets "PEXELS_API_KEY=PEXELS_API_KEY:latest,GOOGLE_GEMINI_API_KEY=GOOGLE_GEMINI_API_KEY:latest,GOOGLE_CLOUD_PROJECT_ID=GOOGLE_CLOUD_PROJECT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest,YOUTUBE_DATA=YOUTUBE_DATA:latest" \
    --project "$PROJECT_ID"

# ============================================================================
# Get Service URL
# ============================================================================

SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format="value(status.url)")

log_success "=========================================="
log_success "Deployment Complete!"
log_success "=========================================="
log_success "Service URL: $SERVICE_URL"
log_success ""
log_info "Test the service:"
log_info "  curl $SERVICE_URL/health"
log_success ""
log_info "View logs:"
log_info "  gcloud run services logs read $SERVICE_NAME --region $REGION --project $PROJECT_ID"
log_success ""
log_info "API Endpoints:"
log_info "  Nano Banana:        $SERVICE_URL/api/video/nano-banana"
log_info "  VEO3:               $SERVICE_URL/api/video/veo3"
log_info "  Consistent Shorts:  $SERVICE_URL/api/video/consistent-shorts"
log_info "  Pexels:             $SERVICE_URL/api/video/pexels"
log_success "=========================================="

exit 0
