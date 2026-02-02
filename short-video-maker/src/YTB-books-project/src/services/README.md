# Services - 비즈니스 로직 계층

> Last Updated: 2026-01-31
> Status: **v3.1.1 FFmpeg ENAMETOOLONG 수정 + 수식 중심 설명 철학**
>
> **핵심 철학**: 논문 콘텐츠는 수학 수식과 원리 설명이 핵심. 이미지는 캐릭터 위주 또는 수식 일관성 위주로 유동 선택

---

## 구현 현황

| 서비스 | 파일 | 상태 | 설명 |
|--------|------|:----:|------|
| Neo4jService | `Neo4jService.ts` | ✅ | Neo4j 연결/쿼리 + Episode/Scene CRUD + contentType 캐싱 |
| ContentPlannerService | `ContentPlannerService.ts` | ✅ | AI 분석 (Gemini) → ShortsPlan |
| GhibliImageService | `GhibliImageService.ts` | ✅ | GPT + NanoBanana 하이브리드 이미지 |
| BooksVideoService | `BooksVideoService.ts` | ✅ | TTS + FFmpeg 비디오 생성 (테스트 완료) |
| MathFormulaService | `MathFormulaService.ts` | ✅ | 수학 수식 감지 + LaTeX → PNG 렌더링 + 수식 컨텍스트 추출 |

---

## 서비스 의존성

```
BooksRouter (API)
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
        ├── GeminiTTS
        └── FFmpeg
```

---

## Neo4jService (v3.1.0)

### contentType 캐싱 (v3.0.0 신규)
```typescript
// 문서 분야 조회 (Neo4j 캐시)
getDocumentContentType(fileName: string): Promise<string | null>

// 문서 분야 저장
setDocumentContentType(fileName: string, contentType: string): Promise<void>
```

### 기본 메서드
- `testConnection()` - 연결 테스트
- `getBooks()` - 책 목록 조회
- `getChunks(bookId)` - 청크 조회 (v3.1.0: latexFormulas, sectionTitle 포함)
- `getGraphStats()` - 통계 조회

### Shorts 상태 관리
- `getUnprocessedDocuments()` - 미처리 문서 조회
- `updateDocumentShortsStatus()` - 상태 업데이트
- `savePlan()` / `getPlan()` - ShortsPlan JSON 저장/조회

### Episode/Scene CRUD (v2.5.0 업데이트)
```typescript
// 🆕 v2.5.0: Episode + Scenes 단일 트랜잭션 생성 (타이밍 이슈 해결)
createEpisodeWithScenes(
  episodeInput: CreateEpisodeInput,
  scenesInput: Omit<CreateSceneInput, 'episodeId' | 'sceneNumber'>[]
): Promise<EpisodeWithScenes>

// Episode 생성 (Document와 연결, 이전 Episode와 NEXT 관계)
createEpisode(input: CreateEpisodeInput): Promise<Episode>

// Scene 생성 (Episode와 연결, Chunk와 BASED_ON 관계)
createScene(input: CreateSceneInput): Promise<Scene>

// 조회
getEpisode(episodeId): Promise<Episode | null>
getEpisodeWithScenes(episodeId): Promise<EpisodeWithScenes | null>
getDocumentEpisodes(documentId): Promise<Episode[]>
getDocumentSeries(documentId): Promise<DocumentSeries | null>
getLastEpisodeNumber(documentId): Promise<number>

// 상태 업데이트
updateEpisodeStatus(episodeId, status, metadata?)
updateSceneAssets(sceneId, { imagePath, audioPath, clipPath })

// 자동화용
getNextPendingEpisode(documentId?): Promise<Episode | null>
getEpisodeStats(): Promise<{...}>
```

---

## ContentPlannerService (v3.1.0 - 수식 인식 커리큘럼 + 중학생 수준)

AI (Gemini)를 사용해 청크를 분석하고 **어려운 내용을 쉽게 설명**하는 ShortsPlan 생성

