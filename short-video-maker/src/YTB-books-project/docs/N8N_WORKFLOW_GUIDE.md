# Books to Shorts - n8n Workflow Guide

## 전체 파이프라인 구조

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            BOOKS → SHORTS 자동화 파이프라인                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  PDF 입력    │───▶│  NEB 처리   │───▶│  AI 분석    │───▶│  이미지 생성  │  │
│  │ (Manual/GCS) │    │ (Chunking)  │    │  (Gemini)   │    │ (GPT→Nano)   │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│         │                   │                   │                   │          │
│         ▼                   ▼                   ▼                   ▼          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │    Upload    │    │   Neo4j     │    │ Shorts Plan │    │   YouTube    │  │
│  │    GCS/URL   │    │   Storage   │    │   Storage   │    │   Upload     │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘  │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## API 엔드포인트 정리

### 1. NEB (llm-graph-builder) API

| Method | Endpoint | 설명 | 사용 시점 |
|--------|----------|------|----------|
| `POST` | `/url/scan` | GCS/S3/URL에서 파일 스캔 → Source Node 생성 | PDF 등록 |
| `POST` | `/extract` | 청킹 + 엔티티 추출 실행 | PDF 처리 |
| `POST` | `/upload` | 직접 파일 업로드 (Chunked) | 수동 업로드 |
| `POST` | `/sources_list` | 소스 목록 조회 | 상태 확인 |
| `GET` | `/document_status/{file_name}` | 문서 처리 상태 | 폴링 |
| `POST` | `/connect` | Neo4j 연결 테스트 | 초기화 |

**NEB 기본 URL:** `http://localhost:8000` (로컬) 또는 배포 URL

### 2. Short-Video-Maker API

| Method | Endpoint | 설명 | 사용 시점 |
|--------|----------|------|----------|
| `GET` | `/api/books/pending` | 미처리 문서 목록 | 24시간 체크 |
| `GET` | `/api/books/:bookId` | 문서 상세 (청크 포함) | 분석 전 |
| `POST` | `/api/books/:bookId/analyze` | AI 분석 → Shorts 계획 | 분석 실행 |
| `PUT` | `/api/books/:bookId/status` | 상태 업데이트 | 진행 추적 |
| `POST` | `/api/gpt-to-nanobanana/generate` | 이미지 생성 | Shorts 생성 |

**Base URL:** `https://short-video-maker-7qtnitbuvq-uc.a.run.app`

---

## n8n 워크플로우 구성

### 워크플로우 1: PDF 입력 (Manual Trigger)

수동으로 PDF를 추가할 때 사용하는 워크플로우입니다.

```
[Manual Trigger] → [Set PDF Info] → [NEB: url/scan] → [Wait 5s]
                                                           ↓
[Update Status: pending] ← [NEB: extract] ← [Check Source Created]
```

**필요한 입력:**
- `source_url`: GCS 경로 (`gs://bucket/file.pdf`) 또는 웹 URL
- `source_type`: `gcs bucket`, `web-url`, `s3 bucket`, `local file`

### 워크플로우 2: GCS Bucket Watch (자동)

GCS에 새 PDF가 업로드되면 자동으로 처리합니다.

```
[GCS Trigger: New File] → [Filter: *.pdf] → [NEB: url/scan] → [NEB: extract]
                                                                     ↓
                          [Short-Video-Maker Status Update] ← [Wait for Completion]
```

### 워크플로우 3: 24시간 자동 Shorts 생성

매일 미처리 문서를 확인하고 Shorts를 생성합니다.

```
[Schedule: 24h] → [GET /api/books/pending] → [IF count > 0] → [Split Books]
                                                   ↓
     [YouTube Upload] ← [Generate Images] ← [AI Analyze] ← [Process Each]
```

---

## 워크플로우 상세 설정

### 필수 Variables (n8n)

```javascript
// n8n Variables 설정
{
  "baseUrl": "https://short-video-maker-7qtnitbuvq-uc.a.run.app",
  "nebUrl": "http://localhost:8000",  // NEB 서버 URL

  // Neo4j 인증 (NEB용)
  "neo4jUri": "bolt://localhost:7687",
  "neo4jUser": "neo4j",
  "neo4jPassword": "your-password",
  "neo4jDatabase": "neo4j"
}
```

### NEB API 인증 형식

NEB API는 form-data 또는 query params로 Neo4j 인증정보를 전달합니다:

```javascript
// Form Data 형식
{
  "uri": "{{ $vars.neo4jUri }}",
  "userName": "{{ $vars.neo4jUser }}",
  "password": "{{ btoa($vars.neo4jPassword) }}",  // Base64 인코딩
  "database": "{{ $vars.neo4jDatabase }}"
}
```

---

## 상태 흐름 (Status Flow)

```
┌───────────┐    ┌───────────┐    ┌────────────┐    ┌───────────┐    ┌──────────┐
│  pending  │───▶│ analyzed  │───▶│ generating │───▶│ completed │───▶│ uploaded │
└───────────┘    └───────────┘    └────────────┘    └───────────┘    └──────────┘
      │               │                 │                 │               │
      │               │                 │                 │               │
   [입력됨]      [AI 분석완료]    [이미지 생성중]   [비디오 완성]   [YouTube 업로드]
```

### 상태 업데이트 API

```bash
# 상태 업데이트
curl -X PUT "${baseUrl}/api/books/${bookId}/status" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "analyzed",
    "planId": "plan_123",
    "totalShorts": 5
  }'
```

---

## PDF 입력 방법 3가지

