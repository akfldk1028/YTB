# YTB-Books-Project

> **AI는 먼저 [README_INDEX.md](./README_INDEX.md)를 읽어주세요!**

책/논문을 Neo4j GraphRAG로 처리하여 YouTube Shorts를 자동 생성하는 프로젝트

### 핵심 철학
- **수식이 주인공** (v3.3.0): math_science + 수식 3개 이상 → 수식 중심 커리큘럼 자동 전환
- **수식 파이프라인**: BookChunk LaTeX 추출 → 수식별 에피소드 그룹화 → assignedFormula per scene → MathJax v4 PNG → FFmpeg overlay
- **이미지 전략**: 수식 씬은 `FORMULA_CONCEPT_PREFIX` (교육적 비유), 비수식 씬은 Ghibli 스타일
- **설명 수준**: 고등학생이 이해할 수 있는 수준 (40-60자/수식씬), 변수별 의미 설명 필수

## 인프라 현황

| 서비스 | 타입 | URL | 용도 |
|--------|------|-----|------|
| **YTB API** | Cloud Run | https://short-video-maker-550996044521.us-central1.run.app | Books API 포함 |
| **NEB API** | Cloud Run | https://neb-550996044521.asia-northeast3.run.app | PDF→Graph 변환 |
| **Neo4j DB** | VM | bolt://34.47.112.49:7687 | 공유 DB |
| **NEB Frontend** | VM | http://34.47.112.49:8081 | PDF 업로드 UI |

---

## 프로젝트 상태

| 항목 | 상태 |
|------|------|
| Architecture | v3.4.2 (MathJax AllPackages 크래시 수정 — 수식 PNG 렌더링 완전 복구) |
| Neo4j Setup | **GCP VM 설치 완료** |
| llm-graph-builder | **서버 실행 확인** |
| API Server | **Books Router + Episode API + Video Pipeline + ELI5 + 자동 저장** |
| Full Flow Test | **2026-01-24 완료** ✅ |
| Video Generation | **멀티 에피소드 생성 성공** (논문 1개 → 3개 영상) |
| ELI5 설명 | **어려운 내용 쉽게 설명** ✅ |

### 최신 테스트 결과 (2026-02-02, v3.3.0)

| Episode | 제목 | 길이 | 수식 | assignedFormula | 상태 |
|---------|------|------|------|-----------------|------|
| EP49 | 3D 얼굴 모델링 기초: 얼굴 모양 결정짓기 | **32초** | 2개 | ✅ β (Shape Parameter) | ✅ completed |
| EP22 | 얼굴 움직임 압축 마법! 다중 스케일 잔차 VQ는 뭘까? | **56.7초** | 5개 | ❌ (v3.2.4 라운드로빈) | ✅ completed |

**v3.4.2 변경 (2026-02-04)** — **수식 렌더링 완전 복구**:
- MathJax `AllPackages` 제거 → `new TeX({})` (Node.js CommonJS 환경 null reference 크래시 해결)
- `<mjx-container>` wrapper SVG 추출: `svgString.match(/<svg[\s\S]*<\/svg>/)`
- `convertLatexToDisplayText()` `$` 구분자 strip 추가
- β, ψ, θ, L_{rec}=||M̂-M||_1 모두 PNG 렌더링 성공 확인
- 파일: `MathFormulaService.ts`

**v3.4.1 변경 (2026-02-03)**:
- MathJax SVG `fill="currentColor"` → `fill="white"` 대체 (β, ψ, θ 렌더링 수정)
- 씬간 텀 0.15초 → 0.05초 (PCM 패딩 + 크로스페이드)
- FFmpeg `-preset ultrafast -crf 23` 추가 (500MB+ → ~10MB, 30분+ → 2-3분)
- 파일: `MathFormulaService.ts`, `AudioProcessor.ts`, `BooksVideoService.ts`, `VideoEditor.ts`

**v3.3.0 변경**: 수식 중심 커리큘럼, assignedFormula per scene, FORMULA_CONCEPT_PREFIX 이미지, TTS connector 수식씬 스킵, 나레이션 60자/수식씬
**v3.2.4 변경**: 수식 적응형 스케일링(25%/40%/60%/85%), 위치 1%, TTS 30자/씬, 이미지 다양성, 자막 싱크 개선

**비디오 저장 위치:**
- 로컬: `C:\Users\SOGANG1\.ai-agents-az-video-generator\videos\books\`
- GCS: `gs://dkdk-474008-short-videos/videos/book_*.mp4`

### 🆕 v2.5.0 핵심 변경: 순차적 커리큘럼 방식

**문제**: 기존 `/entities` 방식은 에피소드 간 연결이 없고 수학 설명 부족

