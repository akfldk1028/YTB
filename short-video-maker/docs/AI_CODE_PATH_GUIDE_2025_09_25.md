# AI Code Path Guide - September 25, 2025

AI가 향후 이 프로젝트를 이해하고 작업할 때 반드시 파악해야 할 핵심 코드 경로와 의존성을 정리한 문서입니다.

## 🎯 Critical Code Paths for AI Understanding

### 1. Entry Point & Server Architecture
```
src/index.ts (Main Entry Point)
├── Config initialization
├── TTS Provider selection (Google TTS vs Kokoro)
├── Whisper initialization  
├── FFmpeg setup
├── Pexels API setup
├── Video source configuration (veo/leonardo/ffmpeg)
└── Server startup

src/server/server.ts
├── Express server setup
├── MCP protocol handling (/mcp)
├── REST API routing (/api)
└── UI serving
```

### 2. Video Processing Core Pipeline
```
src/short-creator/ShortCreator.ts (핵심 비디오 처리)
├── createShortVideo() - 메인 비디오 생성 로직
├── processMultiSceneWithFFmpeg() - 멀티씬 FFmpeg 처리 (라인 689-781)
├── processSingleSceneWithFFmpeg() - 단일씬 처리 (라인 649-686)
└── addToQueue() - 비동기 큐 관리

Key Methods AI Must Understand:
- Line 689-781: processMultiSceneWithFFmpeg (오늘 주요 개선 부분)
- Line 649-686: processSingleSceneWithFFmpeg
- Line 318-334: FFmpeg 모드 처리 로직
```

### 3. FFmpeg Operations (오늘 개선된 핵심 부분)
```
src/short-creator/libraries/FFmpeg.ts
├── concatVideos() - 멀티씬 연결 (라인 175-238) ⭐ 오늘 완전 재작성
├── combineVideoWithAudioAndCaptions() - 오디오/비디오/자막 결합 (라인 98-142)
├── addSubtitlesToVideo() - 자막 추가 (라인 244-298)
├── createSubtitleFilter() - 한국어 자막 필터 생성 (라인 144-170)
└── createMp3DataUri() - 오디오 변환

⚠️ CRITICAL: 
- Line 175-238의 concatVideos는 mergeToFile() 사용
- fs-extra import 필수
- 임시 디렉토리 관리 로직 포함
```

### 4. Audio & TTS Pipeline
```
src/short-creator/libraries/google-tts/GoogleTTS.ts
├── generate() - 한국어 TTS 생성 (라인 69-115)
├── mapKokoroToGoogleVoice() - 음성 매핑 (라인 117-161) ⭐ 한국어 고정
└── init() - Google Cloud 인증

⚠️ CRITICAL:
- 모든 음성이 ko-KR-Neural2 로 매핑됨 (한국어 고정)
- Line 121-150: 음성 매핑 테이블이 한국어 자막 정확성에 중요
```

### 5. Speech Recognition & Subtitles
```
src/short-creator/libraries/Whisper.ts
├── transcribeAudio() - 한국어 음성 인식
├── createKoreanCaptions() - 한국어 자막 생성
└── normalizeAudioForWhisper() - 오디오 전처리

Key Configuration:
- WHISPER_MODEL=medium (한국어 지원)
- Language: 'ko' 고정
- Output: 시간 동기화된 JSON
```

### 6. API Routes & Validation
```
src/server/routers/rest.ts
├── POST /api/create-video (라인 31-65) - 메인 생성 API
├── POST /api/short-video (라인 68-XX) - 레거시 호환
└── Raw data parsing logic

src/server/validator.ts
├── validateCreateShortInput() - Zod 스키마 검증
└── Field requirements: text, searchTerms 필수
```

## 🔧 Environment & Configuration

### Essential Environment Variables
```env
# 핵심 설정 (AI가 반드시 확인해야 함)
VIDEO_SOURCE=ffmpeg          # Remotion 대신 FFmpeg 사용
TTS_PROVIDER=google          # Google TTS 사용 (한국어)
WHISPER_MODEL=medium         # 한국어 지원 모델
PORT=3125                    # 서버 포트

# Google Cloud 인증
GOOGLE_TTS_API_KEY=/path/to/key.json
GOOGLE_TTS_PROJECT_ID=project-id
GOOGLE_GEMINI_API_KEY=key

# Pexels (필수)
PEXELS_API_KEY=key
```

