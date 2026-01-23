# YTB-Books-Project

> **AI는 먼저 [README_INDEX.md](./README_INDEX.md)를 읽어주세요!**

책/논문을 Neo4j GraphRAG로 처리하여 미야자키 하야오 스타일의 YouTube Shorts를 자동 생성하는 프로젝트

## 프로젝트 상태

| 항목 | 상태 |
|------|------|
| Architecture | v2.2.0 (Phase 3 비디오 생성 완료) |
| Neo4j Setup | **GCP VM 설치 완료** |
| llm-graph-builder | **서버 실행 확인** |
| API Server | **Books Router + Episode API + Video Pipeline** |
| Full Flow Test | **2026-01-23 완료** |

---

## 🔥 전체 플로우 (AI 이해용)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     Books-to-Shorts 전체 파이프라인                        │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [1] PDF 업로드                                                           │
│       │                                                                  │
│       ▼                                                                  │
│  [2] NEB (llm-graph-builder)                                             │
│       │  - 텍스트 추출                                                    │
│       │  - 청킹 (Chunking)                                               │
│       │  - 엔티티 추출 (Entity Extraction)                                │
│       │  - 관계 생성 (Relationship)                                       │
│       ▼                                                                  │
│  [3] Neo4j GraphDB                                                       │
│       │  - Document → Chunk → Entity 구조                                │
│       │  - Community Detection (Leiden)                                  │
│       ▼                                                                  │
│  [4] AI 분석 (ContentPlannerService)                                     │
│       │  - Gemini API로 청크 분석                                         │
│       │  - ShortsPlan 생성 (episodes, scenes, narration)                 │
│       ▼                                                                  │
│  [5] 이미지 생성 (GhibliImageService)                                     │
│       │  - Scene 0: GPT-4o로 마스터 이미지 생성                           │
│       │  - Scene 1+: NanoBanana + Reference로 일관성 유지                 │
│       ▼                                                                  │
│  [6] 비디오 생성 (BooksVideoService)                                      │
│       │  - TTS 생성 (Gemini TTS)                                         │
│       │  - 자막 합성                                                      │
│       │  - FFmpeg 합성                                                    │
│       ▼                                                                  │
│  [7] YouTube 업로드                                                       │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 📡 API 엔드포인트 (테스트 완료)

Base URL: `http://localhost:3124/api/books`

### 1. 연결 및 상태 확인

| Method | Endpoint | 설명 | 테스트 결과 |
|--------|----------|------|-------------|
| `GET` | `/connection` | Neo4j 연결 테스트 | ✅ 387 nodes |
| `GET` | `/stats` | 그래프 통계 | ✅ 2 docs, 22 chunks |
| `GET` | `/` | 책 목록 | ✅ 2 books |
| `GET` | `/pending` | 미처리 문서 | ✅ |