### 🆕 v2.5.0 핵심: 순차적 커리큘럼 방식

```typescript
// 기존: 엔티티별 독립 생성 (연결 없음)
const plan = await planner.analyzeAndPlanByEntityClusters(neo4j, bookId);

// 신규: 순차적 커리큘럼 생성 (연결 + 상세 설명)
const plan = await planner.analyzeAndPlanSequentialCurriculum(bookId, title, chunks);
```

| 방식 | 에피소드 연결 | 수학 설명 | 학습 순서 |
|------|-------------|----------|----------|
| `analyzeAndPlanByEntityClusters` | ❌ 독립적 | 표면적 | 랜덤 |
| `analyzeAndPlanSequentialCurriculum` | ✅ 연결 | ✅ 상세 | ✅ 기초→심화 |

### 🆕 ELI5 (Explain Like I'm 5) 기능

복잡한 책/논문/수학/철학 내용을 **쉽게 설명**하는 AI 프롬프트 적용

### v3.0.0: Neo4j contentType + 분야별 프롬프트 가이드

문서 업로드 시 AI가 분야를 1회 판별하여 Neo4j에 캐싱. 이후 커리큘럼 생성 시 해당 분야에 맞는 프롬프트 가이드 적용.

- **ContentType**: `'math_science' | 'humanities' | 'social_science' | 'auto'`
- `detectDocumentContentType(chunks)` - Gemini Flash로 청크 샘플 분석 (AI 판별)
- `detectPrimaryContentType(content)` - score 기반 키워드 fallback (전문 용어, min 2점)
- `getContentTypeGuide(content)` - 감지된 1개 타입에 맞는 가이드 반환
- `getHumanitiesContentGuide()` - 역사/철학/문학 나레이션 + 시각화 템플릿
- `getSocialScienceContentGuide()` - 경제/심리/사회 나레이션 + 시각화 템플릿
- `getMathContentGuide()` - 수식 비유/인포그래픽 (기존 ICS 확장)
- **동화책 스타일**: "Children's book illustration, soft watercolor, whimsical storybook"

| contentType | 나레이션 스타일 | 시각화 스타일 |
|-------------|---------------|-------------|
| `math_science` | 수식 비유 (action alignment) | 인포그래픽, 다이어그램 |
| `humanities` | 스토리텔링 ("그때 무슨 일이...") | 역사 장면, 철학 상징 |
| `social_science` | 일상 비유 ("편의점에서...") | 경제 그래프, 심리 실험 |

### v3.1.0: 수식 인식 커리큘럼 + 중학생 수준

- `extractFormulasFromChunks(chunks)`: 청크에서 수식 + 컨텍스트 추출 (private 헬퍼)
- `buildDetailedEpisodePrompt()`: 수식별 설명 필수 규칙 주입, relevantChunks 파라미터 추가
- `buildCurriculumAnalysisPrompt()`: mathOrTechnical에 실제 LaTeX 포함 ({name, latex, whatItDoes})
- `analyzeAndPlanSequentialCurriculum()`: combinedText에 청크별 수식 목록 + sectionTitle 추가
- `getMathContentGuide()`: "ELI5 스타일" → "중학생 수준"으로 변경
- 수식 변수별 의미 설명 필수 규칙 추가

### v2.9.0: ICS 시각화 프레임워크 (Image Type + Content + Style)

수학/기술 Scene에서 캐릭터만 있는 이미지 대신 다이어그램/인포그래픽을 생성하도록 개선

- `buildDetailedEpisodePrompt()` 에 visualPrompt 작성 가이드 추가
- 분야별 템플릿: 수학/공식, 기술/AI, 비교, 역사, 철학/추상
- `getMathContentGuide()` - 수식 유형별 시각화 템플릿 (공식, 모델 구조, 벡터, 비교, 파이프라인)
- 수학/LaTeX 콘텐츠 자동 감지 (`$$`, `\frac`, `\sum`, `\int`)

### v2.9.1: 수식-나레이션 정렬 (Action Alignment)

