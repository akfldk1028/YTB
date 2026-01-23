# Books to Shorts - Quick Setup Guide

## 1. n8n Variables 설정

n8n 대시보드에서 **Settings → Variables**로 이동하여 다음 변수들을 추가:

```
┌─────────────────────┬─────────────────────────────────────────────────────┐
│ Variable            │ Value (예시)                                         │
├─────────────────────┼─────────────────────────────────────────────────────┤
│ baseUrl             │ https://short-video-maker-7qtnitbuvq-uc.a.run.app   │
│ nebUrl              │ http://localhost:8000                               │
│ neo4jUri            │ bolt://localhost:7687                               │
│ neo4jUser           │ neo4j                                               │
│ neo4jPassword       │ your-password                                       │
│ neo4jDatabase       │ neo4j                                               │
│ gcsBucketName       │ dkdk-474008-short-videos                           │
│ gcsBucketFolder     │ books                                               │
│ gcsProjectId        │ dkdk-474008                                        │
└─────────────────────┴─────────────────────────────────────────────────────┘
```

## 2. 워크플로우 Import

### 방법 A: JSON 파일 Import
1. n8n → Workflows → Import from file
2. 다음 파일들을 순서대로 Import:
   - `pdf-input-workflow.json` (수동 PDF 입력)
   - `gcs-watch-workflow.json` (GCS 자동 감지)
   - `books-to-shorts-complete.json` (24시간 자동 처리)

### 방법 B: 직접 생성
위 JSON 파일의 내용을 복사하여 n8n 에디터에 붙여넣기

## 3. PDF 입력 방법 선택

### Option 1: 수동 입력 (권장 - 처음 테스트용)
```
1. n8n → "PDF Input - Manual Upload" 워크플로우 열기
2. "Manual Trigger" 노드 클릭 → Execute
3. 또는 Webhook URL로 호출:
   POST /webhook/pdf-input
   {
     "source_url": "gs://your-bucket/books/sample.pdf",
     "source_type": "gcs bucket"
   }
```

### Option 2: NEB Frontend 사용
```
1. http://localhost:8001 접속 (NEB UI)
2. "Upload" 버튼으로 PDF 업로드 또는 URL 입력
3. "Extract" 버튼 클릭
4. 24시간 워크플로우가 자동으로 나머지 처리
```

### Option 3: GCS 자동 감지
```
1. "GCS Watch" 워크플로우 활성화
2. GCS 버킷 (gs://your-bucket/books/)에 PDF 업로드
3. 30분마다 자동 스캔 및 처리 시작
```

## 4. 파이프라인 흐름

```
PDF Upload → NEB Chunking → Neo4j Storage → AI Analysis → Image Generation
                                                              ↓
                                          YouTube Upload ← Video Complete
```

### 상태 확인 API

```bash
# 미처리 문서 목록
curl "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/books/pending"

# 특정 문서 상세
curl "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/books/AR_TALK.pdf"

# 분석 결과 (Shorts Plan)
curl "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/books/AR_TALK.pdf/plan"
```

## 5. 트러블슈팅

### NEB 연결 실패
```bash
# Neo4j 연결 테스트
curl -X POST "http://localhost:8000/connect" \
  -F "uri=bolt://localhost:7687" \
  -F "userName=neo4j" \
  -F "password=$(echo -n 'password' | base64)" \
  -F "database=neo4j"
```

### Extract 타임아웃
- 큰 PDF는 5-10분 소요 가능
- n8n HTTP Request 노드의 timeout을 600000 (10분)으로 증가

### 이미지 생성 실패
- GPT-4o API 키 확인 (OPENAI_API_KEY)
- NanoBanana API 상태 확인

## 6. 워크플로우 활성화 순서

```
1. "PDF Input - Manual Upload" → 테스트용 (Active: 선택)
2. "GCS Watch - Auto PDF Detection" → GCS 자동화 시 (Active: Yes)
3. "Books to Shorts - Complete Pipeline" → 24시간 자동 (Active: Yes)
```

## 관련 파일

| 파일 | 위치 |
|------|------|
| 워크플로우 가이드 | `docs/N8N_WORKFLOW_GUIDE.md` |
| PDF 입력 워크플로우 | `workflows/pdf-input-workflow.json` |
| GCS 감지 워크플로우 | `workflows/gcs-watch-workflow.json` |
| 24시간 자동화 | `workflows/books-to-shorts-complete.json` |
| 아키텍처 문서 | `docs/Update/BOOKS_TO_SHORTS_ARCHITECTURE.md` |