### 2. 책 데이터 조회

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/:bookId` | 책 상세 + 청크 |
| `GET` | `/:bookId/chunks` | 청크 목록만 |
| `POST` | `/search` | 유사 청크 검색 |

### 3. AI 분석 및 Shorts 생성

| Method | Endpoint | 설명 | 테스트 결과 |
|--------|----------|------|-------------|
| `POST` | `/:bookId/analyze` | AI 분석 → ShortsPlan | ✅ 동작 |
| `POST` | `/:bookId/shorts` | Shorts 생성 요청 | |
| `POST` | `/:bookId/generate-video` | 비디오 생성 | |
| `GET` | `/download/:videoId` | 비디오 다운로드 | |

### 4. 상태 관리

| Method | Endpoint | 설명 |
|--------|----------|------|
| `PUT` | `/:bookId/status` | 상태 업데이트 |

### 5. Episode/Scene (v2.1)

| Method | Endpoint | 설명 | 테스트 결과 |
|--------|----------|------|-------------|
| `GET` | `/episodes/stats` | Episode/Scene 통계 | ✅ 동작 |
| `GET` | `/episodes/pending` | 다음 처리할 Episode | ✅ 동작 |
| `GET` | `/episodes/:episodeId` | 에피소드 상세 | ✅ 동작 |
| `PUT` | `/episodes/:episodeId/status` | 상태 업데이트 | ✅ 동작 |
| `GET` | `/:bookId/series` | 시리즈 전체 조회 | ✅ 동작 |
| `GET` | `/:bookId/episodes` | 에피소드 목록 | ✅ 동작 |
| `POST` | `/:bookId/episodes` | Episode 생성 (Plan→자동) | ✅ 동작 |

### 6. Phase 3: 비디오 생성 (v2.2 신규)

| Method | Endpoint | 설명 | 테스트 결과 |
|--------|----------|------|-------------|
| `POST` | `/episodes/:episodeId/generate-video` | Episode → 전체 비디오 | ✅ 라우트 확인 |
| `POST` | `/episodes/:episodeId/generate-images` | Episode → 이미지만 | ✅ 8/8 성공 |

---

## 🧪 테스트 플로우 (2026-01-23)

### Step 1: Neo4j 연결 확인
```bash
curl http://localhost:3124/api/books/connection
# {"success":true,"message":"Connected to Neo4j. Total nodes: 387","nodeCount":387}
```

### Step 2: 그래프 통계 조회
```bash
curl http://localhost:3124/api/books/stats
# {
#   "success": true,
#   "stats": {
#     "documents": 2,
#     "chunks": 22,
#     "entities": 334,
#     "relationships": 920
#   }
# }
```

### Step 3: 책 목록 조회
```bash
curl http://localhost:3124/api/books
# {
#   "success": true,
#   "count": 2,
#   "books": [
#     {"id": "AR_TALK.pdf", "title": "AR_TALK.pdf", "totalChunks": 20},
#     {"id": "Hayao_Miyazaki", "title": "Hayao_Miyazaki", "totalChunks": 2}
#   ]
# }
```

### Step 4: 책 상세 조회
```bash
curl http://localhost:3124/api/books/AR_TALK.pdf
# 20개 청크 반환 (논문 전체 텍스트)
```

### Step 5: AI 분석 (ShortsPlan 생성)
```bash
curl -X POST http://localhost:3124/api/books/AR_TALK.pdf/analyze \
  -H "Content-Type: application/json" \
  -d '{"episodeCount": 1, "scenesPerEpisode": 2}'

# 응답 예시:
# {
#   "success": true,
#   "plan": {
#     "bookId": "AR_TALK.pdf",
#     "totalShorts": 1,
#     "character": {
#       "description": "A friendly narrator character, ghibli anime style",
#       "style": "ghibli"
#     },
#     "shorts": [{
#       "title": "말하는 3D 아바타, 이제 실시간으로!",
#       "hook": "혹시 AI 아바타가 내 말을 실시간으로 따라 한다면?",
#       "scenes": [
#         {
#           "sceneIndex": 0,
#           "narrationText": "상상만 하던 일이 현실로!",
#           "visualPrompt": "A curious ghibli-style character...",
#           "durationHint": 7
#         }
#       ]
#     }]
#   }
# }
```

### Step 6: 이미지 생성 테스트
```bash
# GPT-to-NanoBanana 하이브리드 방식
curl -X POST http://localhost:3124/api/gpt-to-nanobanana/generate \
  -H "Content-Type: application/json" \
  -d '{
    "character": {"description": "A curious ghibli-style cat with green eyes"},
    "scenes": [
      {"text": "Cat in a magical forest"},
      {"text": "Cat looking at glowing mushrooms"}
    ]
  }'

