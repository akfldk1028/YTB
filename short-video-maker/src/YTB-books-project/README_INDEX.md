# YTB-Books-Project README INDEX

> AI가 진행 상황을 파악하기 위한 README 모음
> Last Updated: 2026-01-23
> Version: **v2.2 Phase 3 비디오 생성 파이프라인 완료**

---

## 프로젝트 진행 상황 요약

| Phase | 상태 | 설명 |
|-------|:----:|------|
| Phase 1: 핵심 기능 | ✅ | Neo4j, AI 분석, 이미지 생성 |
| Phase 2: 시리즈 연속성 | ✅ | Episode/Scene CRUD + API 완료 |
| Phase 3: 영상 생성 | ✅ | GhibliImage → TTS → FFmpeg 파이프라인 |
| Phase 4: 자동화 | 🔜 | n8n 워크플로우, 24시간 Cron |

---

## README 파일 목록

### 프로젝트 루트
| 파일 | 경로 | 설명 |
|------|------|------|
| **README.md** | `./README.md` | 퀵 스타트 가이드, API 사용법 |
| **README_INDEX.md** | `./README_INDEX.md` | 이 파일 (목차) |

### Architecture
| 파일 | 경로 | 설명 |
|------|------|------|
| FULL_ARCHITECTURE.md | `./Architecture/FULL_ARCHITECTURE.md` | 전체 시스템 아키텍처 v2.0 |
| Architecture.md | `./Architecture/Architecture.md` | 상세 아키텍처 v1.4.0 |
| Neo4j-Setup-Guide.md | `./Architecture/Neo4j-Setup-Guide.md` | Neo4j 설정 가이드 |

### Source Code (src/)
| 파일 | 경로 | 설명 |
|------|------|------|
| **services/README.md** | `./src/services/README.md` | 서비스 계층 (Neo4j, AI, 이미지) |
| **api/README.md** | `./src/api/README.md` | API 엔드포인트 |
| **types/README.md** | `./src/types/README.md` | 타입 정의 (Episode/Scene) |

---

## 주요 코드 파일

### Services
| 파일 | 상태 | 핵심 기능 |
|------|:----:|----------|
| `Neo4jService.ts` | ✅ | Neo4j 연결, Episode/Scene CRUD |
| `ContentPlannerService.ts` | ✅ | AI 분석 (Gemini) → ShortsPlan |
| `GhibliImageService.ts` | ✅ | GPT + NanoBanana 하이브리드 |
| `BooksVideoService.ts` | 🔄 | TTS + FFmpeg 비디오 |

