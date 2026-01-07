# PoliticsProject API Complete Guide

## Overview

YouTube 영상을 자동으로 Shorts로 변환하는 API.
- 여러 YouTube URL에서 하이라이트 추출
- AI 분석 (Gemini)으로 최적 구간 선정
- 한글 자막 지원 (NanumGothicBold)
- YouTube 자동 업로드
- Cloud Run에서 PO Token으로 봇 감지 우회

---

## API Endpoint

```
POST /api/politics/convert
```

**Base URL:** `https://short-video-maker-7qtnitbuvq-uc.a.run.app`

---

## Request Parameters

### 기본 요청

```json
{
  "youtubeUrls": [
    "https://youtube.com/watch?v=VIDEO1",
    "https://youtube.com/watch?v=VIDEO2"
  ],
  "options": {
    "combineOutput": true,
    "subtitleLang": ["ko", "en"]
  }
}
```

### 전체 옵션

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `youtubeUrl` | string | - | 단일 URL (하위호환) |
| `youtubeUrls` | string[] | - | 여러 URL |
| `options.outputCount` | number | 3 | URL당 하이라이트 개수 |
| `options.clipDuration` | object | {min:30, max:60} | 클립 길이 (초) |
| `options.autoAnalyze` | boolean | true | AI 분석 사용 |
| `options.subtitleLang` | string[] | ["ko","en"] | 자막 언어 |
| `options.combineOutput` | boolean | true | 클립 합치기 |
| `options.subtitleStyle` | object | - | 자막 스타일 |
| `options.youtubeUpload` | object | - | YouTube 업로드 |
| `callbackUrl` | string | - | 완료 시 콜백 URL |

---

## Subtitle Style Options

```json
{
  "subtitleStyle": {
    "language": "ko",        // "ko" | "en" | "auto"
    "bodySize": 90,          // 폰트 크기 (기본 90)
    "bodyColor": "#FFFFFF",  // 본문 색상
    "titleColor": "#FFEB3B", // 제목 색상 (노란색)
    "outline": 4,            // 테두리 두께
    "shadow": 2,             // 그림자
    "position": "bottom"     // "top" | "bottom"
  }
}
```

**한글 폰트:**
- Cloud Run: `NanumGothicBold`
- Windows: `Malgun Gothic`

---

## YouTube Upload Options

```json
{
  "youtubeUpload": {
    "enabled": true,
    "channelName": "why_cat",
    "subChannel": "optional_brand_account",
    "privacyStatus": "unlisted",
    "title": "Custom Title",
    "description": "Video description",
    "tags": ["tag1", "tag2"],
    "notifySubscribers": false
  }
}
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | - | 업로드 활성화 (필수) |
| `channelName` | string | - | 채널 이름 (필수) |
| `subChannel` | string | - | Brand Account 서브채널 |
| `privacyStatus` | string | "unlisted" | public/private/unlisted |
| `title` | string | 자동생성 | 영상 제목 |
| `description` | string | 자동생성 | 영상 설명 |
| `tags` | string[] | 자동생성 | 태그 |
| `notifySubscribers` | boolean | false | 구독자 알림 |

---

## Complete Request Example

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/politics/convert" \
  -H "Content-Type: application/json" \
  -d '{
    "youtubeUrls": [
      "https://youtube.com/watch?v=VIDEO1",
      "https://youtube.com/watch?v=VIDEO2",
      "https://youtube.com/watch?v=VIDEO3"
    ],
    "options": {
      "combineOutput": true,
      "subtitleLang": ["ko"],
      "clipDuration": { "min": 30, "max": 60 },
      "subtitleStyle": {
        "language": "ko",
        "bodySize": 90,
        "outline": 4
      },
      "youtubeUpload": {
        "enabled": true,
        "channelName": "why_cat",
        "privacyStatus": "unlisted",
        "title": "오늘의 정치 하이라이트",
        "tags": ["정치", "뉴스", "하이라이트"]
      }
    }
  }'
```

---

## Response

### Async Response (202)

```json
{
  "jobId": "pending-1234567890",
  "status": "pending",
  "message": "Job started. Use /status/:jobId to check progress."
}
```

### Sync Response (200)

`options.sync: true`로 요청 시:

```json
{
  "jobId": "abc-123-def",
  "status": "completed",
  "outputs": [
    {
      "path": "/output/shorts/combined.mp4",
      "title": "Combined Highlights",
      "duration": 120,
      "highlight": {
        "startSec": 0,
        "endSec": 120,
        "title": "Combined Highlights",
        "reason": "3개 하이라이트 결합"
      },
      "downloadUrl": "https://storage.googleapis.com/...",
      "gcsPath": "gs://bucket/politics/combined.mp4",
      "youtube": {
        "videoId": "dQw4w9WgXcQ",
        "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
        "channelName": "why_cat"
      }
    }
  ]
}
```

---

## Status Check

```bash
GET /api/politics/status/:jobId
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Cloud Run Container                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐ │
│  │ POT Provider│    │  yt-dlp     │    │  Main App       │ │
│  │ (port 4416) │◄───│  + Plugin   │◄───│  (port 3123)    │ │
│  └─────────────┘    └─────────────┘    └─────────────────┘ │
│         │                  │                    │           │
│         ▼                  ▼                    ▼           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Workflow                          │   │
│  │  1. YouTube Download (with PO Token)                │   │
│  │  2. SRT Subtitle Parse                              │   │
│  │  3. AI Highlight Analysis (Gemini)                  │   │
│  │  4. FFmpeg Crop + Subtitle Burn                     │   │
│  │  5. Combine Clips                                   │   │
│  │  6. YouTube Upload (optional)                       │   │
│  │  7. Cleanup Temp Files                              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## PO Token (Bot Detection Bypass)

Cloud Run에서 YouTube 다운로드 시 봇 감지 우회:

1. **bgutil-ytdlp-pot-provider** HTTP 서버 (port 4416)
2. yt-dlp 플러그인이 자동으로 PO Token 요청
3. YouTube API 요청에 Token 포함

**Dockerfile:**
```dockerfile
# Install bgutil POT provider
RUN pip3 install bgutil-ytdlp-pot-provider
RUN git clone https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /pot-provider
RUN cd /pot-provider/server && npm install && npx tsc

# Start both POT server + main app
CMD ["/app/start.sh"]
```

---

## File Cleanup

워크플로우 완료 후 자동 정리:

| 파일 | 보관 | 삭제 시점 |
|------|------|-----------|
| 원본 영상 | X | 즉시 |
| 중간 클립 | X | 즉시 |
| 최종 결합본 | O | GCS 업로드 후 |
| 자막 파일 | X | 즉시 |

---

## Environment Variables

```bash
# Required
GOOGLE_GEMINI_API_KEY=xxx       # AI 분석
GCS_BUCKET_NAME=xxx             # GCS 저장소

# YouTube Upload
YOUTUBE_CLIENT_SECRET=xxx       # OAuth JSON

# Optional
POT_PROVIDER_URL=http://127.0.0.1:4416  # PO Token 서버
POLITICS_OUTPUT_DIR=./output/politics    # 출력 디렉토리
```

---

## Sources

- [yt-dlp PO Token Guide](https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide)
- [bgutil-ytdlp-pot-provider](https://github.com/Brainicism/bgutil-ytdlp-pot-provider)
- [yt-dlp FAQ](https://github.com/yt-dlp/yt-dlp/wiki/FAQ)