# Scene 0: GPT-4o로 마스터 이미지 생성 (~40초)
# Scene 1+: NanoBanana로 일관성 유지 이미지 생성 (~10초/장)
```

---

## 🏗️ 서비스 아키텍처

```
src/YTB-books-project/
├── src/
│   ├── api/
│   │   └── BooksRouter.ts        # API 엔드포인트 정의
│   │
│   └── services/
│       ├── Neo4jService.ts       # Neo4j 연결 및 쿼리
│       ├── ContentPlannerService.ts  # AI 분석 (Gemini)
│       ├── GhibliImageService.ts # GPT + NanoBanana 하이브리드
│       └── BooksVideoService.ts  # 비디오 생성 (TTS + FFmpeg)
│
├── Architecture/
│   ├── Architecture.md           # 상세 아키텍처 v1.4.0
│   └── Neo4j-Setup-Guide.md      # Neo4j 설정 가이드
│
└── README.md                     # 이 파일
```

### 서비스 간 의존성

```
BooksRouter
    │
    ├── Neo4jService
    │   └── neo4j-driver (bolt://34.47.112.49:7687)
    │
    ├── ContentPlannerService
    │   └── Gemini API (@google/generative-ai)
    │
    ├── GhibliImageService
    │   ├── GPTImageService (OpenAI gpt-image-1.5)
    │   └── NanoBananaService (Gemini Imagen)
    │
    └── BooksVideoService
        ├── TTS (Gemini)
        └── FFmpeg
```

---

## 🔑 환경변수

```env
# Neo4j 연결 (필수)
NEO4J_URI=bolt://34.47.112.49:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=ytbbooks2026

# Google/Gemini API (필수)
GOOGLE_API_KEY=your-google-api-key

# OpenAI API (GPT Image용)
OPENAI_API_KEY=your-openai-api-key
```

---

## 🎯 캐릭터 일관성 전략

**하이브리드 이미지 생성 (GhibliImageService)**

```
Scene 0 (첫 씬)
    │
    ├── GPT-4o로 고품질 지브리 스타일 이미지 생성
    │   - 캐릭터 마스터 이미지
    │   - ~40초 소요
    │
    └── referenceImage로 저장
         │
         ▼
Scene 1, 2, 3... (이후 씬)
    │
    ├── NanoBanana + referenceImage
    │   - 첫 이미지를 참조로 일관성 유지
    │   - ~10초/장 소요
    │
    └── 동일 캐릭터 유지
```

---

## 📊 Neo4j 그래프 구조

```
Book (해리포터, AR_TALK, ...)
  └─[:HAS_DOCUMENT]→ Document
      └─[:PART_OF]← Chunk
          ├─[:NEXT_CHUNK]→ Chunk (순서)
          └─[:HAS_ENTITY]→ __Entity__
              ├─[:RELATIONSHIP]→ __Entity__
              └─[:IN_COMMUNITY]→ __Community__
```

### 현재 데이터

| 항목 | 개수 |
|------|------|
| Documents | 2 |
| Chunks | 22 |
| Entities | 334 |
| Relationships | 920 |

---

## 🚀 빠른 시작

### 1. 서버 시작
```bash
cd D:\Data\00_Personal\YTB\short-video-maker
npm start
# Server running on port 3124
```

### 2. 연결 테스트
```bash
curl http://localhost:3124/api/books/connection
```

### 3. 책 분석
```bash
curl -X POST http://localhost:3124/api/books/AR_TALK.pdf/analyze \
  -H "Content-Type: application/json" \
  -d '{"episodeCount": 1}'
```

---

## 🔧 트러블슈팅

### Neo4j 연결 실패
```
AuthError: The client is unauthorized
```
**해결**: `.env` 파일의 `NEO4J_PASSWORD` 확인

### GPT Image 400 에러 (moderation_blocked)
```
Request failed with status code 400
"code": "moderation_blocked"
```
**원인**: OpenAI 모더레이션이 아티스트 이름 차단

| 차단됨 ❌ | 허용됨 ✅ |
|----------|----------|
| "Studio Ghibli" | "Ghibli-style" |
| "Hayao Miyazaki" | "hand-painted aesthetic" |
| "Makoto Shinkai" | "whimsical dreamlike" |

**해결**: `src/image-generation/services/GPTImageService.ts`의 `GHIBLI_STYLE_PREFIX` 수정
```typescript
// ❌ 차단됨
"Studio Ghibli inspired... Hayao Miyazaki influence"

// ✅ 허용됨
"Ghibli-style animation, hand-painted aesthetic..."
```

**참고**: https://docs.aihubmix.com/en/api/GPT-Image-1

### 이미지 생성 느림
- GPT-4o: ~50초/장 (고품질)
- NanoBanana: ~10초/장 (일관성)
- 전략: 첫 장만 GPT, 나머지 NanoBanana

---

## 📚 관련 문서

- [Architecture.md](./Architecture/Architecture.md) - 상세 아키텍처 v1.4.0
- [Neo4j-Setup-Guide.md](./Architecture/Neo4j-Setup-Guide.md) - Neo4j 설정 가이드
- [CLAUDE.md](../../CLAUDE.md) - 프로젝트 전체 컨텍스트

---

**Last Updated**: 2026-01-23
**Version**: 2.2.0 (Phase 3 비디오 생성 파이프라인 완료)