**해결**: 새 `/curriculum` API 추가
```
기존 /entities:     Episode 1 ← 독립 → Episode 2 ← 독립 → Episode 3
새 /curriculum:     Episode 1 → "지난 시간에..." → Episode 2 → "다음엔..." → Episode 3
                    (기초)        (연결)          (심화)       (연결)        (적용)
```

| 기능 | /entities | /curriculum (신규) |
|------|-----------|-------------------|
| 에피소드 연결 | ❌ 독립적 | ✅ 순차적 연결 |
| 수학/기술 설명 | 표면적 | ✅ 상세 설명 필수 |
| 학습 순서 | 랜덤 | ✅ 기초→심화 |
| 이전 내용 참조 | ❌ | ✅ "지난 시간에..." |

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
│  [4] AI 분석 (ContentPlannerService) + **ELI5 쉬운 설명**                 │
│       │  - Gemini API로 청크 분석                                         │
│       │  - ShortsPlan 생성 (episodes, scenes, narration)                 │
│       │  - **어려운 내용 → 비유/예시로 쉽게 설명** (ELI5)                   │
│       ▼                                                                  │
│  [5] 이미지 생성 (GhibliImageService)                                     │
│       │  - Scene 0: GPT-4o로 마스터 이미지 생성                           │
│       │  - Scene 1+: NanoBanana + Reference로 일관성 유지                 │
│       ▼                                                                  │
│  [6] 비디오 생성 (BooksVideoService)                                      │
│       │  - MathJax v4 수식 PNG 렌더링 (MathFormulaService)               │
│       │  - TTS 생성 (Gemini TTS, 30자/씬 제한)                           │
│       │  - 오디오 트리밍 (6초/씬 제한)                                    │
│       │  - FFmpeg overlay (수식 PNG) + 자막 합성                          │
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

### 3. AI 분석 및 Shorts 생성 (+ ELI5 옵션)

| Method | Endpoint | 설명 | 테스트 결과 |
|--------|----------|------|-------------|
| `POST` | `/:bookId/curriculum` | **🆕 순차적 커리큘럼 기반 에피소드 (권장)** | ✅ v2.5.0 |
| `POST` | `/:bookId/entities` | 엔티티 클러스터 기반 에피소드 (독립적) | ✅ 동작 |
| `POST` | `/:bookId/analyze` | AI 분석 → ShortsPlan **(ELI5 지원)** | ✅ 동작 |
| `POST` | `/:bookId/shorts` | Shorts 생성 요청 | |
| `POST` | `/:bookId/generate-video` | 비디오 생성 | |
| `GET` | `/download/:videoId` | 비디오 다운로드 | |

#### 🆕 `/curriculum` - 순차적 커리큘럼 기반 에피소드 (v2.5.0) ⭐ 권장

**핵심**: 전체 문서를 학습 순서대로 분석 → 연결된 에피소드 시리즈 생성

```bash
# 순차적 커리큘럼 분석 + Episode 자동 저장
curl -X POST https://short-video-maker-550996044521.us-central1.run.app/api/books/AR_TALK.pdf/curriculum \
  -H "Content-Type: application/json" \
  -d '{
    "saveToNeo4j": true,
    "forceRefresh": true,
    "audienceLevel": "elementary"
  }'

# 응답:
# {
#   "success": true,
#   "method": "sequential-curriculum",
#   "totalEpisodes": 8,
#   "totalScenes": 64,
#   "estimatedDuration": "7분",
#   "savedEpisodes": [
#     {"id": "ep_xxx", "episodeNumber": 1, "title": "ARTalk 소개: 말하는 3D 아바타란?"},
#     {"id": "ep_yyy", "episodeNumber": 2, "title": "핵심 기술: Diffusion Model 이해하기"},
#     ...
#   ]
# }
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `saveToNeo4j` | `true` | Episode/Scene을 Neo4j에 자동 저장 |
| `forceRefresh` | `false` | 캐시 무시하고 재분석 |
| `audienceLevel` | `elementary` | 쉬운 설명 수준 |
| `useELI5Style` | `true` | ELI5 스타일 적용 |
| `maxScenesPerShort` | `8` | 에피소드당 최대 씬 수 |

**특징:**
1. **에피소드 연결**: "지난 시간에 ~를 배웠죠? 오늘은..."
2. **수학/기술 필수 설명**: 공식, 알고리즘 상세 설명
3. **순차적 학습**: 기초 → 심화 순서
4. **완전한 커버**: 문서 내용 빠짐없이 포함

---

#### `/entities` - 엔티티 클러스터 기반 에피소드 (v2.4.0)

**핵심**: 논문 1개 → 여러 개의 Shorts 자동 생성 + Neo4j 저장 (독립적 에피소드)

```bash
# 엔티티 기반 멀티 에피소드 분석 + Neo4j 자동 저장
curl -X POST https://short-video-maker-550996044521.us-central1.run.app/api/books/AR_TALK.pdf/entities \
  -H "Content-Type: application/json" \
  -d '{
    "saveToNeo4j": true,
    "forceRefresh": true
  }'

