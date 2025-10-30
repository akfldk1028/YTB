# 어디서 실행하나요? - 명령어 실행 위치 가이드

## 🤔 당신의 질문

> "이걸 어디서 하라는거임? gcloud cli 깔아야해?"

**답변:**
1. ✅ 네, gcloud CLI 깔아야 합니다!
2. 📍 당신 컴퓨터 터미널에서 실행합니다!
3. 🌐 GCP 웹사이트가 아닙니다!

---

## 📍 전체 흐름 (어디서 뭘 하는지)

```
┌─────────────────────────────────────────────────────────┐
│  1. 당신의 컴퓨터 (Windows/Mac/Linux)                     │
│     ↓                                                    │
│  2. 터미널/명령 프롬프트 열기                             │
│     ↓                                                    │
│  3. gcloud CLI 설치 (한 번만)                            │
│     ↓                                                    │
│  4. gcloud로 GCP에 명령어 전송                           │
│     ↓                                                    │
│  5. GCP가 Cloud Run에 배포                               │
└─────────────────────────────────────────────────────────┘
```

---

## 🖥️ Step 1: 터미널 열기

### Windows

**방법 1: Git Bash (추천)**
1. 시작 메뉴 → "Git Bash" 검색
2. 클릭하여 열기
3. 검은 창이 뜸 (여기가 터미널!)

**방법 2: PowerShell**
1. `Windows키 + X`
2. "Windows PowerShell" 선택
3. 파란 창이 뜸 (여기가 터미널!)

**방법 3: 명령 프롬프트 (cmd)**
1. `Windows키 + R`
2. `cmd` 입력
3. Enter
4. 검은 창이 뜸

### Mac

1. `Command + Space` (Spotlight 검색)
2. "terminal" 입력
3. Enter
4. 흰색/검은색 창이 뜸 (여기가 터미널!)

### Linux

1. `Ctrl + Alt + T`
2. 터미널 열림!

---

## 🛠️ Step 2: gcloud CLI 설치

### Windows

#### 2-1. 다운로드

브라우저에서:
```
https://cloud.google.com/sdk/docs/install
```

1. **Windows용 설치 프로그램** 클릭
2. `GoogleCloudSDKInstaller.exe` 다운로드
3. 다운로드 완료되면 실행

#### 2-2. 설치

1. "Next" 클릭
2. 설치 경로: 그냥 기본값 (C:\Users\...\AppData\Local\Google\Cloud SDK)
3. "Install" 클릭
4. 설치 중... (3-5분 소요)
5. 완료되면:
   - ✅ "Start Cloud SDK Shell" 체크
   - ✅ "Run gcloud init" 체크
6. "Finish" 클릭

#### 2-3. 새 창이 뜨면

"Cloud SDK Shell" 창이 자동으로 열림:
```
Welcome to the Google Cloud SDK!
```

### Mac

#### 2-1. Homebrew로 설치 (가장 쉬움)

터미널에서:
```bash
# Homebrew 있는지 확인
brew --version

# 없으면 Homebrew 먼저 설치
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# gcloud CLI 설치
brew install --cask google-cloud-sdk
```

#### 2-2. 또는 수동 설치

```bash
# 다운로드
curl https://sdk.cloud.google.com | bash

# 터미널 재시작
exec -l $SHELL
```

### Linux (Ubuntu/Debian)

터미널에서:
```bash
# 1. 필수 패키지 설치
sudo apt-get update
sudo apt-get install apt-transport-https ca-certificates gnupg curl

# 2. Google Cloud 저장소 추가
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg

echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list

# 3. gcloud CLI 설치
sudo apt-get update && sudo apt-get install google-cloud-cli
```

---

## ✅ Step 3: 설치 확인

터미널에서 입력:

```bash
gcloud --version
```

**성공하면 이렇게 나옴:**
```
Google Cloud SDK 458.0.0
bq 2.0.101
core 2024.01.23
gsutil 5.27
```

**실패하면 (command not found):**
```
gcloud: command not found
```
→ 터미널을 닫고 다시 열어보세요!
→ 그래도 안 되면 PATH 설정 필요 (아래 참조)

---

## 🔧 Step 4: gcloud 초기화 (한 번만)

### 4-1. 초기화 시작

터미널에서:
```bash
gcloud init
```

### 4-2. 질문에 답하기

**질문 1: Re-initialize?**
```
Pick configuration to use:
 [1] Re-initialize this configuration [default] with new settings
 [2] Create a new configuration

→ 1 입력 후 Enter
```

**질문 2: 로그인**
```
You must log in to continue. Would you like to log in (Y/n)?

→ Y 입력 후 Enter
```

→ 브라우저가 자동으로 열림
→ Google 계정 선택
→ "허용" 클릭
→ "인증되었습니다" 메시지 나오면 브라우저 닫기

**질문 3: 프로젝트 선택**
```
Pick cloud project to use:
 [1] your-project-123456
 [2] Create a new project

→ 1 입력 (내 프로젝트 번호) 후 Enter
```

