# Services - 비즈니스 로직 계층

> Last Updated: 2026-02-25
> Status: **v12.1 NotebookLM + VEO 3.1 + 멀티 스타일 (4개 활성) + 핸들러 분리**
>
> **핵심 철학**: 수식이 주인공. math_science 문서는 수식 중심 커리큘럼으로 자동 전환. 각 씬에 assignedFormula 할당, 고등학생 수준 40-60자 나레이션
>
> **v3.4.2 핵심 변경 (수식 완전 복구)**:
> 1. MathJax `AllPackages` 제거 → `new TeX({})` (Node.js CommonJS null reference 크래시 해결)
> 2. `<mjx-container>` wrapper에서 `<svg>` 추출 (sharp 파싱 에러 해결)
> 3. `convertLatexToDisplayText()` `$` 구분자 strip 추가 (drawtext fallback `$b$` → `b`)
> 4. β, ψ, θ, L_{rec}=||M̂-M||_1 PNG 렌더링 성공 확인
>
> **v3.4.1 변경**: MathJax SVG fill + 씬간 텀 0.05초 + FFmpeg ultrafast

---

## 구현 현황

| 서비스 | 파일 | 상태 | 설명 |
|--------|------|:----:|------|
| Neo4jService | `Neo4jService.ts` | ✅ | Neo4j 연결/쿼리 + Episode/Scene CRUD + replaceChunksAtomic (v12.1) |
| ContentPlannerService | `ContentPlannerService.ts` | ✅ | AI 분석 (Gemini) → ShortsPlan (939줄, v7.0 리팩토링) |
| SceneImageService | `SceneImageService.ts` | ✅ | NanoBanana 이미지 생성 (v7.0 리네이밍, GPT-4o 제거) |
| BooksVideoService | `BooksVideoService.ts` | ✅ | TTS + FFmpeg 비디오 생성 (VEO/Hook 분기 포함) |
| MathFormulaService | `MathFormulaService.ts` | ✅ | MathJax v4 LaTeX → SVG → PNG 렌더링 |
| StyleRegistry | `styles/index.ts` | ✅ | Strategy Pattern 스타일 프로파일 (4개 활성 + 1 legacy) |
| LongFormCompilerService | `LongFormCompilerService.ts` | ✅ | 숏츠 N개 → 롱폼 컴필레이션 (VideoConcat + 챕터) |
| YouTubePublishService | `YouTubePublishService.ts` | ✅ | YouTube 자동 업로드 (OAuth2) |
| VeoInterpolationNode | `VeoInterpolationNode.ts` | ✅ | VEO 3.1 프레임 보간 (v11.0, n8n 노드) |
| HookTextOverlayNode | `HookTextOverlayNode.ts` | ✅ | FFmpeg 후크 텍스트 오버레이 (v12.0, n8n 노드) |
| NotebookLMService | `NotebookLMService.ts` | ✅ | NotebookLM export/import (v12.1, n8n 노드) |
| SemanticRechunkService | `SemanticRechunkService.ts` | ✅ | AI 시맨틱 청킹 (v12.1, Gemini Flash) |
| SlideToVideoNode | `SlideToVideoNode.ts` | ✅ | 슬라이드 → 비디오 변환 (n8n 노드) |
| EpisodeOrchestrator | `orchestration/EpisodeOrchestrator.ts` | ✅ | 이미지/비디오 파이프라인 오케스트레이션 (v7.0) |

---

## 서비스 의존성

