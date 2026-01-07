# n8n 연동 가이드

## 개요

PoliticsProject API를 n8n 워크플로우와 연동하여 YouTube → Shorts 변환을 자동화합니다.

---

## API 엔드포인트

### 1. 변환 요청

```
POST /api/politics/convert
```

**Request Body:**
```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID",
  "options": {
    "outputCount": 3,
    "clipDuration": { "min": 30, "max": 60 },
    "autoAnalyze": true,
    "subtitleLang": ["ko", "en"]
  },
  "callbackUrl": "https://your-n8n-webhook.com/webhook/politics-callback"
}
```

**Response (202 Accepted):**
```json
{
  "jobId": "pending-1234567890",
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
  "message": "OK",
  "outputs": [
    {
      "path": "/output/politics/uuid/shorts/short_1.mp4",
      "title": "하이라이트 제목",
      "duration": 45,
      "highlight": {
        "startSec": 120,
        "endSec": 165,
        "title": "핵심 발언",
        "reason": "강한 주장",
        "score": 9
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

## n8n 워크플로우 예시

### 워크플로우 1: 수동 트리거

```
[Manual Trigger] → [HTTP Request: Convert] → [Wait 30s] → [HTTP Request: Status] → [IF Complete] → [Notification]
```

### 워크플로우 2: Webhook 콜백 방식 (권장)

```
[Manual Trigger] → [HTTP Request: Convert with callbackUrl]

[Webhook: Receive Callback] → [IF Success] → [Process Outputs] → [Upload to YouTube/Storage]
```

### 워크플로우 3: RSS 피드 자동 처리

```
[RSS Feed Trigger] → [Extract YouTube URL] → [HTTP Request: Convert] → [Webhook Callback] → [Auto Upload]
```

---

## n8n 노드 설정

### HTTP Request Node (Convert)

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

### Webhook Node (Callback)

```json
{
  "httpMethod": "POST",
  "path": "politics-callback",
  "responseMode": "responseNode"
}
```

---

## 환경 변수

n8n에서 설정할 환경 변수:

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `API_BASE_URL` | PoliticsProject API 주소 | `https://your-api.com` |
| `N8N_WEBHOOK_URL` | n8n Webhook 주소 | `https://n8n.your-domain.com` |

---

## 전체 자동화 시나리오

### 시나리오: 유튜브 채널 신규 영상 자동 Shorts 생성

1. **RSS 트리거**: 특정 YouTube 채널 RSS 피드 모니터링
2. **필터링**: 정치 관련 영상만 필터 (제목/설명 키워드)
3. **변환 요청**: PoliticsProject API 호출
4. **콜백 수신**: 완료 시 Webhook으로 결과 수신
5. **업로드**: 생성된 Shorts를 YouTube/TikTok 업로드
6. **알림**: Slack/Discord로 완료 알림

### n8n JSON Export

```json
{
  "name": "Politics YouTube to Shorts",
  "nodes": [
    {
      "name": "RSS Trigger",
      "type": "n8n-nodes-base.rssFeedReadTrigger",
      "parameters": {
        "feedUrl": "https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID",
        "pollInterval": 15
      }
    },
    {
      "name": "HTTP Convert",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "={{$env.API_BASE_URL}}/api/politics/convert",
        "bodyType": "json",
        "body": "={{ JSON.stringify({ youtubeUrl: $json.link, callbackUrl: $env.N8N_WEBHOOK_URL + '/webhook/politics-done' }) }}"
      }
    }
  ]
}
```

---

## 에러 처리

### 상태 코드

| 코드 | 상태 | 설명 |
|------|------|------|
| 200 | completed | 성공 |
| 202 | pending | 처리 중 |
| 400 | failed | 잘못된 요청 |
| 404 | failed | Job 없음 |
| 500 | failed | 서버 에러 |

### n8n 에러 핸들링

```
[HTTP Request] → [Error Trigger] → [Slack Notification: Error Alert]
                ↓
            [Success] → [Continue Workflow]
```

---

## 참고

- API 문서: `docs/ARCHITECTURE.md`
- 타입 정의: `types/index.ts`
- 워크플로우 코드: `workflow/YouTubeToShortsWorkflow.ts`
