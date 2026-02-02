# YTB-Books-Project README INDEX

> AI가 진행 상황을 파악하기 위한 README 모음
> Last Updated: 2026-02-02
> Version: **v3.2.4 수식 적응형 스케일링 + TTS 정합 + 이미지 다양성**

---

## 프로젝트 진행 상황 요약

| Phase | 상태 | 설명 |
|-------|:----:|------|
| Phase 1: 핵심 기능 | ✅ | Neo4j, AI 분석, 이미지 생성 |
| Phase 2: 시리즈 연속성 | ✅ | Episode/Scene CRUD + API 완료 |
| Phase 3: 영상 생성 | ✅ | GhibliImage → TTS → FFmpeg 파이프라인 |
| Phase 4: 자동화 | 🔄 | n8n 워크플로우 v3 완료, YouTube 토큰 갱신 필요 |

---

## 🔥 현재 상태 (2026-02-02)

### v3.2.4 주요 변경
- **수식 크기 적응형 스케일링** (짧은 수식 25%, 긴 수식 85%)
- **수식 위치 최상단 1%** (기존 25%)
- **TTS 나레이션 30자/씬** (기존 50자 → TTS 잘림 문제 해결)
- **이미지 다양성**: enhanceExplanationPrompt 획일화 제거
- EP21: 55.8초, 수식 6개
- EP22: 56.7초, 수식 5개

### Cloud Run 테스트 결과 (2026-01-28) ✅

### Cloud Run 테스트 결과 ✅
> 2026-01-28 기준
| 항목 | 결과 |
|------|------|
| Neo4j 연결 | ✅ 844 노드 |
| Episode 통계 | 49개 (완료: 34, draft: 15) |
| 비디오 생성 | ✅ Episode 9 완료 (6.29초) |
| GCS 업로드 | ✅ `gs://dkdk-474008-short-videos/videos/` |

### n8n 워크플로우 v3 ✅
- **파일**: `workflows/IMPORT_THIS_incremental-shorts-v3.json`
- **방식**: 점진적 생성 (매시간 1개씩)
- **장점**: 안정적, 실패해도 다음 실행에서 이어감

### YouTube 토큰 상태 ⚠️
| 채널 | 상태 |
|------|------|
| `clickaround` | ❌ 갱신 필요 |
| `why_cat` | ❌ 갱신 필요 |
| `red_news` | ✅ OK |
| `blue_news` | ❌ 삭제됨 |
| `blue_news_2` | ✅ OK |

**토큰 갱신 가이드**: `docs/Update/YOUTUBE_TOKEN_UPDATE.md`

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
| `Neo4jService.ts` | ✅ | Neo4j 연결, Episode/Scene CRUD, contentType 캐싱 |
| `ContentPlannerService.ts` | ✅ | AI 분석 (Gemini) → ShortsPlan + ELI5 + ICS 시각화 + 분야별 가이드 |
| `GhibliImageService.ts` | ✅ | GPT + NanoBanana 하이브리드 + 다이어그램 감지 |
| `BooksVideoService.ts` | ✅ | TTS + FFmpeg 비디오 + BOOKS_PROJECT_CONFIG |
| `MathFormulaService.ts` | ✅ | LaTeX → MathJax v4 PNG (흰색 텍스트, 반투명 배경, 적응형 크기) |

