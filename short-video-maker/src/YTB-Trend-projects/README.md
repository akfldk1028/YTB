# YTB-Trend-projects

YouTube URL을 입력하면 해당 영상의 스타일(비주얼, 카메라워크, 나레이션 톤)을 AI로 분석하고, 그 스타일대로 새 교육 영상을 생성하는 모듈.

## Architecture

n8n Node Pattern: 각 서비스는 독립 노드 (단일 책임), 오케스트레이터가 연결.

```
[YouTube URL]
     |
     v
 Node 1: YouTubeDownloaderService ──── yt-dlp (execFile, no shell)
     |
     v
 Node 2: GeminiVideoAnalyzerService ── Gemini File API + gemini-2.0-flash
     |
     v
 Node 3: StyleProfileBuilderService ── StyleDNA → TrendStyleProfile (순수 함수)
     |
     v
 Node 4: VideoGenProvider ─────────── KenBurns($0) / Grok($0.05/s) / Veo3($0.10/씬)
     |
     v
 Node 5: VideoCloneService ─────────── 오케스트레이터 (전체 파이프라인)
     |
     v
[Output MP4]
```

## 디렉토리 구조

```
YTB-Trend-projects/
├── index.ts                           # 모듈 exports
├── types/
│   └── index.ts                       # 전체 I/O 인터페이스
├── services/
│   ├── YouTubeDownloaderService.ts    # Node 1: URL → MP4
│   ├── GeminiVideoAnalyzerService.ts  # Node 2: MP4 → StyleDNA
│   ├── StyleProfileBuilderService.ts  # Node 3: StyleDNA → Profile
│   ├── VideoCloneService.ts           # Node 5: 오케스트레이터
│   └── index.ts
├── providers/
│   ├── BaseVideoGenProvider.ts        # 추상 베이스
│   ├── KenBurnsVideoGenProvider.ts    # FFmpeg zoompan ($0, 기본값)
│   ├── GrokVideoGenProvider.ts        # Grok image→video ($0.05/s)
│   ├── Veo3VideoGenProvider.ts        # Veo3 text→video ($0.10/씬)
│   └── index.ts
├── api/
│   └── TrendRouter.ts                 # Express 라우터
└── utils/
    └── PromptTemplates.ts             # Gemini 분석 프롬프트
```

## API Endpoints

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/trends/analyze` | YouTube URL → StyleDNA + Profile (영상 생성 X) |
| `POST` | `/api/trends/clone` | YouTube URL + content → 새 영상 파일 생성 |
| `GET` | `/api/trends/profiles` | 저장된 스타일 프로필 목록 |
| `GET` | `/api/trends/profiles/:id` | 특정 프로필 상세 |

### POST /api/trends/analyze

YouTube 영상의 스타일만 분석. 영상 생성 없음.

```bash
curl -X POST http://localhost:3124/api/trends/analyze \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtube.com/watch?v=XXXX"}'
```

응답:
```json
{
  "success": true,
  "profile": {
    "id": "trend_1738900000000",
    "displayName": "Style from 3Blue1Brown",
    "sourceChannel": "3Blue1Brown",
    "styleDNA": { "visualStyle": {...}, "motionProfile": {...}, ... },
    "ttsConfig": { "voice": "Charon", "gender": "male" },
    "sceneTimingRules": { "hookDuration": 7, "explanationDuration": 6 }
  }
}
```

### POST /api/trends/clone

스타일 분석 + 새 교육 영상 생성.

```bash
curl -X POST http://localhost:3124/api/trends/clone \
  -H "Content-Type: application/json" \
  -d '{
    "referenceUrl": "https://youtube.com/watch?v=XXXX",
    "content": {
      "title": "삼각함수의 비밀",
      "hook": "이 공식 하나로 모든 삼각함수가 풀립니다",
      "mainPoints": ["사인과 코사인의 관계", "단위원 위의 점", "실생활 응용"],
      "conclusion": "이제 삼각함수가 친구가 되었습니다"
    },
    "provider": "kenburns"
  }'
```

**provider 옵션:**

| Provider | 값 | 비용/씬 | 설명 |
|----------|---|---------|------|
| **Ken Burns** (기본) | `kenburns` | $0 | FFmpeg zoompan, 무료 |
| Grok | `grok-img2v` | $0.05/초 | xAI image→video 애니메이션 |
| Veo3 | `veo3-t2v` | ~$0.10 | Google text→video |

**캐시된 프로필 재사용** (분석 단계 스킵):
```bash
curl -X POST http://localhost:3124/api/trends/clone \
  -H "Content-Type: application/json" \
  -d '{
    "forceStyleProfile": "trend_1738900000000",
    "content": { "title": "...", "hook": "...", "mainPoints": [...], "conclusion": "..." }
  }'
