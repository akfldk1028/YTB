# PDF → Shorts 자동 생성 아키텍처

## 개요

PDF 문서(책, 논문 등)를 입력받아 AI가 자동으로 여러 개의 YouTube Shorts를 생성하는 시스템.
**핵심**: 하나의 PDF → 여러 Shorts, 각 Short → 여러 Scenes, 캐릭터 동일성 유지

---

## 전체 파이프라인

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PDF → Shorts Pipeline                        │
└─────────────────────────────────────────────────────────────────────┘

[PDF 입력]
    │
    ▼
┌─────────────────────────────────────┐
│  NEB (llm-graph-builder)            │  ← D:\Data\00_Personal\YTB\NEB
│  - PDF 파싱                          │  ← Python 서비스 (로컬/별도 배포)
│  - 청킹 (Chunking)                   │
│  - 그래프 구축                        │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Neo4j Database                     │  ← VM: 34.47.112.49
│  - 청크 저장                         │
│  - 관계 그래프                        │
│  - 벡터 임베딩                        │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  AI 콘텐츠 분석 (Gemini/GPT)         │
│  - 숏츠 개수 결정                     │
│  - Scene 분할                        │
│  - 나레이션/프롬프트 생성              │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  Shorts 계획 JSON                   │
│  {                                  │
│    totalShorts: 5,                  │
│    character: {...},                │
│    shorts: [{scenes: [...]}]        │
│  }                                  │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  이미지 생성 (캐릭터 동일성)           │
│                                     │
│  Short 1, Scene 1: GPT-4o (Master)  │  ← 캐릭터 확립
│  Short 1, Scene 2~N: NanoBanana     │  ← Master 레퍼런스 사용
│  Short 2~N: NanoBanana              │  ← 동일 Master 재사용
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  영상 생성 (VEO 3/3.1)              │
│  - 이미지 → 영상                     │
│  - 자막/나레이션 추가                 │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  YouTube 업로드                      │
│  - 순차 또는 예약 업로드              │
│  - 시리즈 플레이리스트                │
└─────────────────────────────────────┘
```

---

## 캐릭터 동일성 유지 전략

### 문제
- 여러 Shorts (5~10개)
- 각 Short에 여러 Scenes (3~8개)
- 총 수십 개의 이미지에서 **같은 캐릭터 유지**

### 해결책: GPT-First + NanoBanana

```
┌──────────────────────────────────────────────────────────────┐
│  Short 1                                                      │
│  ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐          │
│  │ Scene1 │ → │ Scene2 │ → │ Scene3 │ → │ Scene4 │          │
│  │ GPT-4o │   │ Nano   │   │ Nano   │   │ Nano   │          │
│  │ MASTER │   │        │   │        │   │        │          │
│  └────┬───┘   └────────┘   └────────┘   └────────┘          │
│       │                                                       │
│       │ Master Reference 저장 (GCS)                          │
│       ▼                                                       │
└──────────────────────────────────────────────────────────────┘
       │
       │ 동일 Master Reference 재사용
       ▼
┌──────────────────────────────────────────────────────────────┐
│  Short 2                                                      │
│  ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐          │
│  │ Scene1 │ → │ Scene2 │ → │ Scene3 │ → │ Scene4 │          │
│  │ Nano   │   │ Nano   │   │ Nano   │   │ Nano   │          │
│  │+Master │   │        │   │        │   │        │          │
│  └────────┘   └────────┘   └────────┘   └────────┘          │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
   Short 3, 4, 5... (동일 패턴)
```

### 장점
- GPT-4o는 **1번만 호출** (비용 절감, ~45초)
- NanoBanana는 빠름 (~10초/장)
- Master Reference를 GCS에 저장하여 세션 간 재사용 가능

---

## 데이터 모델

### BookProject
```typescript
interface BookProject {
  bookId: string;              // 고유 ID
  title: string;               // 책 제목
  pdfPath: string;             // 원본 PDF 경로 (GCS)
  neo4jGraphId: string;        // Neo4j 그래프 ID

  character: {
    description: string;       // 캐릭터 설명 (프롬프트용)
    style: 'ghibli' | 'anime' | 'realistic';
    masterImagePath: string;   // GCS: books/{bookId}/character_master.png
  };

  shorts: ShortPlan[];
  status: 'uploading' | 'ingesting' | 'planning' | 'generating' | 'completed';

