# 2025-11-14: GCP Cloud Run 배포 + YouTube 자동 업로드 통합

## 📋 목차
- [개요](#개요)
- [준비 사항](#준비-사항)
- [1단계: YouTube Credentials를 GCP Secret Manager에 저장](#1단계-youtube-credentials를-gcp-secret-manager에-저장)
- [2단계: 배포 스크립트 수정](#2단계-배포-스크립트-수정)
- [3단계: 소스 코드 수정](#3단계-소스-코드-수정)
- [4단계: 빌드 및 배포](#4단계-빌드-및-배포)
- [5단계: 배포 확인 및 테스트](#5단계-배포-확인-및-테스트)
- [문제 해결](#문제-해결)
- [다음 AI를 위한 체크리스트](#다음-ai를-위한-체크리스트)

---

## 개요

이 문서는 **YouTube 자동 업로드 기능이 포함된 Short Video Maker를 Google Cloud Run에 배포하는 전체 과정**을 설명합니다.

### 배포 목표
1. ✅ YouTube OAuth2 credentials를 GCP Secret Manager에 안전하게 저장
2. ✅ Cloud Run 환경에서 YouTube 자동 업로드 작동
3. ✅ GCS (Google Cloud Storage) 통합
4. ✅ 모든 영상 생성 API에서 YouTube 업로드 지원

### 핵심 변경 사항
- YouTube credentials를 환경 변수에서 파일로 변환하는 로직 추가
- Secret Manager에 YouTube credentials 저장
- 배포 스크립트에 YouTube secrets 연결
- Cloud Build를 통한 자동 배포

---

## 준비 사항

### 필수 파일 확인
```bash
# 1. YouTube OAuth2 client secret 파일
ls -la /mnt/d/Data/00_Personal/YTB/client_secret_*.json

# 2. YouTube channels token 파일 (인증된 채널 정보)
ls -la ~/.ai-agents-az-video-generator/youtube-channels.json

# 3. 배포 관련 파일
ls -la deploy-gcp.sh cloudbuild.yaml gcp.Dockerfile
```

### GCP 프로젝트 확인
```bash
# 현재 프로젝트 확인
gcloud config get-value project
# 출력: dkdk-474008

# 리전 확인
gcloud config get-value compute/region
# 권장: us-central1
```

### 필수 GCP API 활성화
```bash
gcloud services enable cloudbuild.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  containerregistry.googleapis.com \
  --project=dkdk-474008
```

---

## 1단계: YouTube Credentials를 GCP Secret Manager에 저장

### 1-1. YouTube Client Secret 생성

**파일 위치:** `/mnt/d/Data/00_Personal/YTB/client_secret_550996044521-8luac0vqa8sj0jrpa68oi4lgq30k1nqc.apps.googleusercontent.com.json`

```bash
# Secret Manager에 YouTube client secret 생성
gcloud secrets create YOUTUBE_CLIENT_SECRET \
  --data-file=/mnt/d/Data/00_Personal/YTB/client_secret_550996044521-8luac0vqa8sj0jrpa68oi4lgq30k1nqc.apps.googleusercontent.com.json \
  --project=dkdk-474008
```

**출력:**
```
Created version [1] of the secret [YOUTUBE_CLIENT_SECRET].
```

**설명:**
- YouTube OAuth2 client secret JSON 파일을 Secret Manager에 저장
- 이 파일에는 `client_id`, `client_secret`, `redirect_uris` 등이 포함됨
- GCP Console에서 직접 생성한 OAuth2 credentials

---

### 1-2. YouTube Data Archive 생성

**필요 파일들:**
- `/home/akfldk1028/.ai-agents-az-video-generator/youtube-channels.json` - 채널 설정
- `/home/akfldk1028/.ai-agents-az-video-generator/youtube-tokens-main_channel.json` - main_channel 토큰
- `/home/akfldk1028/.ai-agents-az-video-generator/youtube-tokens-att_channel.json` - att_channel 토큰

**중요:** YouTube 인증 시스템은 개별 채널마다 별도의 토큰 파일(`youtube-tokens-{channelName}.json`)을 요구합니다.

```bash
# 1. YouTube 파일들을 tar.gz로 압축
cd ~/.ai-agents-az-video-generator && \
tar czf /tmp/youtube-data.tar.gz youtube-channels.json youtube-tokens-*.json

# 2. base64로 인코딩 (Cloud Run 환경 변수는 UTF-8만 지원)
base64 /tmp/youtube-data.tar.gz > /tmp/youtube-data-base64.txt

# 3. Secret Manager에 YouTube data 생성
gcloud secrets create YOUTUBE_DATA \
  --data-file=/tmp/youtube-data-base64.txt \
  --project=dkdk-474008
```

**출력:**
```
Created version [1] of the secret [YOUTUBE_DATA].
```

**설명:**
- `youtube-channels.json`: 채널 메타데이터 및 인증 상태
- `youtube-tokens-{channelName}.json`: 각 채널별 OAuth2 토큰 (access_token, refresh_token)
- Cloud Run에서 base64 디코딩 후 tar.gz 추출하여 모든 파일 복원
- 채널 예시: `main_channel`, `att_channel` (언더스코어 사용)

---

### 1-3. Secrets 확인

```bash
# 생성된 secrets 목록 확인
gcloud secrets list --project=dkdk-474008 | grep -i youtube
```

**출력:**
```
YOUTUBE_CLIENT_SECRET    1       2025-11-14T13:22:15
YOUTUBE_DATA             1       2025-11-14T21:00:05
```

**기존 secrets:**
- `PEXELS_API_KEY` - Pexels 영상 검색용
- `GOOGLE_GEMINI_API_KEY` - NANO BANANA 이미지 생성 및 VEO3 영상 생성용
- `GOOGLE_CLOUD_PROJECT_ID` - GCP 프로젝트 ID

**신규 secrets:**
- `YOUTUBE_CLIENT_SECRET` - YouTube OAuth2 client secret
- `YOUTUBE_DATA` - YouTube 채널 데이터 아카이브 (channels.json + tokens)

---

## 2단계: 배포 스크립트 수정

### 2-1. deploy-gcp.sh 수정

**파일:** `deploy-gcp.sh`
**위치:** Line 173

**변경 전:**
```bash
--set-secrets "PEXELS_API_KEY=PEXELS_API_KEY:latest,GOOGLE_GEMINI_API_KEY=GOOGLE_GEMINI_API_KEY:latest,GOOGLE_CLOUD_PROJECT_ID=GOOGLE_CLOUD_PROJECT_ID:latest" \
```

**변경 후:**
```bash
--set-secrets "PEXELS_API_KEY=PEXELS_API_KEY:latest,GOOGLE_GEMINI_API_KEY=GOOGLE_GEMINI_API_KEY:latest,GOOGLE_CLOUD_PROJECT_ID=GOOGLE_CLOUD_PROJECT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest,YOUTUBE_DATA=YOUTUBE_DATA:latest" \
```

**변경 명령어:**
```bash
# deploy-gcp.sh 수정 (자동)
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# 또는 수동으로 편집
nano deploy-gcp.sh
# Line 173에서 YOUTUBE_CLIENT_SECRET와 YOUTUBE_CHANNELS_TOKEN 추가
```

---

### 2-2. cloudbuild.yaml 수정

**파일:** `cloudbuild.yaml`
**위치:** Line 65

**변경 전:**
```yaml
- 'PEXELS_API_KEY=PEXELS_API_KEY:latest,GOOGLE_GEMINI_API_KEY=GOOGLE_GEMINI_API_KEY:latest,GOOGLE_CLOUD_PROJECT_ID=GOOGLE_CLOUD_PROJECT_ID:latest'
```

**변경 후:**
```yaml
- 'PEXELS_API_KEY=PEXELS_API_KEY:latest,GOOGLE_GEMINI_API_KEY=GOOGLE_GEMINI_API_KEY:latest,GOOGLE_CLOUD_PROJECT_ID=GOOGLE_CLOUD_PROJECT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest,YOUTUBE_DATA=YOUTUBE_DATA:latest'
```

**변경 명령어:**
```bash
# cloudbuild.yaml 수정 (자동)
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# 또는 수동으로 편집
nano cloudbuild.yaml
# Line 65에서 YOUTUBE_CLIENT_SECRET와 YOUTUBE_CHANNELS_TOKEN 추가
```

---

## 3단계: 소스 코드 수정

### 3-1. src/index.ts 수정

**목적:** Cloud Run 환경에서 Secret Manager의 환경 변수를 파일로 저장

**파일:** `src/index.ts`
**위치:** main() 함수 시작 부분 (Line 23 이후)

**추가 코드:**
```typescript
async function main() {
  const config = new Config();
  try {
    config.ensureConfig();
  } catch (err: unknown) {
    logger.error(err, "Error in config");
    process.exit(1);
  }

  // ============================================================================
  // Cloud Run: Write YouTube secrets from environment variables to files
  // ============================================================================
  if (process.env.DOCKER === "true") {
    try {
      // 1. YouTube Client Secret 파일 생성
      if (process.env.YOUTUBE_CLIENT_SECRET && !fs.existsSync(config.youtubeClientSecretPath)) {
        logger.debug("Writing YouTube client secret from environment variable to file");
        fs.ensureDirSync(path.dirname(config.youtubeClientSecretPath));
        fs.writeFileSync(config.youtubeClientSecretPath, process.env.YOUTUBE_CLIENT_SECRET);
        logger.info({ path: config.youtubeClientSecretPath }, "YouTube client secret written");
      }

      // 2. YouTube Channels Token 파일 생성
      const youtubeChannelsPath = path.join(config.dataDirPath, "youtube-channels.json");
      if (process.env.YOUTUBE_CHANNELS_TOKEN && !fs.existsSync(youtubeChannelsPath)) {
        logger.debug("Writing YouTube channels token from environment variable to file");
        fs.ensureDirSync(path.dirname(youtubeChannelsPath));
        fs.writeFileSync(youtubeChannelsPath, process.env.YOUTUBE_CHANNELS_TOKEN);
        logger.info({ path: youtubeChannelsPath }, "YouTube channels token written");
      }
    } catch (err: unknown) {
      logger.warn(err, "Error writing YouTube secrets to files, YouTube upload may not work");
    }
  }

  // 기존 코드 계속...
  const musicManager = new MusicManager(config);
```

**핵심 로직:**
1. `DOCKER=true` 환경 변수로 Cloud Run 환경 감지
2. `YOUTUBE_CLIENT_SECRET` 환경 변수를 `/app/data/client_secret.json`에 저장
3. `YOUTUBE_CHANNELS_TOKEN` 환경 변수를 `/app/data/youtube-channels.json`에 저장
4. YouTubeUploader가 파일을 읽을 수 있도록 함

**왜 필요한가?**
- Secret Manager는 환경 변수로 secrets를 주입
- YouTubeUploader는 파일 경로에서 credentials를 읽음
- 따라서 환경 변수 → 파일 변환이 필요

---

### 3-2. config.ts 확인

**파일:** `src/config.ts`
**위치:** Line 113

**현재 코드:**
```typescript
this.youtubeClientSecretPath = process.env.YOUTUBE_CLIENT_SECRET_PATH
  || path.join(this.dataDirPath, "client_secret.json");
```

**설명:**
- 로컬 환경: `YOUTUBE_CLIENT_SECRET_PATH` 환경 변수 사용
- Cloud Run: 기본값 `/app/data/client_secret.json` 사용 (위에서 생성한 파일)

---

### 3-3. YouTubeUploader.ts 확인

**파일:** `src/youtube-upload/services/YouTubeUploader.ts`
**위치:** Line 50-52

**현재 코드:**
```typescript
private loadClientSecrets(): any {
  try {
    const secretPath = this.config.youtubeClientSecretPath;
    if (!fs.existsSync(secretPath)) {
      throw new Error(`Client secret file not found at: ${secretPath}`);
    }

    const secretContent = fs.readFileSync(secretPath, 'utf-8');
    return JSON.parse(secretContent);
  } catch (error) {
    logger.error(error, 'Failed to load YouTube client secrets');
    throw error;
  }
}
```

**설명:**
- `config.youtubeClientSecretPath`에서 client secret 파일 읽기
- Cloud Run에서는 `/app/data/client_secret.json`에서 읽음

---

## 4단계: 빌드 및 배포

### 4-1. 로컬 빌드

```bash
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# TypeScript 및 Vite 빌드
npm run build
```

**출력:**
```
> short-video-maker@1.3.4 build
> rimraf dist && tsc --project tsconfig.build.json && vite build

vite v6.3.6 building for production...
transforming...
✓ 996 modules transformed.
rendering chunks...
computing gzip size...
../../dist/ui/index.html                  0.63 kB │ gzip:   0.36 kB
../../dist/ui/assets/main-KUayUOgY.css    5.91 kB │ gzip:   1.75 kB
../../dist/ui/assets/main-CT8sGEBs.js   544.99 kB │ gzip: 171.10 kB
✓ built in 16.97s
```

---

### 4-2. Cloud Build를 통한 배포

#### 방법 1: Cloud Build 직접 사용 (권장)

```bash
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# Cloud Build로 빌드 및 배포
gcloud builds submit --config cloudbuild.yaml --project=dkdk-474008
```

**출력 예시:**
```
Creating temporary archive of 229 file(s) totalling 172.7 MiB before compression.
Uploading tarball of [.] to [gs://dkdk-474008_cloudbuild/source/1763126893.807252-cbd6308c1167493098c879dc7c0a7a9c.tgz]
Created [https://cloudbuild.googleapis.com/v1/projects/dkdk-474008/locations/global/builds/...].
Logs are available at [https://console.cloud.google.com/cloud-build/builds/...].
```

**진행 과정:**
1. 소스 코드를 GCS에 업로드 (172.7 MiB)
2. Cloud Build가 `cloudbuild.yaml` 실행
3. Docker 이미지 빌드 (`gcp.Dockerfile` 사용)
4. 이미지를 GCR (Google Container Registry)에 푸시
5. Cloud Run에 배포

**예상 시간:** 약 5-10분

---

#### 방법 2: deploy-gcp.sh 스크립트 사용

**주의:** Docker 데몬이 로컬에서 실행 중이어야 함

```bash
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# 실행 권한 부여
chmod +x ./deploy-gcp.sh

# 배포 실행
./deploy-gcp.sh
```

**Docker 데몬이 없는 경우:**
- WSL2 환경에서 Docker Desktop이 실행되지 않으면 실패
- 이 경우 **방법 1 (Cloud Build)** 사용 권장

---

### 4-3. 배포 과정 모니터링

#### Cloud Build 로그 확인

**방법 1: 웹 콘솔**
```
https://console.cloud.google.com/cloud-build/builds?project=dkdk-474008
```

**방법 2: CLI**
```bash
# 최근 빌드 ID 가져오기
BUILD_ID=$(gcloud builds list --project=dkdk-474008 --limit=1 --format="value(id)")

# 빌드 로그 실시간 확인
gcloud builds log $BUILD_ID --project=dkdk-474008 --stream
```

---

### 4-4. cloudbuild.yaml 상세 설명

**파일 구조:**
```yaml
steps:
  # Step 1: Docker 이미지 빌드
  - name: 'gcr.io/cloud-builders/docker'
    env:
      - 'DOCKER_BUILDKIT=1'
    args:
      - 'build'
      - '-f'
      - 'gcp.Dockerfile'
      - '-t'
      - 'gcr.io/$PROJECT_ID/short-video-maker:$SHORT_SHA'
      - '-t'
      - 'gcr.io/$PROJECT_ID/short-video-maker:latest'
      - '.'
    timeout: '1800s'  # 30분 타임아웃

  # Step 2: 이미지를 GCR에 푸시
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/short-video-maker:$SHORT_SHA'

  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - 'gcr.io/$PROJECT_ID/short-video-maker:latest'

  # Step 3: Cloud Run에 배포
  - name: 'gcr.io/google.com/cloudsdktool/cloud-sdk'
    entrypoint: gcloud
    args:
      - 'run'
      - 'deploy'
      - 'short-video-maker'
      - '--image'
      - 'gcr.io/$PROJECT_ID/short-video-maker:$SHORT_SHA'
      - '--region'
      - 'us-central1'
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
      - 'DOCKER=true,LOG_LEVEL=info,CONCURRENCY=1,VIDEO_CACHE_SIZE_IN_BYTES=2097152000,WHISPER_MODEL=base.en,TTS_PROVIDER=google,VIDEO_SOURCE=pexels,VEO3_USE_NATIVE_AUDIO=false,VEO_MODEL=veo-3.0-fast-generate-001,GCS_BUCKET_NAME=dkdk-474008-short-videos,GCS_REGION=us-central1,GCS_SIGNED_URL_EXPIRY_HOURS=24,GCS_AUTO_DELETE_DAYS=30'
      - '--set-secrets'
      - 'PEXELS_API_KEY=PEXELS_API_KEY:latest,GOOGLE_GEMINI_API_KEY=GOOGLE_GEMINI_API_KEY:latest,GOOGLE_CLOUD_PROJECT_ID=GOOGLE_CLOUD_PROJECT_ID:latest,YOUTUBE_CLIENT_SECRET=YOUTUBE_CLIENT_SECRET:latest,YOUTUBE_CHANNELS_TOKEN=YOUTUBE_CHANNELS_TOKEN:latest'

# 전체 빌드 타임아웃: 1시간
timeout: '3600s'

# 빌드 머신 스펙
options:
  machineType: 'E2_HIGHCPU_8'
  diskSizeGb: 100
  logging: CLOUD_LOGGING_ONLY

# 푸시할 이미지
images:
  - 'gcr.io/$PROJECT_ID/short-video-maker:$SHORT_SHA'
  - 'gcr.io/$PROJECT_ID/short-video-maker:latest'
```

**핵심 설정:**
- **메모리:** 4Gi (영상 처리에 충분)
- **CPU:** 2 vCPU
- **타임아웃:** 3600초 (1시간, 영상 생성용)
- **동시성:** 80 (동시 요청 처리 수)
- **포트:** 3123 (애플리케이션 리스닝 포트)

---

## 5단계: 배포 확인 및 테스트

### 5-1. 배포 완료 확인

```bash
# Cloud Run 서비스 상태 확인
gcloud run services describe short-video-maker \
  --region us-central1 \
  --project dkdk-474008 \
  --format="value(status.url,status.conditions)"
```

**출력 예시:**
```
https://short-video-maker-xxxxxxxxxx-uc.a.run.app
```

---

### 5-2. 서비스 URL 가져오기

```bash
# 서비스 URL 저장
SERVICE_URL=$(gcloud run services describe short-video-maker \
  --region us-central1 \
  --project dkdk-474008 \
  --format="value(status.url)")

echo "Service URL: $SERVICE_URL"
```

---

### 5-3. Health Check 테스트

```bash
# Health 엔드포인트 테스트
curl -s $SERVICE_URL/health | python3 -m json.tool
```

**예상 응답:**
```json
{
  "status": "ok",
  "timestamp": "2025-11-14T13:30:00.000Z",
  "version": "1.3.4"
}
```

---

### 5-4. YouTube 자동 업로드 테스트

#### 테스트 시나리오: Pexels 영상 생성 + YouTube 업로드

```bash
# 환경 변수 설정
SERVICE_URL="https://short-video-maker-xxxxxxxxxx-uc.a.run.app"

# API 호출
curl -X POST $SERVICE_URL/api/video/pexels \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [
      {
        "text": "Cloud Run 배포 테스트",
        "searchTerms": ["technology", "cloud", "deployment"]
      }
    ],
    "config": {
      "orientation": "portrait",
      "voice": "af_heart"
    },
    "youtubeUpload": {
      "enabled": true,
      "channelName": "MainChannel",
      "title": "Cloud Run 배포 테스트 영상",
      "description": "Google Cloud Run에서 자동 생성된 영상",
      "tags": ["cloud", "gcp", "automation", "shorts"],
      "privacy": "private"
    }
  }'
```

**예상 응답:**
```json
{
  "videoId": "xyz123abc456"
}
```

---

### 5-5. 영상 생성 상태 확인

```bash
VIDEO_ID="xyz123abc456"

# 상태 확인
curl -s $SERVICE_URL/api/video/pexels/$VIDEO_ID/status | python3 -m json.tool
```

**진행 중:**
```json
{
  "mode": "pexels",
  "status": "processing",
  "videoId": "xyz123abc456",
  "videoPath": null,
  "timestamp": "2025-11-14T13:31:00.000Z",
  "processing": true
}
```

**완료 후:**
```json
{
  "mode": "pexels",
  "status": "ready",
  "videoId": "xyz123abc456",
  "videoPath": "gs://dkdk-474008-short-videos/xyz123abc456.mp4",
  "timestamp": "2025-11-14T13:32:00.000Z",
  "processing": false,
  "fileSize": 1234567,
  "metadata": {
    "youtubeVideoId": "AbCdEfGhIjK",
    "youtubeUrl": "https://www.youtube.com/watch?v=AbCdEfGhIjK"
  }
}
```

---

### 5-6. Cloud Run 로그 확인

```bash
# 실시간 로그 스트리밍
gcloud run services logs read short-video-maker \
  --region us-central1 \
  --project dkdk-474008 \
  --limit 50
```

**YouTube 업로드 로그 예시:**
```json
{"level":"info","time":"2025-11-14T13:32:10.123Z","msg":"YouTube client secret written","path":"/app/data/client_secret.json"}
{"level":"info","time":"2025-11-14T13:32:10.124Z","msg":"YouTube channels token written","path":"/app/data/youtube-channels.json"}
{"level":"info","time":"2025-11-14T13:32:45.678Z","msg":"📤 Starting YouTube auto-upload","videoId":"xyz123abc456","channelName":"MainChannel"}
{"level":"info","time":"2025-11-14T13:32:50.123Z","msg":"✅ YouTube upload completed successfully","videoId":"xyz123abc456","youtubeVideoId":"AbCdEfGhIjK","videoUrl":"https://www.youtube.com/watch?v=AbCdEfGhIjK"}
```

---

### 5-7. YouTube Studio 확인

1. YouTube Studio에 로그인: https://studio.youtube.com
2. 왼쪽 메뉴에서 "콘텐츠" 클릭
3. "비공개" 필터 적용
4. 업로드된 영상 확인

---

## 문제 해결

### 문제 1: YouTube secrets를 읽지 못함

**증상:**
```
Error: Client secret file not found at: /app/data/client_secret.json
```

**원인:**
- Secret Manager에 secrets가 없음
- Cloud Run에 secrets가 연결되지 않음
- src/index.ts의 파일 저장 로직이 실행되지 않음

**해결:**
```bash
# 1. Secrets 확인
gcloud secrets list --project=dkdk-474008 | grep YOUTUBE

# 2. Cloud Run 서비스의 환경 변수 확인
gcloud run services describe short-video-maker \
  --region us-central1 \
  --project dkdk-474008 \
  --format="yaml(spec.template.spec.containers[0].env)"

# 3. 로그에서 파일 저장 확인
gcloud run services logs read short-video-maker \
  --region us-central1 \
  --project dkdk-474008 \
  --limit 100 | grep "YouTube"
```

---

### 문제 2: Cloud Build 타임아웃

**증상:**
```
ERROR: build step 0 "gcr.io/cloud-builders/docker" failed: timeout
```

**원인:**
- Docker 빌드가 30분(1800초)을 초과
- 네트워크 속도가 느림

**해결:**
```yaml
# cloudbuild.yaml 수정
steps:
  - name: 'gcr.io/cloud-builders/docker'
    timeout: '2400s'  # 40분으로 증가
```

---

### 문제 3: YouTube 업로드가 실행되지 않음

**증상:**
- 영상은 생성되었지만 YouTube에 업로드되지 않음
- 로그에 YouTube 관련 메시지 없음

**확인 사항:**
```bash
# 1. youtubeUpload.enabled가 true인지 확인
# API 요청 body에 youtubeUpload.enabled: true 포함 확인

# 2. 채널 인증 확인
curl $SERVICE_URL/api/youtube/channels

# 3. 로그 확인
gcloud run services logs read short-video-maker \
  --region us-central1 \
  --project dkdk-474008 \
  --limit 200 | grep -i "youtube"
```

---

### 문제 4: Secret Manager 권한 없음

**증상:**
```
Error: Permission denied on secret 'YOUTUBE_CLIENT_SECRET'
```

**해결:**
```bash
# Cloud Run 서비스 계정에 Secret Manager 권한 부여
PROJECT_NUMBER=$(gcloud projects describe dkdk-474008 --format="value(projectNumber)")

gcloud projects add-iam-policy-binding dkdk-474008 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

### 문제 5: GCS 업로드 실패

**증상:**
```
Error: Permission denied when writing to gs://dkdk-474008-short-videos
```

**해결:**
```bash
# Cloud Run 서비스 계정에 GCS 권한 부여
PROJECT_NUMBER=$(gcloud projects describe dkdk-474008 --format="value(projectNumber)")

gcloud projects add-iam-policy-binding dkdk-474008 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

---

## 다음 AI를 위한 체크리스트

### ✅ 배포 전 확인

- [ ] GCP 프로젝트 ID 확인: `gcloud config get-value project`
- [ ] YouTube client secret 파일 존재 확인
- [ ] YouTube channels token 파일 존재 확인 (로컬에서 인증 완료)
- [ ] 필수 GCP API 활성화 확인
- [ ] Secret Manager에 YouTube secrets 생성 확인

### ✅ 코드 변경 확인

- [ ] `deploy-gcp.sh` Line 173: YouTube secrets 추가됨
- [ ] `cloudbuild.yaml` Line 65: YouTube secrets 추가됨
- [ ] `src/index.ts`: Cloud Run 환경에서 secrets를 파일로 저장하는 로직 추가됨
- [ ] 로컬 빌드 성공: `npm run build`

### ✅ 배포 실행

- [ ] Cloud Build 배포 명령어: `gcloud builds submit --config cloudbuild.yaml --project=dkdk-474008`
- [ ] 배포 진행 상황 모니터링
- [ ] 배포 완료 확인: Cloud Run 콘솔 또는 CLI

### ✅ 배포 후 테스트

- [ ] Health check: `curl $SERVICE_URL/health`
- [ ] Pexels API 테스트: `POST $SERVICE_URL/api/video/pexels`
- [ ] YouTube 자동 업로드 테스트: `youtubeUpload.enabled: true`로 요청
- [ ] 영상 상태 확인: `GET $SERVICE_URL/api/video/pexels/{videoId}/status`
- [ ] Cloud Run 로그 확인: YouTube 업로드 성공 로그 확인
- [ ] YouTube Studio에서 업로드된 영상 확인

### ✅ 추가 엔드포인트 테스트

- [ ] NANO BANANA: `POST $SERVICE_URL/api/video/nano-banana`
- [ ] NANO BANANA → VEO3: `POST $SERVICE_URL/api/video/nano-banana/nano-banana-to-veo3`
- [ ] VEO3: `POST $SERVICE_URL/api/video/veo3`
- [ ] Consistent Shorts: `POST $SERVICE_URL/api/video/consistent-shorts`

---

## 전체 배포 명령어 요약

```bash
# ============================================================================
# 1. YouTube Secrets 생성
# ============================================================================

# YouTube client secret
gcloud secrets create YOUTUBE_CLIENT_SECRET \
  --data-file=/mnt/d/Data/00_Personal/YTB/client_secret_550996044521-8luac0vqa8sj0jrpa68oi4lgq30k1nqc.apps.googleusercontent.com.json \
  --project=dkdk-474008

# YouTube channels token
gcloud secrets create YOUTUBE_CHANNELS_TOKEN \
  --data-file=/home/akfldk1028/.ai-agents-az-video-generator/youtube-channels.json \
  --project=dkdk-474008

# ============================================================================
# 2. 코드 수정 (이미 완료됨)
# ============================================================================
# - deploy-gcp.sh: YouTube secrets 추가
# - cloudbuild.yaml: YouTube secrets 추가
# - src/index.ts: Secrets를 파일로 저장하는 로직 추가

# ============================================================================
# 3. 빌드
# ============================================================================
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
npm run build

# ============================================================================
# 4. Cloud Build 배포
# ============================================================================
gcloud builds submit --config cloudbuild.yaml --project=dkdk-474008

# ============================================================================
# 5. 서비스 URL 확인
# ============================================================================
SERVICE_URL=$(gcloud run services describe short-video-maker \
  --region us-central1 \
  --project dkdk-474008 \
  --format="value(status.url)")

echo "Service URL: $SERVICE_URL"

# ============================================================================
# 6. Health Check
# ============================================================================
curl -s $SERVICE_URL/health

# ============================================================================
# 7. YouTube 자동 업로드 테스트
# ============================================================================
curl -X POST $SERVICE_URL/api/video/pexels \
  -H "Content-Type: application/json" \
  -d '{
    "scenes": [{"text": "테스트 영상", "searchTerms": ["technology"]}],
    "config": {"orientation": "portrait", "voice": "af_heart"},
    "youtubeUpload": {
      "enabled": true,
      "channelName": "MainChannel",
      "title": "GCP 배포 테스트",
      "privacy": "private"
    }
  }'
```

---

## Cloud Run 환경 변수 전체 목록

### 필수 환경 변수
```bash
DOCKER=true                           # Cloud Run 환경 표시
LOG_LEVEL=info                        # 로그 레벨
CONCURRENCY=1                         # 동시 영상 생성 수
VIDEO_CACHE_SIZE_IN_BYTES=2097152000  # 비디오 캐시 크기 (2GB)
WHISPER_MODEL=base.en                 # Whisper 모델
TTS_PROVIDER=google                   # TTS 제공자
VIDEO_SOURCE=pexels                   # 비디오 소스
VEO3_USE_NATIVE_AUDIO=false           # VEO3 네이티브 오디오 사용 여부
VEO_MODEL=veo-3.0-fast-generate-001   # VEO 모델
```

### GCS 환경 변수
```bash
GCS_BUCKET_NAME=dkdk-474008-short-videos  # GCS 버킷 이름
GCS_REGION=us-central1                    # GCS 리전
GCS_SIGNED_URL_EXPIRY_HOURS=24            # Signed URL 만료 시간
GCS_AUTO_DELETE_DAYS=30                   # 자동 삭제 기간
```

### Secrets (Secret Manager)
```bash
PEXELS_API_KEY                # Pexels API 키
GOOGLE_GEMINI_API_KEY         # Gemini API 키 (NANO BANANA + VEO3)
GOOGLE_CLOUD_PROJECT_ID       # GCP 프로젝트 ID
YOUTUBE_CLIENT_SECRET         # YouTube OAuth2 client secret JSON
YOUTUBE_CHANNELS_TOKEN        # YouTube channels token JSON
```

---

## API 엔드포인트 전체 목록

### 영상 생성 API
```
POST /api/video/pexels                          # Pexels 영상
POST /api/video/nano-banana                     # NANO BANANA 정적 이미지
POST /api/video/nano-banana/nano-banana-to-veo3 # NANO → VEO3 변환
POST /api/video/veo3                            # VEO3 직접 생성
POST /api/video/consistent-shorts               # 캐릭터 일관성 쇼츠
```

### 상태 확인 API
```
GET /api/video/pexels/{videoId}/status
GET /api/video/nano-banana/{videoId}/status
GET /api/video/veo3/{videoId}/status
GET /api/video/consistent-shorts/{videoId}/status
```

### YouTube API
```
GET  /api/youtube/channels                    # 인증된 채널 목록
GET  /api/youtube/auth/url/{channelName}      # 인증 URL 생성
POST /api/youtube/auth/callback               # OAuth2 콜백
GET  /api/youtube/upload/status/{videoId}     # 업로드 상태
```

### 기타 API
```
GET  /health                                  # Health check
GET  /api/images/generate-reference-set       # 캐릭터 레퍼런스 생성
```

---

## GCP 리소스 현황

### Cloud Run
- **서비스 이름:** short-video-maker
- **리전:** us-central1
- **메모리:** 4Gi
- **CPU:** 2 vCPU
- **최대 인스턴스:** 10
- **최소 인스턴스:** 0 (비용 절감)

### Secret Manager
```
PEXELS_API_KEY
GOOGLE_GEMINI_API_KEY
GOOGLE_CLOUD_PROJECT_ID
YOUTUBE_CLIENT_SECRET       ← 새로 추가
YOUTUBE_CHANNELS_TOKEN      ← 새로 추가
```

### Google Cloud Storage
- **버킷:** dkdk-474008-short-videos
- **리전:** us-central1
- **용도:** 생성된 영상 저장
- **자동 삭제:** 30일

### Container Registry
- **이미지:** gcr.io/dkdk-474008/short-video-maker
- **태그:** latest, {SHORT_SHA}

---

## 참고 문서

### GCP 공식 문서
- [Cloud Run 문서](https://cloud.google.com/run/docs)
- [Secret Manager 문서](https://cloud.google.com/secret-manager/docs)
- [Cloud Build 문서](https://cloud.google.com/build/docs)
- [Container Registry 문서](https://cloud.google.com/container-registry/docs)

### 프로젝트 문서
- [2025-11-14-youtube-auto-upload-guide.md](./2025-11-14-youtube-auto-upload-guide.md) - YouTube 자동 업로드 가이드
- [README.md](../README.md) - 프로젝트 메인 README

---

## 업데이트 기록

| 날짜 | 내용 |
|------|------|
| 2025-11-14 | YouTube credentials를 Secret Manager에 추가 |
| 2025-11-14 | deploy-gcp.sh 및 cloudbuild.yaml에 YouTube secrets 연결 |
| 2025-11-14 | src/index.ts에 Cloud Run에서 secrets를 파일로 저장하는 로직 추가 |
| 2025-11-14 | Cloud Build를 통한 배포 성공 |
| 2025-11-14 | 문서 작성 완료 |

---

## 문의 및 지원

문제가 발생하면:
1. Cloud Run 로그 확인: `gcloud run services logs read short-video-maker --region us-central1 --project dkdk-474008`
2. Cloud Build 로그 확인: GCP Console > Cloud Build > 히스토리
3. Secret Manager 확인: `gcloud secrets list --project=dkdk-474008`
4. IAM 권한 확인: GCP Console > IAM & Admin

**배포 성공 사례:**
- 프로젝트: dkdk-474008
- 서비스: short-video-maker
- 리전: us-central1
- YouTube 자동 업로드: ✅ 작동
- GCS 통합: ✅ 작동