```

## 비용 추정 (영상 1개, 5씬 기준)

| 단계 | Provider | 비용 |
|------|----------|------|
| YouTube 다운로드 | yt-dlp | $0 |
| 영상 분석 | Gemini Flash | ~$0.08 |
| 이미지 생성 (5씬) | NanoBanana | ~$0.10 |
| **영상 생성 (5씬)** | **Ken Burns** | **$0** |
| (대안) 영상 생성 | Veo3 Fast | ~$0.50 |
| (대안) 영상 생성 | Grok | ~$1.50 |
| TTS (5씬) | Gemini TTS | ~$0.005 |
| **합계 (KenBurns)** | | **~$0.19** |
| **합계 (Veo3)** | | **~$0.69** |
| **합계 (Grok)** | | **~$1.69** |

## StyleDNA 구조

Gemini가 영상에서 추출하는 스타일 DNA:

```typescript
interface StyleDNA {
  visualStyle: {
    colorPalette: string[];     // ["dark navy", "#1a1a2e", "electric blue"]
    composition: string;         // "centered subject with dark background"
    backgroundType: string;      // "animated gradient"
    characterPresence: string;   // "animated mascot character"
    transitionStyle: string;     // "smooth fade"
  };
  motionProfile: {
    cameraMovement: string;      // "static with zoom"
    pace: string;                // "medium"
    cutFrequency: string;        // "every 5-7 seconds"
  };
  educationalPattern: {
    hookStyle: string;           // "provocative question"
    explanationApproach: string; // "visual metaphor with diagrams"
    conclusionStyle: string;     // "key takeaway"
  };
  audioProfile: {
    narratorGender: "male" | "female";
    narratorTone: string;        // "enthusiastic and curious"
    backgroundMusicStyle: string; // "upbeat electronic"
  };
  technicalSpecs: {
    averageShotDuration: number; // 5 (seconds)
    aspectRatio: string;         // "16:9"
    typicalSceneDuration: number; // 6 (seconds)
  };
}
```

## Pipeline 상세

### 1. YouTubeDownloaderService
- `yt-dlp` 바이너리 사용 (`execFile` — shell injection 방지)
- 720p 이하 MP4 다운로드 + info.json 메타데이터 추출
- 재시도 2회, 타임아웃 120초
- **필수**: 시스템에 `yt-dlp` 설치 필요

### 2. GeminiVideoAnalyzerService
- Gemini File API: upload → poll(ACTIVE) → generateContent → delete
- 모델: `gemini-2.0-flash` (비용 효율)
- JSON 응답 파싱 + markdown fence 자동 제거

### 3. StyleProfileBuilderService
- 순수 함수 (외부 API 호출 없음)
- StyleDNA → TTS voice, 이미지 프롬프트 프리픽스, 모션 스타일, 씬 타이밍 매핑
- JSON 파일로 저장 → 재사용 가능

### 4. Video Gen Providers
- **KenBurns**: FFmpeg zoompan (zoom_in/zoom_out/pan_right/pan_left)
  - 프로필의 `motionStyle`에 맞춰 이펙트 선택 (미지정 시 순환)
  - `-loop 1` 사용 안 함 (프레임 폭발 방지)
- **Grok**: 기존 `GrokVideoProvider` (YTB-video-animation) 래핑
- **Veo3**: 기존 `GoogleVeoAPI` (short-creator/libraries) 래핑

### 5. VideoCloneService (오케스트레이터)
```
Download → Analyze → Build Profile → Plan Scenes → Images → Videos → TTS → Assemble
```
- `forceStyleProfile` 제공 시 1~3단계 스킵
- 씬 실패 시 해당 씬만 스킵 (Map 기반 index 정렬)
- 실패 시 세션 디렉토리 자동 정리
- 비용/타이밍 추적하여 응답에 포함

## 재사용 기존 모듈

| 모듈 | 용도 |
|------|------|
| `@google/genai` | Gemini File API + Veo3 |
| `GoogleVeoAPI` | Veo3 text→video |
| `GrokVideoProvider` | Grok image→video |
| `GhibliImageService` | NanoBanana 이미지 생성 |
| `GeminiTTS` | 나레이션 (Charon=남/Leda=여) |
| `VideoEditor` | Ken Burns, 합성 |
| `VideoConcat` | 클립 이어붙이기 |
| `AudioProcessor` | PCM→MP3, 크로스페이드 |

## 환경 변수

| 변수 | 필수 | 용도 |
|------|:----:|------|
| `GOOGLE_GEMINI_API_KEY` | Y | Gemini 분석 + TTS + Veo3 + 이미지 |
| `XAI_API_KEY` | N | Grok provider 사용 시 |
| `OPENAI_API_KEY` | N | GPT 이미지 (현재 미사용) |

## 빌드

```bash
cd short-video-maker
npx tsc --project tsconfig.build.json
```

## 코드 리뷰 결과 (v1.0 수정 완료)

| 이슈 | 수정 |
|------|------|
| Shell injection (yt-dlp) | `exec` → `execFile` (인수 배열 전달) |
| `as any` 타입 bypass | `OrientationEnum.portrait` + 정규 `RenderConfig` |
| Scene/video index 불일치 | `Map<number, string>` 기반 index 정렬 |
| API key null assertion | 생성자에서 명시적 throw |
| motionStyle 미적용 | KenBurns provider에 motionStyle 전달 |
| mainPoints 배열 미검증 | `Array.isArray()` 추가 |
| 실패 시 temp 미정리 | `finally` 블록에서 sessionDir 삭제 |
| Veo3 `as any` cast | 명시적 union type + veo-2.0 fallback |
| Gemini `response.text` throw | try/catch 래핑 |
