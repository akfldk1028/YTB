# PoliticsProject - YouTube to Shorts 아키텍처

## 개요

YouTube 영상 URL을 입력받아 자동으로 Shorts 3개를 생성하는 시스템.

## 파이프라인 흐름

```
YouTube URL
    │
    ▼
┌─────────────────────┐
│   1. Downloader     │  yt-dlp로 영상 + 자막 다운로드
│   (YouTubeDownloader)│
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   2. Parser         │  SRT 파일 → 타임스탬프 + 텍스트 파싱
│   (SRTParser)       │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   3. Analyzer       │  AI가 하이라이트 3개 구간 선택
│   (HighlightAnalyzer)│  (30~60초, 핵심/임팩트/재미)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   4. Processor      │
│   ├─ VerticalCropper│  16:9 → 9:16 크롭
│   └─ SubtitleBurner │  자막 합성
└─────────┬───────────┘
          │
          ▼
    shorts_final/
    ├─ short_01.mp4
    ├─ short_02.mp4
    └─ short_03.mp4
```

## 모듈 구조

### 1. core/downloader
```
downloader/
├── YouTubeDownloader.ts   # yt-dlp 래퍼
├── types.ts               # DownloadResult, DownloadOptions
└── index.ts               # export
```

**책임**: YouTube URL → mp4 + srt 파일

**의존성**: yt-dlp (CLI)

### 2. core/parser
```
parser/
├── SRTParser.ts           # SRT 파일 파싱
├── types.ts               # SubtitleEntry, ParsedSubtitle
└── index.ts
```

**책임**: SRT 파일 → 구조화된 자막 데이터

**의존성**: 없음 (순수 파싱)

### 3. core/analyzer
```
analyzer/
├── HighlightAnalyzer.ts   # AI 분석 로직
├── prompts.ts             # AI 프롬프트 템플릿
├── types.ts               # Highlight, AnalysisResult
└── index.ts
```

**책임**: 자막 데이터 → 하이라이트 3개 선택

**의존성**: OpenAI/Claude API

### 4. core/processor
```
processor/
├── VerticalCropper.ts     # 9:16 크롭
├── SubtitleBurner.ts      # 자막 burn-in
├── types.ts               # CropOptions, BurnOptions
└── index.ts
```

**책임**: 영상 편집 (크롭 + 자막)

**의존성**: FFmpeg (기존 ffmpeg-core 재사용)

### 5. workflow
```
workflow/
├── YouTubeToShortsWorkflow.ts   # 전체 파이프라인 오케스트레이션
├── types.ts                      # WorkflowInput, WorkflowResult
└── index.ts
```

**책임**: 모든 모듈 조합하여 E2E 실행

## 기존 코드 연동

### 재사용할 모듈 (short-creator/libraries)

| 기존 모듈 | 용도 | import 경로 |
|-----------|------|-------------|
| `ffmpeg-core/VideoEditor` | trimVideo, extractAudio | `../../short-creator/libraries/ffmpeg-core` |
| `ffmpeg-core/SubtitleFilter` | 자막 스타일 | 위와 동일 |
| `logger` | 로깅 | `../../logger` |
| `Config` | 설정 | `../../config` |

### 새로 구현할 모듈

| 모듈 | 설명 |
|------|------|
| `YouTubeDownloader` | yt-dlp CLI 래퍼 |
| `SRTParser` | SRT 파일 파싱 |
| `HighlightAnalyzer` | AI 기반 구간 선택 |
| `VerticalCropper` | 16:9 → 9:16 변환 |

## API 설계

### POST /api/video/youtube-to-shorts

**Request:**
```json
{
  "youtubeUrl": "https://youtube.com/watch?v=...",
  "options": {
    "outputCount": 3,
    "clipDuration": { "min": 30, "max": 60 },
    "autoAnalyze": true
  }
}
```

**Response:**
```json
{
  "jobId": "yt2shorts_abc123",
  "status": "processing",
  "message": "YouTube to Shorts conversion started"
}
```

### GET /api/video/youtube-to-shorts/:jobId/status

**Response:**
```json
{
  "jobId": "yt2shorts_abc123",
  "status": "completed",
  "progress": 100,
  "outputs": [
    { "path": "shorts_final/short_01.mp4", "title": "핵심 포인트", "duration": 45 },
    { "path": "shorts_final/short_02.mp4", "title": "충격적인 사실", "duration": 52 },
    { "path": "shorts_final/short_03.mp4", "title": "실용적인 팁", "duration": 38 }
  ]
}
```

## n8n 연동

```
[YouTube RSS] → [HTTP: youtube-to-shorts] → [Wait] → [HTTP: status] → [YouTube Upload]
```

자세한 내용은 `N8N.md` 참조.

## 폴더 규칙

- 각 파일 **100줄 이하** 유지
- 모든 모듈에 **types.ts** 분리
- **index.ts**로 깔끔한 export
- 비즈니스 로직과 타입 분리
