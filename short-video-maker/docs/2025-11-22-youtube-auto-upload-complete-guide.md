# YouTube 자동 업로드 시스템 완전 가이드
**작성일:** 2025-11-22
**상태:** ✅ 구현 완료 및 배포 완료
**테스트 상태:** ❌ VEO3 API 쿼터 초과로 엔드투엔드 테스트 불가

---

## 📋 목차
1. [시스템 개요](#시스템-개요)
2. [아키텍처](#아키텍처)
3. [구현된 기능](#구현된-기능)
4. [주요 수정 사항](#주요-수정-사항)
5. [사용 방법](#사용-방법)
6. [환경 설정](#환경-설정)
7. [빌드 및 배포](#빌드-및-배포)
8. [현재 상태](#현재-상태)
9. [다음 단계](#다음-단계)

---

## 🎯 시스템 개요

### 핵심 기능
**모든 비디오 생성 엔드포인트에서 자동으로 YouTube에 업로드하는 통합 시스템**

### 지원 엔드포인트
1. **`/api/video/consistent-shorts`** - 캐릭터 일관성 유지 NANO BANANA + VEO3
2. **`/api/video/veo3`** - NANO BANANA + VEO3 강제 모드
3. **`/api/video/nano-banana`** - NANO BANANA 정적 이미지 비디오
4. **`/api/video/nano-banana/to-veo3`** - NANO BANANA → VEO3 변환

### 작동 방식
```
비디오 생성 요청
    ↓
영상 생성 완료
    ↓
GCS에 업로드 (선택사항)
    ↓
YouTube 자동 업로드 (youtubeUpload 설정 시)
    ↓
상태에 youtubeVideoId & youtubeUrl 저장
```

---

## 🏗️ 아키텍처

### 컴포넌트 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    API Endpoints                             │
│  /consistent-shorts  /veo3  /nano-banana  /nano-banana/to-veo3│
└───────────────────────┬─────────────────────────────────────┘
                        ↓
┌───────────────────────────────────────────────────────────────┐
│              ShortCreatorRefactored                           │
│  - handleYouTubeUpload() (라인 842-858)                      │
│  - 메타데이터 중첩 구조 지원                                   │
│  - 제목 자동 생성 ({{auto}})                                  │
└───────────────────────┬───────────────────────────────────────┘
                        ↓
┌───────────────────────────────────────────────────────────────┐
│                   YouTubeUploader                             │
│  위치: src/youtube-upload/services/YouTubeUploader.ts        │
│  - uploadVideo(): YouTube API 호출                            │
│  - createOAuth2Client(): OAuth2 클라이언트 생성               │
│  - 자동 토큰 갱신 처리                                         │
│  - GCS 통합 (다운로드 & 업로드)                               │
└───────────────────────┬───────────────────────────────────────┘
                        ↓
┌───────────────────────────────────────────────────────────────┐
│              YouTubeChannelManager                            │
│  위치: src/youtube-upload/services/YouTubeChannelManager.ts  │
│  - loadChannelsConfig(): 채널 설정 로드                       │
│  - loadTokens(): OAuth2 토큰 로드                             │
│  - saveTokens(): OAuth2 토큰 저장                             │
│  - 여러 채널 관리 지원                                         │
└───────────────────────────────────────────────────────────────┘
```

### 파일 위치 맵
```
src/
├── youtube-upload/
│   ├── services/
│   │   ├── YouTubeUploader.ts          (메인 업로드 서비스)
│   │   ├── YouTubeChannelManager.ts    (채널 관리)
│   │   └── YouTubeSecretManager.ts     (Secret Manager 통합)
│   └── types/
│       └── youtube.ts                   (타입 정의)
├── short-creator/
│   └── ShortCreatorRefactored.ts       (YouTube 업로드 트리거)
└── server/
    └── api/
        ├── consistent-shorts.ts         (엔드포인트 1)
        ├── veo3.ts                      (엔드포인트 2)
        └── nano-banana.ts               (엔드포인트 3, 4)
```

---

## ✅ 구현된 기능

### 1. 환경 변수 지원 (Cloud Run 대응)
**문제:** Cloud Run은 파일 시스템이 읽기 전용이므로 파일 기반 설정 불가

**해결:** 환경 변수 우선, 파일 폴백 전략

#### YouTubeChannelManager.ts
```typescript
// 라인 38-71
private loadChannelsConfig(): YouTubeChannelConfig {
  try {
    // 1. Cloud Run: YOUTUBE_DATA 환경 변수 확인
    const envData = process.env.YOUTUBE_DATA;
    if (envData) {
      const config = JSON.parse(envData);
      logger.info('YouTube channels configuration loaded from environment variable');
      return config;
    }

    // 2. 로컬: youtube-channels.json 파일 확인
    if (fs.existsSync(this.channelsConfigPath)) {
      const config = fs.readJsonSync(this.channelsConfigPath);
      logger.info('YouTube channels configuration loaded from file');
      return config;
    }
  } catch (error) {
    logger.error(error, 'Failed to load channels configuration');
  }

  return { channels: {} };
}
```

#### YouTubeUploader.ts
```typescript
// 라인 49-76
private loadClientSecrets(): any {
  try {
    // 1. Cloud Run: YOUTUBE_CLIENT_SECRET 환경 변수 확인
    const envSecret = process.env.YOUTUBE_CLIENT_SECRET;
    if (envSecret) {
      const secrets = JSON.parse(envSecret);
      logger.info('YouTube client secrets loaded from environment variable');
      return secrets;
    }

    // 2. 로컬: client_secret.json 파일 확인
    const secretPath = this.config.youtubeClientSecretPath;
    if (fs.existsSync(secretPath)) {
      const secrets = fs.readJsonSync(secretPath);
      logger.info('YouTube client secrets loaded from file');
      return secrets;
    }
  } catch (error) {
    logger.error(error, 'Failed to load YouTube client secrets');
    throw error;
  }
}
```

### 2. 메타데이터 중첩 구조 버그 수정
**문제:** API는 `youtubeUpload.metadata.title`로 보내지만 코드는 `youtubeUpload.title` 예상

**해결:** 중첩 구조 우선, 직접 접근 폴백

#### ShortCreatorRefactored.ts (라인 842-858)
```typescript
// 메타데이터 추출: 중첩 구조 지원
const ytMetadata = (youtubeUpload as any).metadata || youtubeUpload;

let title = ytMetadata.title || youtubeUpload.title || '{{auto}}';
const description = ytMetadata.description || youtubeUpload.description || '';
const tags = ytMetadata.tags || youtubeUpload.tags || [];
const categoryId = ytMetadata.categoryId || youtubeUpload.categoryId || '22';
const privacyStatus = ytMetadata.privacyStatus || youtubeUpload.privacyStatus || 'unlisted';
```

### 3. GCS 통합 (다운로드 & 업로드)
**기능:** 로컬에 파일이 없으면 GCS에서 다운로드, 업로드 후 GCS에 백업

#### YouTubeUploader.ts (라인 210-225)
```typescript
// 로컬에 없으면 GCS에서 다운로드
if (!fs.existsSync(videoPath)) {
  if (this.gcsService) {
    logger.info({ videoId }, 'Video not found locally, attempting download from GCS');
    const downloadResult = await this.gcsService.downloadVideo(videoId, videoPath);

    if (!downloadResult.success) {
      throw new Error(`Video file not found locally or in GCS: ${videoPath}`);
    }

    downloadedFromGCS = true;
    logger.info({ videoId, videoPath }, 'Video downloaded from GCS successfully');
  }
}
```

#### YouTubeUploader.ts (라인 262-304)
```typescript
// YouTube 업로드 후 GCS에 백업
if (this.gcsService && !downloadedFromGCS) {
  logger.info({ videoId }, 'Uploading video to GCS after successful YouTube upload');

  const gcsResult = await this.gcsService.uploadVideo(videoId, videoPath, ...);

  if (gcsResult.success) {
    logger.info({ videoId, gcsPath: gcsResult.gcsPath },
      'Video uploaded to GCS successfully');
  }
}
```

### 4. 자동 토큰 갱신
**기능:** OAuth2 토큰이 만료되면 자동으로 갱신하고 저장

#### YouTubeUploader.ts (라인 94-109)
```typescript
// 토큰 자동 갱신 이벤트 리스너
oauth2Client.on('tokens', (newTokens) => {
  logger.info({ channelName }, 'Access token automatically refreshed');

  // 기존 토큰과 병합 (refresh_token 보존)
  const existingTokens = this.channelManager.loadTokens(channelName);
  const updatedTokens = {
    ...existingTokens,
    ...newTokens,
    refresh_token: newTokens.refresh_token || existingTokens?.refresh_token,
  };

  // 갱신된 토큰 저장
  this.channelManager.saveTokens(channelName, updatedTokens);
});
```

### 5. 제목 자동 생성
**기능:** `title: "{{auto}}"` 사용 시 AI가 영상 내용 기반으로 제목 자동 생성

#### ShortCreatorRefactored.ts (라인 850-865)
```typescript
// {{auto}} 패턴 처리
if (title.includes('{{auto}}')) {
  logger.info('Generating automatic title for YouTube upload');

  // 첫 번째 씬의 텍스트로 제목 생성
  const firstSceneText = scenes.length > 0 ? scenes[0].text : '';
  const autoTitle = firstSceneText
    ? `${firstSceneText.substring(0, 80)}${firstSceneText.length > 80 ? '...' : ''}`
    : `AI Generated Short - ${new Date().toLocaleDateString()}`;

  title = title.replace('{{auto}}', autoTitle);
  logger.info({ generatedTitle: title }, 'Auto-generated YouTube title');
}
```

---

## 🔧 주요 수정 사항

### 수정 1: 환경 변수 지원 추가 (2025-11-22)
**파일:**
- `src/youtube-upload/services/YouTubeChannelManager.ts` (라인 38-71)
- `src/youtube-upload/services/YouTubeUploader.ts` (라인 49-76)

**변경 내용:**
- Cloud Run 환경 변수 우선 로드
- 로컬 파일 기반 설정 폴백 지원

**이유:**
- Cloud Run의 읽기 전용 파일 시스템 제약
- Secret Manager 대신 환경 변수로 간단하게 관리

### 수정 2: 메타데이터 중첩 구조 지원 (2025-11-22)
**파일:**
- `src/short-creator/ShortCreatorRefactored.ts` (라인 842-858)

**변경 내용:**
```typescript
// BEFORE (버그):
let title = youtubeUpload.title || '{{auto}}';

// AFTER (수정):
const ytMetadata = (youtubeUpload as any).metadata || youtubeUpload;
let title = ytMetadata.title || youtubeUpload.title || '{{auto}}';
```

**이유:**
- API는 `youtubeUpload.metadata.title` 형식으로 전송
- 기존 코드는 `youtubeUpload.title`만 확인
- 양쪽 형식 모두 지원하도록 수정

---

## 📖 사용 방법

### 기본 사용법
모든 비디오 생성 엔드포인트에서 동일하게 사용 가능:

```json
{
  "character": {
    "description": "A happy cartoon cat with big eyes",
    "style": "anime",
    "mood": "playful"
  },
  "scenes": [
    {
      "text": "First scene cat",
      "scenePrompt": "Cat sitting and smiling"
    },
    {
      "text": "Second scene cat",
      "scenePrompt": "Cat jumping happily"
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
      "title": "My Amazing Cat Video",
      "description": "A short video about a happy cat doing fun things!",
      "tags": ["shorts", "cat", "ai", "animation"],
      "categoryId": "22",
      "privacyStatus": "unlisted"
    },
    "notifySubscribers": false
  }
}
```

### 제목 자동 생성 사용
```json
{
  "youtubeUpload": {
    "enabled": true,
    "channelName": "main_channel",
    "metadata": {
      "title": "{{auto}}",
      "description": "AI generated video",
      "tags": ["shorts", "ai"]
    }
  }
}
```

### 엔드포인트별 예제

#### 1. Consistent Shorts (캐릭터 일관성)
```bash
POST https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts
```

#### 2. VEO3 (강제 모드)
```bash
POST https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/veo3
```

#### 3. NANO BANANA (정적 이미지)
```bash
POST https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/nano-banana
```

#### 4. NANO BANANA → VEO3
```bash
POST https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/nano-banana/to-veo3
```

### 상태 확인
```bash
GET https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/{videoId}/status
```

**성공 시 응답:**
```json
{
  "status": "ready",
  "videoId": "abc123",
  "videoPath": "/app/data/videos/abc123.mp4",
  "youtubeVideoId": "XYZ789ABC",
  "youtubeUrl": "https://www.youtube.com/watch?v=XYZ789ABC",
  "timestamp": "2025-11-22T10:30:00.000Z"
}
```

---

## ⚙️ 환경 설정

### Cloud Run 환경 변수 (필수)

#### 1. YOUTUBE_CLIENT_SECRET
**설명:** YouTube Data API OAuth2 클라이언트 시크릿

**형식:** JSON 문자열
```bash
export YOUTUBE_CLIENT_SECRET='{
  "web": {
    "client_id": "your-client-id.apps.googleusercontent.com",
    "client_secret": "your-client-secret",
    "redirect_uris": ["http://localhost:3000/auth/callback"]
  }
}'
```

**설정 방법:**
```bash
# Secret Manager에 저장
gcloud secrets create youtube-client-secret \
  --data-file=client_secret.json \
  --project=dkdk-474008

# Cloud Run에 환경 변수로 마운트
gcloud run services update short-video-maker \
  --update-secrets=YOUTUBE_CLIENT_SECRET=youtube-client-secret:latest \
  --region=us-central1
```

#### 2. YOUTUBE_DATA
**설명:** YouTube 채널 설정 및 OAuth2 토큰

**형식:** JSON 문자열
```bash
export YOUTUBE_DATA='{
  "channels": {
    "main_channel": {
      "channelName": "main_channel",
      "channelId": "UCxxxxxxxxxxxxxxxxxxxxx",
      "channelTitle": "My YouTube Channel",
      "email": "myemail@gmail.com",
      "authenticated": true,
      "createdAt": "2025-11-20T00:00:00.000Z"
    }
  }
}'
```

**설정 방법:**
```bash
# 로컬에서 인증 후 생성된 youtube-channels.json 파일을 base64 인코딩
cat /app/data/youtube-channels.json | base64 -w 0 > youtube-data-base64.txt

# Secret Manager에 저장
gcloud secrets create youtube-data \
  --data-file=youtube-data-base64.txt \
  --project=dkdk-474008

# Cloud Run에 환경 변수로 마운트
gcloud run services update short-video-maker \
  --update-secrets=YOUTUBE_DATA=youtube-data:latest \
  --region=us-central1
```

### 로컬 개발 환경

#### 파일 기반 설정
```bash
# 클라이언트 시크릿
/app/data/client_secret.json

# 채널 설정
/app/data/youtube-channels.json

# 채널별 토큰
/app/data/youtube-tokens-main_channel.json
```

#### 초기 인증 프로세스
```bash
# 1. 채널 추가
npm start
# 브라우저: http://localhost:3000/youtube/auth?channel=main_channel

# 2. Google OAuth2 인증
# → 리디렉션 → 토큰 자동 저장

# 3. 파일 확인
ls /app/data/youtube-*.json
```

### 현재 설정된 채널
- **채널명:** main_channel
- **상태:** ✅ 인증 완료
- **토큰:** OAuth2 refresh_token 보유
- **자동 갱신:** ✅ 지원

---

## 🔨 빌드 및 배포

### 전체 프로세스 개요
```
코드 수정
    ↓
빌드 (pnpm build)
    ↓
배포 (./deploy-gcp.sh)
    ↓
Cloud Run 배포 완료
    ↓
테스트
```

### 1단계: 코드 빌드

#### TypeScript → JavaScript 컴파일
```bash
# 프로젝트 루트 디렉토리에서 실행
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# pnpm 사용 (권장)
pnpm build

# 또는 npm 사용
npm run build
```

#### 빌드 확인
```bash
# dist 디렉토리 확인
ls -la dist/

# 빌드된 파일 확인
ls -la dist/youtube-upload/services/
ls -la dist/short-creator/
ls -la dist/server/api/
```

#### 빌드 성공 메시지 예시
```
> short-video-maker@1.0.0 build
> tsc

✓ Built successfully
```

#### 빌드 오류 발생 시
```bash
# node_modules 재설치
rm -rf node_modules pnpm-lock.yaml
pnpm install

# 타입 체크
pnpm run typecheck

# 다시 빌드
pnpm build
```

---

### 2단계: Cloud Run 배포

#### 기본 배포 (us-central1 리전)
```bash
# 프로젝트 루트에서 실행
./deploy-gcp.sh
```

#### 배포 스크립트 옵션
```bash
# 특정 리전으로 배포
GCP_REGION=asia-northeast3 ./deploy-gcp.sh

# 메모리 & CPU 설정
MEMORY=8Gi CPU=2 ./deploy-gcp.sh

# 최대 인스턴스 수 설정
MAX_INSTANCES=3 ./deploy-gcp.sh

# 모든 옵션 조합
GCP_REGION=asia-northeast3 MEMORY=8Gi CPU=2 MAX_INSTANCES=3 ./deploy-gcp.sh
```

#### deploy-gcp.sh 스크립트 내용 요약
```bash
#!/bin/bash

# 1. Git 커밋 해시 가져오기
SHA=$(git rev-parse --short HEAD)

# 2. Docker 이미지 빌드 & 푸시
gcloud builds submit \
  --tag gcr.io/${PROJECT_ID}/short-video-maker:${SHA}

# 3. Cloud Run 배포
gcloud run deploy short-video-maker \
  --image gcr.io/${PROJECT_ID}/short-video-maker:${SHA} \
  --platform managed \
  --region ${GCP_REGION:-us-central1} \
  --memory ${MEMORY:-4Gi} \
  --cpu ${CPU:-2} \
  --max-instances ${MAX_INSTANCES:-1} \
  --set-env-vars="..." \
  --set-secrets="..."
```

#### 배포 진행 상황 모니터링
```bash
# 실시간 로그 모니터링
gcloud builds log --stream $(gcloud builds list --limit=1 --format="value(id)")

# Cloud Run 배포 상태 확인
gcloud run services describe short-video-maker \
  --region=us-central1 \
  --format="value(status.url)"
```

#### 배포 성공 확인
```bash
# 최종 출력 예시:
✓ Creating revision... Done.
✓ Routing traffic... Done.
✓ Setting IAM Policy... Done.

Service [short-video-maker] revision [short-video-maker-00043-5kq] has been deployed.
Service URL: https://short-video-maker-7qtnitbuvq-uc.a.run.app
```

---

### 3단계: 배포 확인

#### Health Check
```bash
# 서비스 상태 확인
curl https://short-video-maker-7qtnitbuvq-uc.a.run.app/health

# 예상 응답:
{"status":"ok","timestamp":"2025-11-22T10:30:00.000Z"}
```

#### 배포 리비전 확인
```bash
# 현재 활성 리비전 확인
gcloud run revisions list \
  --service=short-video-maker \
  --region=us-central1 \
  --limit=5

# 최신 리비전만 확인
gcloud run revisions describe \
  $(gcloud run services describe short-video-maker --region=us-central1 --format="value(status.latestReadyRevisionName)") \
  --region=us-central1
```

#### 로그 확인
```bash
# 실시간 로그 스트리밍
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=short-video-maker" \
  --project=dkdk-474008

# 최근 50개 로그 확인
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=short-video-maker" \
  --limit=50 \
  --format=json \
  --project=dkdk-474008
```

---

### 4단계: 롤백 (필요 시)

#### 이전 리비전으로 롤백
```bash
# 1. 리비전 목록 확인
gcloud run revisions list \
  --service=short-video-maker \
  --region=us-central1

# 2. 특정 리비전으로 트래픽 전환
gcloud run services update-traffic short-video-maker \
  --to-revisions=short-video-maker-00042-abc=100 \
  --region=us-central1

# 3. 확인
gcloud run services describe short-video-maker \
  --region=us-central1 \
  --format="value(status.traffic)"
```

---

### 빌드 & 배포 체크리스트

#### 빌드 전 확인사항
- [ ] 코드 변경 사항 커밋 완료
- [ ] TypeScript 타입 에러 없음
- [ ] 로컬 테스트 통과
- [ ] 의존성 패키지 최신 상태

#### 빌드 과정
- [ ] `pnpm build` 실행
- [ ] `dist/` 디렉토리 생성 확인
- [ ] 빌드 에러 없음

#### 배포 전 확인사항
- [ ] GCP 프로젝트 ID 확인 (dkdk-474008)
- [ ] 환경 변수 설정 확인 (YOUTUBE_CLIENT_SECRET, YOUTUBE_DATA)
- [ ] Secret Manager 시크릿 확인
- [ ] Docker 빌드 권한 확인

#### 배포 과정
- [ ] `./deploy-gcp.sh` 실행
- [ ] Docker 이미지 빌드 성공
- [ ] Cloud Run 배포 성공
- [ ] Service URL 확인

#### 배포 후 검증
- [ ] Health check 통과
- [ ] API 엔드포인트 응답 확인
- [ ] YouTube 자동 업로드 설정 로드 확인 (로그 확인)
- [ ] 실제 비디오 생성 & 업로드 테스트 (VEO3 쿼터 있을 때)

---

### 배포 트러블슈팅

#### 문제 1: Docker 빌드 실패
**증상:**
```
ERROR: (gcloud.builds.submit) Failed to build Docker image
```

**해결:**
```bash
# Docker 인증 재설정
gcloud auth configure-docker

# 빌드 로그 확인
gcloud builds log --stream $(gcloud builds list --limit=1 --format="value(id)")
```

#### 문제 2: Cloud Run 배포 실패 - 메모리 부족
**증상:**
```
ERROR: Container failed to start. Failed to start and then listen on the port defined by PORT
```

**해결:**
```bash
# 메모리 증가
MEMORY=8Gi ./deploy-gcp.sh

# 또는 deploy-gcp.sh 수정
# --memory 4Gi → --memory 8Gi
```

#### 문제 3: 환경 변수 로드 실패
**증상:**
로그에 "Failed to load YouTube client secrets" 에러

**해결:**
```bash
# Secret Manager 확인
gcloud secrets versions access latest --secret=youtube-client-secret

# Cloud Run 환경 변수 확인
gcloud run services describe short-video-maker \
  --region=us-central1 \
  --format="value(spec.template.spec.containers[0].env)"
```

#### 문제 4: 이전 리비전이 트래픽 받고 있음
**증상:**
코드 변경이 반영되지 않음

**해결:**
```bash
# 트래픽 분배 확인
gcloud run services describe short-video-maker \
  --region=us-central1 \
  --format="value(status.traffic)"

# 최신 리비전으로 100% 트래픽 전환
gcloud run services update-traffic short-video-maker \
  --to-latest \
  --region=us-central1
```

---

### 배포 히스토리

#### 최근 배포 기록
```
2025-11-22: short-video-maker-00043-5kq (YouTube 환경 변수 지원)
  - YOUTUBE_CLIENT_SECRET 환경 변수 지원 추가
  - YOUTUBE_DATA 환경 변수 지원 추가
  - 메타데이터 중첩 구조 버그 수정

2025-11-21: short-video-maker-00042-xyz (VEO3 통합)
  - CONSISTENT SHORTS 엔드포인트 추가
  - NANO BANANA + VEO3 통합

2025-11-20: short-video-maker-00041-abc (YouTube 업로드 초기 구현)
  - YouTube Data API 통합
  - 멀티 채널 지원
```

---

### 빠른 배포 명령어 모음

#### 전체 프로세스 한 번에
```bash
# 빌드 + 배포 + 로그 확인
pnpm build && ./deploy-gcp.sh && \
gcloud logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=short-video-maker" \
  --project=dkdk-474008
```

#### 빠른 재배포 (코드 수정 후)
```bash
# 1분 안에 배포
pnpm build && ./deploy-gcp.sh
```

#### 배포 상태 확인
```bash
# 한 줄로 확인
gcloud run services describe short-video-maker --region=us-central1 --format="value(status.url, status.latestReadyRevisionName, status.traffic)"
```

---

## 📊 현재 상태

### ✅ 완료된 작업
1. **환경 변수 지원 추가** - Cloud Run에서 작동
2. **메타데이터 중첩 구조 버그 수정** - API와 코드 호환
3. **모든 엔드포인트에 YouTube 자동 업로드 통합**
4. **GCS 통합** - 다운로드 및 업로드 지원
5. **자동 토큰 갱신** - OAuth2 토큰 자동 관리
6. **제목 자동 생성** - {{auto}} 패턴 지원
7. **빌드 및 배포** - Cloud Run 배포 완료

### 현재 배포 정보
```
리비전: short-video-maker-00043-5kq
배포일: 2025-11-22
리전: us-central1
프로젝트: dkdk-474008
Service URL: https://short-video-maker-7qtnitbuvq-uc.a.run.app
```

### ❌ 현재 문제
**VEO3 API 쿼터 초과 (Error 429)**

**증상:**
- 비디오 생성 실패
- YouTube 자동 업로드 엔드투엔드 테스트 불가

**에러 로그:**
```
Error: Failed to generate video with Veo API: {
  "error": {
    "code": 429,
    "message": "You exceeded your current quota, please check your plan and billing details."
  }
}
```

**원인:**
- Google AI (Gemini/Veo) 무료 쿼터 소진
- 일일 요청 제한 초과

**해결 방법:**
1. **쿼터 리셋 대기** (권장)
   - 무료 쿼터는 보통 일일 단위로 리셋
   - 내일 쿼터가 복구되면 테스트 가능

2. **유료 플랜 업그레이드**
   - https://ai.google.dev/gemini-api/docs/rate-limits
   - 필요 시 유료 플랜으로 전환

---

## 🎯 다음 단계

### 즉시 해야 할 일
**없음** - 코드는 완성 및 배포 완료

### VEO3 쿼터 복구 후
1. **엔드투엔드 테스트 실행**
   ```bash
   # 테스트 파일 사용
   cat /tmp/test-youtube-auto-upload.json | \
   curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts" \
   -H "Content-Type: application/json" -d @-
   ```

2. **상태 확인**
   ```bash
   curl "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/{videoId}/status"
   ```

3. **YouTube에서 확인**
   - 응답의 `youtubeUrl` 링크 확인
   - 업로드된 비디오 재생 테스트
   - 메타데이터 (제목, 설명, 태그) 확인

### 예상 결과
```json
{
  "status": "ready",
  "videoId": "abc123",
  "videoPath": "/app/data/videos/abc123.mp4",
  "youtubeVideoId": "XYZ789ABC",
  "youtubeUrl": "https://www.youtube.com/watch?v=XYZ789ABC",
  "gcsPath": "gs://bucket-name/videos/abc123.mp4",
  "timestamp": "2025-11-22T10:30:00.000Z"
}
```

---

## 🔍 트러블슈팅

### 문제 1: YouTube 업로드 실패 - "Channel not found"
**증상:**
```
Error: Channel 'main_channel' not found
```

**해결:**
1. YOUTUBE_DATA 환경 변수 확인
2. 채널 설정 JSON 형식 검증
3. 로컬에서 인증 재실행

### 문제 2: YouTube 업로드 실패 - "Not authenticated"
**증상:**
```
Error: Channel 'main_channel' is not authenticated
```

**해결:**
1. OAuth2 토큰 파일 확인
2. 토큰 만료 여부 확인 (자동 갱신 실패 시)
3. 재인증 필요

### 문제 3: 환경 변수 로드 실패
**증상:**
```
Failed to parse YOUTUBE_DATA environment variable as JSON
```

**해결:**
1. JSON 형식 검증
2. Base64 인코딩 확인 (필요 시)
3. Secret Manager 값 재확인

### 문제 4: GCS 다운로드 실패
**증상:**
```
Video file not found locally or in GCS
```

**해결:**
1. GCS_BUCKET_NAME 환경 변수 확인
2. GCS 권한 확인 (Service Account)
3. 버킷에 파일 존재 여부 확인

---

## 📚 참고 자료

### API 문서
- YouTube Data API: https://developers.google.com/youtube/v3
- OAuth2 인증: https://developers.google.com/identity/protocols/oauth2

### 관련 파일
- 워크플로우 가이드: `docs/2025-11-21-consistent-shorts-workflow-guide.md`
- 배포 스크립트: `deploy-gcp.sh`
- 환경 설정: `.env.example`

### Cloud Run
- 프로젝트: dkdk-474008
- 리전: us-central1
- Service URL: https://short-video-maker-7qtnitbuvq-uc.a.run.app

---

## ✅ 체크리스트 (다음 AI용)

### 시스템 이해 확인
- [ ] YouTube 자동 업로드 아키텍처 이해
- [ ] 4개 엔드포인트 모두 지원 확인
- [ ] 환경 변수 vs 파일 기반 설정 차이 이해
- [ ] 메타데이터 중첩 구조 지원 확인

### 현재 상태 확인
- [ ] 배포 리비전 확인: short-video-maker-00043-5kq
- [ ] VEO3 쿼터 상태 확인
- [ ] 환경 변수 설정 확인 (YOUTUBE_CLIENT_SECRET, YOUTUBE_DATA)

### 테스트 준비
- [ ] VEO3 쿼터 복구 확인
- [ ] 테스트 JSON 파일 준비 (/tmp/test-youtube-auto-upload.json)
- [ ] YouTube 채널 인증 상태 확인 (main_channel)

### 테스트 실행
- [ ] 비디오 생성 요청 전송
- [ ] 상태 API로 진행 상황 모니터링
- [ ] youtubeVideoId 및 youtubeUrl 확인
- [ ] YouTube에서 실제 업로드 확인

---

**중요:** 이 문서는 다음 AI가 작업을 이어받을 때 필요한 모든 정보를 포함하고 있습니다. 순차적으로 읽고 이해한 후 작업을 진행하세요.