### API
| 파일 | 상태 | 핵심 기능 |
|------|:----:|----------|
| `BooksRouter.ts` | ✅ | /api/books/* 엔드포인트 |

### Types
| 파일 | 상태 | 핵심 기능 |
|------|:----:|----------|
| `index.ts` | ✅ | Episode, Scene, 전체 타입 |

---

## 최근 변경 사항

### v3.2.4 업데이트 (2026-02-02) - 수식 적응형 스케일링 + TTS 정합 + 이미지 다양성 + 자막 싱크

#### 1. 수식 크기 적응형 스케일링 (VideoEditor.ts)
- 기존: 모든 수식 PNG를 화면 85%로 확대 → β 같은 짧은 수식이 거대하게 나옴
- 수정: pngWidth 기반 4단계 (25%/40%/60%/85%)
- PNG overlay + drawtext fallback 모두 적용

#### 2. 수식 위치 최상단 1% (VideoEditor.ts)
- 기존 25% → 1%로 이동 (최상단 배치)
- 자막(88%)과 최대한 분리

#### 3. TTS 나레이션 길이-시간 정합 (BooksVideoService.ts)
- maxNarrationLength: 50→30 (한국어 ~4자/초, 6초≈24자)
- 기존: 50자→TTS 12초→6초 잘림→나레이션 절반만 재생
- 수정: 30자→TTS ~7초→6초 약간 트림 또는 자연 완료

#### 4. 이미지 다양성 개선 (BooksRouter.ts)
- enhanceExplanationPrompt: 획일적 "infographic on cream background" 변환 제거
- 원래 visualDesc 유지 + 교육적 힌트만 추가

#### 5. 자막-음성 싱크 개선 (BooksVideoService.ts)
- captionDuration = min(ttsDuration, effectiveDuration) → 실제 TTS 길이에 맞춤
- 기존: 씬 전체 duration으로 자막 분배 → 음성과 불일치

---

### v3.1.0 업데이트 (2026-01-31) - 수식 설명 품질 개선 + 모듈화

#### 1. BookChunk latexFormulas 전달 파이프라인
- BookChunk 타입에 `latexFormulas`, `sectionTitle` 필드 추가
- Neo4jService.getChunks()에서 latexFormulas 반환
- 커리큘럼 생성 시 AI에게 실제 LaTeX 수식 + 주변 맥락 전달

#### 2. 수식 설명 수준 변경: 5살 → 중학생
- MathFormulaService.generateFormulaAwareNarration(): 40-70자→80-150자, 5살→중학생
- ContentPlannerService: getMathContentGuide() 중학생 수준으로 변경
- buildDetailedEpisodePrompt(): 수식 변수별 의미 설명 필수 규칙 추가

#### 3. MathFormulaService 모듈화
- 새 인터페이스: FormulaWithContext (latex, name, context, variables)
- 새 메서드: extractFormulasWithContext(chunks) - 수식+맥락 추출
- 새 private 메서드: extractVariablesFromLatex() - LaTeX에서 변수 심볼 추출

#### 4. ContentPlannerService 수식 인식 커리큘럼
- extractFormulasFromChunks() 헬퍼: 청크에서 수식+컨텍스트 추출
- buildCurriculumAnalysisPrompt(): mathOrTechnical에 실제 LaTeX 포함 (name, latex, whatItDoes)
- buildDetailedEpisodePrompt(): 수식별 설명 필수 규칙 주입, relevantChunks 파라미터 추가
- analyzeAndPlanSequentialCurriculum(): combinedText에 청크별 수식 목록 추가

---

### v3.0.0 업데이트 (2026-01-30) - Neo4j contentType + 분야별 프롬프트 + 동화책 스타일

#### 1. Neo4j contentType 아키텍처 (핵심 변경)
- 문서 업로드 시 AI(Gemini Flash)가 분야를 1회 판별하여 Neo4j Document 노드에 캐싱
- `ContentType`: `'math_science' | 'humanities' | 'social_science' | 'auto'`
- Neo4jService: `getDocumentContentType()`, `setDocumentContentType()`
- BooksRouter `/curriculum`: Neo4j 캐시 확인 → AI 판별 → 저장 → ContentPlanner 전달

#### 2. 분야별 프롬프트 가이드
- `math_science`: 수식 비유, 인포그래픽 시각화 (기존 ICS 프레임워크)
- `humanities`: 스토리텔링 나레이션 ("그때 무슨 일이 있었냐면요..."), 역사/철학/문학 시각화
- `social_science`: 일상 비유 나레이션 ("편의점에서 과자 살 때..."), 경제/심리/사회 시각화

#### 3. AI 기반 문서 분류
- `detectDocumentContentType(chunks)`: Gemini Flash로 청크 샘플(첫/중간/마지막) 분석
- `detectPrimaryContentType(content)`: 키워드 기반 fallback (score >= 2, 전문 용어만)
- 한 문서에 1개 타입만 배정 (프롬프트 bloat 방지)

#### 4. 동화책 일러스트 스타일
- 모든 visualPrompt: "Children's book illustration, soft watercolor, whimsical storybook" 형식
- 수식 오버레이: mathFormulaPosition 'top' (기존 center)

---

### v2.9.1 업데이트 (2026-01-30) - BOOKS_PROJECT_CONFIG + 수식-나레이션 정렬 + 자막 수정

#### 1. BOOKS_PROJECT_CONFIG (BooksVideoService)
- 프로젝트별 중앙 설정: orientation, language, subtitleYPosition, enableMathFormulas, mathFormulaPosition, reuseImageForSameType
- `subtitleYPosition: 'h*0.88'` 하단 자막 배치 (Books만, Cat/News 영향 없음)
- `enableMathFormulas: true` + 노란 텍스트/검정 배경 (CodeCogs)
- `reuseImageForSameType: false (v3.2.3)` (streak=1 제한)

#### 2. SubtitleFilter.ts 수정
- `createSubtitleFilter()` + `createSimplifiedSubtitleFilter()` 모두 `config.yPosition` 반영
- 기존: simplified 버전(30+ drawtext 필터 시 사용)이 `h*0.55` 하드코딩
- Cat/News 프로젝트 영향 없음 (config 미설정 시 기존 값 유지)

#### 3. ContentPlannerService - 수식-나레이션 정렬 (Action Alignment)
- `getMathContentGuide()` 재작성: 비유의 동작이 수식의 동작과 일치해야 함
- 변수 기호 직접 읽기 가능 (beta, M, V_lips 등)
- CVA 접근법: 추상적이지만 정확한 비유

#### 4. BooksRouter - 이미지 재사용
- `generateSceneImages()` 헬퍼 메서드 (3곳 중복 루프 추출)
- streak-limited reuse: 연속 동일 sceneType은 이미지 재사용, streak=1 제한

#### 5. MathFormulaService - 렌더링 색상 변경
- CodeCogs: 노란색 텍스트 + 검정 배경 (기존: 흰색 텍스트 + 투명 배경)

#### 6. 커리큘럼 재생성
- 18개 에피소드 삭제, ICS 프레임워크로 재생성: 13 에피소드, 117 씬
- 모든 에피소드에 ICS visualDescs 포함

---

### v2.9.0 업데이트 (ICS 시각화 프레임워크 + 다이어그램 감지)

#### 1. ContentPlannerService: ICS 프레임워크
- `buildDetailedEpisodePrompt()`에 visualPrompt 작성 가이드 추가
- ICS 프레임워크: Image Type + Content (labeled components) + Style
- 분야별 템플릿: 수학/공식, 기술/AI, 비교, 역사, 철학/추상
- `getMathContentGuide()` 수식 유형별 시각화 가이드 연동
- 수학/LaTeX 콘텐츠 자동 감지 (hasMathContent, hasLatexInContent)

#### 2. GhibliImageService: 다이어그램 자동 감지
- `isDiagramPrompt()` 키워드 감지 (infographic, diagram, flowchart 등)
- `DIAGRAM_STYLE_PREFIX` 추가 (캐릭터 제외, 교육 인포그래픽 중심)
- `buildStyledPrompt()` 리팩터 (isDiagram 파라미터)
- 다이어그램 씬은 reference 이미지 저장하지 않음 (캐릭터 오염 방지)

#### 3. 전체 서비스 이모지 제거
- ContentPlannerService, GhibliImageService, BooksVideoService, Neo4jService, MathFormulaService

---

### v2.5.0 업데이트 (순차적 커리큘럼 + Neo4j 수정 + TTS 안정화) ✅

#### 🆕 1. 순차적 커리큘럼 API (`/curriculum`) - 핵심 변경!

**문제**: 기존 `/entities`는 에피소드가 독립적 → 연결성 없음, 수학 설명 부족

**해결**: 새 `/curriculum` 엔드포인트 추가
```bash
# 순차적 커리큘럼 기반 에피소드 생성 (권장)
curl -X POST .../api/books/AR_TALK.pdf/curriculum \
  -d '{"saveToNeo4j": true, "forceRefresh": true}'
```

| 기능 | /entities (기존) | /curriculum (신규) |
|------|-----------------|-------------------|
| 에피소드 연결 | ❌ 독립적 | ✅ "지난 시간에..." |
| 수학/기술 설명 | 표면적 | ✅ 상세 필수 |
| 학습 순서 | 랜덤 | ✅ 기초→심화 |

**ContentPlannerService 변경**:
```typescript
// 기존: analyzeAndPlanByEntityClusters() - 엔티티별 독립 생성
// 신규: analyzeAndPlanSequentialCurriculum() - 순차적 커리큘럼 생성
const plan = await planner.analyzeAndPlanSequentialCurriculum(bookId, title, chunks);
```

#### 2. Neo4j 트랜잭션 타이밍 이슈 해결

- **문제**: `createEpisode()` 후 "Episode not found" 에러
- **해결**: `createEpisodeWithScenes()` - 단일 트랜잭션
- **추가**: `linkEpisodes()` - 에피소드 간 연결

#### 3. Gemini TTS 400 에러 해결

- **문제**: 나레이션이 명령으로 오해됨
- **해결**: TTS 프롬프트 프리픽스 추가

#### 4. 테스트 결과
- Episode 16-19 전체 비디오 생성 완료 (74MB, 9개 영상)
- 로컬 다운로드: `downloads/books/`

---

### v2.3 업데이트 (ELI5 쉬운 설명) ✅

**어려운 책/논문/수학/철학 내용을 쉽게 설명**하는 AI 프롬프트 적용

1. **ContentPlannerConfig 확장**
   ```typescript
   audienceLevel?: 'elementary' | 'general' | 'professional';
   useELI5Style?: boolean;  // default: true
   ```

2. **대상 청중 레벨**
   - `elementary`: 초등학생도 이해 가능
   - `general`: 일반 성인 (기본값)
   - `professional`: 전문가/학술 수준

3. **ELI5 스타일 규칙 자동 적용**
   - 전문 용어 → 괄호 안 쉬운 설명
   - 비유와 예시 필수
   - 수학/과학 공식 → 의미 중심 설명
   - 철학/인문학 개념 → 일상 상황으로 풀이

4. **API 사용법**
   ```bash
   curl -X POST http://localhost:3124/api/books/AR_TALK.pdf/analyze \
     -H "Content-Type: application/json" \
     -d '{"audienceLevel": "elementary", "useELI5Style": true}'
   ```

5. **n8n 워크플로우 업데이트** (`workflows/IMPORT_THIS_books-to-shorts.json`)
   - "5. AI 분석 (Gemini)" 노드에 ELI5 파라미터 추가
   ```json
   {
     "style": "ghibli",
     "maxShorts": 5,
     "maxScenes": 6,
     "audienceLevel": "general",
     "useELI5Style": true
   }
   ```
   - n8n에서 워크플로우 재임포트 필요

---

### v2.2 업데이트 (Phase 3: 비디오 생성) - 테스트 완료 ✅
1. **BooksRouter Phase 3 API** (`src/api/BooksRouter.ts`)
   - `POST /episodes/:episodeId/generate-video` - Episode → 비디오 생성
   - `POST /episodes/:episodeId/generate-images` - Episode → 이미지만 생성

2. **비디오 생성 파이프라인**
   - GhibliImageService: GPT-4o + NanoBanana 하이브리드 이미지
   - BooksVideoService: GeminiTTS + FFmpeg 비디오 합성
   - Neo4j 상태 추적: approved → producing → completed

3. **FFmpeg 수정 (2026-01-23)**
   - **문제**: 8개 이미지 동시 concat 시 "Error reinitializing filters" 오류
   - **원인**: FFmpeg 필터 복잡도 제한 (stream #7:0에서 실패)
   - **해결**: 개별 scene 비디오 생성 → concat → 오디오+자막 합성
   ```typescript
   // BooksVideoService.ts - 수정된 접근법
   // Step 2-1: 각 이미지를 개별 scene 비디오로 변환
   for (let i = 0; i < imagePaths.length; i++) {
     await this.ffmpeg.createStaticVideoFromImage(imagePaths[i], sceneVideoPath, duration);
   }
   // Step 2-2: scene 비디오들을 concat (stream copy로 빠르게)
   await this.ffmpeg.concatVideos(sceneVideoPaths, tempVideoPath);
   ```

4. **테스트 결과 (AR_TALK.pdf)**
   | 항목 | 결과 |
   |------|------|
   | 총 길이 | 54초 |
   | 씬 수 | 8개 |
   | 자막 수 | 16개 |
   | 파일 크기 | 8.6MB |
   | 해상도 | 1080x1920 (Portrait) |
   | TTS | Gemini Kore (한국어) |
   | 이미지 | GPT(1장) + NanoBanana(7장) |

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

### Phase 4: 자동화 (진행 중) 🔄
- [x] n8n 워크플로우 v3 생성 (점진적 생성 방식)
- [x] Cloud Run 비디오 생성 테스트 완료
- [x] ICS 시각화 프레임워크 + 다이어그램 감지 (v2.9.0)
- [x] BOOKS_PROJECT_CONFIG + 수식-나레이션 정렬 + 자막 수정 (v2.9.1)
- [x] Neo4j contentType + 분야별 프롬프트 + 동화책 스타일 (v3.0.0)
- [x] 수식 설명 품질 개선 + 모듈화 (v3.1.0)
- [x] FFmpeg ENAMETOOLONG 수정 (v3.1.1)
- [x] MathJax v4 수식 렌더링 + 영상 60초 제한 (v3.2.0)
- [x] 수식 배경 GhibliImageService + 크기/위치 개선 (v3.2.2)
- [x] 이미지 다양성 + 수식 풍부화 + 마지막 끊김 수정 (v3.2.3)
- [x] 수식 적응형 스케일링 + TTS 30자 정합 + 이미지 다양성 (v3.2.4)
- [ ] YouTube 토큰 갱신 (clickaround/why_cat)
- [ ] n8n에 워크플로우 Import 및 활성화
- [ ] 24시간 자동 실행 테스트

**n8n 워크플로우 v3 특징:**
```
매시간 실행 → Episode 통계 확인 → 미완료 있으면 1개 생성 → YouTube 업로드
```
- 파일: `workflows/IMPORT_THIS_incremental-shorts-v3.json`
- API: `POST /api/books/generate-next-episode`

---

## 관련 외부 문서

| 문서 | 경로 | 설명 |
|------|------|------|
| CLAUDE.md | `../../CLAUDE.md` | 프로젝트 전체 컨텍스트 |
| **YTB-tts/README.md** | `../../YTB-tts/README.md` | TTS 모듈 (한국어/영어 지원) |
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

# Phase 3: Episode 비디오 생성 (한국어)
curl -X POST http://localhost:3124/api/books/episodes/{episodeId}/generate-video \
  -H "Content-Type: application/json" \
  -d '{"config":{"orientation":"portrait","language":"ko"}}'

# Phase 3: Episode 비디오 생성 (영어)
curl -X POST http://localhost:3124/api/books/episodes/{episodeId}/generate-video \
  -H "Content-Type: application/json" \
  -d '{"config":{"orientation":"portrait","language":"en"}}'

# Phase 3: Episode 이미지만 생성
curl -X POST http://localhost:3124/api/books/episodes/{episodeId}/generate-images \
  -H "Content-Type: application/json" \
  -d '{"config":{"orientation":"portrait","mood":"whimsical"}}'
```

---

**이 파일을 먼저 읽으면 프로젝트 전체 구조와 진행 상황을 파악할 수 있습니다.**
