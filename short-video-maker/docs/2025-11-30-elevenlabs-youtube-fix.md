# 2025-11-30 ElevenLabs Timestamps & YouTube Upload Fix

## 개요

이 문서는 두 가지 주요 문제 해결 과정을 기록합니다:
1. **ElevenLabs TTS alignment 데이터 활용** - Whisper timeout 우회
2. **YouTube 업로드 인증 문제** - channelName vs channelId 혼동

---

## 1. ElevenLabs Timestamps Fix

### 1.1 문제 상황

Cloud Run에서 Whisper transcription이 timeout 발생:
- Whisper는 CPU 집약적 작업
- Cloud Run의 제한된 리소스에서 30초 이상 소요
- `ETIMEDOUT` 에러 발생

### 1.2 해결 방안

ElevenLabs의 `convertWithTimestamps` API를 사용하여 alignment 데이터(character-level timestamps)를 직접 받아 캡션 생성.

### 1.3 코드 변경

#### `src/short-creator/libraries/elevenlabs-tts/ElevenLabsTTS.ts`

```typescript
// ElevenLabs API 호출 - convertWithTimestamps 사용
const sdkResponseRaw = await Promise.race([
  this.client.textToSpeech.convertWithTimestamps(elevenLabsVoice.voiceId, {
    text: text,
    modelId: "eleven_multilingual_v2"
  }),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('ElevenLabs API timeout after 30 seconds')), 30000)
  )
]);

// SDK response에서 실제 데이터 추출
// 중요: SDK가 { data: { audioBase64, alignment } } 형태로 래핑함
const sdkResponse = sdkResponseRaw as {
  data?: {
    audioBase64: string;
    alignment: {
      characters: string[];
      characterStartTimesSeconds: number[];  // camelCase!
      characterEndTimesSeconds: number[];
    } | null;
  };
  audioBase64?: string;
  alignment?: {...} | null;
};

const response = sdkResponse.data || sdkResponse;

// Base64를 ArrayBuffer로 변환
const audioBuffer = Buffer.from(response.audioBase64, 'base64').buffer;

// SDK response를 기존 interface에 맞게 변환 (camelCase → snake_case)
const alignmentConverted = response.alignment ? {
  characters: response.alignment.characters,
  character_start_times_seconds: response.alignment.characterStartTimesSeconds,
  character_end_times_seconds: response.alignment.characterEndTimesSeconds,
} : undefined;
```

#### 핵심 포인트

| 항목 | 설명 |
|------|------|
| SDK 응답 구조 | `{ data: { audioBase64, alignment } }` 래핑됨 |
| 프로퍼티 케이스 | SDK는 camelCase 사용 (`characterStartTimesSeconds`) |
| 내부 인터페이스 | snake_case 사용 (`character_start_times_seconds`) |
| 변환 필요 | SDK 응답 → 내부 인터페이스로 변환 |

#### `src/short-creator/processors/AudioProcessor.ts`

alignment 데이터를 word-level 캡션으로 변환:

```typescript
private convertAlignmentToCaptions(
  text: string,
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  }
): any[] {
  const captions: any[] = [];
  let currentWord = '';
  let wordStartTime = 0;
  let wordEndTime = 0;

  for (let i = 0; i < alignment.characters.length; i++) {
    const char = alignment.characters[i];
    const startTime = alignment.character_start_times_seconds[i];
    const endTime = alignment.character_end_times_seconds[i];

    if (currentWord === '') {
      wordStartTime = startTime;
    }

    if (char === ' ' || char === '\n') {
      if (currentWord.trim()) {
        captions.push({
          text: currentWord.trim(),
          start: wordStartTime,
          end: wordEndTime
        });
      }
      currentWord = '';
    } else {
      currentWord += char;
      wordEndTime = endTime;
    }
  }

  // 마지막 단어 추가
  if (currentWord.trim()) {
    captions.push({
      text: currentWord.trim(),
      start: wordStartTime,
      end: wordEndTime
    });
  }

  return captions;
}
```

### 1.4 처리 흐름

```
ElevenLabs TTS 호출
    ↓
convertWithTimestamps API
    ↓
alignment 데이터 수신 (character-level timestamps)
    ↓
convertAlignmentToCaptions() 호출
    ↓
word-level 캡션 생성
    ↓
Whisper 불필요! ✅
```

---

## 2. YouTube 업로드 인증 문제

### 2.1 문제 상황

```
"Channel not authenticated, skipping auto-upload"
```

Refresh token이 설정되어 있음에도 불구하고 인증 실패.

