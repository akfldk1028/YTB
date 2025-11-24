# CONSISTENT SHORTS Workflow 완전 가이드 (2025-11-21)

## 개요
CONSISTENT SHORTS는 **캐릭터 일관성**을 유지하면서 여러 장면의 쇼츠 영상을 자동으로 생성하는 워크플로우입니다.

- **NANO BANANA**: 캐릭터 일관성 유지 (Chat Mode처럼 이전 이미지를 reference로 사용)
- **VEO3 I2V**: 생성된 이미지를 동영상으로 변환 (선택사항)
- **YouTube 자동 업로드**: 비디오 생성 완료 후 YouTube에 자동 업로드 (선택사항)
- **GCS 통합**: 생성된 비디오를 Google Cloud Storage에 자동 업로드 및 관리

## 전체 플로우

```
API 요청 → 큐 추가 → 오디오 생성 → NANO BANANA 이미지 생성 (캐릭터 일관성)
→ VEO3 I2V 변환 → 영상 합성 → GCS 업로드 → YouTube 자동 업로드 → 완료
```

## 1. 개발 환경 설정

### 필수 환경 변수
```bash
# .env 파일
# Google AI API Keys
GOOGLE_AI_API_KEY=your-gemini-api-key
VEO3_API_KEY=your-veo3-api-key

# Google Cloud (GCS & Cloud Run)
GOOGLE_CLOUD_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=your-bucket-name
GCS_REGION=asia-northeast3
GCS_STORAGE_CLASS=STANDARD
GCS_SIGNED_URL_EXPIRY_HOURS=72
GCS_AUTO_DELETE_LOCAL_AFTER_DAYS=0  # 0 = never delete locally

# Service Account (로컬 개발용, Cloud Run에서는 불필요)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json

# YouTube API
YOUTUBE_CLIENT_SECRET_PATH=/path/to/client_secret.json
YOUTUBE_TOKENS_DIR=/path/to/youtube-tokens

# Server
PORT=3000
NODE_ENV=development
```

### YouTube 채널 인증 설정
```bash
# 1. YouTube 채널 추가
curl -X POST "http://localhost:3000/api/youtube/channels" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "main_channel",
    "displayName": "My Main Channel"
  }'

# 2. 인증 URL 받기
curl "http://localhost:3000/api/youtube/channels/main_channel/auth-url"

# 3. 브라우저에서 인증 URL 방문 → OAuth 승인

# 4. 인증 콜백 처리 (redirect URI에서 code 받아서)
curl -X POST "http://localhost:3000/api/youtube/channels/main_channel/callback" \
  -H "Content-Type: application/json" \
  -d '{"code": "4/0AanRR..."}'
```

## 2. 빌드

```bash
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# 의존성 설치
pnpm install

# TypeScript 빌드
pnpm build

# 빌드 성공 확인
ls -lh dist/
```

## 3. 로컬 실행

```bash
# 개발 모드
npm run dev

# 프로덕션 모드
npm start

# 서버 확인
curl http://localhost:3000/health
```

## 4. Cloud Run 배포

### 배포 스크립트
```bash
# 배포 스크립트 사용
./deploy-gcp.sh

# 또는 환경변수와 함께 배포
GCP_REGION=asia-northeast3 MEMORY=8Gi CPU=2 MAX_INSTANCES=3 ./deploy-gcp.sh
```

### 배포 스크립트 내용 (deploy-gcp.sh)
```bash
#!/bin/bash
set -e

# Configuration
PROJECT_ID="${GOOGLE_CLOUD_PROJECT_ID:-dkdk-474008}"
SERVICE_NAME="short-video-maker"
REGION="${GCP_REGION:-us-central1}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Build version tag
SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
TIMESTAMP=$(date +%s)
BUILD_TAG="${SHA}-${TIMESTAMP}"

echo "Building Docker image: ${IMAGE_NAME}:${BUILD_TAG}"

# Build and push
docker build -t ${IMAGE_NAME}:${BUILD_TAG} .
docker push ${IMAGE_NAME}:${BUILD_TAG}

# Deploy to Cloud Run
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME}:${BUILD_TAG} \
  --platform managed \
  --region ${REGION} \
  --memory ${MEMORY:-8Gi} \
  --cpu ${CPU:-2} \
  --timeout 3600 \
  --max-instances ${MAX_INSTANCES:-5} \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID}"

echo "Deployment complete!"
```

