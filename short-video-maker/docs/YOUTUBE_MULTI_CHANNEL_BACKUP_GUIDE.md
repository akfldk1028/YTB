# YouTube Multi-Channel Backup & Troubleshooting Guide

## Summary

This guide provides:
- ✅ **GCS Storage Verification**: Confirmed that all videos created on Cloud Run are successfully uploaded to `gs://dkdk-474008-short-videos/videos/`
- ✅ **YouTube Data Extraction Working**: The tar.gz archive with all channel tokens is correctly extracted in Cloud Run
- ⚠️ **YouTube Token Refresh Needed**: OAuth tokens have expired - follow the renewal guide below

---

## GCS Storage Verification Results

### Test Results (2025-11-14)

**Videos Successfully Uploaded to GCS:**
```bash
gs://dkdk-474008-short-videos/videos/cmhywtg8900000es61uz3dpnu.mp4  (678 KB)
gs://dkdk-474008-short-videos/videos/cmhyx3cd500020es6241agzjh.mp4  (501 KB)
gs://dkdk-474008-short-videos/videos/cmhzei7px00000es66aiv284m.mp4  (437 KB)
```

**Cloud Run Logs Confirm:**
```
✅ Video uploaded to GCS successfully
✅ YouTube client secret written
✅ YouTube data extracted from archive
✅ YouTube channels configuration loaded
✅ YouTube Uploader initialized with multi-channel support
```

### How to Verify GCS Uploads

```bash
# Check specific video
gsutil ls gs://dkdk-474008-short-videos/videos/{VIDEO_ID}.mp4

# List all videos with sizes
gsutil ls -lh gs://dkdk-474008-short-videos/videos/
```

---

## YouTube Token Refresh Guide

### Problem: "invalid_grant" Error

When YouTube tokens expire, you'll see this error:
```json
{
  "error": "invalid_grant",
  "error_description": "Bad Request"
}
```

### Solution: Refresh YouTube Tokens

#### Step 1: Re-authenticate Channels Locally

```bash
# Start local server
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
npm start

# Open in browser
http://localhost:3123/api/youtube/auth/url/main_channel
```

Follow Google OAuth flow to re-authenticate the channel.

#### Step 2: Recreate YouTube Data Archive

```bash
# 1. Create tar.gz with all YouTube files
cd ~/.ai-agents-az-video-generator
tar czf /tmp/youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json

# 2. Base64 encode (Cloud Run env vars must be UTF-8)
base64 /tmp/youtube-data.tar.gz > /tmp/youtube-data-base64.txt

# 3. Update Secret Manager
gcloud secrets delete YOUTUBE_DATA --project=dkdk-474008 --quiet
gcloud secrets create YOUTUBE_DATA --data-file=/tmp/youtube-data-base64.txt --project=dkdk-474008
```

#### Step 3: Redeploy Cloud Run

```bash
gcloud run deploy short-video-maker \
  --image gcr.io/dkdk-474008/short-video-maker:latest \
  --region us-central1 \
  --update-secrets YOUTUBE_DATA=YOUTUBE_DATA:latest \
  --project dkdk-474008
```

---

## Channel Names Reference

**Correct channel names (use underscores):**
- `main_channel` ✅
- `att_channel` ✅

**Incorrect:**
- ~~`MainChannel`~~ ❌

Check available channels:
```bash
curl https://short-video-maker-550996044521.us-central1.run.app/api/youtube/channels
```

---

## Troubleshooting

### YouTube data not extracted

**Check logs:**
```bash
gcloud logging read 'resource.type="cloud_run_revision" AND jsonPayload.msg=~"YouTube"' \
  --limit=20 --project=dkdk-474008
```

**Expected logs:**
```
YouTube client secret written
YouTube data extracted from archive
YouTube channels configuration loaded
YouTube Uploader initialized
```

### Verify tar.gz contents

```bash
tar tzf /tmp/youtube-data.tar.gz
```

**Expected output:**
```
youtube-channels.json
youtube-tokens-main_channel.json
youtube-tokens-att_channel.json
```

---

## Related Documentation

- [2025-11-14-gcp-deployment-youtube-integration.md](./2025-11-14-gcp-deployment-youtube-integration.md)
- [2025-11-14-youtube-auto-upload-guide.md](./2025-11-14-youtube-auto-upload-guide.md)
