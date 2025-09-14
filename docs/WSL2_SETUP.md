# WSL2 환경에서 Short Video Maker 완벽 설치 가이드

## 🎯 개요

Windows에서 Short Video Maker를 실행할 때 발생하는 네이티브 모듈 호환성 문제를 WSL2 Linux 환경에서 완벽하게 해결하는 방법을 설명합니다.

## ✅ 해결된 문제들

- **whisper.cpp 컴파일 실패** → ✅ Linux 환경에서 정상 컴파일
- **Chrome Headless Shell 라이브러리 오류** → ✅ 시스템 패키지로 해결  
- **Kokoro TTS 모듈 로딩 오류** → ✅ 정상 작동
- **포트 접근 문제** → ✅ localhost:3123으로 정상 접근

## 🔧 WSL2 설치 및 설정

### 1️⃣ WSL2 활성화 (Windows 10/11)

**관리자 권한으로** PowerShell 또는 Command Prompt 열기:

```powershell
# WSL 기능 활성화
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

# Virtual Machine Platform 활성화
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

# 컴퓨터 재시작 필요
```

재시작 후:
```powershell
# WSL2를 기본값으로 설정
wsl --set-default-version 2

# Ubuntu 22.04 설치
wsl --install -d Ubuntu-22.04
```

### 2️⃣ Ubuntu 초기 설정

WSL2 Ubuntu가 설치되면 사용자 계정을 생성하고 다음을 실행:

```bash
# 패키지 목록 업데이트
sudo apt update && sudo apt upgrade -y

# Node.js 20.x 설치
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Node.js 버전 확인
node --version  # v20.x.x 이상이어야 함
npm --version   # 10.x.x 이상이어야 함
```

## 🔧 시스템 의존성 설치

### Chrome Headless Shell 필요 라이브러리 설치

```bash
sudo apt install -y \
    libnss3 \
    libdbus-1-3 \
    libatk1.0-0 \
    libgbm-dev \
    libasound2 \
    libxrandr2 \
    libxkbcommon-dev \
    libxfixes3 \
    libxcomposite1 \
    libxdamage1 \
    libatk-bridge2.0-0 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2
```

### 추가 개발 도구 설치

```bash
# 빌드 도구 설치
sudo apt install -y build-essential cmake

# Git 설치 (이미 있을 수 있음)
sudo apt install -y git

# FFmpeg (추가 의존성으로 필요할 수 있음)
sudo apt install -y ffmpeg
```

## 🚀 Short Video Maker 설치 및 실행

### 1️⃣ 프로젝트 디렉토리로 이동

```bash
# Windows 파일 시스템의 프로젝트로 이동
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# 현재 위치 확인
pwd  # /mnt/d/Data/00_Personal/YTB/short-video-maker 출력되어야 함
```

### 2️⃣ 환경 변수 확인

```bash
# .env 파일 확인
cat .env

# 다음 내용이 있는지 확인:
# PEXELS_API_KEY=JXYSxzfCYKkpDs3FJJjh1ePOgZAMMALSvpfwpL24YfQZO11FWo9Yhrnw
# LOG_LEVEL=trace
# WHISPER_VERBOSE=true
# PORT=3123
# DEV=true
```

### 3️⃣ 의존성 설치

```bash
# Node.js 의존성 설치
npm install --legacy-peer-deps

# 설치 완료까지 2-3분 소요
```

### 4️⃣ 프로젝트 빌드

```bash
# 프로젝트 빌드
npm run build

# 빌드 완료까지 1-2분 소요
```

### 5️⃣ 서버 실행

```bash
# 프로덕션 모드로 서버 실행
npm start
```

## 🎉 실행 성공 확인

서버가 성공적으로 시작되면 다음과 같은 메시지들이 표시됩니다:

```json
{"level":"debug","msg":"checking music files"}
{"level":"debug","msg":"initializing remotion"}
{"level":"debug","msg":"initializing kokoro"}
{"level":"debug","msg":"initializing whisper"}
{"level":"debug","msg":"Whisper model downloaded"}
{"level":"debug","msg":"initializing ffmpeg"}
{"level":"info","msg":"testing if the installation was successful - this may take a while..."}
{"level":"debug","msg":"Audio generated with Kokoro"}
{"level":"debug","msg":"Found video from Pexels API"}
{"level":"debug","msg":"Rendering test video: 100% complete"}
{"level":"info","msg":"the installation was successful - starting the server"}
{"level":"info","msg":"MCP and API server is running"}
{"level":"info","msg":"UI server is running on http://localhost:3123"}
```