  createdAt: Date;
  updatedAt: Date;
}
```

### ShortPlan
```typescript
interface ShortPlan {
  shortIndex: number;          // 0, 1, 2, ...
  title: string;               // Short 제목
  description: string;         // YouTube 설명

  scenes: ScenePlan[];

  generatedVideoPath?: string; // 생성된 영상 경로
  youtubeVideoId?: string;     // 업로드된 YouTube ID
  status: 'pending' | 'generating' | 'completed' | 'uploaded';
}
```

### ScenePlan
```typescript
interface ScenePlan {
  sceneIndex: number;          // 0, 1, 2, ...
  narrationText: string;       // 나레이션 텍스트 (TTS용)
  visualPrompt: string;        // 이미지 생성 프롬프트

  generatedImagePath?: string; // 생성된 이미지 경로
  generatedVideoPath?: string; // 생성된 영상 클립 경로
}
```

---

## API 엔드포인트

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/books/upload` | PDF 업로드 → NEB 전송 |
| `GET` | `/api/books/:bookId/status` | 청킹/처리 상태 확인 |
| `POST` | `/api/books/:bookId/plan` | AI가 Shorts 계획 생성 |
| `GET` | `/api/books/:bookId/plan` | 생성된 계획 조회 |
| `PUT` | `/api/books/:bookId/plan` | 계획 수정 (수동 조정) |
| `POST` | `/api/books/:bookId/generate` | 계획 기반 Shorts 생성 시작 |
| `GET` | `/api/books/:bookId/shorts` | 생성된 Shorts 목록 |
| `POST` | `/api/books/:bookId/upload-youtube` | YouTube 일괄 업로드 |

---

## 서비스 구조

```
src/YTB-books-project/
├── services/
│   ├── BookIngestionService.ts    # PDF → NEB → Neo4j
│   ├── ContentPlannerService.ts   # Neo4j 쿼리 → Shorts 계획
│   ├── BookShortsWorkflow.ts      # 계획 → 이미지/영상 생성
│   └── BookStorageService.ts      # GCS 저장 관리
├── routes/
│   └── booksRouter.ts             # API 라우트
├── types/
│   └── books.ts                   # 타입 정의
└── README.md
```

---

## 통합 포인트

### 1. NEB (llm-graph-builder)
- **위치**: `D:\Data\00_Personal\YTB\NEB`
- **역할**: PDF 파싱 + 청킹 + Neo4j 저장
- **통합 방법**:
  - Option A: HTTP API (별도 서버 배포)
  - Option B: Python subprocess (로컬 실행)

### 2. Neo4j
- **VM**: 34.47.112.49
- **드라이버**: `neo4j-driver` (npm)
- **역할**: 청크 저장, 관계 쿼리, 벡터 검색

### 3. GPT-to-NanoBanana
- **엔드포인트**: `/api/gpt-to-nanobanana/generate`
- **역할**: 캐릭터 동일성 이미지 생성
- **서비스**: `GPTImageService`, `NanoBananaService`

### 4. ConsistentShortsWorkflow
- **기존 워크플로우 확장**
- **역할**: 이미지 → VEO 영상 → 자막 → 최종 영상

---

## 예상 처리 시간

| 단계 | 예상 시간 |
|------|----------|
| PDF 업로드 + NEB 청킹 | 2~5분 (PDF 크기에 따라) |
| AI 계획 생성 | 30초~1분 |
| 캐릭터 Master 이미지 (GPT) | ~45초 |
| Scene 이미지 (NanoBanana) | ~10초/장 |
| VEO 영상 생성 | ~30초/Scene |
| 최종 영상 합성 | ~1분/Short |

**예시**: 5 Shorts × 5 Scenes = 25 이미지
- Master 이미지: 45초
- NanoBanana: 24장 × 10초 = 240초 (4분)
- VEO: 25장 × 30초 = 750초 (12.5분)
- 총 예상: **~20분**

---

## 향후 확장

1. **다중 캐릭터 지원**: 책에 여러 등장인물 → 각각 Master Reference
2. **스타일 선택**: 지브리 외 다양한 스타일
3. **언어 지원**: 영어/한국어/일본어 나레이션
4. **시리즈 관리**: 책 시리즈 → YouTube 플레이리스트 자동 생성

---

## PDF 업로드 가이드 (NEB 사용법)

### 사전 요구사항

1. **Neo4j VM 실행 중**: `34.47.112.49:7687`
2. **NEB Docker 실행**: 로컬에서 `docker-compose up`

### Step 1: NEB 실행

