# Short Video Maker - README INDEX

> AI가 프로젝트를 빠르게 파악하기 위한 README 목차
> Last Updated: 2026-01-31

---

## 인프라 현황

| 서비스 | 타입 | URL | Region |
|--------|------|-----|--------|
| **YTB API** | Cloud Run | https://short-video-maker-550996044521.us-central1.run.app | us-central1 |
| **NEB API** | Cloud Run | https://neb-550996044521.asia-northeast3.run.app | asia-northeast3 |
| **Neo4j DB** | VM | bolt://34.47.112.49:7687 | asia-northeast3 |
| **NEB Frontend** | VM | http://34.47.112.49:8081 | asia-northeast3 |
| **GCS Bucket** | Storage | gs://dkdk-474008-short-videos | - |

---

## 프로젝트 개요

**YouTube Shorts 자동 생성 시스템**

- 캐릭터 기반 일관성 있는 영상 생성
- 책/논문 → AI 분석 → Shorts 자동 생성
- 뉴스 → 정치/경제 Shorts 생성
- YouTube 자동 업로드

---

## README 목차

### 1. 프로젝트 루트

| 파일 | 경로 | 설명 |
|------|------|------|
| **CLAUDE.md** | `./CLAUDE.md` | AI 컨텍스트 (API 레퍼런스, 핵심 정보) |
| **README_INDEX.md** | `./README_INDEX.md` | 이 파일 (전체 목차) |

---

### 2. 핵심 모듈 (src/)

| 모듈 | README 경로 | 설명 |
|------|-------------|------|
| **character-store** | [`src/character-store/README.md`](src/character-store/README.md) | 캐릭터/프로필 관리 |
| **image-generation** | [`src/image-generation/README.md`](src/image-generation/README.md) | AI 이미지 생성 (GPT, NanoBanana) |
| **server** | [`src/server/README.md`](src/server/README.md) | Express API 서버 |
| **short-creator** | [`src/short-creator/README.md`](src/short-creator/README.md) | 비디오 생성 워크플로우 |
| **youtube-upload** | [`src/youtube-upload/README.md`](src/youtube-upload/README.md) | YouTube 업로드 |
| **storage** | [`src/storage/README.md`](src/storage/README.md) | GCS 파일 관리 |
| **types** | [`src/types/README.md`](src/types/README.md) | 전역 타입 정의 |

---

### 3. 프로젝트별 모듈

| 프로젝트 | README 경로 | 설명 |
|----------|-------------|------|
| **YTB-books-project** | [`src/YTB-books-project/README.md`](src/YTB-books-project/README.md) | 책/논문 → Shorts |
| **YTB-news-project** | [`src/YTB-news-project/README.md`](src/YTB-news-project/README.md) | 뉴스 → Shorts |
| **YTB-ffmpeg** | [`src/YTB-ffmpeg/README.md`](src/YTB-ffmpeg/README.md) | FFmpeg 비디오 합성 |
| **YTB-tts** | [`src/YTB-tts/README.md`](src/YTB-tts/README.md) | TTS (한국어/영어) |
| **politics-project** | [`src/politics-project/README.md`](src/politics-project/README.md) | 정치 뉴스 분석 |

---

### 4. YTB-books-project 상세

책/논문 → Neo4j GraphRAG → Shorts 자동 생성 (v3.1.1)
- **핵심 철학**: 논문은 수학 수식/원리 설명이 핵심. 이미지는 캐릭터 위주 OR 수식 일관성 위주 유동 선택
- **v3.1.1**: FFmpeg ENAMETOOLONG 수정 (filter_complex_script)

| 파일 | 경로 | 설명 |
|------|------|------|
| **README_INDEX.md** | [`src/YTB-books-project/README_INDEX.md`](src/YTB-books-project/README_INDEX.md) | Books 프로젝트 목차 |
| services/README.md | [`src/YTB-books-project/src/services/README.md`](src/YTB-books-project/src/services/README.md) | 서비스 계층 |
| api/README.md | [`src/YTB-books-project/src/api/README.md`](src/YTB-books-project/src/api/README.md) | API 엔드포인트 |
| types/README.md | [`src/YTB-books-project/src/types/README.md`](src/YTB-books-project/src/types/README.md) | 타입 정의 |