### Health Check 확인

새로운 터미널에서:
```bash
curl http://localhost:3123/health
# 출력: {"status":"ok"}
```

## 🌐 웹 인터페이스 접근

브라우저에서 다음 URL로 접근:
- **메인 UI**: http://localhost:3123
- **Health Check**: http://localhost:3123/health
- **API Docs**: http://localhost:3123/api

## 🔧 개발 모드 실행

### 개발 서버 (파일 변경 시 자동 재시작)

```bash
# 개발 모드로 실행
npm run dev

# Vite가 파일 변경을 감지하고 자동으로 Frontend를 재빌드
# ts-node가 파일 변경을 감지하고 자동으로 Backend를 재시작
```

## 🛠️ 문제 해결

### 포트 충돌 문제

```bash
# 포트 3123 사용 중인 프로세스 확인
sudo ss -tlnp | grep 3123

# 프로세스 종료
sudo pkill -f "node.*index.ts"
sudo pkill -f "node.*index.js"
```

### 권한 문제

```bash
# npm 전역 패키지 권한 문제 해결
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### 메모리 부족 문제

WSL2 메모리 제한 설정 (Windows에서):

`C:\Users\[사용자명]\.wslconfig` 파일 생성:
```ini
[wsl2]
memory=4GB
processors=2
```

설정 후 WSL 재시작:
```powershell
# Windows PowerShell에서
wsl --shutdown
wsl
```

## 📊 성능 최적화

### 1. WSL2 메모리 할당량 늘리기
앞서 설명한 `.wslconfig` 설정 사용

### 2. 개발 환경에서 리소스 절약
```bash
# 환경변수로 리소스 사용량 조절
export CONCURRENCY=1
export VIDEO_CACHE_SIZE_IN_BYTES=1048576000  # 1GB
export WHISPER_MODEL=tiny.en  # 더 작은 모델 사용

npm start
```

## 🔄 서비스 관리

### 백그라운드에서 실행 (PM2 사용)

```bash
# PM2 설치
npm install -g pm2

# 서비스 시작
pm2 start dist/index.js --name short-video-maker

# 상태 확인
pm2 status

# 로그 확인
pm2 logs short-video-maker

# 서비스 중지
pm2 stop short-video-maker

# 서비스 삭제
pm2 delete short-video-maker
```

### 자동 시작 설정

```bash
# PM2 스타트업 스크립트 생성
pm2 startup

# 현재 실행 중인 프로세스를 자동 시작에 저장
pm2 save
```

## 📁 생성된 파일 위치

```bash
# 데이터 디렉토리
~/.ai-agents-az-video-generator/

# 구조:
├── libs/
│   └── whisper/               # Whisper.cpp 바이너리 및 모델
│       └── models/
│           └── ggml-medium.en.bin
├── videos/                    # 생성된 비디오 파일
├── audio/                     # 임시 오디오 파일
└── temp/                      # 임시 파일들
```

## 🚀 다음 단계

1. **브라우저에서 http://localhost:3123 접속**
2. **텍스트 입력하여 첫 번째 비디오 생성**
3. **API 엔드포인트 테스트**
4. **필요시 설정 파일 커스터마이징**

---

## ✅ 체크리스트

실행 전 다음 사항들을 확인하세요:

- [ ] WSL2가 활성화되고 Ubuntu 22.04가 설치됨
- [ ] Node.js 20.x 이상 설치됨
- [ ] 시스템 라이브러리들이 설치됨
- [ ] npm install --legacy-peer-deps 완료
- [ ] npm run build 완료
- [ ] .env 파일에 PEXELS_API_KEY 설정됨
- [ ] 최소 3GB RAM 여유 공간 확보
- [ ] 포트 3123이 사용 가능함

모든 체크리스트가 완료되면 `npm start`로 서버를 실행하세요!