`getMathContentGuide()`가 "action alignment" 원칙으로 재작성됨:

- **핵심 원칙**: 비유의 동작(action)이 수식의 동작과 반드시 일치해야 함
- **변수 기호 직접 읽기 가능**: beta, M, V_lips 등 변수명을 나레이션에서 직접 언급
- **CVA 접근법**: 추상적이지만 정확한 비유 (Concise, Visual, Accurate)

| 구분 | 예시 |
|------|------|
| BAD | 입술 복원 수식에 "점묘화" 비유 (도메인 불일치) |
| GOOD | 입술 복원 수식에 "거울 립싱크 체크" 비유 (동작 일치) |

**비교 수식 -> 비교 비유**, **복원 수식 -> 복원 비유** 매칭 필수

### Config 옵션
```typescript
interface ContentPlannerConfig {
  apiKey: string;
  model?: string;                  // default: gemini-2.0-flash
  maxShortsPerBook?: number;       // default: 10
  maxScenesPerShort?: number;      // default: 8
  language?: 'ko' | 'en';          // default: ko
  style?: string;                  // default: ghibli

  // 🆕 ELI5 옵션
  audienceLevel?: 'elementary' | 'general' | 'professional';  // default: general
  useELI5Style?: boolean;          // default: true

  // 🆕 v3.0.0 contentType
  contentType?: 'math_science' | 'humanities' | 'social_science' | 'auto';  // default: auto
}
```

### 대상 청중 레벨 (audienceLevel)
| 레벨 | 설명 | 예시 |
|------|------|------|
| `elementary` | 초등학생도 이해 가능 | "양자역학(아주 작은 세계의 물리법칙)" |
| `general` | 일반 성인 (기본값) | 전문용어 + 쉬운 설명 병행 |
| `professional` | 전문가/학술 수준 | 정확한 용어 + 깊이 있는 설명 |

### ELI5 스타일 규칙 (자동 적용)
1. **전문 용어 처리**: 괄호 안에 쉬운 설명 추가
   - 예: "엔트로피(쉽게 말해 방이 어질러지는 정도)"
2. **비유와 예시 필수**
   - 예: "블랙홀은 마치 우주의 배수구와 같아요"
3. **수학/과학 공식 설명**: 의미 중심
   - 예: "E=mc²는 아주 작은 물질도 엄청난 에너지가 될 수 있다는 뜻이에요"
4. **철학/인문학 개념**: 일상 상황으로 풀어서 설명
   - 예: "실존주의는 '나는 누구인가?'를 스스로 정하는 거예요"
5. **문장 구조**: 한 문장에 하나의 핵심 아이디어만

### 주요 메서드
```typescript
analyzeAndPlan(options: PlanningOptions): Promise<ShortsPlan>
```

### 출력: ShortsPlan
```typescript
{
  bookId: string;
  totalShorts: number;
  character: { description, style };
  shorts: [{
    shortIndex: number;
    title: string;
    hook: string;
    scenes: [{
      sceneIndex: number;
      sceneType: 'hook' | 'intro' | 'problem' | ...;
      narrationText: string;
      visualPrompt: string;
      durationHint: number;
      sourceChunkIds: string[];
    }]
  }]
}
```

---

## GhibliImageService (v2.9.0 - 다이어그램 감지)

하이브리드 이미지 생성 (캐릭터 일관성 + 다이어그램 자동 전환)

### 전략
```
Scene 0 → GPT-4o로 마스터 이미지 (~50초)
Scene 1+ → NanoBanana + referenceImage (~10초/장)
```

### v2.9.0: 다이어그램/인포그래픽 자동 감지

- `isDiagramPrompt()`: visualPrompt에 infographic, diagram, flowchart 등 키워드 감지
- `DIAGRAM_STYLE_PREFIX`: 다이어그램 전용 스타일 프리픽스 (캐릭터 제외)
- `buildStyledPrompt()`: isDiagram 여부에 따라 GHIBLI vs DIAGRAM 프리픽스 자동 선택
- 다이어그램 씬은 reference 이미지로 저장하지 않음 (캐릭터 오염 방지)