```
BooksRouter (v12.1: RouterContext + 10 handlers)
    │
    ├── Neo4jService
    │   └── neo4j-driver (bolt://34.47.112.49:7687)
    │
    ├── ContentPlannerService (939줄, v7.0)
    │   └── Gemini API (@google/generative-ai)
    │
    ├── EpisodeOrchestrator (v7.0)
    │   └── SceneImageService → NanoBananaService
    │
    ├── SceneImageService (v7.0, 구 GhibliImageService)
    │   └── NanoBananaService (Gemini Imagen, 모든 이미지)
    │
    ├── StyleRegistry (styles/)
    │   ├── VideoStyleProfile (interface)
    │   ├── MathCharacterStyleProfile (PRIMARY)
    │   ├── ViralCatStyleProfile (v10.0)
    │   ├── PhilosophyMentorStyleProfile (v12.0)
    │   └── HumanitiesStyleProfile
    │
    ├── VeoInterpolationNode (v11.0)
    │   └── VEO 3.1 API
    │
    ├── HookTextOverlayNode (v12.0)
    │   └── FFmpeg drawtext
    │
    ├── LongFormCompilerService (v9.0)
    │   └── VideoConcat (concatVideosWithXfade)
    │
    ├── YouTubePublishService (v8.1)
    │   └── YouTube Data API v3 (OAuth2)
    │
    ├── NotebookLMService (v12.1)
    │   └── NotebookLM export/import
    │
    ├── SemanticRechunkService (v12.1)
    │   └── Gemini Flash (AI 시맨틱 청킹)
    │
    └── BooksVideoService
        ├── GeminiTTS (스타일별 voice 자동 선택)
        └── FFmpeg (overlay + 자막 합성)
```

---

## Neo4jService (v3.3.0)

### v3.3.0 수식 필드 (Scene 노드)
- `createScene()`, `createEpisodeWithScenes()`: `assignedFormula`, `formulaName`, `formulaMetaphor` 저장
- `recordToScene()`: 조회 시 `assignedFormula`, `formulaName`, `formulaMetaphor` 매핑

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
  style?: string;                  // default: math_character (교육 콘텐츠 기본)

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

## SceneImageService (v9.0 - Ghibli 완전 제거, NanoBanana Only)

NanoBanana 이미지 생성 (v3.8.0: GPT-4o 완전 제거, 스타일별 캐릭터 일관성 + 다이어그램 자동 전환)

> **참고**: `GhibliImageService.ts`는 하위호환 re-export wrapper 파일 (deprecated). 실제 코드는 `SceneImageService.ts`에 있음.

### 전략 (v3.8.0)
| 씬 타입 | imageMode | 이미지 전략 | 캐릭터 |
|---------|-----------|------------|--------|
| narrative (hook/conclusion) | narrative 또는 educational* | NanoBanana character ref | O (올빼미 교수 / 수채화 캐릭터) |
| educational (explanation/data) | educational | NanoBanana style ref | X |
| formula (assignedFormula 씬) | formula | NanoBanana style ref | X |

*non-ghibli 스타일은 educational path + styleOverridePrefix로 기본 스타일 우회

### v3.8.0: GPT-4o 제거
- `forceGpt` 파라미터: BooksRouter에서 더 이상 전달하지 않음 (인터페이스는 보존)
- 첫 씬 GPT-4o 블록: 제거 → 모든 narrative 씬이 NanoBanana로 직행
- 첫 씬 결과는 `referenceImage`로 저장 → 이후 씬 캐릭터 일관성 유지
- GPT-4o 서비스 코드는 삭제하지 않음 (필요 시 복구 가능)

### v3.7.0: 스타일 프로파일 연동
- `styleOverridePrefix`: 외부 스타일 프리픽스가 GHIBLI_STYLE_PREFIX 대신 사용됨
- `compositions`: 스타일별 카메라 구도 배열

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

## StyleRegistry (v12.0 - Strategy Pattern, 4개 활성 프로파일)

스타일별 비주얼/TTS/수식 설정을 프로파일로 분리. 새 스타일 = 1파일 + registry 등록.

### 구조
```
styles/
├── VideoStyleProfile.ts          # 인터페이스 (+engagementGuide, hookTextOverlay)
├── MathCharacterStyleProfile.ts  # PRIMARY: 올빼미 교수, dark navy, Charon
├── ViralCatStyleProfile.ts       # v10.0: 고양이+수채화+직장인공감, Fenrir
├── PhilosophyMentorStyleProfile.ts # v12.0: 멘탈훈련소, Enceladus
├── HumanitiesStyleProfile.ts     # 인문학: 역사/철학/문학
├── GhibliStyleProfile.ts         # DEPRECATED (하위호환 re-export)
├── ContentPlannerStyleGuide.ts   # 스타일 선택 유틸
└── index.ts                      # getStyleProfile(id?) 팩토리 + STYLE_REGISTRY
```