### Cloud Run 환경에서의 인증
Cloud Run에서는 **Application Default Credentials (ADC)** 를 자동으로 사용합니다:
- Service Account Key 파일 불필요
- Cloud Run의 Service Account에 필요한 권한만 부여하면 됨

필요한 IAM 권한:
```bash
# Cloud Run Service Account에 부여
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/storage.objectAdmin"  # GCS 접근

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"  # Secret Manager 접근
```

## 5. API 호출 (CONSISTENT SHORTS 생성)

### 엔드포인트
```
POST https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts
```

### 요청 형식

#### 기본 예제 (YouTube 자동 업로드 포함)
```json
{
  "character": {
    "description": "A cute animated robot with big eyes and a friendly smile",
    "style": "cinematic",
    "mood": "happy"
  },
  "scenes": [
    {
      "text": "Scene one robot",
      "scenePrompt": "Robot standing in a futuristic city"
    },
    {
      "text": "Scene two robot",
      "scenePrompt": "Robot walking through neon-lit streets"
    }
  ],
  "config": {
    "orientation": "portrait",
    "voice": "af_heart",
    "generateVideos": true
  },
  "youtubeUpload": {
    "enabled": true,
    "channelName": "main_channel",
    "metadata": {
      "title": "AI Robot Character - Consistent Shorts Test",
      "description": "Testing Consistent Shorts workflow with NANO BANANA character consistency and VEO3 I2V conversion.",
      "tags": ["shorts", "ai", "animation", "robot", "veo3"],
      "categoryId": "22",
      "privacyStatus": "unlisted"
    },
    "notifySubscribers": false
  }
}
```

### 요청 파라미터 설명

#### character (필수)
- `description`: 캐릭터 설명 (NANO BANANA prompt)
- `style`: 스타일 (cinematic, anime, realistic 등)
- `mood`: 분위기 (happy, sad, mysterious 등)

#### scenes (필수)
- `text`: TTS로 변환할 텍스트
- `scenePrompt`: VEO3 I2V에 사용할 장면 프롬프트
- `duration`: 장면 길이 (초, 선택사항)

#### config (선택사항)
- `orientation`: "portrait" (9:16) 또는 "landscape" (16:9)
- `voice`: ElevenLabs 음성 ID (기본값: "af_heart")
- `generateVideos`: true면 VEO3 I2V 사용, false면 이미지만 생성
- `musicVolume`: "low", "medium", "high"

#### youtubeUpload (선택사항)
- `enabled`: true로 설정하면 자동 업로드 활성화
- `channelName`: YouTube 채널 이름 (사전 인증 필요)
- `metadata`: YouTube 비디오 메타데이터
  - `title`: 비디오 제목
  - `description`: 비디오 설명
  - `tags`: 태그 배열
  - `categoryId`: YouTube 카테고리 ID (기본값: "22" = People & Blogs)
  - `privacyStatus`: "public", "unlisted", "private"
- `notifySubscribers`: 구독자 알림 여부 (기본값: false)

### cURL 예제
```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{
    "character": {
      "description": "A cute animated robot",
      "style": "cinematic",
      "mood": "happy"
    },
    "scenes": [
      {
        "text": "Scene one robot",
        "scenePrompt": "Robot standing"
      },
      {
        "text": "Scene two robot",
        "scenePrompt": "Robot walking"
      }
    ],
    "config": {
      "orientation": "portrait",
      "voice": "af_heart",
      "generateVideos": true
    },
    "youtubeUpload": {
      "enabled": true,
      "channelName": "main_channel",
      "metadata": {
        "title": "AI Robot - Shorts Test",
        "description": "Generated with CONSISTENT SHORTS workflow",
        "tags": ["shorts", "ai", "robot"],
        "privacyStatus": "unlisted"
      }
    }
  }'
```

### 응답
```json
{
  "videoId": "cmi7lc6a900030es64sig0b0z",
  "mode": "consistent-shorts",
  "sceneCount": 2,
  "characterDescription": "A cute animated robot",
  "generateVideos": true,
  "message": "Consistent character video generation started. All scenes will feature the same character."
}
```

## 6. 상태 확인

```bash
# 비디오 생성 상태 확인
curl "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/[VIDEO_ID]/status"
```