**질문 4: Region 설정**
```
Do you want to configure a default Compute Region and Zone? (Y/n)?

→ Y 입력 후 Enter

Please enter numeric choice or text value (must exactly match list item):
 [1] us-east1-b
 ...
 [15] us-central1
 ...

→ 15 입력 (us-central1) 후 Enter
```

**완료!**
```
Your Google Cloud SDK is configured and ready to use!
```

---

## 📂 Step 5: 코드 폴더로 이동

### 5-1. Git 저장소 클론 (아직 안 했으면)

터미널에서:

```bash
# 홈 디렉토리로 이동
cd ~

# 또는 바탕화면으로
cd Desktop

# 저장소 클론
git clone https://github.com/YOUR_USERNAME/YTB.git

# 폴더 들어가기
cd YTB/short-video-maker

# 현재 위치 확인
pwd

# 출력 (Mac/Linux):
# /Users/username/YTB/short-video-maker
# 또는 (Windows):
# /c/Users/username/YTB/short-video-maker
```

### 5-2. 파일 확인

```bash
ls -la

# 이런 파일들이 보여야 함:
# deploy-gcp.sh
# gcp.Dockerfile
# package.json
# src/
# docs/
```

✅ `deploy-gcp.sh` 보이면 성공!

---

## 🚀 Step 6: 이제 명령어 실행!

**현재 위치:** `/YTB/short-video-maker` 폴더 안

### 6-1. API 활성화

터미널에 **한 줄씩** 복사-붙여넣기:

```bash
gcloud services enable run.googleapis.com
```
Enter 누르면 → 10초 대기 → "Operation finished successfully" 나옴

```bash
gcloud services enable cloudbuild.googleapis.com
```
Enter → 대기 → 완료

```bash
gcloud services enable secretmanager.googleapis.com
```
Enter → 대기 → 완료

```bash
gcloud services enable containerregistry.googleapis.com
```
Enter → 대기 → 완료

✅ 4개 다 완료!

### 6-2. Secret Manager에 키 저장

**먼저 메모장에 키 준비:**
```
PEXELS_API_KEY: JXYSxzfCYKkpDs3FJJjh1ePOgZAMMALSvpfwpL24YfQZO11FWo9Yhrnw
GOOGLE_GEMINI_API_KEY: AIzaSyDaGmNJn9F3P2aBcDeFgHiJkLmNoPqRsTu
GOOGLE_CLOUD_PROJECT_ID: shorts-automation-123456
```

**터미널에 입력 (실제 키로 바꾸세요!):**

```bash
# Pexels 키 저장
echo -n "JXYSxzfCYKkpDs3FJJjh1ePOgZAMMALSvpfwpL24YfQZO11FWo9Yhrnw" | gcloud secrets create PEXELS_API_KEY --data-file=-
```
Enter → "Created version [1] of the secret [PEXELS_API_KEY]." 나오면 성공!

```bash
# Gemini 키 저장
echo -n "AIzaSyDaGmNJn9F3P2aBcDeFgHiJkLmNoPqRsTu" | gcloud secrets create GOOGLE_GEMINI_API_KEY --data-file=-
```
Enter → 성공 메시지

```bash
# 프로젝트 ID 저장
echo -n "shorts-automation-123456" | gcloud secrets create GOOGLE_CLOUD_PROJECT_ID --data-file=-
```
Enter → 성공 메시지

✅ 3개 다 완료!

### 6-3. 프로젝트 ID 환경 변수 설정

```bash
export GCP_PROJECT_ID="shorts-automation-123456"
```
⚠️ `shorts-automation-123456`를 당신의 실제 프로젝트 ID로 바꾸세요!

확인:
```bash
echo $GCP_PROJECT_ID
```
출력: `shorts-automation-123456` (당신의 프로젝트 ID)

### 6-4. 배포 스크립트 실행

**실행 권한 부여 (한 번만):**
```bash
chmod +x deploy-gcp.sh
```

**배포 시작!**
```bash
./deploy-gcp.sh
```

**화면에 이렇게 나옴:**
```
[INFO] Starting GCP Cloud Run deployment...
[SUCCESS] Using GCP Project: shorts-automation-123456
[INFO] Region: us-central1
[INFO] Service Name: short-video-maker
[INFO] Checking required GCP APIs...
[SUCCESS] API cloudbuild.googleapis.com is already enabled
...
[INFO] Building Docker image...
Step 1/15 : FROM ubuntu:22.04 AS install-whisper
...
```

⏱️ **5-10분 대기... ☕**

컴퓨터 가만히 두고 커피 마시면 됩니다!

**완료되면:**
```
[SUCCESS] ==========================================
[SUCCESS] Deployment Complete!
[SUCCESS] ==========================================
[SUCCESS] Service URL: https://short-video-maker-abc123-uc.a.run.app

[INFO] Test the service:
[INFO]   curl https://short-video-maker-abc123-uc.a.run.app/health
[SUCCESS] ==========================================
```

✅ **Service URL을 메모장에 복사!**

---

## 🎉 완료!