### 활성 프로파일 비교

| 스타일 | 캐릭터 | 배경 | TTS Voice | hookTextOverlay | 용도 |
|--------|--------|------|-----------|:---:|------|
| `math_character` | 안경 올빼미 | dark navy | Charon (남성) | X | 수학/과학 교육 |
| `viral_cat` | 고양이 | 따뜻한 수채화 | Fenrir (남성) | O | 직장인 공감/라이프스타일 |
| `philosophy_mentor` | 만화풍 | 따뜻한 톤 | Enceladus (남성) | O | 철학/마인드셋/멘탈 |
| `humanities` | - | 시네마틱 | Charon | X | 역사/철학/문학 |

### 새 스타일 추가 방법
1. `styles/NewStyleProfile.ts` 파일 생성 (VideoStyleProfile 구현)
2. `styles/index.ts`의 STYLE_REGISTRY에 등록
3. (optional) `prompts/`에 전용 콘텐츠 가이드 추가
4. 끝. 기존 코드 변경 없음.

### VideoStyleProfile 인터페이스 (v12.0)
```typescript
interface VideoStyleProfile {
  id: string;
  narrativeStylePrefix: string;
  educationalStylePrefix: string;
  ttsVoice: string;
  ttsGender: 'male' | 'female';
  compositions: string[];
  engagementGuide?: string;       // v10.0: 커스텀 바이럴 가이드
  hookTextOverlay?: {              // v12.0: 후크 텍스트 오버레이 설정
    enabled: boolean;
    fontColor?: string;
    fontSize?: number;
  };
}
```

### 자동 감지 우선순위 (4중 방어)
1. API `config.style` → 명시적 지정
2. Neo4j `videoConfig.style` → 문서별 저장된 스타일
3. Neo4j `contentType` 매핑 (math_science → math_character, empathy_lifestyle → viral_cat)
4. Episode `assignedFormula` 존재 → math_character
5. Fallback → math_character (기본)

---

## LongFormCompilerService (v9.0 - 롱폼 컴필레이션)

숏츠 N개를 합쳐서 8-15분 롱폼 비디오 생성 (Phase 2 수익화)

### n8n 노드 인터페이스
```typescript
interface CompileInput {
  documentId: string;
  episodeIds?: string[];       // 미지정 시 completed 에피소드 전부
  title?: string;
  transitionType?: string;     // default: 'dissolve'
  transitionDuration?: number; // default: 0.5
  orientation?: string;        // default: '1080x1920' (portrait)
  includeChapters?: boolean;   // default: true
}

interface CompileOutput {
  success: boolean;
  videoPath?: string;
  duration?: number;
  episodeCount?: number;
  chapters?: Array<{ title: string; startTime: number }>;
  error?: string;
}
```

### 핵심 메서드
- `compile(input)` — 에피소드 비디오들 → 1개 롱폼 비디오 + 챕터
- `getCompilableEpisodes(documentId)` — 컴파일 가능 에피소드 목록

### 의존성
- `VideoConcat.concatVideosWithXfade()` — dissolve 트랜지션
- `getVideoDuration()` — 챕터 시작 시간 계산
- `Neo4jService.getDocumentEpisodes()` — 에피소드 조회

---

## YouTubePublishService (v8.1 - YouTube 자동 업로드)

에피소드 → YouTube 업로드 (n8n 노드 패턴)

### n8n 노드 인터페이스
- `PublishInput` → `publish()` → `PublishOutput`
- YouTube Data API v3 (OAuth2)
- 업로드 후 Neo4j 상태 업데이트 (`updateEpisodeStatus(id, 'uploaded', { youtubeId })`)

---

## VeoInterpolationNode (v11.0 - VEO 3.1 Frame Interpolation)

씬당 키프레임 2장 → VEO 3.1 AI 보간 → 8초 시네마틱 비디오 (n8n 노드 패턴)