# 응답:
# {
#   "success": true,
#   "method": "entity-clusters",
#   "clusterInfo": [
#     {"name": "FaceDiffuser 기술 분석", "mainEntity": "FaceDiffuser", "chunkCount": 8},
#     {"name": "motion 개념 설명", "mainEntity": "motion", "chunkCount": 2}
#   ],
#   "savedToNeo4j": true,
#   "episodes": [
#     {"id": "ep_xxx", "title": "FaceDiffuser: ...", "scenes": [...]},
#     {"id": "ep_yyy", "title": "motion: ...", "scenes": [...]}
#   ]
# }
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `saveToNeo4j` | `true` | Episode/Scene을 Neo4j에 자동 저장 |
| `forceRefresh` | `false` | 캐시 무시하고 재분석 |
| `audienceLevel` | `elementary` | 쉬운 설명 수준 |
| `useELI5Style` | `true` | ELI5 스타일 적용 |

#### 🆕 ELI5 (쉬운 설명) 옵션

```bash
# 초등학생도 이해할 수 있게 분석
curl -X POST http://localhost:3124/api/books/AR_TALK.pdf/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "audienceLevel": "elementary",
    "useELI5Style": true
  }'
```

| 옵션 | 값 | 설명 |
|------|-----|------|
| `audienceLevel` | `elementary` | 초등학생 수준 - 전문용어 완전 배제 |
| `audienceLevel` | `general` | 일반 성인 (기본값) |
| `audienceLevel` | `professional` | 전문가 수준 |
| `useELI5Style` | `true` | ELI5 규칙 적용 (기본값) |

**ELI5 적용 예시:**
- 원문: "엔트로피는 열역학 제2법칙에 따라 증가한다"
- ELI5: "엔트로피(쉽게 말해 방이 어질러지는 정도)는 시간이 지나면 점점 커져요. 마치 방을 정리해도 다시 어질러지는 것처럼요!"

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

### 6. Phase 3: 비디오 생성 (v2.4 업데이트)

| Method | Endpoint | 설명 | 테스트 결과 |
|--------|----------|------|-------------|
| `POST` | `/episodes/:episodeId/generate-video` | Episode → 전체 비디오 | ✅ **54초 영상 생성 성공** |
| `POST` | `/episodes/:episodeId/generate-images` | Episode → 이미지만 | ✅ 8/8 성공 |

---

## 🚀 전체 파이프라인 (원스텝)

**논문 1개 → 멀티 에피소드 영상 자동 생성**

```bash
# Step 1: 엔티티 분석 + Episode 자동 저장 (1회 호출)
curl -X POST .../api/books/AR_TALK.pdf/entities \
  -d '{"saveToNeo4j": true, "forceRefresh": true}'

# 결과: episodes 배열에 Episode ID 반환
# → ep_xxx, ep_yyy

# Step 2: 각 Episode 비디오 생성
curl -X POST .../api/books/episodes/ep_xxx/generate-video
curl -X POST .../api/books/episodes/ep_yyy/generate-video

# 결과: GCS에 영상 업로드
# → https://storage.googleapis.com/dkdk-474008-short-videos/videos/book_xxx.mp4
```

### 진행 상황 확인

```bash
# 문서별 Episode 목록 + 상태
curl .../api/books/AR_TALK.pdf/episodes

# 응답:
# {
#   "episodes": [
#     {"episodeNumber": 1, "status": "completed", "videoPath": "..."},
#     {"episodeNumber": 2, "status": "completed", "videoPath": "..."},
#     {"episodeNumber": 3, "status": "draft", "videoPath": null}
#   ]
# }

# 미완료 Episode 조회
curl .../api/books/episodes/pending
```

### Episode 상태 플로우

```
draft → approved → producing → completed → uploaded
                       │
                       ├── 이미지 생성 중
                       ├── TTS 생성 중
                       └── 비디오 합성 중
```

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
│       ├── Neo4jService.ts          # Neo4j 연결 및 쿼리
│       ├── ContentPlannerService.ts # AI 분석 (Gemini)
│       ├── GhibliImageService.ts    # GPT + NanoBanana 하이브리드
│       ├── MathFormulaService.ts    # MathJax v4 수식 PNG 렌더링 (v3.2.0)
│       └── BooksVideoService.ts     # 비디오 생성 (TTS + FFmpeg)
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
    ├── MathFormulaService
    │   └── MathJax v4 (mathjax-full + sharp)
    │
    └── BooksVideoService
        ├── MathFormulaService (수식 PNG)
        ├── TTS (Gemini, 30자/씬 제한)
        └── FFmpeg (overlay + 자막)
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

