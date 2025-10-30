# Cloud Run + Cloud Scheduler 완전 초보자 가이드

정해진 시간에 자동으로 숏츠를 생성하는 완전 자동화 시스템을 처음부터 끝까지 설정하는 방법

**⏱️ 예상 소요 시간:** 30-40분
**💰 예상 비용:** 월 $5-10

---

## 📚 목차

1. [사전 준비](#1-사전-준비)
2. [GCP 프로젝트 생성](#2-gcp-프로젝트-생성)
3. [gcloud CLI 설치 및 설정](#3-gcloud-cli-설치-및-설정)
4. [API 키 발급받기](#4-api-키-발급받기)
5. [코드 준비](#5-코드-준비)
6. [Cloud Run 배포](#6-cloud-run-배포)
7. [Cloud Scheduler 설정](#7-cloud-scheduler-설정)
8. [테스트 및 확인](#8-테스트-및-확인)
9. [문제 해결](#9-문제-해결)

---

## 1. 사전 준비

### 1-1. 필요한 것들

✅ **Google 계정** (Gmail 있으면 됨)
✅ **신용카드** (GCP 결제용, 무료 크레딧 $300 제공)
✅ **컴퓨터** (Windows, Mac, Linux 다 가능)
✅ **인터넷 연결**

### 1-2. 준비할 시간

- GCP 설정: 10분
- API 키 발급: 10분
- 배포 실행: 10분
- 스케줄 설정: 5분
- 테스트: 5분

**총 40분 정도면 완성!**

---

## 2. GCP 프로젝트 생성

### 2-1. GCP 콘솔 접속

1. 브라우저에서 접속: https://console.cloud.google.com/
2. Google 계정으로 로그인
3. 처음이면 **무료 체험 시작** 클릭
   - 신용카드 등록 필요 (자동 결제 안 됨, 걱정 마세요!)
   - $300 무료 크레딧 받음 (90일간 사용 가능)

### 2-2. 새 프로젝트 만들기

1. 왼쪽 상단 **프로젝트 선택** 클릭
2. 오른쪽 상단 **새 프로젝트** 클릭
3. 프로젝트 이름 입력:
   ```
   예: shorts-automation
   ```
4. **만들기** 클릭
5. 프로젝트가 만들어질 때까지 10초 대기

### 2-3. 프로젝트 ID 확인

프로젝트가 만들어지면:
1. 상단에 프로젝트 이름 옆에 ID가 보임
2. 예: `shorts-automation-123456`
3. **이 ID를 메모장에 복사해두세요!** (나중에 사용)

```
내 프로젝트 ID: shorts-automation-123456
```

### 2-4. 결제 계정 연결 확인

1. 왼쪽 메뉴 → **결제**
2. 결제 계정이 연결되어 있는지 확인
3. 없으면 **결제 계정 연결** 클릭

---

## 3. gcloud CLI 설치 및 설정

### 3-1. gcloud CLI 설치

#### Windows:

1. 다운로드: https://cloud.google.com/sdk/docs/install
2. `GoogleCloudSDKInstaller.exe` 실행
3. 설치 옵션 전부 기본값으로 **다음** 클릭
4. 설치 완료 후 **Git Bash** 또는 **PowerShell** 열기

#### Mac:

```bash
# Homebrew로 설치 (가장 간단)
brew install --cask google-cloud-sdk

# 또는 수동 설치
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

#### Linux:

```bash
# Debian/Ubuntu
sudo apt-get update
sudo apt-get install apt-transport-https ca-certificates gnupg
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo apt-key --keyring /usr/share/keyrings/cloud.google.gpg add -
sudo apt-get update && sudo apt-get install google-cloud-cli
```

### 3-2. gcloud 초기화

터미널/명령 프롬프트를 열고:

```bash
# 1. gcloud 초기화
gcloud init

# 질문이 나올 거예요:
```

**질문 1:** "Pick configuration to use:"
```
→ [1] Re-initialize this configuration [default] with new settings
선택: 1 입력 후 Enter
```

**질문 2:** "Choose the account you would like to use:"
```
→ 로그인 창이 브라우저에 뜸
→ Google 계정 선택
→ "허용" 클릭
```

**질문 3:** "Pick cloud project to use:"
```
→ 아까 만든 프로젝트 선택
예: [1] shorts-automation-123456
선택: 1 입력 후 Enter
```

**질문 4:** "Do you want to configure a default Compute Region and Zone?"
```
선택: Y 입력 후 Enter
→ Region 선택: 15 (us-central1) 입력
```

### 3-3. 설치 확인

```bash
# 버전 확인
gcloud --version

# 출력 예시:
# Google Cloud SDK 458.0.0
# bq 2.0.101
# core 2024.01.23
```

✅ 버전이 나오면 설치 성공!

### 3-4. 프로젝트 설정 확인

```bash
# 현재 프로젝트 확인
gcloud config get-value project

# 출력: shorts-automation-123456
```

---

## 4. API 키 발급받기

3개의 API 키가 필요합니다:

### 4-1. Pexels API Key (무료 영상 소스)

1. 웹사이트 접속: https://www.pexels.com/api/
2. 오른쪽 상단 **Sign Up** 클릭
3. 계정 만들기 (이메일로 가입)
4. 이메일 인증 완료
5. 다시 https://www.pexels.com/api/ 접속
6. **Get Started** 클릭
7. **Your API Key**가 보임
   ```
   예: JXYSxzfCYKkpDs3FJJjh1ePOgZAMMALSvpfwpL24YfQZO11FWo9Yhrnw
   ```
8. **복사해서 메모장에 저장!**

### 4-2. Google Gemini API Key (이미지 & 비디오 생성)

1. 웹사이트 접속: https://aistudio.google.com/app/apikey
2. Google 계정으로 로그인
3. **Create API Key** 클릭
4. 프로젝트 선택:
   - **Create API key in new project** 선택 (쉬움)
   - 또는 기존 GCP 프로젝트 선택
5. API Key가 생성됨:
   ```
   예: AIzaSyDaGmNJn9F3P2aBcDeFgHiJkLmNoPqRsTu
   ```
6. **복사해서 메모장에 저장!**

⚠️ **중요:** 이 키는 다시 볼 수 없으니 잘 저장해두세요!

### 4-3. GCP Project ID

이미 2-3 단계에서 메모했던 거:
```
예: shorts-automation-123456
```

### 4-4. 정리: 3개 키 확인

메모장에 이렇게 정리:

```
PEXELS_API_KEY=JXYSxzfCYKkpDs3FJJjh1ePOgZAMMALSvpfwpL24YfQZO11FWo9Yhrnw
GOOGLE_GEMINI_API_KEY=AIzaSyDaGmNJn9F3P2aBcDeFgHiJkLmNoPqRsTu
GOOGLE_CLOUD_PROJECT_ID=shorts-automation-123456
```

---

## 5. 코드 준비

### 5-1. Git 저장소 클론

터미널에서:

```bash
# 1. 원하는 폴더로 이동
cd ~
# 또는
cd Desktop

# 2. 저장소 클론 (실제 주소로 바꾸세요)
git clone https://github.com/YOUR_USERNAME/YTB.git
cd YTB/short-video-maker

# 3. 파일 확인
ls -la

# deploy-gcp.sh, gcp.Dockerfile 등이 보여야 함
```

### 5-2. 환경 변수 설정 (로컬 테스트용 - 선택사항)

```bash
# .env 파일 생성
cp .env.example .env

# .env 파일 편집 (nano, vim, 또는 텍스트 에디터)
nano .env
```

아까 메모한 API 키 입력:
```env
PEXELS_API_KEY=여기에_페셀스_키
GOOGLE_GEMINI_API_KEY=여기에_제미나이_키
GOOGLE_CLOUD_PROJECT_ID=여기에_프로젝트_ID
```

저장: `Ctrl+O` → `Enter` → `Ctrl+X`

---

## 6. Cloud Run 배포

이제 본격적으로 배포합니다!

### 6-1. GCP 필요한 API 활성화

터미널에서 실행:

```bash
# 1. Cloud Run API 활성화
gcloud services enable run.googleapis.com

# 2. Cloud Build API 활성화
gcloud services enable cloudbuild.googleapis.com

# 3. Secret Manager API 활성화
gcloud services enable secretmanager.googleapis.com

# 4. Container Registry API 활성화
gcloud services enable containerregistry.googleapis.com

# 각 명령어마다 10-20초 소요
# "Operation finished successfully" 나오면 성공!
```

### 6-2. Secret Manager에 API 키 저장

API 키를 안전하게 저장:

```bash
# 1. Pexels API Key 저장 (YOUR_KEY를 실제 키로 바꾸세요!)
echo -n "JXYSxzfCYKkpDs3FJJjh1ePOgZAMMALSvpfwpL24YfQZO11FWo9Yhrnw" | \
  gcloud secrets create PEXELS_API_KEY --data-file=-

# 성공 메시지:
# Created version [1] of the secret [PEXELS_API_KEY].

# 2. Gemini API Key 저장
echo -n "AIzaSyDaGmNJn9F3P2aBcDeFgHiJkLmNoPqRsTu" | \
  gcloud secrets create GOOGLE_GEMINI_API_KEY --data-file=-

# 3. Project ID 저장
echo -n "shorts-automation-123456" | \
  gcloud secrets create GOOGLE_CLOUD_PROJECT_ID --data-file=-
```

✅ 3개 다 "Created version [1]" 메시지 나오면 성공!

### 6-3. 비밀 확인

```bash
# 저장된 비밀 목록 확인
gcloud secrets list

# 출력:
# NAME                        CREATED              REPLICATION_POLICY  LOCATIONS
# PEXELS_API_KEY             2024-10-30T12:00:00  automatic           -
# GOOGLE_GEMINI_API_KEY      2024-10-30T12:01:00  automatic           -
# GOOGLE_CLOUD_PROJECT_ID    2024-10-30T12:02:00  automatic           -
```

### 6-4. 프로젝트 ID 환경 변수 설정

```bash
# 내 프로젝트 ID로 설정 (실제 ID로 바꾸세요!)
export GCP_PROJECT_ID="shorts-automation-123456"

# 확인
echo $GCP_PROJECT_ID
# 출력: shorts-automation-123456
```

### 6-5. Docker 설치 확인

```bash
# Docker 버전 확인
docker --version

# 출력 예시:
# Docker version 24.0.7, build afdd53b
```

❌ 만약 "command not found" 에러가 나면:
- **Windows:** Docker Desktop 설치 (https://docs.docker.com/desktop/install/windows-install/)
- **Mac:** `brew install --cask docker`
- **Linux:** `sudo apt-get install docker.io`

### 6-6. 배포 스크립트 실행

드디어! 배포 시작:

```bash
# 실행 권한 부여 (한 번만)
chmod +x deploy-gcp.sh

# 배포 시작!
./deploy-gcp.sh
```

### 6-7. 배포 과정 (5-10분 소요)

스크립트가 자동으로:

1. ✅ **Prerequisites 체크**
   ```
   [INFO] Starting GCP Cloud Run deployment...
   [SUCCESS] Using GCP Project: shorts-automation-123456
   [INFO] Region: us-central1
   ```

2. ✅ **API 활성화 확인**
   ```
   [SUCCESS] API cloudbuild.googleapis.com is already enabled
   [SUCCESS] API run.googleapis.com is already enabled
   ```

3. ✅ **Docker 이미지 빌드** (가장 오래 걸림: 5-8분)
   ```
   [INFO] Building Docker image...
   Step 1/15 : FROM ubuntu:22.04 AS install-whisper
   ...
   [SUCCESS] Docker image built: gcr.io/shorts-automation-123456/short-video-maker:20241030-120000
   ```

4. ✅ **Container Registry에 푸시** (2-3분)
   ```
   [INFO] Pushing Docker image to GCR...
   The push refers to repository [gcr.io/shorts-automation-123456/short-video-maker]
   ...
   [SUCCESS] Docker image pushed to GCR
   ```

5. ✅ **Secret 확인**
   ```
   [SUCCESS] Secret PEXELS_API_KEY exists
   [SUCCESS] Secret GOOGLE_GEMINI_API_KEY exists
   [SUCCESS] Secret GOOGLE_CLOUD_PROJECT_ID exists
   ```

6. ✅ **Cloud Run 배포**
   ```
   [INFO] Deploying to Cloud Run...
   Deploying container to Cloud Run service [short-video-maker] in project [shorts-automation-123456] region [us-central1]
   ✓ Deploying... Done.
   ✓ Creating Revision...
   ✓ Routing traffic...
   Done.
   ```

7. ✅ **완료!**
   ```
   [SUCCESS] ==========================================
   [SUCCESS] Deployment Complete!
   [SUCCESS] ==========================================
   [SUCCESS] Service URL: https://short-video-maker-abc123-uc.a.run.app

   [INFO] Test the service:
   [INFO]   curl https://short-video-maker-abc123-uc.a.run.app/health

   [INFO] API Endpoints:
   [INFO]   Nano Banana:        https://short-video-maker-abc123-uc.a.run.app/api/video/nano-banana
   [INFO]   VEO3:               https://short-video-maker-abc123-uc.a.run.app/api/video/veo3
   [INFO]   Consistent Shorts:  https://short-video-maker-abc123-uc.a.run.app/api/video/consistent-shorts
   [INFO]   Pexels:             https://short-video-maker-abc123-uc.a.run.app/api/video/pexels
   [SUCCESS] ==========================================
   ```

### 6-8. Service URL 복사

출력에서 **Service URL**을 복사해서 메모장에 저장!

```
Service URL: https://short-video-maker-abc123-uc.a.run.app
```

### 6-9. 배포 확인

```bash
# Health check 테스트
curl https://short-video-maker-abc123-uc.a.run.app/health

# 출력:
# {"status":"ok"}
```

✅ `{"status":"ok"}` 나오면 배포 성공!

---

## 7. Cloud Scheduler 설정

이제 정해진 시간에 자동으로 실행되도록 설정합니다!

### 7-1. Cloud Scheduler API 활성화

```bash
gcloud services enable cloudscheduler.googleapis.com

# 출력:
# Operation "operations/..." finished successfully.
```

### 7-2. Service Account 생성

Cloud Scheduler가 Cloud Run을 호출할 수 있도록:

```bash
# 1. Service Account 생성
gcloud iam service-accounts create scheduler-invoker \
  --display-name="Cloud Scheduler Invoker"

# 출력:
# Created service account [scheduler-invoker].

# 2. Cloud Run 호출 권한 부여
gcloud run services add-iam-policy-binding short-video-maker \
  --member="serviceAccount:scheduler-invoker@shorts-automation-123456.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=us-central1

# ⚠️ shorts-automation-123456를 당신의 프로젝트 ID로 바꾸세요!

# 출력:
# Updated IAM policy for service [short-video-maker].
```

### 7-3. App Engine 초기화 (Cloud Scheduler 요구사항)

```bash
# App Engine 앱 생성 (처음 한 번만)
gcloud app create --region=us-central

# 질문이 나오면:
# "Please choose the region where you want your App Engine application located:"
# → 15 (us-central) 입력

# 출력:
# Success! The app is now created.
```

❌ 만약 "already contains an App Engine application" 에러가 나면:
→ 이미 있다는 뜻! 넘어가세요.

### 7-4. Scheduler Job 생성 - 오전 9시

```bash
gcloud scheduler jobs create http shorts-morning \
  --location=us-central1 \
  --schedule="0 9 * * *" \
  --time-zone="Asia/Seoul" \
  --uri="https://short-video-maker-abc123-uc.a.run.app/api/video/consistent-shorts" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{
    "character": {
      "description": "A young female astronaut with blonde hair, wearing a white space suit, exploring the cosmos",
      "style": "cinematic",
      "mood": "adventurous"
    },
    "scenes": [
      {
        "text": "우주를 탐험하는 젊은 우주비행사",
        "scenePrompt": "Floating gracefully in deep space with Earth in the background, stars twinkling",
        "duration": 3
      },
      {
        "text": "신비로운 행성을 발견하다",
        "scenePrompt": "Approaching a mysterious colorful planet with rings",
        "duration": 3
      },
      {
        "text": "새로운 세계로의 여행이 시작된다",
        "scenePrompt": "Landing on an alien landscape with purple sky and two moons",
        "duration": 3
      }
    ],
    "config": {
      "orientation": "portrait",
      "voice": "af_sarah",
      "generateVideos": false,
      "musicVolume": "low"
    }
  }' \
  --oidc-service-account-email="scheduler-invoker@shorts-automation-123456.iam.gserviceaccount.com"
```

⚠️ **수정해야 할 부분:**
1. `https://short-video-maker-abc123-uc.a.run.app` → 당신의 Service URL
2. `shorts-automation-123456` → 당신의 프로젝트 ID

출력:
```
Created job [shorts-morning].
```

### 7-5. Scheduler Job 생성 - 오후 12시

```bash
gcloud scheduler jobs create http shorts-noon \
  --location=us-central1 \
  --schedule="0 12 * * *" \
  --time-zone="Asia/Seoul" \
  --uri="https://short-video-maker-abc123-uc.a.run.app/api/video/consistent-shorts" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{
    "character": {
      "description": "A cheerful chef in a modern kitchen",
      "style": "bright and warm",
      "mood": "energetic"
    },
    "scenes": [
      {
        "text": "점심 시간! 간단한 요리를 준비해요",
        "scenePrompt": "Chef chopping fresh vegetables in bright kitchen",
        "duration": 3
      },
      {
        "text": "맛있는 요리가 완성되었어요",
        "scenePrompt": "Presenting a beautiful dish with garnish",
        "duration": 3
      }
    ],
    "config": {
      "orientation": "portrait",
      "voice": "af_sarah",
      "generateVideos": false
    }
  }' \
  --oidc-service-account-email="scheduler-invoker@shorts-automation-123456.iam.gserviceaccount.com"
```

### 7-6. Scheduler Job 생성 - 오후 6시

```bash
gcloud scheduler jobs create http shorts-evening \
  --location=us-central1 \
  --schedule="0 18 * * *" \
  --time-zone="Asia/Seoul" \
  --uri="https://short-video-maker-abc123-uc.a.run.app/api/video/consistent-shorts" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{
    "character": {
      "description": "A calm person in cozy home setting",
      "style": "warm and relaxing",
      "mood": "peaceful"
    },
    "scenes": [
      {
        "text": "하루를 마무리하는 저녁 시간",
        "scenePrompt": "Reading a book by warm lamp light in cozy room",
        "duration": 3
      },
      {
        "text": "편안한 밤을 준비해요",
        "scenePrompt": "Sipping warm tea while looking at sunset through window",
        "duration": 3
      }
    ],
    "config": {
      "orientation": "portrait",
      "voice": "af_sarah",
      "generateVideos": false
    }
  }' \
  --oidc-service-account-email="scheduler-invoker@shorts-automation-123456.iam.gserviceaccount.com"
```

### 7-7. 생성된 Job 확인

```bash
# Job 목록 보기
gcloud scheduler jobs list --location=us-central1

# 출력:
# ID               LOCATION      SCHEDULE (TZ)        TARGET_TYPE  STATE
# shorts-morning   us-central1   0 9 * * * (Asia/Seoul)   HTTP         ENABLED
# shorts-noon      us-central1   0 12 * * * (Asia/Seoul)  HTTP         ENABLED
# shorts-evening   us-central1   0 18 * * * (Asia/Seoul)  HTTP         ENABLED
```

✅ 3개 다 `ENABLED` 상태면 성공!

---

## 8. 테스트 및 확인

### 8-1. 즉시 테스트 실행

스케줄을 기다리지 말고 지금 바로 테스트:

```bash
# 오전 9시 Job 즉시 실행
gcloud scheduler jobs run shorts-morning --location=us-central1

# 출력:
# Running job [shorts-morning]...done.
```

### 8-2. 실행 결과 확인 (GCP Console)

1. 브라우저에서 접속: https://console.cloud.google.com/cloudscheduler
2. `shorts-morning` 클릭
3. **실행 기록** 탭 클릭
4. 최근 실행 확인:
   - 성공하면: ✅ 녹색 체크
   - 실패하면: ❌ 빨간 X

### 8-3. Cloud Run 로그 확인

```bash
# 최근 로그 보기
gcloud run services logs read short-video-maker \
  --region=us-central1 \
  --limit=100

# 실시간 로그 (계속 지켜보기)
gcloud run services logs tail short-video-maker \
  --region=us-central1
```

로그에서 찾아야 할 것:
```
✨ Processing CONSISTENT SHORTS request (character consistency mode)
🎨 Using CONSISTENT SHORTS workflow
📸 Generating image for scene
✅ Consistent character image generated and saved
🎉 All images generated with consistent character!
```

### 8-4. 생성된 비디오 확인

비디오가 생성되면 응답으로 URL이 반환됩니다:

```json
{
  "videoId": "ckm2abc123",
  "status": "queued",
  "message": "Video queued for processing"
}
```

비디오 상태 확인:
```bash
curl https://short-video-maker-abc123-uc.a.run.app/api/video/status/ckm2abc123

# 응답:
{
  "videoId": "ckm2abc123",
  "status": "completed",
  "videoUrl": "https://..."
}
```

---

## 9. 문제 해결

### 문제 1: "gcloud: command not found"

**원인:** gcloud CLI가 PATH에 없음

**해결:**
```bash
# Mac/Linux
export PATH=$PATH:~/google-cloud-sdk/bin
source ~/.bashrc

# Windows - 환경 변수에 추가:
C:\Users\사용자이름\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin
```

### 문제 2: "You do not currently have an active account selected"

**해결:**
```bash
gcloud auth login
# 브라우저에서 로그인
```

### 문제 3: Deploy 중 "Permission denied"

**해결:**
```bash
# Docker 권한 설정 (Linux)
sudo usermod -aG docker $USER
newgrp docker

# 또는 sudo로 실행
sudo ./deploy-gcp.sh
```

### 문제 4: "Secret already exists"

이미 Secret이 있다는 뜻. 업데이트:

```bash
# 기존 Secret 삭제
gcloud secrets delete PEXELS_API_KEY

# 다시 생성
echo -n "새로운키" | gcloud secrets create PEXELS_API_KEY --data-file=-
```

### 문제 5: Scheduler Job 실행 실패

**확인사항:**

1. Service Account 권한 확인:
```bash
gcloud run services get-iam-policy short-video-maker --region=us-central1

# scheduler-invoker가 있는지 확인
```

2. Cloud Run 로그 확인:
```bash
gcloud run services logs read short-video-maker --region=us-central1 --limit=50
```

3. Service URL이 맞는지 확인:
```bash
gcloud run services describe short-video-maker --region=us-central1 --format="value(status.url)"
```

### 문제 6: 비디오 생성 실패

**확인사항:**

1. API 키가 올바른지 확인:
```bash
# Secret 내용 확인 (일부만 보임)
gcloud secrets versions access latest --secret=GOOGLE_GEMINI_API_KEY

# 키가 맞는지 확인
```

2. 로그에서 에러 메시지 찾기:
```bash
gcloud run services logs read short-video-maker --region=us-central1 | grep ERROR
```

### 문제 7: "BUILD FAILED"

**원인:** Docker 이미지 빌드 실패

**해결:**
```bash
# 디스크 공간 확인
df -h

# Docker 정리
docker system prune -a

# 다시 시도
./deploy-gcp.sh
```

### 문제 8: Cold Start 너무 느림

**해결책 1:** 최소 인스턴스 1로 설정 (비용 증가)
```bash
gcloud run services update short-video-maker \
  --min-instances=1 \
  --region=us-central1
```

**해결책 2:** 그냥 기다리기 (추천)
- Cold start는 30초 정도
- 비디오 생성은 3-5분
- 전체 시간 대비 영향 미미

---

## 10. 유용한 명령어 모음

### Cloud Run 관련

```bash
# 서비스 목록
gcloud run services list

# 서비스 상세 정보
gcloud run services describe short-video-maker --region=us-central1

# 서비스 삭제
gcloud run services delete short-video-maker --region=us-central1

# 환경 변수 업데이트
gcloud run services update short-video-maker \
  --set-env-vars "LOG_LEVEL=debug" \
  --region=us-central1

# 메모리/CPU 변경
gcloud run services update short-video-maker \
  --memory=8Gi \
  --cpu=4 \
  --region=us-central1
```

### Cloud Scheduler 관련

```bash
# Job 목록
gcloud scheduler jobs list --location=us-central1

# Job 즉시 실행
gcloud scheduler jobs run shorts-morning --location=us-central1

# Job 일시 중지
gcloud scheduler jobs pause shorts-morning --location=us-central1

# Job 재개
gcloud scheduler jobs resume shorts-morning --location=us-central1

# Job 삭제
gcloud scheduler jobs delete shorts-morning --location=us-central1

# Job 스케줄 변경
gcloud scheduler jobs update http shorts-morning \
  --schedule="0 10 * * *" \
  --location=us-central1
```

### Secret Manager 관련

```bash
# Secret 목록
gcloud secrets list

# Secret 값 보기
gcloud secrets versions access latest --secret=PEXELS_API_KEY

# Secret 업데이트
echo -n "새로운키" | gcloud secrets versions add PEXELS_API_KEY --data-file=-

# Secret 삭제
gcloud secrets delete PEXELS_API_KEY
```

### 로그 확인

```bash
# 최근 로그
gcloud run services logs read short-video-maker --region=us-central1 --limit=100

# 실시간 로그
gcloud run services logs tail short-video-maker --region=us-central1

# 에러만 보기
gcloud run services logs read short-video-maker --region=us-central1 | grep ERROR

# 특정 시간 로그
gcloud run services logs read short-video-maker \
  --region=us-central1 \
  --filter="timestamp>=2024-10-30T09:00:00Z"
```

---

## 11. 비용 모니터링

### 11-1. 비용 확인

1. GCP Console: https://console.cloud.google.com/billing
2. **비용 보고서** 클릭
3. 서비스별 비용 확인:
   - Cloud Run
   - Cloud Build
   - Container Registry
   - Secret Manager
   - Cloud Scheduler

### 11-2. 예산 알림 설정

1. **예산 및 알림** 클릭
2. **예산 만들기**
3. 예산 금액 설정 (예: $10/월)
4. 알림 임계값 설정 (예: 50%, 90%, 100%)
5. 이메일 주소 입력
6. **만들기**

---

## 12. 다음 단계

✅ 배포 완료!
✅ 스케줄러 설정 완료!

이제 할 수 있는 것:

### 12-1. 스케줄 추가하기

평일/주말 다른 컨텐츠:
```bash
# 평일만 (월-금)
gcloud scheduler jobs create http shorts-weekday \
  --schedule="0 9 * * 1-5" \
  ...

# 주말만 (토-일)
gcloud scheduler jobs create http shorts-weekend \
  --schedule="0 10 * * 0,6" \
  ...
```

### 12-2. n8n 연동

webhook_url 추가하여 YouTube 자동 업로드:
```json
{
  "webhook_url": "https://your-n8n.com/webhook/youtube-upload",
  "character": {...},
  "scenes": [...]
}
```

### 12-3. 캐릭터 변경

매일 다른 캐릭터로:
```bash
# config 파일 만들기
cat > morning-astronaut.json <<EOF
{
  "character": {
    "description": "A young female astronaut..."
  },
  ...
}
EOF

# Scheduler에서 파일 사용
--message-body-from-file=morning-astronaut.json
```

### 12-4. 코드 업데이트

```bash
cd short-video-maker
git pull origin main
./deploy-gcp.sh  # 자동으로 새 버전 배포
```

---

## 13. 요약

### ✅ 완료한 것

1. ✅ GCP 프로젝트 생성
2. ✅ gcloud CLI 설치 및 설정
3. ✅ API 키 3개 발급
4. ✅ Secret Manager에 키 저장
5. ✅ Cloud Run에 배포
6. ✅ Cloud Scheduler 3개 Job 생성 (9시, 12시, 6시)
7. ✅ 테스트 완료

### 📊 현재 상태

- **Service URL:** https://short-video-maker-abc123-uc.a.run.app
- **API Endpoints:**
  - `/api/video/consistent-shorts` (캐릭터 일관성)
  - `/api/video/nano-banana` (Nano Banana)
  - `/api/video/veo3` (VEO3)
  - `/health` (헬스 체크)
- **Scheduler Jobs:**
  - `shorts-morning` - 매일 오전 9시 (한국 시간)
  - `shorts-noon` - 매일 오후 12시
  - `shorts-evening` - 매일 오후 6시

### 💰 예상 비용

- Cloud Scheduler: 무료 (3개 이내)
- Cloud Run: $5-10/월
- Container Registry: $1-2/월
- **Total: ~$6-12/월**

### 🎉 축하합니다!

**정해진 시간에 자동으로 숏츠가 생성되는 시스템이 완성되었습니다!**

이제:
- 매일 오전 9시, 12시, 오후 6시에 자동으로 숏츠 생성
- 서버 관리 불필요
- 비용 효율적
- Auto-scaling 지원

**더 이상 손댈 필요 없이 자동으로 작동합니다! 🚀**

---

## 📞 도움이 필요하면

- **문서:** `docs/` 폴더의 다른 가이드 참조
- **로그 확인:** `gcloud run services logs read ...`
- **상태 확인:** GCP Console - Cloud Run, Cloud Scheduler

**Happy Automating! 🎬✨**