### API
| 파일 | 상태 | 핵심 기능 |
|------|:----:|----------|
| `BooksRouter.ts` | ✅ | /api/books/* 엔드포인트 |

### Types
| 파일 | 상태 | 핵심 기능 |
|------|:----:|----------|
| `index.ts` | ✅ | Episode, Scene, 전체 타입 |

---

## 최근 변경 사항 (2026-01-23)

### v2.2 업데이트 (Phase 3: 비디오 생성)
1. **BooksRouter Phase 3 API** (`src/api/BooksRouter.ts`)
   - `POST /episodes/:episodeId/generate-video` - Episode → 비디오 생성
   - `POST /episodes/:episodeId/generate-images` - Episode → 이미지만 생성

2. **비디오 생성 파이프라인**
   - GhibliImageService: GPT-4o + NanoBanana 하이브리드 이미지
   - BooksVideoService: GeminiTTS + FFmpeg 비디오 합성
   - Neo4j 상태 추적: approved → producing → completed

### v2.1 업데이트 (Episode/Scene API)
1. **BooksRouter Episode/Scene API** (`src/api/BooksRouter.ts`)
   - `GET /episodes/stats` - Episode/Scene 통계
   - `GET /episodes/pending` - 다음 처리할 Episode
   - `GET /episodes/:episodeId` - 에피소드 상세
   - `PUT /episodes/:episodeId/status` - 상태 업데이트
   - `GET /:bookId/series` - 시리즈 전체 조회
   - `GET /:bookId/episodes` - 에피소드 목록
   - `POST /:bookId/episodes` - 에피소드 생성 (Plan→자동)

### v2.0 업데이트
1. **Episode/Scene 타입 추가** (`src/types/index.ts`)
   - Episode, Scene, EpisodeWithScenes, DocumentSeries
   - CreateEpisodeInput, CreateSceneInput
   - EpisodeStatus, SceneType, VisualType, CameraType, TransitionType

2. **Neo4jService Episode/Scene CRUD** (`src/services/Neo4jService.ts`)
   - createEpisode(), createScene()
   - getEpisode(), getEpisodeWithScenes()
   - getDocumentEpisodes(), getDocumentSeries()
   - updateEpisodeStatus(), updateSceneAssets()
   - getNextPendingEpisode(), getEpisodeStats()

3. **README 파일 추가**
   - src/services/README.md
   - src/api/README.md
   - src/types/README.md
   - README_INDEX.md (이 파일)

---

## 다음 단계 (TODO)

### Phase 2 완료 (v2.1) ✅
- [x] BooksRouter에 Episode/Scene API 엔드포인트 추가
- [x] POST /:bookId/episodes - ShortsPlan → Episode/Scene 자동 생성
- [x] 시리즈 연속성 (previousEpisodeId 연결)
- [x] Episode/Scene API 통합 테스트 완료

### Phase 3 완료 (v2.2) ✅
- [x] POST /episodes/:episodeId/generate-video - 비디오 생성 API
- [x] POST /episodes/:episodeId/generate-images - 이미지 생성 API
- [x] GhibliImageService → Scene별 이미지 생성
- [x] BooksVideoService → TTS + FFmpeg 합성
- [x] Neo4j 상태 추적 (approved → producing → completed)

### Phase 4: 자동화 (다음)
- [ ] n8n 워크플로우 생성
- [ ] 24시간 Cron 설정
- [ ] GCS 감시 → 자동 처리
- [ ] YouTube 자동 업로드

---

## 관련 외부 문서

| 문서 | 경로 | 설명 |
|------|------|------|
| CLAUDE.md | `../../CLAUDE.md` | 프로젝트 전체 컨텍스트 |
| SHORTS_FROM_DOCUMENT_DESIGN.md | `D:\Data\00_Personal\YTB\NEB\docs\` | Episode/Scene 스키마 설계 |
| N8N_WORKFLOW_GUIDE.md | `D:\Data\00_Personal\YTB\NEB\docs\` | n8n 워크플로우 가이드 |

---

## 빠른 테스트 명령어

```bash
# 서버 시작
cd D:\Data\00_Personal\YTB\short-video-maker
npm start

# 연결 테스트
curl http://localhost:3124/api/books/connection

# AI 분석 → ShortsPlan 생성
curl -X POST http://localhost:3124/api/books/AR_TALK.pdf/analyze \
  -H "Content-Type: application/json" \
  -d '{"episodeCount": 1}'

# Episode 자동 생성 (ShortsPlan → Neo4j)
curl -X POST http://localhost:3124/api/books/AR_TALK.pdf/episodes \
  -H "Content-Type: application/json" \
  -d '{"fromPlan": true}'

# Episode/Scene 통계
curl http://localhost:3124/api/books/episodes/stats

# 시리즈 조회
curl http://localhost:3124/api/books/AR_TALK.pdf/series

# 이미지 생성 테스트
curl -X POST http://localhost:3124/api/gpt-to-nanobanana/generate \
  -H "Content-Type: application/json" \
  -d '{"character":{"description":"A ghibli cat"},"scenes":[{"text":"Cat in forest"}]}'

# Phase 3: Episode 비디오 생성
curl -X POST http://localhost:3124/api/books/episodes/{episodeId}/generate-video \
  -H "Content-Type: application/json" \
  -d '{"config":{"orientation":"portrait","ttsVoice":"Kore"}}'

# Phase 3: Episode 이미지만 생성
curl -X POST http://localhost:3124/api/books/episodes/{episodeId}/generate-images \
  -H "Content-Type: application/json" \
  -d '{"config":{"orientation":"portrait","mood":"whimsical"}}'
```

---

**이 파일을 먼저 읽으면 프로젝트 전체 구조와 진행 상황을 파악할 수 있습니다.**