### v2.9.0: 다이어그램/인포그래픽 자동 전환

```
isDiagramPrompt() 감지
    │
    ├── TRUE (infographic, diagram, flowchart 등)
    │   ├── DIAGRAM_STYLE_PREFIX 적용
    │   ├── referenceImage 사용 안 함
    │   └── reference로 저장 안 함 (캐릭터 오염 방지)
    │
    └── FALSE (일반 캐릭터 씬)
        ├── GHIBLI_STYLE_PREFIX 적용
        ├── referenceImage 사용 (일관성)
        └── reference로 저장
```

---

## 🎙️ TTS 언어별 설정

**BooksVideoService**는 언어에 따라 최적의 TTS voice를 자동 선택합니다.

```typescript
// 한국어 콘텐츠 (기본값)
config: { language: 'ko' }  // → Kore voice (여성)

// 영어 콘텐츠
config: { language: 'en' }  // → Aoede voice (여성)

// 특정 voice 직접 지정
config: { language: 'ko', ttsVoice: 'Charon', ttsGender: 'male' }
```

| 언어 | 여성 Voice | 남성 Voice | 설명 |
|------|-----------|-----------|------|
| `ko` | Kore (기본) | Charon | 한국어 최적화 |
| `en` | Aoede (기본) | Puck | 영어 최적화 |

**참고**: [YTB-tts/README.md](../../YTB-tts/README.md) - 전체 Voice 목록

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

### Neo4j "Episode not found" 타이밍 에러 (v2.5.0 수정됨)
```
Error: Episode not found after creation
```
**원인**: `createEpisode()` 후 별도 세션에서 `createScene()` 호출 시 트랜잭션 격리로 Episode가 아직 보이지 않음

**해결** (`Neo4jService.ts`):
```typescript
// ❌ 이전 방식 (별도 트랜잭션 → 타이밍 이슈)
const episode = await neo4j.createEpisode(episodeInput);
for (const scene of scenes) {
  await neo4j.createScene({ episodeId: episode.id, ...scene });
}

// ✅ 수정된 방식 (단일 트랜잭션)
const episodeWithScenes = await neo4j.createEpisodeWithScenes(episodeInput, scenesInput);
```

**새 메서드**: `createEpisodeWithScenes()` - Episode + 모든 Scenes를 단일 트랜잭션으로 생성

### Gemini TTS 400 에러 (v2.5.0 수정됨)
```
400 Bad Request: "Model tried to generate text, but it was asked to only output audio"
```
**원인**: 한국어 나레이션이 명령어로 오해됨 (예: "다음을 설명합니다")

**해결** (`GeminiTTS.ts`):
```typescript
// ❌ 이전 방식 (명령으로 오해됨)
const requestBody = { contents: [{ parts: [{ text: narrationText }] }] };

// ✅ 수정된 방식 (TTS 전용 프롬프트)
const ttsPrompt = `다음 대사를 자연스럽게 읽어주세요: ${narrationText}`;
const requestBody = { contents: [{ parts: [{ text: ttsPrompt }] }] };
```

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

### FFmpeg "Error reinitializing filters" (stream #7:0)
```
Error reinitializing filters! Failed to inject frame into filter network: Invalid argument
```
**원인**: 8개 이상 이미지를 동시에 concat+subtitle 필터 적용 시 FFmpeg 복잡도 제한 초과

**해결** (`BooksVideoService.ts`):
```typescript
// ❌ 이전 방식 (실패)
await this.ffmpeg.createStaticVideoFromMultipleImages(images, durations, output);

// ✅ 수정된 방식 (성공)
// Step 1: 각 이미지를 개별 scene 비디오로 변환
for (let i = 0; i < imagePaths.length; i++) {
  await this.ffmpeg.createStaticVideoFromImage(imagePaths[i], sceneVideoPath, duration);
}
// Step 2: scene 비디오들을 concat (stream copy)
await this.ffmpeg.concatVideos(sceneVideoPaths, tempVideoPath);
// Step 3: 최종 합성 (오디오 + 자막)
await this.ffmpeg.combineVideoWithAudioAndCaptions(...);
```

### FFmpeg ENAMETOOLONG 크래시 (v3.1.1 수정됨)
```
Error: spawn ENAMETOOLONG
    at ChildProcess.spawn (node:internal/child_process:420:11)
```
**원인**: 15개 씬 × 84개 캡션 × 2~3줄 = 230개 drawtext 필터 → FFmpeg 명령줄이 Windows 32KB 제한 초과

