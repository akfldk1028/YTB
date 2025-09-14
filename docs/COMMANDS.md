# Short Video Maker 실행 가이드

## 🚀 빠른 시작

### 1️⃣ 환경변수 설정
```bash
# short-video-maker 폴더로 이동
cd short-video-maker

# 환경변수 파일 복사 (이미 생성됨)
copy .env.example .env

# .env 파일에서 PEXELS_API_KEY 확인/수정
# PEXELS_API_KEY=JXYSxzfCYKkpDs3FJJjh1ePOgZAMMALSvpfwpL24YfQZO11FWo9Yhrnw
```

### 2️⃣ 의존성 설치 (이미 완료)
```bash
npm install --legacy-peer-deps
```

### 3️⃣ 프로젝트 빌드 (이미 완료)
```bash
npm run build
```

## 🖥️ 실행 방법

### 현재 실행 중인 서비스
- **통합 서버 (UI + API)**: http://localhost:3123 (✅ WSL2에서 실행 중)
- **Web UI**: http://localhost:3123
- **REST API**: http://localhost:3123/api
- **MCP Server**: http://localhost:3123/mcp
- **Health Check**: http://localhost:3123/health

### WSL2에서 실행 (권장)

✅ **해결됨**: WSL2 Linux 환경에서 성공적으로 실행됩니다!

```bash
# 1. WSL2 환경 진입
wsl

# 2. 프로젝트 디렉토리로 이동
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# 3. 필요한 시스템 라이브러리 설치 (최초 1회만)
sudo apt update
sudo apt install -y libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2

# 4. 서버 실행
npm start
```

🎉 **성공**: 서버가 http://localhost:3123에서 실행됩니다!

## 🐳 Docker로 실행 (권장)

Docker가 설치되어 있다면 아래 방법을 권장합니다:

### Tiny 버전 (리소스 절약)
```bash
docker run -it --rm --name short-video-maker -p 3123:3123 ^
  -e LOG_LEVEL=debug ^
  -e PEXELS_API_KEY=JXYSxzfCYKkpDs3FJJjh1ePOgZAMMALSvpfwpL24YfQZO11FWo9Yhrnw ^
  gyoridavid/short-video-maker:latest-tiny
```

### 일반 버전
```bash
docker run -it --rm --name short-video-maker -p 3123:3123 ^
  -e LOG_LEVEL=debug ^
  -e PEXELS_API_KEY=JXYSxzfCYKkpDs3FJJjh1ePOgZAMMALSvpfwpL24YfQZO11FWo9Yhrnw ^
  gyoridavid/short-video-maker:latest
```

### CUDA 버전 (GPU 가속)
```bash
docker run -it --rm --name short-video-maker -p 3123:3123 ^
  -e LOG_LEVEL=debug ^
  -e PEXELS_API_KEY=JXYSxzfCYKkpDs3FJJjh1ePOgZAMMALSvpfwpL24YfQZO11FWo9Yhrnw ^
  --gpus=all ^
  gyoridavid/short-video-maker:latest-cuda
```

## 🔧 개발 모드

### 통합 개발 서버 (Frontend + Backend)
```bash
# WSL2에서 실행
wsl
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
npm run dev
# → Frontend + Backend가 함께 실행됨
# → http://localhost:3123
```

### 프로덕션 모드
```bash
# WSL2에서 실행
wsl
cd /mnt/d/Data/00_Personal/YTB/short-video-maker
npm start
# → http://localhost:3123
```

### 테스트 실행
```bash
npm test
```

## 📡 API 엔드포인트

백엔드 서버가 실행되면 다음 API를 사용할 수 있습니다:

### 기본 정보
- **Health Check**: `GET /health`
- **Available Voices**: `GET /api/voices`
- **Music Tags**: `GET /api/music-tags`

### 비디오 관리
- **Create Video**: `POST /api/short-video`
- **Get Video Status**: `GET /api/short-video/{id}/status`
- **Download Video**: `GET /api/short-video/{id}`
- **List Videos**: `GET /api/short-videos`
- **Delete Video**: `DELETE /api/short-video/{id}`

### 예시 요청
```bash
# 비디오 생성
curl -X POST "http://localhost:3123/api/short-video" ^
  -H "Content-Type: application/json" ^
  -d "{\"scenes\": [{\"text\": \"Hello world!\", \"searchTerms\": [\"nature\"]}], \"config\": {\"music\": \"chill\"}}"

# 상태 확인
curl "http://localhost:3123/api/short-video/{videoId}/status"
```

## 🌍 웹 인터페이스 사용법

1. **브라우저에서 접속**: http://localhost:3123
2. **텍스트 입력**: 나레이션으로 사용할 텍스트 입력
3. **검색 키워드**: 배경 영상 검색용 키워드 (쉼표로 구분)
   - 예: `nature, forest, mountain`
   - 예: `city, urban, night`
   - 예: `ocean, waves, sunset`
4. **옵션 선택**:
   - **Voice**: 음성 종류
   - **Music**: 배경 음악 분위기
   - **Caption Position**: 자막 위치
   - **Orientation**: 영상 방향
5. **생성**: "Create Video" 버튼 클릭

## ⚠️ 문제 해결

### Windows 호환성 이슈 ✅ 해결됨!

**문제**: Windows에서 whisper.cpp 및 Chrome Headless Shell 호환성 이슈

**✅ 해결 방법**: WSL2 환경에서 성공적으로 실행 가능!

```bash
# WSL2 설치 (Windows 11/10)
wsl --install

# Ubuntu 22.04 설치
wsl --install -d Ubuntu-22.04

# 필요한 시스템 라이브러리 설치
sudo apt update
sudo apt install -y libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 libxkbcommon-dev libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2
```

**대안**:
1. **WSL2 환경** (현재 성공적으로 동작 중) ⭐ 권장
2. **Docker 사용**
3. **Linux 서버에서 실행**

### 메모리 부족
최소 3GB, 권장 4GB RAM이 필요합니다. Docker Desktop에서 메모리 할당량을 확인하세요.

### API 키 오류
Pexels API 키가 올바른지 확인하세요:
- 무료 계정: https://www.pexels.com/api/
- 월 200회 요청 제한

## 📋 프로덕션 배포

### Docker Compose 사용
```bash
# docker-compose.yml 파일이 있는 디렉토리에서
docker-compose up -d

# 로그 확인
docker-compose logs -f short-video-maker
```

### PM2 사용 (Linux/Mac)
```bash
# PM2 설치
npm install -g pm2

# 애플리케이션 시작
pm2 start dist/index.js --name short-video-maker

# 상태 확인
pm2 status

# 로그 확인
pm2 logs short-video-maker
```

## 🔄 서비스 관리

### 현재 실행 중인 프로세스 확인
```bash
# Windows
netstat -ano | findstr :3000
netstat -ano | findstr :3123

# 프로세스 종료
taskkill /PID <PID번호> /F
```

### 서비스 재시작
```bash
# WSL2에서 서버 재시작
Ctrl+C  # 현재 실행 중인 프로세스 종료
npm start  # 통합 서버 다시 시작 (Frontend + Backend)

# 또는 개발 모드로 재시작
npm run dev  # 개발 모드 (파일 변경 시 자동 재시작)
```

## 📁 생성된 파일 위치

### Windows (npm 실행)
- **데이터 디렉토리**: `~/.ai-agents-az-video-generator`
- **생성된 비디오**: 데이터 디렉토리 내 `videos/` 폴더

### Docker
- **데이터 디렉토리**: `/app/data`
- **볼륨 마운트**: `-v ./videos:/app/data/videos`로 로컬에 저장 가능