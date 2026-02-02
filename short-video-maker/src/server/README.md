# Server

> Express API 서버 모듈
> 모든 API 라우트 및 미들웨어 관리

---

## 폴더 구조

```
server/
├── server.ts           # Express 앱 진입점 (포트 3124)
├── validator.ts        # 요청 검증
├── api/                # API 라우트 정의
│   ├── characters.ts       # /api/characters/*
│   ├── consistent-shorts.ts # /api/video/consistent-shorts
│   ├── gpt-to-nanobanana.ts # /api/gpt-to-nanobanana/*
│   ├── nano-banana.ts      # /api/nano-banana/*
│   ├── pexels.ts           # /api/pexels/*
│   └── veo3.ts             # /api/veo3/*
├── parsers/            # 요청 파서
└── routers/            # 라우터 설정
```

---

## 서버 설정

```typescript
// server.ts
const PORT = process.env.PORT || 3124;
const BASE_URL = 'https://short-video-maker-7qtnitbuvq-uc.a.run.app';
```

---

## 등록된 라우트

| 경로 | 모듈 | 설명 |
|------|------|------|
| `/api/characters/*` | character-store | 캐릭터/프로필 관리 |
| `/api/video/*` | short-creator | 비디오 생성 |
| `/api/gpt-to-nanobanana/*` | image-generation | 하이브리드 이미지 |
| `/api/nano-banana/*` | image-generation | NanoBanana 이미지 |
| `/api/youtube/*` | youtube-upload | YouTube 업로드 |
| `/api/news/*` | YTB-news-project | 뉴스 비디오 |
| `/api/books/*` | YTB-books-project | 책→Shorts |
| `/api/storage/*` | storage | GCS 파일 관리 |

---

## 핵심 API 요약

### 비디오 생성
```bash
POST /api/video/consistent-shorts
GET  /api/video/consistent-shorts/:videoId/status
```

### 이미지 생성
```bash
POST /api/gpt-to-nanobanana/generate
GET  /api/gpt-to-nanobanana/:testId
```

### YouTube 업로드
```bash
GET  /api/youtube/channels
POST /api/youtube/upload
GET  /api/youtube/auth/health-check
```

### 뉴스 비디오
```bash
POST /api/news/create
GET  /api/news/status/:videoId
GET  /api/news/download/:videoId
```

### 책→Shorts
```bash
POST /api/books/:bookId/analyze
POST /api/books/episodes/:episodeId/generate-video
GET  /api/books/episodes/stats
```

---

## 로컬 실행

```bash
cd short-video-maker
npm start
# 서버 시작: http://localhost:3124
```

---

## 환경 변수

서버 실행에 필요한 환경 변수는 `.env` 또는 Cloud Run Secret Manager에서 관리

```bash
PORT=3124
GOOGLE_CLOUD_PROJECT=dkdk-474008
GCS_BUCKET=dkdk-474008-short-videos
OPENAI_API_KEY=sk-xxx
GOOGLE_GEMINI_API_KEY=xxx
NEO4J_URI=bolt://34.47.112.49:7687
NEO4J_PASSWORD=xxx
```

---

## 관련 문서

- [CLAUDE.md](../../CLAUDE.md) - 전체 API 레퍼런스
- [environment-variables-guide.md](../../docs/environment-variables-guide.md)