**해결** (`VideoEditor.ts`):
```typescript
// 필터가 8KB 이상이면 파일로 저장 후 -filter_complex_script 사용
if (fullFilter.length > 8000 && tempDir) {
  const filterScriptPath = path.join(tempDir, `filter_complex_${Date.now()}.txt`);
  fs.writeFileSync(filterScriptPath, fullFilter, 'utf-8');
  ffmpegCommand.outputOptions(['-filter_complex_script', filterScriptPath, ...]);
}
```

---

## 📚 관련 문서

- [Architecture.md](./Architecture/Architecture.md) - 상세 아키텍처 v1.4.0
- [Neo4j-Setup-Guide.md](./Architecture/Neo4j-Setup-Guide.md) - Neo4j 설정 가이드
- [CLAUDE.md](../../CLAUDE.md) - 프로젝트 전체 컨텍스트

---

## 🔗 NEB (LLM Graph Builder) 연동

> **핵심**: NEB가 문서를 Knowledge Graph로 변환하면, YTB-books-project가 엔티티 기반으로 더 정교한 에피소드 분리 가능

### NEB란?

Neo4j Labs의 **LLM Graph Builder** 프로젝트로, PDF/문서를 자동으로 Knowledge Graph로 변환합니다.

**NEB 상세 문서**: [`D:\Data\00_Personal\YTB\NEB\CLAUDE.md`](../../../../NEB/CLAUDE.md)

### NEB vs YTB-books-project

| 항목 | NEB | YTB-books-project |
|------|-----|-------------------|
| 청킹 | TokenTextSplitter + UnstructuredFileLoader | 단순 토큰 청킹 |
| 엔티티 | LLM 추출 (TECHNOLOGY, PERSON, CONCEPT) | 없음 |
| 관계 | HAS_ENTITY, SIMILAR, IN_COMMUNITY | 없음 |
| 용도 | Knowledge Graph 구축 | Shorts 비디오 생성 |

### 동일한 Neo4j 인스턴스

```
URI: bolt://34.47.112.49:7687
Username: neo4j
Password: ytbbooks2026
```

**NEB로 문서 처리 → YTB에서 엔티티 기반 Shorts 생성**

### 엔티티 기반 에피소드 분리

기존 방식은 하나의 문서를 1개 Shorts로 압축했지만, NEB 엔티티를 활용하면 **여러 에피소드**로 분리 가능:

```
AR_TALK.pdf 예시:

Entity Clusters (NEB 추출):
1. [TECHNOLOGY] ARTalk (8 chunks) → Episode 1: "ARTalk 기술이란?"
2. [TECHNOLOGY] FaceDiffuser (8 chunks) → Episode 2: "FaceDiffuser 비교"
3. [TECHNOLOGY] DiffPoseTalk (8 chunks) → Episode 3: "DiffPoseTalk 분석"
4. [CONCEPT] motion (4 chunks) → Episode 4: "모션 생성 원리"
5. [CONCEPT] VOCASET dataset (3 chunks) → Episode 5: "데이터셋 설명"
```

### Neo4jService 추가 메서드

```typescript
// 1. 문서별 엔티티 조회
const entities = await neo4jService.getDocumentEntities('AR_TALK.pdf');

// 2. 청크 + 엔티티 함께 조회
const chunksWithEntities = await neo4jService.getChunksWithEntities('AR_TALK.pdf');

// 3. 엔티티 클러스터링 (에피소드 분리용)
const clusters = await neo4jService.getEntityClusters('AR_TALK.pdf');

// 4. 클러스터별 청크 텍스트 조회
const texts = await neo4jService.getClusterChunkTexts(cluster.chunkIds);
```

### 워크플로우