### 2.2 원인 분석

API 호출 시:
```json
{
  "channelId": "UCQD_Z1DzRlY4R6E8zqtJXgA"  // ❌ 잘못된 방법
}
```

시스템은 `channelName`으로 채널을 찾음:
```typescript
// ShortCreatorRefactored.ts:860
if (!this.youtubeUploader.isChannelAuthenticated(youtubeUpload.channelName)) {
  // "Channel not authenticated" 에러 발생
}
```

### 2.3 등록된 채널 확인

Secret Manager의 `YOUTUBE_DATA`에 저장된 `youtube-channels.json`:

```json
{
  "channels": {
    "main_channel": {
      "channelName": "main_channel",
      "channelId": "UC7Qhr0aTucaeQ9I-DhIbFpA",
      "channelTitle": "ATT",
      "authenticated": true
    },
    "ATT": {
      "channelName": "ATT",
      "channelId": "UCaadthD1K_3rUodAkVSucPA",
      "channelTitle": "CGXR",
      "authenticated": true
    }
  }
}
```

### 2.4 해결 방법

API 호출 시 `channelName` 사용:

```json
{
  "youtubeUpload": {
    "enabled": true,
    "channelName": "ATT",  // ✅ 올바른 방법
    "title": "테스트 영상",
    "description": "설명",
    "tags": ["test"],
    "privacyStatus": "private"
  }
}
```

### 2.5 채널 이름 ↔ ID 매핑

| channelName | channelId | channelTitle |
|-------------|-----------|--------------|
| `main_channel` | UC7Qhr0aTucaeQ9I-DhIbFpA | ATT |
| `ATT` | UCaadthD1K_3rUodAkVSucPA | CGXR |

---

## 3. 배포 설정

### 3.1 Cloud Build 설정

파일: `/tmp/cloudbuild-min-scene.yaml`

주요 환경 변수:
```yaml
- 'DOCKER=true'
- 'LOG_LEVEL=info'
- 'TTS_PROVIDER=elevenlabs'
- 'VIDEO_SOURCE=veo'
- 'VEO_MODEL=veo-3.0-fast-generate-001'
- 'WHISPER_MODEL=base.en'
```

시크릿:
```yaml
- 'PEXELS_API_KEY=PEXELS_API_KEY:latest'
- 'GOOGLE_GEMINI_API_KEY=GOOGLE_GEMINI_API_KEY:latest'
- 'GOOGLE_CLOUD_PROJECT_ID=GOOGLE_CLOUD_PROJECT_ID:latest'
- 'YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest'
- 'YOUTUBE_DATA=YOUTUBE_DATA:latest'
- 'ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:latest'
```

### 3.2 배포된 리비전

- Revision: `short-video-maker-00015-wlh`
- Region: `asia-northeast3`

---

## 4. 테스트 결과

### 4.1 테스트 API 호출

```bash
curl -X POST "https://short-video-maker-550996044521.asia-northeast3.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{
    "character": {
      "description": "A cheerful robot...",
      "style": "pixar",
      "mood": "cheerful"
    },
    "scenes": [{
      "text": "안녕하세요! 저는 AI 로봇이에요!",
      "scenePrompt": "friendly robot waving hello"
    }],
    "config": {
      "orientation": "portrait",
      "generateVideos": true
    },
    "youtubeUpload": {
      "enabled": true,
      "channelName": "ATT",
      "title": "테스트 영상",
      "privacyStatus": "private"
    }
  }'
```

### 4.2 성공 결과

| 단계 | 상태 | 비고 |
|------|------|------|
| ElevenLabs TTS | ✅ | alignment 데이터 포함 |
| Nano Banana 이미지 | ✅ | - |
| VEO3 I2V | ✅ | 33초 소요 |
| GCS 업로드 | ✅ | 1.15 MB |
| YouTube 업로드 | ✅ | 토큰 자동 갱신 |

### 4.3 성공한 YouTube 업로드

- **Video ID:** `cmilnufzn00040es6ftbw6vnn`
- **YouTube Video ID:** `OhDHmj7FUwg`
- **YouTube URL:** https://www.youtube.com/watch?v=OhDHmj7FUwg
- **Channel:** ATT (CGXR)

---

## 5. 주요 로그 메시지

### 성공 시 로그:

```
"Access token automatically refreshed"
"📤 Starting YouTube auto-upload"
"YouTube upload completed successfully"
"youtubeVideoId": "OhDHmj7FUwg"
"videoUrl": "https://www.youtube.com/watch?v=OhDHmj7FUwg"
```

