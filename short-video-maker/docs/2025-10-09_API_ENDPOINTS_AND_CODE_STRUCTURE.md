# API 엔드포인트 및 코드 구조 가이드

**작성일**: 2025-10-09
**목적**: 다음 AI 또는 개발자가 API 엔드포인트와 관련 코드를 빠르게 찾을 수 있도록 정리

---

## 📋 목차

1. [서버 진입점](#1-서버-진입점)
2. [API 엔드포인트 개요](#2-api-엔드포인트-개요)
3. [모드별 API 라우터](#3-모드별-api-라우터)
4. [핵심 워크플로우](#4-핵심-워크플로우)
5. [비디오 소스 및 프로세서](#5-비디오-소스-및-프로세서)
6. [주요 설정 파일](#6-주요-설정-파일)

---

## 1. 서버 진입점

### `/src/index.ts`
- **역할**: 애플리케이션 메인 진입점
- **주요 기능**:
  - TTS Provider 초기화 (ElevenLabs → Google TTS 폴백)
  - Whisper, FFmpeg 초기화
  - NANO BANANA Image Generation Service 초기화
  - VEO API, Pexels API 초기화
  - `ShortCreator` 인스턴스 생성
  - Server 시작

### `/src/server/server.ts`
- **역할**: Express 서버 설정 및 라우터 마운트
- **마운트된 엔드포인트**:
  ```
  /health                          - 헬스체크
  /api/*                          - 메인 API (APIRouter)
  /mcp/*                          - MCP 프로토콜 (MCPRouter)
  /api/images/*                   - 이미지 생성 (ImageRoutes)
  /api/video/pexels/*             - Mode 1: PEXELS 전용
  /api/video/nano-banana/*        - Mode 2: NANO BANANA 전용 (FFmpeg 정적 비디오)
  /api/video/veo3/*               - Mode 3: NANO BANANA + VEO3
  ```

---

## 2. API 엔드포인트 개요

### 헬스체크
```
GET /health
```
- 서버 상태 확인
- Response: `{ "status": "ok" }`

### 비디오 생성 엔드포인트

#### Mode 1: PEXELS 전용
```
POST /api/video/pexels
GET /api/video/pexels/:videoId/status
```

#### Mode 2: NANO BANANA 전용 (FFmpeg 정적 비디오)
```
POST /api/video/nano-banana
GET /api/video/nano-banana/:videoId/status
```

#### Mode 3: NANO BANANA + VEO3 (Image-to-Video)
```
POST /api/video/veo3
GET /api/video/veo3/:videoId/status
```

---

## 3. 모드별 API 라우터

### Mode 1: PEXELS (`/src/server/api/pexels.ts`)

**파일**: `PexelsAPIRouter`

**동작**:
- PEXELS 비디오 소스 강제 사용
- VEO3 관련 필드 제거
- `videoSource: "pexels"` 강제 설정

**요청 예시**:
```json
{
  "scenes": [
    {
      "text": "A beautiful sunset",
      "keywords": ["sunset", "nature"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "voice": "af_heart"
  }
}
```

---

### Mode 2: NANO BANANA (`/src/server/api/nano-banana.ts`)

**파일**: `NanoBananaAPIRouter`

**동작**:
- NANO BANANA 이미지 생성 강제
- FFmpeg로 정적 비디오 생성
- `needsImageGeneration: true` 강제 설정
- `videoSource: "ffmpeg"` 사용

**요청 예시**:
```json
{
  "scenes": [
    {
      "text": "First scene with golden light",
      "imageData": {
        "prompt": "Golden sunrise over mountains",
        "style": "cinematic",
        "mood": "dynamic"
      }
    }
  ],
  "config": {
    "orientation": "portrait",
    "voice": "af_heart"
  }
}
```

**응답**:
```json
{
  "videoId": "cmgiv3npg0000uvdlbp1v3a8w",
  "mode": "nano-banana"
}
```

---

### Mode 3: VEO3 (`/src/server/api/veo3.ts`)

**파일**: `VEO3APIRouter`

**동작**:
- NANO BANANA 이미지 생성 → VEO3 Image-to-Video
- `mode: "veo3"` 메타데이터 설정
- `veo3_priority: true` 강제
- `needsImageGeneration: true` 모든 씬에 적용

**요청 예시**:
```json
{
  "scenes": [
    {
      "text": "First scene with golden light",
      "image_prompt": "Golden sunrise over mountains",
      "duration": 2
    },
    {
      "text": "Second scene shows ocean",
      "image_prompt": "Deep blue ocean waves",
      "duration": 2
    }
  ],
  "config": {
    "orientation": "portrait",
    "voice": "af_heart",
    "videoSource": "veo"
  },
  "metadata": {
    "mode": "veo3",
    "veo3_priority": true
  }
}
```

**응답**:
```json
{
  "videoId": "cmgiv3npg0000uvdlbp1v3a8w",
  "mode": "veo3"
}
```

---

## 4. 핵심 워크플로우

### ShortCreatorRefactored (`/src/short-creator/ShortCreatorRefactored.ts`)

**역할**: 비디오 생성 오케스트레이션

**주요 메서드**:
- `addToQueue()`: 비디오를 큐에 추가
- `processVideo()`: 큐에서 비디오 처리 시작
- `createShort()`: 실제 비디오 생성 로직
- `generateVideoForScene()`: 씬별 비디오 생성 (VEO3/PEXELS 분기)

**VEO3 워크플로우** (lines 335-380):
```typescript
if (metadata?.mode === "veo3" && this.imageGenerationService && this.veoVideoSource) {
  // 1. NANO BANANA 이미지 생성
  const imageGenResult = await this.imageGenerationService.generateImages(params, videoId, sceneIndex);

  // 2. VEO3 Image-to-Video
  const videoResult = await this.veoVideoSource.generateFromImage(imageData, audioDuration);

  return videoResult;
}
```

---

### 워크플로우 클래스

#### SingleSceneWorkflow (`/src/short-creator/workflows/SingleSceneWorkflow.ts`)
- 단일 씬 비디오 처리
- FFmpeg로 오디오/자막 합성

#### MultiSceneWorkflow (`/src/short-creator/workflows/MultiSceneWorkflow.ts`)
- **핵심 기능**:
  - 다중 씬 처리
  - VEO3 모드: TTS 오디오로 VEO3 네이티브 오디오 교체
  - Whisper 기반 정확한 타이밍
  - 씬별 자막 time offset 조정
  - FFmpeg 씬 연결

**주요 로직**:
```typescript
// VEO3 TTS 모드: VEO3 오디오를 TTS 나레이션으로 교체
if (isVeo3Mode && !useVeo3NativeAudio) {
  await this.videoProcessor.replaceVeo3AudioWithTTS(
    scene.video,
    scene.audio.url,
    sceneDuration,
    sceneVideoPath
  );
}

// 자막 시간 오프셋 적용
const adjustedCaptions = scene.captions.map(caption => ({
  ...caption,
  startMs: caption.startMs + (cumulativeDuration * 1000),
  endMs: caption.endMs + (cumulativeDuration * 1000),
}));

// 씬 비디오 연결
await this.videoProcessor.concatenateScenes(sceneVideoPaths, tempConcatenatedPath);
```

**Temp 파일 보존** (lines 158-184):
- 기존 cleanup 코드 비활성화
- 검증용 temp 파일 보존
- 디버깅 로그 추가

#### NanoBananaStaticWorkflow (`/src/short-creator/workflows/NanoBananaStaticWorkflow.ts`)
- NANO BANANA 정적 이미지 비디오 전용
- FFmpeg로 이미지 → 비디오 변환

---

## 5. 비디오 소스 및 프로세서

### 비디오 소스

#### PexelsVideoSource (`/src/short-creator/video-sources/PexelsVideoSource.ts`)
- Pexels API 비디오 검색

#### VeoVideoSource (`/src/short-creator/video-sources/VeoVideoSource.ts`)
- Google VEO2/VEO3 비디오 생성
- Image-to-Video 지원

#### NanoBananaVideoSource (`/src/short-creator/video-sources/NanoBananaVideoSource.ts`)
- **역할**: NANO BANANA 이미지 생성
- `generateStaticVideo()`: 단일 이미지 생성
- `generateMultipleImages()`: 복수 이미지 생성 (일관성 유지)

**주요 메서드**:
```typescript
async generateStaticVideo(params: NanoBananaVideoParams): Promise<VideoResult> {
  const enhancedPrompt = `${params.imageData.prompt}. Style: ${params.imageData.style}. Mood: ${params.imageData.mood}`;
  const aspectRatio = params.orientation === OrientationEnum.portrait ? "9:16" : "16:9";

  const result = await this.imageGenerationService.generateImages({
    prompt: enhancedPrompt,
    numberOfImages: 1,
    aspectRatio: aspectRatio
  }, params.videoId, params.sceneIndex);

  return { url: `nano-banana://${tempId}`, width, height, id: tempId };
}
```

---

### 프로세서

#### AudioProcessor (`/src/short-creator/processors/AudioProcessor.ts`)
- TTS 오디오 생성
- Whisper 음성 인식
- 자막 생성

#### VideoProcessor (`/src/short-creator/processors/VideoProcessor.ts`)
- FFmpeg 비디오 처리
- VEO3 오디오 교체
- 자막 추가
- 씬 연결

**주요 메서드**:
- `replaceVeo3AudioWithTTS()`: VEO3 오디오를 TTS로 교체
- `concatenateScenes()`: 씬 비디오 연결
- `addSubtitlesToVideo()`: 자막 추가
- `createVideoTempDir()`: 비디오별 temp 디렉토리 생성

---

## 6. 주요 설정 파일

### 환경 변수 (`.env`)
```bash
# 비디오 소스 설정
VIDEO_SOURCE=veo              # pexels | veo | leonardo | both

# VEO3 오디오 모드
VEO3_USE_NATIVE_AUDIO=false   # false: TTS 오디오 사용 (기본)
                              # true: VEO3 네이티브 오디오 사용

# API Keys
GOOGLE_GEMINI_API_KEY=your_key
PEXELS_API_KEY=your_key
ELEVENLABS_API_KEY=your_key
```

### Config (`/src/config.ts`)
- 환경 변수 로드
- 설정 검증
- 기본값 설정

---

## 7. Temp 파일 관리

### 보존된 위치
```bash
# 비디오별 temp 폴더
~/.ai-agents-az-video-generator/temp/{videoId}/

# 보존되는 파일
- scene_0_{videoId}.png          # NANO BANANA 이미지
- scene_1_{videoId}.png
- scene_0.mp4                    # 씬별 비디오 (선택적)
- temp_concat.mp4                # 임시 연결 비디오
```

### Cleanup 비활성화
**파일**:
- `/src/short-creator/workflows/MultiSceneWorkflow.ts` (lines 158-184)
- `/src/short-creator/ShortCreatorRefactored.ts` (lines 314-317)

**이유**: 검증 및 디버깅을 위해 temp 파일 보존

---

## 8. 주요 데이터 파서

### RawDataParser (`/src/server/parsers/N8NDataParser.ts`)
- **역할**: N8N 워크플로우 데이터 파싱
- Raw 데이터 → Validated Schema 변환
- 채널 설정 추출
- 메타데이터 정규화

---

## 9. 테스트 방법

### Mode 3: VEO3 테스트
```bash
curl -X POST http://localhost:3124/api/video/veo3/ \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [
      {
        "text": "First scene with golden light",
        "image_prompt": "Golden sunrise over mountains",
        "duration": 2
      }
    ],
    "config": {
      "orientation": "portrait",
      "voice": "af_heart",
      "videoSource": "veo"
    },
    "metadata": {
      "mode": "veo3"
    }
  }'
```

### 상태 확인
```bash
curl http://localhost:3124/api/video/veo3/{videoId}/status
```

---

## 10. 디버깅 팁

### 로그 확인
```bash
# 서버 로그
tail -f server.log | grep -E "(Scene|TTS|Whisper|NANO|VEO|Download|Concatenat|✅)"

# Temp 폴더 확인
ls -lh ~/.ai-agents-az-video-generator/temp/{videoId}/
```

### 주요 로그 키워드
- `🎬 VEO3 mode`: VEO3 모드 시작
- `🖼️ Generating image with NANO BANANA`: 이미지 생성 시작
- `✅ Image generated successfully`: 이미지 생성 완료
- `⬇️ Downloading video from VEO API`: VEO 비디오 다운로드
- `✅ Video downloaded successfully`: 다운로드 완료
- `Using Whisper-based accurate scene timing`: Whisper 타이밍 적용
- `Applying synchronized subtitles`: 자막 추가

---

## 11. 핵심 기능 요약

### ✅ 완성된 기능
1. **VEO3 워크플로우**: NANO BANANA → VEO3 → FFmpeg 연결
2. **Multi-scene 처리**: 씬별 타이밍 정확도 (Whisper 기반)
3. **오디오 교체**: VEO3 네이티브 오디오 → TTS 오디오
4. **자막 동기화**: Time offset 자동 조정
5. **Temp 파일 보존**: 검증 가능한 디버깅 환경
6. **모드별 API**: PEXELS / NANO BANANA / VEO3 독립 엔드포인트
7. **TTS 폴백**: ElevenLabs → Google TTS 자동 전환

### 🔧 유지보수 포인트
- **Cleanup 코드**: 현재 비활성화 (검증 완료 후 활성화 여부 결정)
- **VEO3 오디오 모드**: 환경 변수로 제어 (`VEO3_USE_NATIVE_AUDIO`)
- **Image Generation**: NANO BANANA (Gemini 2.5 Flash Image Preview)

---

## 12. 다음 AI/개발자를 위한 체크리스트

- [ ] `/src/server/server.ts` - 엔드포인트 라우팅 확인
- [ ] `/src/server/api/veo3.ts` - VEO3 API 로직
- [ ] `/src/short-creator/ShortCreatorRefactored.ts` - 비디오 생성 오케스트레이션
- [ ] `/src/short-creator/workflows/MultiSceneWorkflow.ts` - 멀티씬 워크플로우
- [ ] `/src/short-creator/video-sources/NanoBananaVideoSource.ts` - NANO BANANA 이미지 생성
- [ ] `/src/short-creator/processors/VideoProcessor.ts` - FFmpeg 비디오 처리
- [ ] `temp 파일 보존 코드` - MultiSceneWorkflow.ts:158-184, ShortCreatorRefactored.ts:314-317

---

**마지막 업데이트**: 2025-10-09
**작성자**: Claude Code AI Assistant