```bash
# NEB 폴더로 이동
cd D:\Data\00_Personal\YTB\NEB

# Docker Compose 실행
docker-compose up -d

# 실행 확인
curl http://localhost:8000/health
```

### Step 2: PDF 업로드 (웹 UI)

1. 브라우저에서 `http://localhost:8080` 접속
2. **New Connection** → Neo4j 연결 설정:
   - URI: `bolt://34.47.112.49:7687`
   - Username: `neo4j`
   - Password: `ytbbooks2026`
3. **Upload** → PDF 파일 선택
4. **Extract** → 청킹 + 그래프 생성 시작
5. 완료될 때까지 대기 (파일 크기에 따라 1~5분)

### Step 3: 청킹 결과 확인

```bash
# Neo4j 연결 테스트
cd D:\Data\00_Personal\YTB\short-video-maker
npx ts-node src/YTB-books-project/scripts/test-neo4j.ts
```

### NEB API (선택적)

```bash
# 직접 API 호출도 가능
# GCS에서 PDF 가져오기
curl -X POST http://localhost:8000/url/scan \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "https://storage.googleapis.com/bucket/path/to/file.pdf",
    "source_type": "url"
  }'
```

---

## 다중 PDF 관리 전략

### 저장 구조

```
GCS: gs://dkdk-474008-short-videos/books/
├── book_1705829123456/
│   ├── metadata.json       # 메타데이터 (제목, 저자, 카테고리)
│   ├── original.pdf        # 원본 PDF
│   ├── character_master.png # 캐릭터 이미지 (생성 후)
│   └── shorts/
│       ├── short_001/
│       │   ├── plan.json
│       │   ├── scene_001.png
│       │   └── final.mp4
│       └── ...
├── book_1705829234567/
│   └── ...
└── index.json              # 전체 책 목록 인덱스
```

### metadata.json 구조

```json
{
  "bookId": "book_1705829123456",
  "title": "AR Talk: Speech-Driven 3D Head Animation",
  "author": "XUANGENG CHU et al.",
  "category": "paper",
  "tags": ["AI", "3D", "Animation", "Speech"],
  "language": "en",

  "neo4j": {
    "fileName": "AR_TALK.pdf",
    "chunkCount": 20,
    "entityCount": 198
  },

  "character": {
    "description": "A friendly robot professor explaining AI concepts",
    "style": "ghibli",
    "masterImagePath": "books/book_xxx/character_master.png"
  },

  "shorts": {
    "planned": 5,
    "completed": 0,
    "status": "planning"
  },

  "createdAt": "2026-01-20T12:46:00Z",
  "updatedAt": "2026-01-21T06:15:00Z"
}
```

### 카테고리 분류

| 카테고리 | 설명 | 예시 |
|---------|------|------|
| `paper` | 학술 논문 | arXiv, IEEE, ACM |
| `book` | 일반 도서 | 소설, 비문학 |
| `textbook` | 교과서 | 대학 교재 |
| `manual` | 매뉴얼/가이드 | 기술 문서 |
| `article` | 기사/블로그 | 웹 콘텐츠 |

---

## Neo4j 스키마 (NEB 생성)

```
(:Document {fileName, fileSource, status, total_chunks, ...})
    -[:FIRST_CHUNK]-> (:Chunk {id, text, position, embedding})
    -[:NEXT_CHUNK]-> (:Chunk)

(:Chunk) -[:HAS_ENTITY]-> (:__Entity__ :PERSON|WORK|CONCEPT|...)

(:__Entity__) -[:DIRECTED|WROTE|INSPIRED|...]-> (:__Entity__)
```

### 주요 노드/관계

| 레이블 | 설명 |
|--------|------|
| `Document` | 업로드된 PDF/문서 |
| `Chunk` | 청킹된 텍스트 블록 |
| `__Entity__` | 추출된 엔티티 (인물, 작품, 개념 등) |
| `FIRST_CHUNK` | Document → 첫 번째 Chunk |
| `NEXT_CHUNK` | Chunk → 다음 Chunk (순서) |
| `HAS_ENTITY` | Chunk → 관련 Entity |

---

## 관련 문서

- `src/YTB-books-project/README.md` - 프로젝트 상세
- `src/YTB-books-project/scripts/test-neo4j.ts` - Neo4j 연결 테스트
- `docs/Update/NEWS_CHANNEL_SETUP.md` - 뉴스 채널 설정 참조
- `CLAUDE.md` - 전체 API 엔드포인트 목록