이제 다 됐어요!

### 확인:

```bash
curl https://short-video-maker-abc123-uc.a.run.app/health
```

출력:
```json
{"status":"ok"}
```

✅ 성공!

---

## 📝 요약: 어디서 뭘 했나?

```
┌──────────────────────────────────────────────────────┐
│ 1. 브라우저 (GCP Console)                             │
│    → console.cloud.google.com                        │
│    → 프로젝트 만들기                                  │
│    → 프로젝트 ID 확인                                 │
└──────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────┐
│ 2. 브라우저 (API 키 발급)                             │
│    → pexels.com/api (Pexels 키)                      │
│    → aistudio.google.com (Gemini 키)                 │
│    → 키 복사해서 메모장에 저장                        │
└──────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────┐
│ 3. 당신의 컴퓨터 - 터미널 (이게 핵심!)                │
│    Windows: Git Bash / PowerShell / cmd             │
│    Mac: Terminal                                     │
│    Linux: Terminal                                   │
│                                                      │
│    여기서 실행:                                       │
│    ├─ gcloud CLI 설치                                │
│    ├─ gcloud init (초기화)                           │
│    ├─ git clone (코드 다운로드)                       │
│    ├─ cd YTB/short-video-maker                       │
│    ├─ gcloud services enable ... (API 활성화)        │
│    ├─ gcloud secrets create ... (키 저장)            │
│    ├─ export GCP_PROJECT_ID=...                      │
│    └─ ./deploy-gcp.sh (배포!)                        │
└──────────────────────────────────────────────────────┘
                      ↓
┌──────────────────────────────────────────────────────┐
│ 4. GCP (자동으로 처리됨)                              │
│    → Docker 이미지 빌드                               │
│    → Container Registry에 푸시                       │
│    → Cloud Run에 배포                                │
│    → Service URL 생성                                │
└──────────────────────────────────────────────────────┘
```

---

## ❓ 자주 묻는 질문

### Q1: GCP Console 웹사이트에서 하는 거 아님?

**A:** 아니요!
- GCP Console: 프로젝트 만들기, 상태 확인
- 터미널 (gcloud CLI): 실제 배포 명령어 실행

### Q2: Docker Desktop도 깔아야 함?

**A:** 네! 필요해요.
- Windows/Mac: Docker Desktop 설치
- Linux: `sudo apt-get install docker.io`

확인:
```bash
docker --version
```

### Q3: 터미널이 뭔지 모르겠어요

**A:**
- Windows: 검은색 또는 파란색 창 (명령어 입력하는 곳)
- Mac: "Terminal" 앱
- Linux: 기본으로 있는 터미널

### Q4: "command not found" 에러가 나요

**A:**
1. 터미널 닫고 다시 열기
2. 그래도 안 되면:
```bash
# Mac/Linux
export PATH=$PATH:~/google-cloud-sdk/bin
source ~/.bashrc

# Windows
시스템 환경 변수에 추가:
C:\Users\사용자이름\AppData\Local\Google\Cloud SDK\google-cloud-sdk\bin
```

### Q5: deploy-gcp.sh 파일이 없어요

**A:**
```bash
# 현재 위치 확인
pwd

# YTB/short-video-maker 폴더에 있어야 함
cd ~/YTB/short-video-maker

# 파일 확인
ls -la deploy-gcp.sh
```

---

## 🎯 체크리스트

배포 전:
- [ ] 터미널 열었음
- [ ] gcloud CLI 설치 완료 (`gcloud --version` 확인)
- [ ] gcloud init 완료 (로그인, 프로젝트 선택)
- [ ] Git 저장소 클론 완료
- [ ] `YTB/short-video-maker` 폴더에 있음 (`pwd` 확인)
- [ ] API 키 3개 준비됨
- [ ] Docker 설치 완료 (`docker --version` 확인)

배포 중:
- [ ] API 4개 활성화 완료
- [ ] Secret 3개 생성 완료
- [ ] `export GCP_PROJECT_ID=...` 실행
- [ ] `./deploy-gcp.sh` 실행 중...

배포 후:
- [ ] Service URL 받음
- [ ] `curl https://xxx.run.app/health` 테스트 성공

---

## 🚀 다음 단계

배포 완료했으면:

```bash
# 1. Cloud Scheduler 설정
gcloud scheduler jobs create http shorts-morning \
  --location=us-central1 \
  --schedule="0 9 * * *" \
  --uri="https://YOUR_SERVICE_URL/api/video/consistent-shorts" \
  ...

# 2. 테스트
gcloud scheduler jobs run shorts-morning --location=us-central1

# 3. 로그 확인
gcloud run services logs read short-video-maker --region=us-central1
```

**모든 명령어는 당신 컴퓨터 터미널에서 실행합니다!** 💻

---

이제 명확해졌나요? 😊

**핵심:**
1. ✅ gcloud CLI 설치 필요
2. 📍 당신 컴퓨터 터미널에서 실행
3. 🌐 GCP 웹사이트 아님
4. ☕ 배포는 5-10분 소요