### 응답 예제
```json
{
  "mode": "consistent-shorts",
  "status": "completed",
  "videoId": "cmi7lc6a900030es64sig0b0z",
  "videoPath": "/app/data/videos/cmi7lc6a900030es64sig0b0z.mp4",
  "processing": false,
  "timestamp": "2025-11-21T03:22:15.800Z",
  "gcsUrl": "gs://dkdk-474008-short-videos/videos/cmi7lc6a900030es64sig0b0z.mp4",
  "youtubeVideoId": "L9cXSgfjTzA",
  "youtubeUrl": "https://www.youtube.com/watch?v=L9cXSgfjTzA"
}
```

## 7. 워크플로우 상세 동작

### 7.1 캐릭터 일관성 (NANO BANANA)
```typescript
// 각 scene마다 NANO BANANA로 이미지 생성
for (let i = 0; i < scenes.length; i++) {
  // Scene 1: reference 없이 생성
  // Scene 2~N: 이전 이미지들을 reference로 사용 (최대 3장)

  const referenceImages = i > 0
    ? previousImages.slice(-3).map(img => ({
        data: img.data,
        mimeType: img.mimeType
      }))
    : undefined;

  // NANO BANANA 호출
  const result = await imageGenerationService.generateImages({
    prompt: enhancedPrompt,
    numberOfImages: 1,
    aspectRatio: "9:16",
    referenceImages: referenceImages  // ⭐ Chat Mode!
  });

  // 생성된 이미지를 다음 scene의 reference로 추가
  previousImages.push({
    data: generatedImage.data,
    mimeType: "image/png",
    sceneIndex: i
  });
}
```

### 7.2 VEO3 I2V 변환 (선택사항)
```typescript
if (config.generateVideos) {
  // 각 이미지를 VEO3 I2V로 동영상 변환
  for (const imageData of imageDataList) {
    const veoResult = await veo3Service.generateVideo({
      prompt: scene.videoPrompt,
      referenceImage: imageData.imageBuffer,
      duration: audioDuration
    });

    // VEO3 비디오 다운로드
    await veo3Service.downloadVideo(veoResult.videoId, localPath);
  }
}
```

### 7.3 GCS 업로드
비디오 생성 완료 후 자동으로 GCS에 업로드:
```typescript
if (gcsService) {
  const uploadResult = await gcsService.uploadVideo(
    videoId,
    videoPath,
    (progress) => {
      logger.debug({ percentComplete: progress.percentComplete });
    }
  );

  // GCS Path: gs://bucket-name/videos/[VIDEO_ID].mp4
  // Signed URL 생성 (72시간 유효)
}
```

### 7.4 YouTube 자동 업로드
```typescript
if (youtubeUpload?.enabled && youtubeUploader) {
  // 1. 로컬 파일 확인
  // 2. 없으면 GCS에서 다운로드
  // 3. YouTube API로 업로드
  // 4. 임시 파일 정리

  const youtubeVideoId = await youtubeUploader.uploadVideo(
    videoId,
    channelName,
    metadata,
    notifySubscribers
  );

  // YouTube URL: https://www.youtube.com/watch?v=[YOUTUBE_VIDEO_ID]
}
```

## 8. 주요 파일 및 코드 위치

### API 엔드포인트
- `src/server/api/consistent-shorts.ts:67-178` - POST /api/video/consistent-shorts
- `src/server/api/consistent-shorts.ts:151` - YouTube 메타데이터 전달

### 워크플로우 로직
- `src/short-creator/workflows/ConsistentShortsWorkflow.ts:104-189` - NANO BANANA 캐릭터 일관성
- `src/short-creator/workflows/ConsistentShortsWorkflow.ts:131-149` - Reference Images 사용

### YouTube 업로드
- `src/youtube-upload/services/YouTubeUploader.ts:170-326` - YouTube 업로드 메인 로직
- `src/youtube-upload/services/YouTubeUploader.ts:196-210` - GCS 다운로드 지원
- `src/short-creator/ShortCreatorRefactored.ts:277-281` - 자동 업로드 트리거

### GCS 통합
- `src/storage/GoogleCloudStorageService.ts:85-190` - GCS 업로드
- `src/storage/GoogleCloudStorageService.ts:240-285` - GCS 다운로드
- `src/youtube-upload/services/YouTubeUploader.ts:33-40` - GCS 서비스 초기화 (ADC 지원)