```
┌─────────────────────────────────────────────────────────────────────┐
│                   NEB → YTB 연동 워크플로우                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  [1] NEB 프론트엔드에서 PDF 업로드                                   │
│       │                                                             │
│       ▼                                                             │
│  [2] NEB가 Knowledge Graph 생성                                     │
│       │  - Document, Chunk, Entity 노드 생성                        │
│       │  - HAS_ENTITY, SIMILAR 관계 생성                            │
│       │  - Community Detection                                      │
│       ▼                                                             │
│  [3] YTB에서 엔티티 기반 분석 API 호출                               │
│       │  POST /api/books/:bookId/analyze-entities                   │
│       ▼                                                             │
│  [4] ContentPlannerService.analyzeAndPlanByEntityClusters()         │
│       │  - Entity Cluster 조회                                       │
│       │  - Cluster별 Episode 생성                                    │
│       │  - 5-7개 Shorts로 분리                                       │
│       ▼                                                             │
│  [5] 각 Episode별 이미지/비디오 생성                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📚 관련 문서

- [Architecture.md](./Architecture/Architecture.md) - 상세 아키텍처 v1.4.0
- [Neo4j-Setup-Guide.md](./Architecture/Neo4j-Setup-Guide.md) - Neo4j 설정 가이드
- [CLAUDE.md](../../CLAUDE.md) - 프로젝트 전체 컨텍스트
- [NEB/CLAUDE.md](../../../../NEB/CLAUDE.md) - **NEB (LLM Graph Builder) AI 컨텍스트** 🆕

---

## ⚠️ 알려진 제한사항 / TODO

### 1. Episode 간 캐릭터 동일성 (v2.5 예정)

**현재 문제**:
```
Episode 1: GPT(새 캐릭터) → NanoBanana(동일성 유지)
Episode 2: GPT(다른 캐릭터!) → NanoBanana(동일성 유지)
         ↑ Episode 간 캐릭터 불일치 가능
```

**해결 방안** (구현 예정):
- 문서(Document) 수준 "마스터 캐릭터 이미지" 저장
- 모든 Episode가 동일 마스터 이미지 reference 사용
- Neo4j `Document` 노드에 `masterCharacterImage` 필드 추가

```typescript
// TODO: 첫 Episode 생성 시 마스터 이미지 저장
const masterImage = await ghibliService.generateMasterCharacter(characterDesc);
await neo4j.updateDocumentMasterImage(bookId, masterImagePath);

