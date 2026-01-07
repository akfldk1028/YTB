# PoliticsProject API Reference

## 개요

YouTube 영상을 자동으로 9:16 Shorts로 변환하는 API.
AI가 하이라이트 구간을 분석하고, FFmpeg로 크롭 + 자막 번인.

**Base URL:** `https://short-video-maker-xxxxx.a.run.app`

---

## API 엔드포인트

### 1. 변환 요청

```
POST /api/politics/convert
```

**Request:**
```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "options": {
    "outputCount": 3,
    "clipDuration": { "min": 30, "max": 60 },
    "autoAnalyze": true,
    "subtitleLang": ["ko", "en"]
  },
  "callbackUrl": "https://your-webhook.com/callback"
}
```

**Response (202):**
```json
{
  "jobId": "pending-1704520000000",
  "status": "pending",
  "message": "Job started. Use /status/:jobId to check progress."
}
```

### 2. 상태 조회

```
GET /api/politics/status/:jobId
```

**Response:**
```json
{
  "jobId": "uuid-here",
  "status": "completed",
  "outputs": [
    {
      "path": "/output/uuid/shorts/short_1.mp4",
      "title": "핵심 발언",
      "duration": 45,
      "highlight": {
        "startSec": 120,
        "endSec": 165,
        "reason": "강한 주장"
      }
    }
  ]
}
```

### 3. 헬스체크

```
GET /api/politics/health
```

---

## 파이프라인 흐름

```
YouTube URL
    │
    ▼
┌─────────────────┐
│ 1. yt-dlp       │ → 영상 + 자막 다운로드
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 2. SRTParser    │ → 자막 파싱
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 3. AI Analyzer  │ → 하이라이트 3개 선정 (30-60초)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. FFmpeg       │ → 9:16 크롭 + 자막 번인
└────────┬────────┘
         │
         ▼
    shorts_final/
    ├── short_1.mp4
    ├── short_2.mp4
    └── short_3.mp4
```

---

## 프로젝트 구조

```
src/politics-project/
├── index.ts                 # 메인 export
├── types/index.ts           # 공통 타입
├── core/
│   ├── downloader/          # yt-dlp 래퍼
│   │   └── YouTubeDownloader.ts
│   ├── parser/              # SRT 파서
│   │   └── SRTParser.ts
│   ├── analyzer/            # AI 하이라이트 분석
│   │   ├── HighlightAnalyzer.ts
│   │   └── prompts.ts
│   └── processor/           # FFmpeg 처리
│       ├── VerticalCropper.ts
│       └── SubtitleBurner.ts
├── workflow/
│   └── YouTubeToShortsWorkflow.ts
├── api/
│   └── routes.ts
└── docs/
    ├── ARCHITECTURE.md
    ├── N8N-INTEGRATION.md
    └── API-REFERENCE.md     # (이 파일)
```

---

## n8n 연동

### 기본 워크플로우

```
[Manual Trigger]
    → [HTTP Request: /api/politics/convert]
    → [Wait or Webhook Callback]
    → [Process Outputs]
    → [Upload to YouTube]
```

### HTTP Request 노드 설정

```json
{
  "method": "POST",
  "url": "{{$env.API_BASE_URL}}/api/politics/convert",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "youtubeUrl": "={{ $json.youtubeUrl }}",
    "options": {
      "outputCount": 3,
      "autoAnalyze": true
    },
    "callbackUrl": "{{$env.N8N_WEBHOOK_URL}}/webhook/politics-callback"
  }
}
```

### Webhook 콜백 페이로드

```json
{
  "jobId": "uuid",
  "status": "completed",
  "outputs": [
    {
      "path": "/path/to/short_1.mp4",
      "title": "하이라이트 제목",
      "duration": 45
    }
  ]
}
```

---

## 옵션 설명

| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `outputCount` | number | 3 | 생성할 Shorts 개수 |
| `clipDuration.min` | number | 30 | 최소 클립 길이(초) |
| `clipDuration.max` | number | 60 | 최대 클립 길이(초) |
| `autoAnalyze` | boolean | true | AI 하이라이트 분석 사용 |
| `subtitleLang` | string[] | ["ko","en"] | 자막 언어 우선순위 |

---

## 에러 코드

| 코드 | 상태 | 설명 |
|------|------|------|
| 200 | completed | 성공 |
| 202 | pending | 처리 중 |
| 400 | failed | 잘못된 요청 (URL 누락 등) |
| 404 | failed | Job ID 없음 |
| 500 | failed | 서버 에러 |

---

## 의존성

- `yt-dlp`: YouTube 다운로드
- `ffmpeg`: 영상 처리
- `@anthropic-ai/sdk`: AI 하이라이트 분석

---

## 관련 문서

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 상세 아키텍처
- [N8N-INTEGRATION.md](./N8N-INTEGRATION.md) - n8n 워크플로우 예시