| 씬 유형 | Style Prefix | Reference 저장 |
|---------|-------------|:---:|
| 일반 캐릭터 | GHIBLI_STYLE_PREFIX | O |
| 다이어그램/인포그래픽 | DIAGRAM_STYLE_PREFIX | X |

### 주요 메서드
```typescript
generateSceneImage(prompt, sceneIndex, aspectRatio, config?, videoId?): Promise<SceneImageResult>
generateAllSceneImages(scenes, aspectRatio, videoId?): Promise<SceneImageResult[]>
```

---

## BooksVideoService (v2.9.1 - BOOKS_PROJECT_CONFIG)

TTS + FFmpeg로 최종 비디오 생성

### v2.9.1: BOOKS_PROJECT_CONFIG (중앙 설정)

Books 프로젝트 전용 설정을 한 곳에서 관리:

```typescript
const BOOKS_PROJECT_CONFIG = {
  orientation: 'portrait',
  language: 'ko',
  subtitleYPosition: 'h*0.88',        // 하단 자막 (Books만, Cat/News 영향 없음)
  enableMathFormulas: true,            // 수식 감지 + 렌더링 활성화
  mathFormulaPosition: 'center',       // 수식 오버레이 위치
  reuseImageForSameType: true,         // 연속 동일 sceneType 이미지 재사용 (streak=1 제한)
};
```

### 주요 메서드
```typescript
createShortVideo(input: {
  bookId: string;
  shortPlan: ShortPlan;
  imagePaths: string[];
  config?: {
    orientation?: 'portrait' | 'landscape';
    language?: 'ko' | 'en';     // 언어별 TTS voice 자동 선택
    ttsVoice?: string;          // 특정 voice 지정 (선택)
    ttsGender?: 'female' | 'male';
    subtitleYPosition?: string; // 자막 Y 위치 (기본: BOOKS_PROJECT_CONFIG 사용)
    enableMathFormulas?: boolean;
    mathFormulaPosition?: 'center' | 'top' | 'bottom';
    reuseImageForSameType?: boolean;
  };
}): Promise<BooksVideoResult>
```

### 언어별 TTS Voice 자동 선택
| 언어 | 여성 (기본) | 남성 |
|------|------------|------|
| `ko` (한국어) | Kore | Charon |
| `en` (영어) | Aoede | Puck |

### 테스트 결과 (2026-01-23)
| 항목 | 결과 |
|------|------|
| 총 길이 | 54초 |
| 씬 수 | 8개 |
| 자막 수 | 16개 |
| 파일 크기 | 8.6MB |
| 해상도 | 1080x1920 |
| TTS | Gemini (언어별 자동 선택) |

### FFmpeg 수정사항
**문제**: 8개 이미지 동시 처리 시 "Error reinitializing filters"
**해결**: 개별 scene 비디오 생성 → concat → 오디오+자막 합성

---

## 🆕 v2.6.0 점진적 비디오 생성 (Incremental Mode)

PDF 처리 시 한 번에 모든 에피소드를 생성하지 않고, 어디까지 했는지 기억하고 다음 것만 생성

### API: `POST /api/books/generate-next-episode`

```bash
# 다음 대기 에피소드 자동 생성 (한 번에 하나씩!)
curl -X POST .../api/books/generate-next-episode \
  -H "Content-Type: application/json" \
  -d '{"documentId": "AR_TALK.pdf"}'
```

### 응답 예시
```json
{
  "success": true,
  "completed": false,
  "episodeNumber": 5,
  "videoId": "books_ep5_xxx",
  "progress": {
    "totalEpisodes": 34,
    "completedEpisodes": 25,
    "remainingEpisodes": 9,
    "nextPendingEpisode": { "id": "...", "episodeNumber": 6 }
  },
  "message": "Episode 5 completed. Next: Episode 6"
}
```