### 실패 시 로그:

```
"Channel not authenticated, skipping auto-upload"
```

---

## 6. 다음 AI를 위한 참고사항

### 6.1 ElevenLabs SDK 응답 구조

```typescript
// SDK 응답은 이렇게 래핑됨
{
  data: {
    audioBase64: string,
    alignment: {
      characters: string[],
      characterStartTimesSeconds: number[],  // camelCase
      characterEndTimesSeconds: number[]
    }
  }
}
```

### 6.2 YouTube 업로드 시 필수 확인

1. `channelName` 사용 (channelId 아님!)
2. 등록된 채널: `main_channel`, `ATT`
3. Secret Manager의 `YOUTUBE_DATA`에 토큰 저장됨

### 6.3 관련 파일 위치

| 파일 | 역할 |
|------|------|
| `src/short-creator/libraries/elevenlabs-tts/ElevenLabsTTS.ts` | ElevenLabs TTS |
| `src/short-creator/processors/AudioProcessor.ts` | 캡션 생성 |
| `src/short-creator/ShortCreatorRefactored.ts` | YouTube 업로드 로직 |
| `src/youtube-upload/services/YouTubeUploader.ts` | YouTube 업로드 서비스 |

### 6.4 문제 해결 체크리스트

1. **Whisper timeout** → ElevenLabs alignment 사용 확인
2. **YouTube 인증 실패** → `channelName` 올바른지 확인
3. **토큰 만료** → "Access token automatically refreshed" 로그 확인

---

## 7. 빌드 & 배포 명령어

### 7.1 로컬 빌드

```bash
# TypeScript 빌드
npm run build

# 빌드 결과 확인
ls -la dist/
```

### 7.2 Cloud Build 설정 파일 생성

```bash
# /tmp/cloudbuild-min-scene.yaml 내용
cat > /tmp/cloudbuild-min-scene.yaml << 'EOF'
steps:
  - name: 'gcr.io/cloud-builders/docker'
    env:
      - 'DOCKER_BUILDKIT=1'
    args:
      - 'build'
      - '-f'
      - 'gcp.Dockerfile'
      - '-t'
      - 'gcr.io/$PROJECT_ID/short-video-maker:min-scene-duration'
      - '-t'
      - 'gcr.io/$PROJECT_ID/short-video-maker:latest'
      - '.'
    timeout: '1800s'
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/short-video-maker:min-scene-duration'
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/short-video-maker:latest'
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'short-video-maker'
      - '--image'
      - 'gcr.io/$PROJECT_ID/short-video-maker:min-scene-duration'
      - '--region'
      - 'asia-northeast3'
      - '--platform'
      - 'managed'
      - '--allow-unauthenticated'
      - '--memory'
      - '4Gi'
      - '--cpu'
      - '2'
      - '--timeout'
      - '3600'
      - '--concurrency'
      - '80'
      - '--min-instances'
      - '0'
      - '--max-instances'
      - '10'
      - '--port'
      - '3123'
      - '--set-env-vars'
      - 'DOCKER=true,LOG_LEVEL=info,CONCURRENCY=1,VIDEO_CACHE_SIZE_IN_BYTES=2097152000,WHISPER_MODEL=base.en,TTS_PROVIDER=elevenlabs,VIDEO_SOURCE=veo,VEO3_USE_NATIVE_AUDIO=false,VEO_MODEL=veo-3.0-fast-generate-001,GCS_BUCKET_NAME=dkdk-474008-short-videos,GCS_REGION=us-central1,GCS_SIGNED_URL_EXPIRY_HOURS=24,GCS_AUTO_DELETE_DAYS=30'
      - '--set-secrets'
      - 'PEXELS_API_KEY=PEXELS_API_KEY:latest,GOOGLE_GEMINI_API_KEY=GOOGLE_GEMINI_API_KEY:latest,GOOGLE_CLOUD_PROJECT_ID=GOOGLE_CLOUD_PROJECT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest,YOUTUBE_DATA=YOUTUBE_DATA:latest,ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:latest'
timeout: '3600s'
options:
  machineType: 'E2_HIGHCPU_8'
  diskSizeGb: 100
  logging: CLOUD_LOGGING_ONLY
images:
  - 'gcr.io/$PROJECT_ID/short-video-maker:min-scene-duration'
  - 'gcr.io/$PROJECT_ID/short-video-maker:latest'
EOF
```

### 7.3 Cloud Build 배포 실행