### Package Dependencies (AI가 확인해야 할 것들)
```json
{
  "fluent-ffmpeg": "^2.1.3",           // mergeToFile() 사용
  "@google-cloud/text-to-speech": "^6.3.0",  // 한국어 TTS
  "fs-extra": "^11.3.0",               // 디렉토리 관리 (FFmpeg.ts에서 사용)
  "@remotion/cli": "^4.0.286"          // 사용하지 않지만 의존성 유지
}
```

## 🚨 Critical Error Patterns AI Should Know

### 1. Concatenation Issues
```
❌ Problem: "첫번쨰 영상과 두번쨰 영상이 자연스럽게 합쳐지지가 안흔ㄴ데"
✅ Solution: FFmpeg.ts의 concatVideos에서 mergeToFile() 사용
🔍 Check: Line 175-238 in FFmpeg.ts
```

### 2. Korean Subtitle Issues  
```
❌ Problem: "영어 한국 혼용되서 아주난리인데"
✅ Solution: GoogleTTS.ts의 voice mapping을 ko-KR로 고정
🔍 Check: Line 121-150 voice mapping table
```

### 3. Timeout Issues
```
❌ Problem: 298초 Remotion 타임아웃
✅ Solution: VIDEO_SOURCE=ffmpeg 설정
🔍 Check: .env 파일과 ShortCreator.ts의 videoSource 체크
```

## 📁 File Structure AI Must Navigate

### Core Processing Files
```
src/
├── index.ts                          # Entry point
├── config.ts                         # Environment config
├── short-creator/
│   ├── ShortCreator.ts               # 메인 비디오 처리 로직 ⭐
│   └── libraries/
│       ├── FFmpeg.ts                 # 비디오 연결/처리 ⭐ 오늘 개선
│       ├── google-tts/GoogleTTS.ts   # 한국어 TTS ⭐
│       ├── Whisper.ts                # 한국어 자막 생성 ⭐
│       ├── Pexels.ts                 # 비디오 검색
│       └── GoogleVeo.ts              # AI 비디오 생성 (선택사항)
└── server/
    ├── server.ts                     # Express 서버
    ├── routers/rest.ts               # API 엔드포인트 ⭐
    └── validator.ts                  # 입력 검증
```

### Configuration Files
```
.env                                  # 환경변수 ⭐ (반드시 확인)
package.json                          # 의존성
remotion.config.ts                    # Remotion (사용안함)
tsconfig.json                         # TypeScript 설정
```

## 🎯 Next Steps for AI

### 1. When Debugging Video Issues:
1. **먼저 확인:** `.env`의 `VIDEO_SOURCE=ffmpeg` 설정
2. **로그 확인:** ShortCreator.ts의 processMultiSceneWithFFmpeg 로그
3. **FFmpeg 확인:** FFmpeg.ts의 concatVideos 메서드 (line 175-238)

### 2. When Debugging Korean Subtitle Issues:
1. **TTS 확인:** GoogleTTS.ts의 voice mapping (line 121-150)
2. **Whisper 확인:** Whisper.ts의 language='ko' 설정
3. **자막 필터:** FFmpeg.ts의 createSubtitleFilter 한글 폰트 경로

### 3. When Adding New Features:
1. **API 추가:** rest.ts에 새 엔드포인트
2. **검증 추가:** validator.ts에 Zod 스키마
3. **처리 추가:** ShortCreator.ts에 로직
4. **테스트:** 한국어 3씬 테스트로 검증

## 📊 Performance Benchmarks (AI 성능 기준점)

### Expected Processing Times:
- **3씬 비디오:** ~58초
- **단일씬 비디오:** ~20초  
- **TTS 생성:** ~1초/씬
- **Whisper 인식:** ~11초/씬
- **FFmpeg 연결:** ~3초

### File Sizes:
- **16초 비디오:** ~4.4MB
- **포트레이트 1080x1920**
- **오디오:** AAC 128k

이 문서는 AI가 프로젝트를 빠르게 이해하고 문제를 해결할 수 있도록 핵심 경로만 정리한 것입니다.