---

### 5. 문서 (docs/)

| 카테고리 | 주요 문서 |
|----------|----------|
| **YouTube** | `YOUTUBE_OAUTH_COMPLETE_FLOW.md`, `YOUTUBE_TOKEN_UPDATE.md` |
| **캐릭터** | `CHARACTER-MANAGEMENT-GUIDE.md` |
| **CatProject** | `docs/CatProject/` - 고양이 커플 채널 가이드 |
| **NewsProject** | `docs/NewsProject/` - 뉴스 비디오 워크플로우 |
| **PoliticsProject** | `docs/PoliticsProject/` - 정치 분석 |
| **Update** | `docs/Update/` - 최신 업데이트 기록 |

---

## 빠른 시작

### 1. 서버 실행

```bash
cd short-video-maker
npm install
npm start
# http://localhost:3124
```

### 2. 핵심 API 테스트

```bash
# 캐릭터 목록
curl http://localhost:3124/api/characters/profiles

# GPT-to-NanoBanana 이미지 생성
curl -X POST http://localhost:3124/api/gpt-to-nanobanana/generate \
  -H "Content-Type: application/json" \
  -d '{
    "character": {"description": "A cute orange cat"},
    "scenes": [{"text": "Cat in forest"}, {"text": "Cat by river"}]
  }'

# 책 AI 분석 (ELI5 모드)
curl -X POST http://localhost:3124/api/books/AR_TALK.pdf/analyze \
  -H "Content-Type: application/json" \
  -d '{"audienceLevel": "elementary", "useELI5Style": true}'
```

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                         API Server (Express)                     │
│                         src/server/                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │ character-  │  │   image-    │  │   youtube-  │               │
│  │   store     │  │ generation  │  │   upload    │               │
│  └─────────────┘  └─────────────┘  └─────────────┘               │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │   short-    │  │   YTB-tts   │  │  YTB-ffmpeg │               │
│  │  creator    │  │             │  │             │               │
│  └─────────────┘  └─────────────┘  └─────────────┘               │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│                      Projects (Sub-systems)                       │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │ YTB-books-      │  │ YTB-news-       │  │ politics-       │   │
│  │ project         │  │ project         │  │ project         │   │
│  │ (Neo4j+Gemini)  │  │ (News Shorts)   │  │ (정치 분석)     │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│                      External Services                            │
│                                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │  Neo4j   │ │ Gemini   │ │  GPT-4o  │ │ YouTube  │            │
│  │ GraphDB  │ │ AI/TTS   │ │  Image   │ │   API    │            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                          │
│  │   GCS    │ │ NanoBana │ │  VEO 3   │                          │
│  │ Storage  │ │ (Imagen) │ │ (Video)  │                          │
│  └──────────┘ └──────────┘ └──────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## YouTube 채널

| channelName | YouTube 채널 | Type |
|-------------|-------------|:----:|
| `clickaround` | ClickAround | **Main** |
| `why_cat` | 왜저러냥 | Sub |
| `red_news` | 빨강나라 보수공주 | News |
| `blue_news` | ~~파랑나라 진보왕자~~ (삭제됨) | News |
| `blue_news_2` | 진보나라파랑왕자 | News |

---

## 환경 변수

```bash
# 서버
PORT=3124

# GCP
GOOGLE_CLOUD_PROJECT=dkdk-474008
GCS_BUCKET=dkdk-474008-short-videos

# AI
OPENAI_API_KEY=sk-xxx
GOOGLE_GEMINI_API_KEY=xxx

# Neo4j (Books)
NEO4J_URI=bolt://34.47.112.49:7687
NEO4J_PASSWORD=xxx

# YouTube
YOUTUBE_CLIENT_ID=xxx
YOUTUBE_CLIENT_SECRET=xxx
```

---

## 배포

```bash
# Cloud Run 배포
gcloud builds submit --config=cloudbuild.yaml

# Secret Manager 업데이트
gcloud secrets versions add YOUTUBE_DATA --data-file=youtube-data.tar.gz
```

---

**이 파일을 먼저 읽으면 프로젝트 전체 구조를 빠르게 파악할 수 있습니다.**