```bash
# 프로젝트 루트에서 실행
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# Cloud Build 제출
gcloud builds submit --config=/tmp/cloudbuild-min-scene.yaml --project=dkdk-474008 .

# 빌드 상태 확인
gcloud builds list --project=dkdk-474008 --limit=5 --format="table(id,status,createTime)"

# 특정 빌드 로그 확인
gcloud builds log BUILD_ID --project=dkdk-474008
```

### 7.4 Cloud Run 배포 확인

```bash
# 서비스 상태 확인
gcloud run services describe short-video-maker \
  --region=asia-northeast3 \
  --project=dkdk-474008 \
  --format="table(status.url,status.latestReadyRevisionName)"

# 리비전 목록 확인
gcloud run revisions list \
  --service=short-video-maker \
  --region=asia-northeast3 \
  --project=dkdk-474008 \
  --limit=5
```

---

## 8. 디버깅 & 로그 확인 명령어

### 8.1 Cloud Run 로그 확인

```bash
# 최근 에러 로그
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="short-video-maker" AND severity>=ERROR' \
  --project=dkdk-474008 \
  --limit=20 \
  --format='json(jsonPayload.msg,jsonPayload.err,timestamp)'

# 특정 videoId 로그 추적
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="short-video-maker" AND jsonPayload.videoId="VIDEO_ID_HERE"' \
  --project=dkdk-474008 \
  --limit=50 \
  --format='json(jsonPayload.msg,timestamp)'

# YouTube 관련 로그
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="short-video-maker" AND (jsonPayload.msg:"YouTube" OR jsonPayload.msg:"youtube")' \
  --project=dkdk-474008 \
  --limit=20 \
  --format='json(jsonPayload)'

# ElevenLabs TTS 로그
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="short-video-maker" AND (jsonPayload.msg:"ElevenLabs" OR jsonPayload.msg:"TTS" OR jsonPayload.msg:"alignment")' \
  --project=dkdk-474008 \
  --limit=20 \
  --format='json(jsonPayload)'

# 특정 리비전 로그
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="short-video-maker" AND resource.labels.revision_name="REVISION_NAME"' \
  --project=dkdk-474008 \
  --limit=30 \
  --format='json(jsonPayload.msg,timestamp)'
```

### 8.2 Secret Manager 확인

```bash
# 시크릿 목록
gcloud secrets list --project=dkdk-474008

# YouTube 데이터 내용 확인
gcloud secrets versions access latest --secret=YOUTUBE_DATA --project=dkdk-474008 | base64 -d | tar -tzf -

# YouTube 채널 설정 확인
gcloud secrets versions access latest --secret=YOUTUBE_DATA --project=dkdk-474008 | base64 -d | tar -xzOf - youtube-channels.json
```

### 8.3 API 테스트 명령어

```bash
# 비디오 상태 확인
curl -s "https://short-video-maker-550996044521.asia-northeast3.run.app/api/video/consistent-shorts/VIDEO_ID/status"

# 채널 목록 확인
curl -s "https://short-video-maker-550996044521.asia-northeast3.run.app/api/youtube/channels"

# 헬스 체크
curl -s "https://short-video-maker-550996044521.asia-northeast3.run.app/health"
```

---

## 9. 커밋 정보

### 커밋 히스토리

```bash
# 오늘 커밋
git log --oneline -5
```

### 커밋 내용:
- **Commit:** `18eb063`
- **Message:** Fix ElevenLabs timestamps and YouTube upload authentication
- **Revision:** `short-video-maker-00015-wlh`
- **날짜:** 2025-11-30

### 변경된 파일:
```
src/short-creator/libraries/elevenlabs-tts/ElevenLabsTTS.ts
src/short-creator/processors/AudioProcessor.ts
src/short-creator/libraries/TTSProvider.ts
docs/2025-11-30-elevenlabs-youtube-fix.md (이 문서)
```

---

## 10. Quick Reference

### 자주 쓰는 명령어 모음

```bash
# 빌드 & 배포
npm run build && gcloud builds submit --config=/tmp/cloudbuild-min-scene.yaml --project=dkdk-474008 .

# 에러 로그 확인
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="short-video-maker" AND severity>=ERROR' --project=dkdk-474008 --limit=10 --format='json(jsonPayload.msg)'

# 비디오 상태 확인
curl -s "https://short-video-maker-550996044521.asia-northeast3.run.app/api/video/consistent-shorts/VIDEO_ID/status"

# YouTube 채널 확인
gcloud secrets versions access latest --secret=YOUTUBE_DATA --project=dkdk-474008 | base64 -d | tar -xzOf - youtube-channels.json
```

---

*문서 작성: 2025-11-30*