### 장점
- YouTube 점진적 업로드 가능 (한 번에 다 올리지 않아도 됨)
- Cloud Run 과부하 방지
- 언제든 중단/재개 가능

---

## 🆕 v2.7.0 수학 수식 LaTeX 렌더링 (Math Formula Feature)

수학/과학 논문의 복잡한 수식을 시각적으로 표현

### 워크플로우

```
나레이션 텍스트 → AI 수식 감지 (Gemini) → LaTeX 추출 → PNG 렌더링 (CodeCogs) → 비디오 오버레이
```

### MathFormulaService (v3.1.0 - 수식 컨텍스트 추출 + 중학생 수준)

```typescript
// 수식 감지 + LaTeX 변환
const detection = await mathService.extractAndConvertToLatex(narrationText);
// { hasMath: true, formulas: [...], cleanedText: "..." }

// LaTeX → PNG 렌더링
const rendered = await mathService.renderFormulasForScene(sceneId, detection.formulas);
// [{ latex: "E = mc^2", imagePath: "/tmp/math/formula_0.png", ... }]

// v3.1.0: 청크에서 수식 + 주변 컨텍스트 추출 (커리큘럼 프롬프트용)
const formulasWithContext = mathService.extractFormulasWithContext(chunks);
// [{ latex: "L_{recon} = ...", name: "Training objectives", context: "원문 설명...", variables: ["M̂", "M", "V_lips"] }]

// v3.1.0: 수식 인식 나레이션 생성 (중학생 수준, 80-150자)
const narration = await mathService.generateFormulaAwareNarration(originalNarration, formulas, sceneType);
```

#### v3.1.0 새 인터페이스: FormulaWithContext
```typescript
interface FormulaWithContext {
  latex: string;       // 원본 LaTeX
  name: string;        // 수식 이름 (섹션 제목에서 추출)
  context: string;     // 수식 앞뒤 설명 텍스트
  variables: string[]; // 주요 변수 목록 (예: ["M̂", "M", "V_lips"])
}
```

### BooksVideoService Config

```typescript
config: {
  enableMathFormulas?: boolean;  // 기본: true (수식 감지 활성화)
  mathFormulaPosition?: 'center' | 'top' | 'bottom';  // 기본: center
}
```

### 결과 예시

```json
{
  "success": true,
  "videoId": "book_xxx_short_1_abc",
  "details": {
    "sceneCount": 8,
    "captionCount": 16,
    "mathFormulaCount": 3,
    "scenesWithMath": 2
  }
}
```

### LaTeX 렌더링 엔진

- **CodeCogs API** (무료, 간단)
- URL 형식: `https://latex.codecogs.com/png.image?...LATEX`
- 300 DPI, **노란색 글자, 검정 배경** (v2.9.1 변경 - 기존: 흰색 글자, 투명 배경)

### Nougat 연동 (NEB)

PDF에서 LaTeX 추출을 위해 NEB Cloud Run에 Nougat 활성화:

```bash
# NEB Cloud Run 설정 (2026-01-25 업데이트)
Memory: 8Gi
CPU: 4
USE_NOUGAT_FOR_PDF: true
```

---

## 다음 단계 (Phase 4)

- [x] 점진적 비디오 생성 API
- [x] 수학 수식 LaTeX 렌더링
- [x] ICS 시각화 프레임워크 + 다이어그램 감지 (v2.9.0)
- [ ] Nougat PDF 재처리 (AR_TALK.pdf)
- [ ] n8n 워크플로우 연동
- [ ] 24시간 Cron 자동화
- [ ] YouTube 자동 업로드

---

## 관련 파일

- [../types/index.ts](../types/index.ts) - 타입 정의
- [../api/BooksRouter.ts](../api/BooksRouter.ts) - API 라우트
- [../../Architecture/FULL_ARCHITECTURE.md](../../Architecture/FULL_ARCHITECTURE.md) - 전체 아키텍처
