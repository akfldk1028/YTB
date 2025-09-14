# Short Video Maker 프로젝트 요약

## 📋 프로젝트 개요
**Short Video Maker**는 텍스트 입력을 통해 자동으로 짧은 형태의 비디오를 생성하는 오픈소스 도구입니다.

### 주요 특징
- 🎙️ **텍스트-음성 변환**: Kokoro TTS를 사용한 자연스러운 음성 생성
- 📝 **자동 자막**: Whisper를 통한 정확한 자막 생성
- 🎥 **배경 비디오**: Pexels API를 통한 관련 배경 영상 자동 선택
- 🎵 **배경 음악**: 다양한 장르/분위기의 배경 음악 추가
- 🌐 **웹 UI**: React 기반의 직관적인 웹 인터페이스
- 🔄 **API 지원**: REST API 및 MCP(Model Context Protocol) 서버

## 🛠️ 기술 스택

### Backend
- **언어**: TypeScript/Node.js
- **프레임워크**: Express.js
- **비디오 생성**: Remotion
- **음성 합성**: Kokoro TTS
- **음성 인식**: Whisper.cpp
- **비디오 처리**: FFmpeg
- **외부 API**: Pexels (배경 비디오)

### Frontend
- **프레임워크**: React 19
- **빌드 도구**: Vite
- **스타일링**: Tailwind CSS
- **HTTP 클라이언트**: Axios
- **상태 관리**: Tanstack React Query

### 개발 도구
- **패키지 관리**: npm/pnpm
- **타입 검사**: TypeScript
- **린터**: ESLint
- **테스트**: Vitest
- **컨테이너화**: Docker

## 📁 프로젝트 구조
```
short-video-maker/
├── src/
│   ├── components/        # React 컴포넌트
│   ├── server/           # Express 서버
│   ├── short-creator/    # 비디오 생성 로직
│   ├── types/           # TypeScript 타입 정의
│   └── ui/              # UI 관련 파일
├── static/              # 정적 파일 (배경음악 등)
├── dist/               # 빌드된 파일
├── __mocks__/          # 테스트 모킹
├── docker-compose.yml  # Docker 설정
└── package.json       # 의존성 및 스크립트
```

## 🎯 주요 기능

### 1. 비디오 생성 프로세스
1. **텍스트 입력**: 사용자가 나레이션 텍스트와 검색 키워드 입력
2. **음성 변환**: Kokoro TTS가 텍스트를 자연스러운 음성으로 변환
3. **자막 생성**: Whisper가 생성된 음성을 분석해 정확한 자막 생성
4. **배경 선택**: Pexels API에서 키워드 관련 배경 비디오 검색
5. **음악 추가**: 선택된 장르/분위기에 맞는 배경 음악 추가
6. **합성**: Remotion이 모든 요소를 조합해 최종 비디오 렌더링

### 2. 웹 인터페이스 기능
- **비디오 생성**: 직관적인 폼을 통한 비디오 생성
- **설정 옵션**: 음성, 음악, 자막 위치, 비디오 방향 등 커스터마이징
- **진행 상황 추적**: 실시간 생성 진행 상황 모니터링
- **결과 관리**: 생성된 비디오 목록 조회 및 다운로드

### 3. API 기능
- **REST API**: HTTP 엔드포인트를 통한 프로그래매틱 접근
- **MCP 서버**: AI 에이전트와의 연동을 위한 Model Context Protocol 지원

## 🔧 설정 가능한 옵션

### 비디오 설정
- **방향**: 세로(Portrait) / 가로(Landscape)
- **자막 위치**: 상단/중앙/하단
- **자막 배경색**: 다양한 색상 옵션
- **패딩**: 나레이션 종료 후 추가 재생 시간

### 오디오 설정
- **음성**: 30+ 종류의 Kokoro 음성 선택
- **음악 장르**: sad, happy, chill, dark, hopeful 등 12가지 분위기
- **음량**: 낮음/중간/높음/음소거

## 📊 시스템 요구사항

### 최소 요구사항
- **메모리**: 3GB 이상 (권장 4GB)
- **CPU**: 2 vCPU 이상
- **저장공간**: 5GB 이상
- **네트워크**: 인터넷 연결 (Pexels API, 모델 다운로드)
- **운영체제**: WSL2 (Ubuntu 22.04+) 또는 Linux

### API 요구사항
- **Pexels API Key**: 무료 계정으로 발급 가능

### WSL2 추가 요구사항
- **Windows 10/11**: WSL2 지원
- **시스템 라이브러리**: Chrome Headless Shell 용

## 🌟 특징 및 장점

### 장점
- ✅ **완전 무료**: 오픈소스이며 무료 API 사용
- ✅ **로컬 실행**: GPU 집약적인 클라우드 서비스 대신 로컬에서 실행
- ✅ **고품질**: 전문적인 품질의 짧은 비디오 생성
- ✅ **커스터마이징**: 다양한 설정 옵션으로 개인화 가능
- ✅ **통합성**: 웹 UI와 API 모두 지원으로 다양한 사용 사례 대응

### 제한사항
- ❌ **언어 제한**: 영어 음성만 지원 (Kokoro 제한)
- ❌ **배경 소스**: Pexels로 제한됨
- ❌ **이미지 생성**: 텍스트/이미지 기반 비디오 생성 불가
- ✅ **Windows 호환성**: WSL2 환경에서 완전 해결!

## 🎬 사용 사례
- **소셜 미디어**: TikTok, Instagram Reels, YouTube Shorts 콘텐츠 제작
- **교육**: 간단한 설명 비디오 생성
- **마케팅**: 제품 소개나 광고 비디오 제작
- **개인**: 개인 프로젝트나 취미용 비디오 제작

## 📈 확장 가능성
- 다국어 TTS 모델 통합
- 추가 배경 비디오 소스 연동
- AI 기반 이미지/비디오 생성 통합
- 고급 편집 기능 추가
- 클라우드 배포 및 스케일링

## ✅ WSL2 성공 사례

**해결된 문제들:**
- whisper.cpp 컴파일 실패 → ✅ 해결
- Chrome Headless Shell 라이브러리 오류 → ✅ 해결
- Kokoro TTS 모듈 로딩 오류 → ✅ 해결

### WSL2 환경에서 실행 방법:
```bash
# 1. WSL2 환경 진입
wsl

# 2. 프로젝트 디렉토리로 이동
cd /mnt/d/Data/00_Personal/YTB/short-video-maker

# 3. 필요한 시스템 라이브러리 설치 (최초 1회만)
sudo apt update
sudo apt install -y libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 \
                    libxrandr2 libxkbcommon-dev libxfixes3 libxcomposite1 \
                    libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2

# 4. 서버 실행
npm start

# 5. 브라우저에서 접속
# http://localhost:3123
```

### ✅ 성공 확인:
- 서버 포트: 3123에서 listening 중
- Health Check: `{"status":"ok"}`
- 모든 구성요소 정상 작동
- 테스트 비디오 렌더링 성공