## 9. 비용 최적화

### NANO BANANA 사용량
- Scene 개수만큼 NANO BANANA 호출 (각 scene당 1장)
- 예: 2 scenes = NANO BANANA 2장

### VEO3 사용량
- `generateVideos: true`일 때만 VEO3 호출
- Scene 개수만큼 VEO3 I2V 호출

### GCS 비용
- Storage Class: STANDARD (기본값)
- Signed URL 만료: 72시간
- 로컬 파일 삭제: `GCS_AUTO_DELETE_LOCAL_AFTER_DAYS` 설정으로 제어

## 10. 문제 해결

### YouTube 업로드 실패
```bash
# 1. 채널 인증 확인
curl "http://localhost:3000/api/youtube/channels"

# 2. 채널 재인증
curl "http://localhost:3000/api/youtube/channels/main_channel/auth-url"

# 3. 수동 업로드 테스트
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/upload" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "cmi7lc6a900030es64sig0b0z",
    "channelName": "main_channel",
    "metadata": {
      "title": "Test",
      "description": "Test",
      "privacyStatus": "unlisted"
    }
  }'
```

### GCS 다운로드 실패
```bash
# GCS 연결 테스트
gsutil ls gs://your-bucket-name/videos/

# 파일 존재 확인
gsutil ls -lh gs://your-bucket-name/videos/[VIDEO_ID].mp4

# 수동 다운로드
gsutil cp gs://your-bucket-name/videos/[VIDEO_ID].mp4 /tmp/
```

### VEO3 타임아웃
- VEO3 I2V는 scene당 1-2분 소요
- Cloud Run timeout: 3600초 (60분)
- 긴 비디오는 scene을 줄이거나 나눠서 생성

### 빌드 실패
```bash
# 캐시 클리어 후 재빌드
rm -rf dist/ node_modules/.cache
pnpm install
pnpm build
```

## 11. 테스트된 구성

### 성공한 테스트 케이스
```json
{
  "character": {
    "description": "A cute animated robot",
    "style": "cinematic",
    "mood": "happy"
  },
  "scenes": [
    {
      "text": "Scene one robot",
      "scenePrompt": "Robot standing"
    },
    {
      "text": "Scene two robot",
      "scenePrompt": "Robot walking"
    }
  ],
  "config": {
    "orientation": "portrait",
    "voice": "af_heart",
    "generateVideos": true
  },
  "youtubeUpload": {
    "enabled": true,
    "channelName": "main_channel",
    "metadata": {
      "title": "AI Robot Character - Consistent Shorts Test",
      "description": "Testing Consistent Shorts workflow",
      "tags": ["shorts", "ai", "animation", "robot", "veo3"],
      "privacyStatus": "unlisted"
    }
  }
}
```

**결과**:
- Video ID: `cmi7lc6a900030es64sig0b0z`
- 길이: 2.25초 (2 scenes)
- NANO BANANA: 2장 사용
- VEO3: 2 clips 생성 및 결합
- GCS: 성공 업로드
- YouTube: `https://www.youtube.com/watch?v=L9cXSgfjTzA`
- Deployment: `short-video-maker-00041-v78`

## 12. 다음 단계

### 추가 기능 개발
- [ ] Reference Set 자동 생성 (POST /api/video/consistent-shorts/reference-set)
- [ ] Webhook 콜백 지원
- [ ] 배치 생성 (여러 비디오 동시 생성)
- [ ] Scene 템플릿

### 최적화
- [ ] NANO BANANA 캐싱
- [ ] VEO3 병렬 처리
- [ ] GCS 멀티파트 업로드
- [ ] YouTube 업로드 재시도 로직

## 13. 참고 자료

### 관련 문서
- NANO BANANA API: https://ai.google.dev/gemini-api/docs/imagen
- VEO3 I2V: https://developers.googleblog.com/en/veo-3-video-generation/
- YouTube Data API v3: https://developers.google.com/youtube/v3
- Google Cloud Storage: https://cloud.google.com/storage/docs

### 코드 저장소
- GitHub: (your repository)
- Cloud Run Service: `short-video-maker-7qtnitbuvq-uc.a.run.app`

---

**마지막 업데이트**: 2025-11-21
**작성자**: AI Assistant (Claude)
**버전**: v1.0
