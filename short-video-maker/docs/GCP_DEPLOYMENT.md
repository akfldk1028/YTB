# GCP Cloud Run Deployment Guide

Complete guide for deploying Short Video Maker to Google Cloud Platform (GCP) Cloud Run.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Detailed Setup](#detailed-setup)
- [Environment Variables](#environment-variables)
- [Secrets Management](#secrets-management)
- [Deployment Methods](#deployment-methods)
- [Monitoring and Logging](#monitoring-and-logging)
- [Troubleshooting](#troubleshooting)
- [Cost Optimization](#cost-optimization)

---

## Prerequisites

### Required Tools

1. **Google Cloud SDK (gcloud)**
   ```bash
   # Install gcloud CLI
   # Visit: https://cloud.google.com/sdk/docs/install

   # Initialize and login
   gcloud init
   gcloud auth login
   ```

2. **Docker**
   ```bash
   # Install Docker
   # Visit: https://docs.docker.com/get-docker/

   # Verify installation
   docker --version
   ```

3. **GCP Project**
   ```bash
   # Create a new project (or use existing)
   gcloud projects create YOUR_PROJECT_ID --name="Short Video Maker"

   # Set as default project
   gcloud config set project YOUR_PROJECT_ID
   ```

### Required API Keys

You'll need API keys for:

1. **Pexels API** (Required) - https://www.pexels.com/api/
2. **Google Gemini API** (Required) - https://ai.google.dev/
3. **Google Cloud Project ID** (Required) - Your GCP project ID

Optional:
- **ElevenLabs API** - https://elevenlabs.io/
- **Leonardo AI API** - https://leonardo.ai/
- **YouTube OAuth** - https://console.cloud.google.com/apis/credentials

---

## Quick Start

### Option 1: Automated Deployment (Recommended)

```bash
# 1. Navigate to project directory
cd short-video-maker

# 2. Set your GCP project
export GCP_PROJECT_ID="your-project-id"

# 3. Run deployment script
./deploy-gcp.sh
```

The script will:
- ✅ Check prerequisites
- ✅ Enable required GCP APIs
- ✅ Build Docker image
- ✅ Push to Container Registry
- ✅ Deploy to Cloud Run
- ✅ Output service URL

### Option 2: Cloud Build (CI/CD)

```bash
# Submit build using Cloud Build
gcloud builds submit --config cloudbuild.yaml
```

---

## Detailed Setup

### Step 1: Enable GCP APIs

```bash
# Enable required services
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### Step 2: Create Secrets

Store API keys securely in Secret Manager:

```bash
# Create secrets (replace with your actual keys)
echo -n "YOUR_PEXELS_API_KEY" | \
  gcloud secrets create PEXELS_API_KEY --data-file=-

echo -n "YOUR_GEMINI_API_KEY" | \
  gcloud secrets create GOOGLE_GEMINI_API_KEY --data-file=-

echo -n "YOUR_PROJECT_ID" | \
  gcloud secrets create GOOGLE_CLOUD_PROJECT_ID --data-file=-

# Optional secrets
echo -n "YOUR_ELEVENLABS_KEY" | \
  gcloud secrets create ELEVENLABS_API_KEY --data-file=-

echo -n "YOUR_LEONARDO_KEY" | \
  gcloud secrets create LEONARDO_API_KEY --data-file=-
```

### Step 3: Grant Secret Access

```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe $GCP_PROJECT_ID --format="value(projectNumber)")

# Grant Secret Manager access to Cloud Run service account
gcloud projects add-iam-policy-binding $GCP_PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Step 4: Build Docker Image

```bash
# Build using gcp.Dockerfile
docker build -f gcp.Dockerfile -t gcr.io/$GCP_PROJECT_ID/short-video-maker:latest .

# Push to Container Registry
docker push gcr.io/$GCP_PROJECT_ID/short-video-maker:latest
```

### Step 5: Deploy to Cloud Run

```bash
gcloud run deploy short-video-maker \
  --image gcr.io/$GCP_PROJECT_ID/short-video-maker:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 4Gi \
  --cpu 2 \
  --timeout 3600 \
  --concurrency 80 \
  --min-instances 0 \
  --max-instances 10 \
  --port 3123 \
  --set-env-vars "DOCKER=true,LOG_LEVEL=info,TTS_PROVIDER=kokoro,VIDEO_SOURCE=pexels" \
  --set-secrets "PEXELS_API_KEY=PEXELS_API_KEY:latest,GOOGLE_GEMINI_API_KEY=GOOGLE_GEMINI_API_KEY:latest"
```

---

## Environment Variables

### Core Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3123` | Server port (Cloud Run sets this automatically) |
| `LOG_LEVEL` | `info` | Logging level: `trace`, `debug`, `info`, `warn`, `error` |
| `DOCKER` | `true` | Running in Docker mode |
| `DATA_DIR_PATH` | `/app/data` | Data directory for videos/temp files |

### Performance Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `CONCURRENCY` | `1` | Chrome tabs for rendering (1-2 recommended) |
| `VIDEO_CACHE_SIZE_IN_BYTES` | `2097152000` | 2GB video cache |

### Whisper Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WHISPER_MODEL` | `base.en` | Whisper model: `tiny.en`, `base.en`, `small.en`, `medium`, `large` |
| `WHISPER_VERBOSE` | `false` | Enable verbose whisper logs |

### TTS Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TTS_PROVIDER` | `kokoro` | TTS provider: `kokoro`, `google`, `elevenlabs` |
| `GOOGLE_TTS_PROJECT_ID` | - | Google Cloud TTS project ID |
| `ELEVENLABS_API_KEY` | - | ElevenLabs API key |

### Video Source Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `VIDEO_SOURCE` | `pexels` | Video source: `pexels`, `veo`, `leonardo`, `ffmpeg`, `both` |
| `VEO_MODEL` | `veo-3.0-fast-generate-001` | VEO model version |
| `VEO3_USE_NATIVE_AUDIO` | `false` | Use VEO3 native audio vs TTS |

### API Keys (via Secrets)

| Secret Name | Required | Description |
|-------------|----------|-------------|
| `PEXELS_API_KEY` | ✅ Yes | Pexels stock video API |
| `GOOGLE_GEMINI_API_KEY` | ✅ Yes | Gemini API (Nano Banana + VEO3) |
| `GOOGLE_CLOUD_PROJECT_ID` | ✅ Yes | Your GCP project ID |
| `LEONARDO_API_KEY` | ⚪ Optional | Leonardo AI image generation |
| `ELEVENLABS_API_KEY` | ⚪ Optional | ElevenLabs TTS |

---

## Secrets Management

### Create Secret

```bash
echo -n "YOUR_SECRET_VALUE" | \
  gcloud secrets create SECRET_NAME --data-file=-
```

### Update Secret

```bash
echo -n "NEW_VALUE" | \
  gcloud secrets versions add SECRET_NAME --data-file=-
```

### View Secrets

```bash
# List all secrets
gcloud secrets list

# View secret metadata
gcloud secrets describe SECRET_NAME

# Access secret value (requires permission)
gcloud secrets versions access latest --secret=SECRET_NAME
```

### Delete Secret

```bash
gcloud secrets delete SECRET_NAME
```

---

## Deployment Methods

### Method 1: Manual Deployment Script

Best for: Quick deployments, local development

```bash
./deploy-gcp.sh
```

Environment variables:
```bash
export GCP_PROJECT_ID="your-project-id"
export GCP_REGION="us-central1"
export SERVICE_NAME="short-video-maker"
export MEMORY="4Gi"
export CPU="2"
```

### Method 2: Cloud Build

Best for: CI/CD pipelines, automated deployments

```bash
gcloud builds submit --config cloudbuild.yaml
```

### Method 3: GitHub Actions (Future)

Create `.github/workflows/deploy-gcp.yml` for automatic deployments on push.

---

## Monitoring and Logging

### View Logs

```bash
# Real-time logs
gcloud run services logs tail short-video-maker \
  --region us-central1

# Read recent logs
gcloud run services logs read short-video-maker \
  --region us-central1 \
  --limit 100
```

### Cloud Console

Visit: https://console.cloud.google.com/run

- View service details
- Monitor requests, latency, errors
- Check resource utilization

### Health Check

```bash
# Get service URL
SERVICE_URL=$(gcloud run services describe short-video-maker \
  --region us-central1 \
  --format="value(status.url)")

# Test health endpoint
curl $SERVICE_URL/health
```

Expected response:
```json
{
  "status": "ok",
  "version": "1.3.4",
  "timestamp": "2024-10-30T12:00:00.000Z"
}
```

---

## API Endpoints

Once deployed, access these endpoints:

### Health Check
```bash
GET $SERVICE_URL/health
```

### Nano Banana (Static Images)
```bash
POST $SERVICE_URL/api/video/nano-banana
```

### Consistent Shorts (Character Consistency) ✨ NEW!
```bash
POST $SERVICE_URL/api/video/consistent-shorts
```

### VEO3 (Text-to-Video)
```bash
POST $SERVICE_URL/api/video/veo3
```

### Pexels (Stock Footage)
```bash
POST $SERVICE_URL/api/video/pexels
```

For detailed API documentation, see:
- `docs/CONSISTENT_SHORTS_API_GUIDE.md` - Consistent Shorts API

---

## Troubleshooting

### Common Issues

#### 1. Build Timeout

**Error:** `Build step timed out`

**Solution:** Increase timeout in `cloudbuild.yaml`:
```yaml
timeout: '3600s'  # 1 hour
```

#### 2. Memory Exceeded

**Error:** `Container exceeded memory limits`

**Solution:** Increase memory allocation:
```bash
gcloud run services update short-video-maker \
  --memory 8Gi \
  --region us-central1
```

#### 3. Secret Access Denied

**Error:** `Permission denied accessing secret`

**Solution:** Grant IAM role:
```bash
PROJECT_NUMBER=$(gcloud projects describe $GCP_PROJECT_ID --format="value(projectNumber)")

gcloud secrets add-iam-policy-binding SECRET_NAME \
  --member="serviceAccount:$PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### 4. Port Binding Error

**Error:** `Container failed to bind to port`

**Solution:** Ensure Dockerfile exposes correct port:
```dockerfile
EXPOSE 3123
CMD ["pnpm", "start"]
```

Cloud Run will set `PORT` environment variable automatically.

#### 5. Cold Start Timeout

**Error:** `Service timeout during cold start`

**Solution:** Increase minimum instances or startup timeout:
```bash
gcloud run services update short-video-maker \
  --min-instances 1 \
  --timeout 3600
```

### Debug Commands

```bash
# Check service status
gcloud run services describe short-video-maker --region us-central1

# View recent deployments
gcloud run revisions list --service short-video-maker --region us-central1

# Test locally with Docker
docker run -p 3123:3123 \
  -e PEXELS_API_KEY="your-key" \
  -e GOOGLE_GEMINI_API_KEY="your-key" \
  gcr.io/$GCP_PROJECT_ID/short-video-maker:latest
```

---

## Cost Optimization

### Cloud Run Pricing

Cloud Run charges for:
- **CPU allocation**: While container is running
- **Memory allocation**: While container is running
- **Requests**: Number of requests served
- **Network egress**: Data sent out

### Optimization Tips

1. **Use Minimum Instances Wisely**
   ```bash
   # Set to 0 for cost savings (cold starts)
   --min-instances 0

   # Set to 1+ for always-warm (costs more)
   --min-instances 1
   ```

2. **Adjust Concurrency**
   ```bash
   # Higher concurrency = fewer instances
   --concurrency 80
   ```

3. **Use Appropriate Resources**
   ```bash
   # For light workloads
   --memory 2Gi --cpu 1

   # For heavy video processing
   --memory 8Gi --cpu 4
   ```

4. **Enable Request Timeout**
   ```bash
   # Prevent long-running requests
   --timeout 900  # 15 minutes
   ```

5. **Use GCS for Video Storage**

   Store generated videos in Google Cloud Storage instead of local disk:
   ```bash
   --set-env-vars "GCS_BUCKET_NAME=your-bucket"
   ```

### Cost Estimation

Typical costs for moderate usage:
- **Requests**: $0.40 per million requests
- **CPU**: $0.00002400 per vCPU-second
- **Memory**: $0.00000250 per GiB-second
- **Container Registry**: $0.10 per GB/month storage

Example: 1000 video generations/month
- ~$20-50/month (varies by video length and complexity)

---

## Advanced Configuration

### Custom Domain

```bash
# Map custom domain
gcloud run domain-mappings create \
  --service short-video-maker \
  --domain your-domain.com \
  --region us-central1
```

### Authentication

```bash
# Require authentication
gcloud run services update short-video-maker \
  --no-allow-unauthenticated \
  --region us-central1
```

### VPC Connector

For accessing private resources:
```bash
gcloud run services update short-video-maker \
  --vpc-connector your-connector \
  --region us-central1
```

---

## Updating the Service

### Rolling Update

```bash
# Build new image
docker build -f gcp.Dockerfile -t gcr.io/$GCP_PROJECT_ID/short-video-maker:v2 .
docker push gcr.io/$GCP_PROJECT_ID/short-video-maker:v2

# Update service
gcloud run services update short-video-maker \
  --image gcr.io/$GCP_PROJECT_ID/short-video-maker:v2 \
  --region us-central1
```

### Rollback

```bash
# List revisions
gcloud run revisions list --service short-video-maker --region us-central1

# Rollback to previous revision
gcloud run services update-traffic short-video-maker \
  --to-revisions REVISION_NAME=100 \
  --region us-central1
```

---

## Support and Resources

- **Documentation**: `/docs/`
- **GitHub Issues**: https://github.com/gyoridavid/short-video-maker/issues
- **GCP Cloud Run Docs**: https://cloud.google.com/run/docs
- **GCP Pricing**: https://cloud.google.com/run/pricing

---

## Summary

✅ **Prerequisites**: gcloud, Docker, GCP project, API keys
✅ **Quick Deploy**: `./deploy-gcp.sh`
✅ **Secrets**: Store API keys in Secret Manager
✅ **Monitoring**: Use Cloud Logging and Cloud Console
✅ **Cost**: ~$20-50/month for moderate usage
✅ **Scaling**: Auto-scales from 0 to max instances

**Service is now ready for production! 🚀**

For API usage, see:
- `docs/CONSISTENT_SHORTS_API_GUIDE.md` - Consistent Shorts API (NEW!)
- Project README.md - General API documentation
