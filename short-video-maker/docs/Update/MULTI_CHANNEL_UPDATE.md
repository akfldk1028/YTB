# Multi-Channel Token Update Guide

**Purpose**: Update multiple YouTube channel tokens in one session

---

## Step 1: Check All Channels Status

```bash
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/health-check"
```

## Step 2: Generate Auth URLs for All Channels

```bash
# Main channel
echo "clickaround: https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/url?state=clickaround"

# Sub channel
echo "why_cat: https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/url?state=why_cat"

# Other channels (if needed)
echo "segong: https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/url?state=segong"
```

## Step 3: User Opens Each URL and Provides Codes

**User provides:**
```
clickaround code: 4/0Axxxx...
why_cat code: 4/0Bxxxx...
```

## Step 4: Exchange All Codes

```bash
# clickaround
curl -s -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/exchange" \
  -H "Content-Type: application/json" \
  -d '{"code":"CLICKAROUND_CODE", "state":"clickaround"}' > /tmp/token-clickaround.json

# why_cat
curl -s -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/exchange" \
  -H "Content-Type: application/json" \
  -d '{"code":"WHY_CAT_CODE", "state":"why_cat"}' > /tmp/token-why_cat.json
```

## Step 5: Download Current Secret

```bash
cd /tmp && mkdir -p youtube-update && cd youtube-update
gcloud secrets versions access latest --secret=YOUTUBE_DATA --project=dkdk-474008 > current.b64
base64 --ignore-garbage -d < current.b64 | tar xzf -
```

## Step 6: Update All Token Files

```bash
cd /tmp/youtube-update

# Parse and update clickaround token
# (Extract values from /tmp/token-clickaround.json)
cat > youtube-tokens-clickaround.json << 'EOF'
{
  "access_token": "ya29.xxx_from_exchange",
  "scope": "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/yt-analytics.readonly",
  "token_type": "Bearer",
  "refresh_token_expires_in": 604799,
  "expiry_date": 1234567890000,
  "refresh_token": "1//0exxx_from_exchange"
}
EOF

# Parse and update why_cat token
cat > youtube-tokens-why_cat.json << 'EOF'
{
  "access_token": "ya29.xxx_from_exchange",
  "scope": "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/yt-analytics.readonly",
  "token_type": "Bearer",
  "refresh_token_expires_in": 604799,
  "expiry_date": 1234567890000,
  "refresh_token": "1//0exxx_from_exchange"
}
EOF
```

## Step 7: Upload and Deploy

```bash
# Create archive
cd /tmp/youtube-update
tar czvf youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json

# Base64 encode
base64 -w 0 youtube-data.tar.gz > youtube-data.b64

# Upload
gcloud secrets versions add YOUTUBE_DATA --data-file=youtube-data.b64 --project=dkdk-474008

# Deploy
cd "D:/Data/00_Personal/YTB/short-video-maker"
gcloud builds submit --config=cloudbuild.yaml --project=dkdk-474008
```

## Step 8: Verify All Channels

```bash
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/auth/health-check"
```

---

## AI Quick Reference

When user says "모든 채널 토큰 업데이트":

1. Health check → identify failed channels
2. Generate auth URLs for failed channels only
3. Ask user to authenticate each and provide codes
4. Exchange all codes (parallel)
5. Download secret once
6. Update all token files
7. Upload once
8. Deploy once
9. Verify all

---

## Channel Account Mapping

| Channel | Google Account | Login Required |
|---------|----------------|:-------------:|
| clickaround | clickaround8@gmail.com | Yes |
| why_cat | clickaround8@gmail.com | Same session |
| segong | sogangmetaverselab@gmail.com | Yes (different) |

**Note**: Same Google account channels can be authenticated in same browser session.
