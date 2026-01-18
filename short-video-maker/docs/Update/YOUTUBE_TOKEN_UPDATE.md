# YouTube Token Update Guide for AI Automation

**Last Updated**: 2026-01-17
**Purpose**: AI-executable guide for YouTube OAuth token re-authentication

---

## Quick Reference

### API Endpoints
```
BASE_URL=https://short-video-maker-7qtnitbuvq-uc.a.run.app
```

| Action | Endpoint |
|--------|----------|
| Health Check | `GET /api/youtube/auth/health-check` |
| Get Auth URL | `GET /api/youtube/auth/url?state={channelName}` |
| Exchange Code | `POST /api/youtube/auth/exchange` |
| Upload Video | `POST /api/youtube/upload` |

### Channel Configuration

| channelName | YouTube Channel | Google Account | Primary |
|-------------|-----------------|----------------|:-------:|
| `clickaround` | ClickAround | clickaround8@gmail.com | **Main** |
| `why_cat` | 왜저러냥 | clickaround8@gmail.com | Sub |
| `segong` | ATT | sogangmetaverselab@gmail.com | Backup |

---

## AI Execution Flow

### Step 0: Check Token Status
```bash
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/health-check"
```

**Expected Response:**
```json
{
  "healthy": true/false,
  "channels": [
    {"channelName": "xxx", "status": "ok/error", "message": "..."}
  ]
}
```

**AI Decision:**
- If `status: "ok"` → Token valid, no action needed
- If `status: "error"` → Proceed to Step 1

---

### Step 1: Generate OAuth URL (AI provides to user)
```bash
# Replace {CHANNEL_NAME} with: clickaround, why_cat, or segong
echo "Please open this URL in browser:"
echo "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/url?state={CHANNEL_NAME}"
```

**User Action Required:**
1. Open URL in browser
2. Login with correct Google account
3. Select correct YouTube channel
4. Copy `code=` value from redirect URL

---

### Step 2: Exchange Code for Token
```bash
# User provides CODE value
CODE="4/0Axxxx..."
CHANNEL_NAME="clickaround"

curl -s -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/exchange" \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"$CODE\", \"state\":\"$CHANNEL_NAME\"}"
```

**Expected Response:**
```json
{
  "success": true,
  "tokens": {
    "access_token": "ya29.xxx",
    "refresh_token": "1//0exxx",
    "scope": "...",
    "token_type": "Bearer",
    "expiry_date": 1234567890
  }
}
```

**AI Action:** Save the entire `tokens` object for Step 3

---

### Step 3: Download Current Secret
```bash
cd /tmp && mkdir -p youtube-update && cd youtube-update

# Download and extract current secret
gcloud secrets versions access latest --secret=YOUTUBE_DATA --project=dkdk-474008 > current.b64
base64 --ignore-garbage -d < current.b64 | tar xzf -

# Verify files exist
ls -la youtube-*.json
```

**Expected Files:**
- `youtube-channels.json`
- `youtube-tokens-clickaround.json`
- `youtube-tokens-why_cat.json`
- `youtube-tokens-segong.json`

---

### Step 4: Update Token File
```bash
# Create/update token file for specific channel
# Replace {CHANNEL_NAME} and token values from Step 2

cat > youtube-tokens-{CHANNEL_NAME}.json << 'EOF'
{
  "access_token": "{ACCESS_TOKEN}",
  "scope": "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/yt-analytics.readonly",
  "token_type": "Bearer",
  "refresh_token_expires_in": 604799,
  "expiry_date": {EXPIRY_DATE},
  "refresh_token": "{REFRESH_TOKEN}"
}
EOF

# Verify content
cat youtube-tokens-{CHANNEL_NAME}.json | grep refresh_token
```

---

### Step 5: Upload to Secret Manager
```bash
cd /tmp/youtube-update

# Create tar.gz with all token files
tar czvf youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json

# Base64 encode (no line breaks!)
base64 -w 0 youtube-data.tar.gz > youtube-data.b64

# Upload to Secret Manager
gcloud secrets versions add YOUTUBE_DATA --data-file=youtube-data.b64 --project=dkdk-474008
```

**Expected Output:**
```
Created version [XXX] of the secret [YOUTUBE_DATA].
```

---

### Step 6: Verify Secret Upload
```bash
# Download and verify the new secret
cd /tmp && mkdir -p verify-secret && cd verify-secret
gcloud secrets versions access latest --secret=YOUTUBE_DATA --project=dkdk-474008 | \
  base64 --ignore-garbage -d | tar xzf -

# Check the updated token
cat youtube-tokens-{CHANNEL_NAME}.json | grep refresh_token
```