### 방법 1: 수동 입력 (n8n Manual Trigger)

1. n8n에서 Manual Trigger 워크플로우 실행
2. PDF URL 또는 GCS 경로 입력
3. 자동으로 NEB 처리 시작

```json
// n8n Manual Trigger Input
{
  "source_url": "gs://my-bucket/books/book1.pdf",
  "source_type": "gcs bucket"
}
```

### 방법 2: GCS Bucket Watch (자동)

1. GCS 버킷에 PDF 업로드
2. n8n GCS Trigger가 감지
3. 자동으로 파이프라인 시작

**GCS 설정:**
- Bucket: `gs://your-bucket/books/`
- Trigger: Object Create
- Filter: `*.pdf`

### 방법 3: NEB Frontend 직접 사용

1. NEB 웹 UI (http://localhost:8001) 접속
2. 파일 업로드 또는 URL 입력
3. "Extract" 버튼 클릭
4. 24시간 자동 워크플로우가 나머지 처리

---

## n8n 노드 설정 예시

### 1. NEB url/scan 노드

```javascript
// HTTP Request Node
{
  "method": "POST",
  "url": "{{ $vars.nebUrl }}/url/scan",
  "sendBody": true,
  "contentType": "multipart-form-data",
  "body": {
    "uri": "{{ $vars.neo4jUri }}",
    "userName": "{{ $vars.neo4jUser }}",
    "password": "{{ Buffer.from($vars.neo4jPassword).toString('base64') }}",
    "database": "{{ $vars.neo4jDatabase }}",
    "source_url": "{{ $json.source_url }}",
    "source_type": "{{ $json.source_type }}",
    "model": "gemini-2.0-flash-001"
  }
}
```

### 2. NEB extract 노드

```javascript
// HTTP Request Node
{
  "method": "POST",
  "url": "{{ $vars.nebUrl }}/extract",
  "sendBody": true,
  "contentType": "multipart-form-data",
  "body": {
    "uri": "{{ $vars.neo4jUri }}",
    "userName": "{{ $vars.neo4jUser }}",
    "password": "{{ Buffer.from($vars.neo4jPassword).toString('base64') }}",
    "database": "{{ $vars.neo4jDatabase }}",
    "file_name": "{{ $json.file_name }}",
    "source_type": "{{ $json.source_type }}",
    "model": "gemini-2.0-flash-001"
  },
  "options": {
    "timeout": 300000  // 5분 (큰 PDF는 시간이 걸림)
  }
}
```

### 3. AI 분석 노드

```javascript
// HTTP Request Node
{
  "method": "POST",
  "url": "{{ $vars.baseUrl }}/api/books/{{ $json.id }}/analyze",
  "sendBody": true,
  "contentType": "application/json",
  "body": {
    "style": "ghibli",
    "maxShorts": 5,
    "maxScenes": 6,
    "forceRefresh": false
  },
  "options": {
    "timeout": 120000  // 2분
  }
}
```

### 4. 이미지 생성 노드

```javascript
// HTTP Request Node
{
  "method": "POST",
  "url": "{{ $vars.baseUrl }}/api/gpt-to-nanobanana/generate",
  "sendBody": true,
  "contentType": "application/json",
  "body": {
    "character": {
      "description": "{{ $json.character.description }}"
    },
    "scenes": "{{ $json.scenes }}",
    "config": {
      "aspectRatio": "9:16"
    }
  },
  "options": {
    "timeout": 300000  // 5분
  }
}
```

---

## 에러 처리

### Retry 로직

```javascript
// Error Trigger 노드 연결
// 실패 시 3회 재시도, 지수 백오프

{
  "retry": {
    "enabled": true,
    "maxTries": 3,
    "waitBetweenTries": {
      "mode": "exponential",
      "value": 5000  // 5초 시작
    }
  }
}
```

### 실패 알림

```javascript
// Slack 또는 Email 알림
{
  "webhookUrl": "{{ $vars.slackWebhook }}",
  "message": "❌ Books to Shorts 파이프라인 실패\n- 문서: {{ $json.bookId }}\n- 단계: {{ $json.stage }}\n- 에러: {{ $json.error }}"
}
```

---

## 권장 실행 순서

### 처음 설정할 때:

1. **NEB 설정 확인**
   ```bash
   curl -X POST "http://localhost:8000/connect" \
     -F "uri=bolt://localhost:7687" \
     -F "userName=neo4j" \
     -F "password=$(echo -n 'password' | base64)" \
     -F "database=neo4j"
   ```

2. **n8n Variables 설정**
   - Settings → Variables에서 위 변수들 추가

3. **워크플로우 Import**
   - `books-to-shorts-workflow.json` Import
   - `pdf-input-workflow.json` Import

4. **테스트 실행**
   - 작은 PDF로 Manual Trigger 테스트
   - 로그 확인 후 24시간 자동화 활성화

### 일상 운영:

1. GCS에 PDF 업로드 또는 NEB UI 사용
2. 24시간 자동 워크플로우가 처리
3. 완료된 Shorts는 YouTube에 업로드 (수동/자동)

---

## 관련 파일

| 파일 | 설명 |
|------|------|
| `workflows/books-to-shorts-workflow.json` | 24시간 자동 Shorts 생성 |
| `workflows/pdf-input-workflow.json` | PDF 수동 입력 |
| `workflows/gcs-watch-workflow.json` | GCS 자동 감지 |
| `services/ContentPlannerService.ts` | AI 분석 서비스 |
| `services/Neo4jService.ts` | Neo4j 연동 |
| `api/BooksRouter.ts` | Books API |