### n8n 노드 인터페이스
```typescript
interface VeoInterpolationInput {
  firstFramePath: string;    // 첫 키프레임 이미지
  lastFramePath: string;     // 마지막 키프레임 이미지
  durationSeconds?: number;  // default: 8
  model?: string;            // default: veo-3.1-fast-generate-preview
}

interface VeoInterpolationOutput {
  success: boolean;
  videoPath?: string;
  duration?: number;
  error?: string;
}
```

### 사용
- `useVeo: true` API 파라미터 → 전체 파이프라인 VEO 모드 전환
- ContentPlanner: `useVeoInterpolation=true` → AI가 씬별 `firstFramePrompt`/`lastFramePrompt` 생성
- EpisodeOrchestrator: `generateKeyframePairs()` — 씬당 2장 이미지 생성
- BooksVideoService Step 2: VEO 분기 (성공→trim+resize, 실패→Ken Burns fallback)
- 비용: ~$1.3/에피소드, 하위 호환 100%

---

## HookTextOverlayNode (v12.0 - FFmpeg Hook 텍스트 오버레이)

첫 씬에 굵은 한국어 후크 텍스트를 FFmpeg drawtext로 오버레이 (n8n 노드 패턴)

### 사용
- VideoStyleProfile의 `hookTextOverlay.enabled: true` 시 활성화
- BooksVideoService Step 2.5에서 자동 분기
- 현재 활성: `philosophy_mentor`, `viral_cat`
- 미설정 스타일은 기존 파이프라인 그대로 (하위 호환)

---

## NotebookLMService (v12.1 - NotebookLM Export/Import)

NotebookLM 연동 서비스 (n8n 노드 패턴, 290줄)

### 핵심 메서드
- `exportPackage(bookId)` — Neo4j → NotebookLM 소스 파일 export
- `exportEpisodes(bookId)` — 에피소드별 슬라이드 export
- `importSlides(bookId, slidesData)` — NotebookLM 슬라이드 import → VEO 파이프라인
- OCR 깨짐 텍스트 클리닝: `cleanGarbledText()` + `trimTrailingGarbage()`
  - 한글 비율 <15% 줄 제거, trailing garbage 자동 정리

### 폴더 구조
```
notebookLM/{bookSlug}/
├── sources/     # Neo4j 청크 → txt 파일
├── prompts/     # 프롬프트 가이드
├── episodes/    # 에피소드 슬라이드
└── slides/      # import된 슬라이드
```

### Circular Flow
```
export → NotebookLM (external) → slides → import/slides → VEO 파이프라인
```

---

## SemanticRechunkService (v12.1 - AI 시맨틱 청킹)

Neo4j 청크를 의미 단위로 재분할 (252줄)

### 핵심 메서드
- `rechunk(bookId)` — AI가 chunkIndices로 의미 단위 병합 지시 → Neo4j 원자적 교체
- `Neo4jService.replaceChunksAtomic()` — 삭제+생성 단일 트랜잭션
- 청크 스키마 확장: `sectionTitle`, `summary`, `keywords`, `chunkType`
- 모델: `gemini-3-flash-preview`
- 결과: Sonja 50→19 chunks, AR_TALK 28→13 chunks (주제별 의미 단위)

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
- [x] YouTube 자동 업로드 (v8.1)
- [x] Viral Cat 스타일 피벗 (v10.0)
- [x] VEO 3.1 Frame Interpolation (v11.0)
- [x] 모듈별 독립 테스트 + PhilosophyMentor 스타일 (v12.0)
- [x] NotebookLM 파이프라인 + 시맨틱 리청킹 (v12.1)
- [x] BooksRouter 핸들러 분리 (v12.1)
- [ ] Nougat PDF 재처리 (AR_TALK.pdf)
- [ ] n8n 워크플로우 연동
- [ ] 24시간 Cron 자동화

---

## 관련 파일

- [../types/index.ts](../types/index.ts) - 타입 정의
- [../api/BooksRouter.ts](../api/BooksRouter.ts) - API 라우트
- [../../Architecture/FULL_ARCHITECTURE.md](../../Architecture/FULL_ARCHITECTURE.md) - 전체 아키텍처