**AI Validation:**
- Verify `refresh_token` matches the one from Step 2

---

### Step 7: Deploy New Revision
```bash
# Option A: Cloud Build (recommended, ~10 min)
cd "D:/Data/00_Personal/YTB/short-video-maker"
gcloud builds submit --config=cloudbuild.yaml --project=dkdk-474008

# Option B: Quick env var update (faster, ~2 min)
gcloud run services update short-video-maker \
  --region=us-central1 \
  --project=dkdk-474008 \
  --update-env-vars=YT_TOKEN_V=$(date +%s)
```

---

### Step 8: Verify Deployment
```bash
# Wait for deployment, then check health
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/health-check"
```

**Success Criteria:**
```json
{
  "channels": [
    {"channelName": "{CHANNEL_NAME}", "status": "ok"}
  ]
}
```

---

## Multi-Channel Update (Batch)

For updating multiple channels at once:

```bash
# Step 1: Get codes from user for all channels
CHANNELS=("clickaround" "why_cat")
declare -A CODES
CODES[clickaround]="4/0Axxxx..."
CODES[why_cat]="4/0Bxxxx..."

# Step 2: Exchange all codes
for ch in "${CHANNELS[@]}"; do
  echo "Exchanging code for $ch..."
  curl -s -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/exchange" \
    -H "Content-Type: application/json" \
    -d "{\"code\":\"${CODES[$ch]}\", \"state\":\"$ch\"}" > /tmp/token-$ch.json
done

# Step 3: Update all token files
cd /tmp/youtube-update
for ch in "${CHANNELS[@]}"; do
  # Parse tokens and update files
  # (AI should extract values from /tmp/token-$ch.json)
done

# Step 4-8: Same as single channel
```

---

## Troubleshooting

### Error: "invalid_grant"
- **Cause**: Token expired or revoked
- **Solution**: Full re-authentication from Step 1

### Error: "Token refresh failed"
- **Cause**: Refresh token invalid
- **Solution**: Full re-authentication with `prompt=consent`

### Error: Deployment startup probe failed
- **Cause**: Missing env vars or secret format issue
- **Solution**: Use Cloud Build instead of direct update

### Error: base64 invalid input
- **Cause**: Line breaks in base64 encoding
- **Solution**: Use `base64 -w 0` for no line wraps

---

## Constants

```bash
# GCP Project
PROJECT_ID="dkdk-474008"

# Secret Names
SECRET_NAME="YOUTUBE_DATA"

# OAuth Client (DO NOT CHANGE)
CLIENT_ID="550996044521-8luac0vqa8sj0jrpa68oi4lgq30k1nqc.apps.googleusercontent.com"
REDIRECT_URI="http://localhost:3124/api/youtube/auth/callback"

# Cloud Run
SERVICE_NAME="short-video-maker"
REGION="us-central1"
```

---

## File Formats

### youtube-channels.json
```json
{
  "channels": [
    {
      "channelName": "clickaround",
      "channelId": "UCxxx",
      "email": "clickaround8@gmail.com",
      "description": "Main channel"
    }
  ]
}
```

### youtube-tokens-{channelName}.json
```json
{
  "access_token": "ya29.xxx",
  "scope": "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/yt-analytics.readonly",
  "token_type": "Bearer",
  "refresh_token_expires_in": 604799,
  "expiry_date": 1234567890000,
  "refresh_token": "1//0exxx"
}
```

---

## Quick Commands Summary

```bash
# 1. Check status
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/health-check"

# 2. Get auth URL
echo "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/url?state=CHANNEL_NAME"

# 3. Exchange code
curl -X POST ".../api/youtube/auth/exchange" -d '{"code":"...", "state":"..."}'

# 4. Download secret
gcloud secrets versions access latest --secret=YOUTUBE_DATA --project=dkdk-474008 | base64 --ignore-garbage -d | tar xzf -

# 5. Update token file
cat > youtube-tokens-CHANNEL.json << 'EOF' ... EOF

# 6. Upload secret
tar czf youtube-data.tar.gz youtube-*.json && base64 -w 0 youtube-data.tar.gz | gcloud secrets versions add YOUTUBE_DATA --data-file=- --project=dkdk-474008

# 7. Deploy
gcloud builds submit --config=cloudbuild.yaml --project=dkdk-474008

# 8. Verify
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/health-check"
```