// 이후 Episode는 마스터 이미지 reference 사용
const masterImagePath = await neo4j.getDocumentMasterImage(bookId);
await ghibliService.setReferenceImage(masterImagePath);
```

### 2. 수학/과학 콘텐츠 시각화 (v2.9.0 ICS 프레임워크)

**ICS 프레임워크** (Image Type + Content + Style):
- `buildDetailedEpisodePrompt()`에 시각화 가이드 포함
- `getMathContentGuide()` 수식 유형별 템플릿
- `isDiagramPrompt()` 다이어그램 키워드 자동 감지

**시각화 템플릿** (v3.2.0: 텍스트/라벨 완전 제거):
| 콘텐츠 유형 | visualPrompt 예시 |
|------------|-------------------|
| 수학 공식 | "Educational infographic showing [공식명]: visual diagram with color-coded variables, directional arrows, portrait 9:16" |
| 기술/AI | "Technical flowchart diagram: [Input] -> [Process] -> [Output], color-coded components, data flow arrows, portrait 9:16" |
| 비교 | "Comparison chart: [A] vs [B], two columns with distinct rows, checkmarks and icons, portrait 9:16" |
| 모델 구조 | "Architecture diagram: [모델명] with connected color-coded components, data flow arrows, portrait 9:16" |

---

**Last Updated**: 2026-02-04
**Version**: v3.4.2 (MathJax AllPackages 크래시 수정 — 수식 PNG 렌더링 완전 복구)

### Changelog v3.4.2 (2026-02-04) — 수식 렌더링 완전 복구
- **MathJax AllPackages 제거**: `new TeX({ packages: AllPackages })` → `new TeX({})`
  - **근본 원인**: AllPackages가 Node.js CommonJS 환경에서 null reference 크래시 유발
  - MathJax 초기화 실패 → renderLatexToPng() 에러 → drawtext fallback → `$b$` 표시
  - 기본 TeX({})로 그리스 문자, 분수, 위첨자/아래첨자, hat 등 모두 정상 렌더링
- **`<mjx-container>` wrapper 제거**: `adaptor.outerHTML()` → `<mjx-container><svg>...</svg></mjx-container>` 반환
  - sharp는 `<svg>` root만 파싱 → regex로 `<svg>...</svg>` 추출
- **`$` 구분자 제거**: `convertLatexToDisplayText()`에서 `$`/`$$` strip 추가
- **에러 로깅 강화**: `initMathJax()` try-catch 추가
- **빌드 주의**: TS 변경 → `npx tsc --project tsconfig.build.json` 필수 (`npm start`는 `dist/` 사용)
- **파일 변경**: `MathFormulaService.ts`

### Changelog v3.4.1 (2026-02-03)
- **MathJax SVG fill 중복 수정**: `fill="currentColor"` → `fill="white"` 대체 (기존 `<g fill="white"` 추가 → "Attribute fill redefined" XML 에러)
  - MathJax가 이미 `fill="currentColor"` 포함 → 새 속성 추가 대신 기존 속성 대체
  - β, ψ, θ 등 그리스 문자가 제대로 렌더링됨
- **씬간 텀 축소**: 0.15초 → 0.05초
  - PCM 무음 패딩: 0.15초 → 0.05초 (`AudioProcessor.savePcmToMp3`)
  - 크로스페이드: 0.15초 → 0.05초 (`BooksVideoService.concatAudiosWithCrossfade`)
  - 씬과 씬 사이 어색한 공백 해결
- **파일 변경**: `MathFormulaService.ts`, `AudioProcessor.ts`, `BooksVideoService.ts`

### Changelog v3.2.4 (2026-02-02)
- **수식 크기 적응형 스케일링**: 짧은 수식(β 등) 25% 이하, 중간 40-60%, 긴 수식만 85%
  - 기존: 모든 수식을 화면 85%로 확대 → 짧은 수식이 화면 가득 채움
  - pngWidth 기반 4단계 스케일링 (25%/40%/60%/85%)
- **수식 위치 최상단(1%)**: 기존 25% → 1%로 이동 (최상단 배치, 자막 88%과 분리)
  - PNG overlay + drawtext fallback 모두 적용
- **TTS 나레이션 길이-시간 정합**: maxNarrationLength 50→30 (한국어 ~4자/초, 6초=24자)
  - 기존: 50자 나레이션 → TTS 12초 → maxSceneDuration 6초로 잘림 → 나레이션 절반만 재생
  - 수정: 30자로 줄여 TTS가 6초 안에 자연스럽게 완료
- **이미지 다양성 개선**: enhanceExplanationPrompt 획일화 제거
  - 기존: 모든 explanation 씬을 "Clean educational infographic on soft cream background"로 교체
  - 수정: 원래 visualDesc 유지, 교육적 힌트만 간단히 추가
- **파일 변경**: VideoEditor.ts, BooksVideoService.ts, BooksRouter.ts
- **테스트**: EP21 55.8초 수식6개, EP22 56.7초 수식5개
- **영향 범위**: Books 프로젝트만 (News/Cat 프로젝트 영향 없음)

### Changelog v3.2.2
- **수식 배경 개선**: `FORMULA_BG_PROMPT`(빈 그라데이션) 삭제 → `visualDesc` + GhibliImageService(GPT→NanoBanana)
  - 첫 수식 씬: GhibliImageService로 동화풍 배경 생성 → `formulaBackgroundPath` 저장
  - 이후 수식 씬: 복사 재사용 (수식 씬끼리 일관된 배경)
- **수식 크기+위치**: overlayY 8%→25%(중상단), PNG 화면 너비 85% 스케일링
  - drawtext fallback도 동일 위치(`h*0.25`) 적용
- **나레이션 끊김 수정**: `maxNarrationLength: 35→50` (≈12초/씬)
  - 한국어 종결어미 감지 정규식 개선 (`|[^.!?。！？]+$`)
  - 어절 단위 절단 fallback (공백/쉼표 기준)
- **파일 변경**: `BooksRouter.ts`, `VideoEditor.ts`, `BooksVideoService.ts`
- **테스트**: EP22 58.6초 수식 6개, EP21 57.7초 수식 7개

### Changelog v3.2.0
- **MathJax v4 수식 렌더링**: FFmpeg drawtext 완전 대체 → LaTeX → MathJax SVG → sharp PNG → FFmpeg overlay
  - 그리스 문자, 분수, 위첨자/아래첨자, 행렬 등 완전한 수학 조판
  - 반투명 검정 배경 박스 (rgba(0,0,0,0.6), border-radius 16px)
  - maxWidth 900px, density 300dpi
  - drawtext fallback 유지 (MathJax 실패 시)
- **영상 길이 60초 제한**:
  - `maxNarrationLength: 35` (한국어 TTS ~4자/초 → ~8초/씬)
  - `maxSceneDuration: 6` (6초 × 10씬 = 60초)
  - 모든 씬에 나레이션 문장 경계 트리밍 적용
  - TTS 오디오 실제 트리밍 (`trimAudio()`) - 기존은 duration 수치만 cap
- **AI 이미지 텍스트 완전 제거**:
  - ContentPlannerService: 34개 "labeled" → visual-only 대체 (arrows, colors, icons)
  - GhibliImageService: 텍스트 제거 regex 강화 + NO TEXT 지시문
  - AI 프롬프트에 텍스트/라벨 금지 규칙 추가
- **의존성 추가**: `mathjax-full`, `sharp`, `@types/sharp`
- **테스트**: EP22 54초, 수식 6개 MathJax PNG 오버레이 성공

### Changelog v3.1.2
- **수식 스타일**: 노란 글씨+검정 배경 → 흰색 글씨+투명 배경 (일러스트와 자연스러운 블렌딩)
- **적응형 수식 크기**: LaTeX 길이 기반 동적 크기 (짧은 수식 40%, 중간 55%, 긴 수식 70%)
- **드롭쉐도우**: 투명 배경 수식 가독성을 위한 FFmpeg 그림자 효과
- **이미지 한국어 텍스트**: DIAGRAM_STYLE_PREFIX, GHIBLI_STYLE_PREFIX, buildStyledPrompt에 "No English text" 지시 추가
- **설명 씬 프롬프트**: enhanceExplanationPrompt에 "(labels in Korean)" 추가

### Changelog v3.0.0
- **Neo4j contentType 아키텍처**: 문서 업로드 시 AI(Gemini Flash)가 분야를 1회 판별하여 Neo4j Document 노드에 캐싱
- **ContentType 분류**: `'math_science' | 'humanities' | 'social_science' | 'auto'` - 문서별 1개 타입
- **Neo4jService 확장**: `getDocumentContentType()`, `setDocumentContentType()` - Document 노드에 contentType 속성 읽기/쓰기
- **AI 기반 분야 판별**: `detectDocumentContentType(chunks)` - Gemini Flash로 청크 샘플 분석, 키워드 기반 fallback (score >= 2)
- **분야별 프롬프트 가이드**: 각 contentType에 맞는 나레이션/시각화 템플릿 자동 적용
  - `math_science`: 수식 비유, 인포그래픽 시각화
  - `humanities`: 스토리텔링 ("그때 무슨 일이 있었냐면요..."), 역사/철학/문학 시각화
  - `social_science`: 일상 비유 ("편의점에서 과자 살 때..."), 경제/심리/사회 시각화
- **동화책 일러스트 스타일**: 모든 visualPrompt에 "Children's book illustration, soft watercolor, whimsical storybook" 형식 적용
- **BooksRouter /curriculum 플로우**: Neo4j 캐시 확인 → AI 판별 → 저장 → ContentPlanner에 전달
- **수식 오버레이 상단 배치**: mathFormulaPosition: 'top' (기존 center)

### Changelog v2.9.1
- **BOOKS_PROJECT_CONFIG**: BooksVideoService에 프로젝트별 중앙 설정 도입 (orientation, language, subtitleYPosition, enableMathFormulas, mathFormulaPosition, reuseImageForSameType)
- **자막 위치 수정**: `subtitleYPosition: 'h*0.88'`로 하단 자막 배치 (Books 프로젝트만, Cat/News 영향 없음)
- **SubtitleFilter 수정**: `createSubtitleFilter()`와 `createSimplifiedSubtitleFilter()` 모두 `config.yPosition` 반영. 기존에 simplified 버전(30+ drawtext 필터 시 사용)은 `h*0.55` 하드코딩이었으나 이제 config 우선 적용
- **수식-나레이션 정렬 (ContentPlannerService)**: `getMathContentGuide()` "action alignment" 원칙으로 재작성. 비유의 동작이 수식의 동작과 일치해야 함 (예: 입술 복원 수식 -> 거울 립싱크 체크 비유). CVA 접근법 적용
- **이미지 재사용 (BooksRouter)**: `generateSceneImages()` 헬퍼 메서드 추출, streak-limited reuse (연속 동일 sceneType은 이미지 재사용, streak=1 제한)
- **MathFormulaService**: CodeCogs 렌더링 색상 변경 - 노란색 텍스트 + 검정 배경 (기존 흰색 텍스트 + 투명 배경)
- **커리큘럼 재생성**: 18개 에피소드 삭제 후 ICS 프레임워크로 재생성 (13 에피소드, 117 씬, 모두 ICS visualDescs 포함)
- **수학 수식 활성화**: `enableMathFormulas: true` + 노란 텍스트/검정 배경 (CodeCogs)

### Changelog v2.9.0
- **ICS 시각화 프레임워크**: buildDetailedEpisodePrompt()에 Image Type + Content + Style 가이드 추가
- **다이어그램 자동 감지**: GhibliImageService.isDiagramPrompt() - infographic/diagram/flowchart 키워드 감지
- **DIAGRAM_STYLE_PREFIX**: 다이어그램 씬 전용 스타일 (캐릭터 제외)
- **Reference 오염 방지**: 다이어그램 씬은 캐릭터 reference로 저장하지 않음
- **이모지 제거**: 전체 서비스 파일 logger/코드에서 이모지 제거

### Changelog v2.5.0
- **Neo4j 트랜잭션 수정**: `createEpisodeWithScenes()` 추가 - Episode + Scenes 단일 트랜잭션 생성
- **TTS 안정화**: Gemini TTS 프롬프트 수정 - 나레이션 텍스트가 명령으로 오해되는 문제 해결
- **테스트 성공**: Episode 16-19 전체 비디오 생성 완료
