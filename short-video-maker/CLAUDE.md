# Short Video Maker - AI Context

## 프로젝트 개요

YouTube Shorts 자동 생성 시스템. 캐릭터 기반 일관성 있는 영상을 생성하고 YouTube에 업로드.

**Base URL:** `https://short-video-maker-7qtnitbuvq-uc.a.run.app`
**GCS Bucket:** `gs://dkdk-474008-short-videos`

---

## 핵심 API 엔드포인트

### 캐릭터/프로필 관리

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/characters/profiles` | 전체 프로필 목록 |
| `GET` | `/api/characters/profiles/:profileId` | 프로필 상세 |
| `POST` | `/api/characters/profiles` | 새 프로필 생성 |
| `POST` | `/api/characters/profiles/:profileId/characters` | 캐릭터 추가 |
| `PUT` | `/api/characters/profiles/:profileId/characters/:characterId` | 캐릭터 수정 |
| `DELETE` | `/api/characters/profiles/:profileId/characters/:characterId` | 캐릭터 삭제 |

### 비디오 생성

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/video/consistent-shorts` | 캐릭터 기반 영상 생성 |
| `GET` | `/api/video/consistent-shorts/:videoId/status` | 생성 상태 확인 |

### 뉴스 비디오 생성 (NewsProject)

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/news/create` | 뉴스 비디오 생성 (finalNode.json) |
| `GET` | `/api/news/status/:videoId` | 생성 상태 조회 |
| `GET` | `/api/news/download/:videoId` | 비디오 다운로드 |
| `GET` | `/api/news/health` | 헬스 체크 |

### YouTube 업로드

| Method | Endpoint | 설명 |
|--------|----------|------|
| `GET` | `/api/youtube/channels` | 채널 목록 |
| `POST` | `/api/youtube/upload` | 비디오 업로드 |
| `GET` | `/api/youtube/auth/health-check` | 토큰 상태 확인 |

---

## 현재 등록된 프로필/캐릭터

| profileId | channelName | characters |
|-----------|-------------|------------|
| `cat-couple` | `why_cat` | `kami`, `dalgi` |

### YouTube 채널 구조

| channelName | YouTube 채널 | Type |
|-------------|-------------|:----:|
| `clickaround` | ClickAround | **Main** |
| `why_cat` | 왜저러냥 | Sub |
| `red_news` | 빨강나라 보수공주 | 🔴 News |
| `blue_news` | 파랑나라 진보왕자 | 🔵 News |

**계정**: clickaround8@gmail.com (전체 동일)

---

## 뉴스 채널 (NewsProject)

| channelName | YouTube 채널 | Channel ID | 성향 |
|-------------|-------------|------------|------|
| `red_news` | 빨강나라 보수공주 | UC8wQlyHC7iYjzZYBoOAYaKw | 🔴 보수 |
| `blue_news` | 파랑나라 진보왕자 | UC7Pj-MJOYkYgONLsk3uejSA | 🔵 진보 |

**n8n 워크플로우**: `docs/NewsProject/YTB_260118_NEWS_VIDEO_v1.9.json`

### 뉴스 워크플로우 옵션

```javascript
// Set Channel Type 노드에서 설정
channel_type: "red_news" | "blue_news" | "news_politics" | "news_economy" | "news_social"
tone: "conservative_fun" | "progressive_fun" | "neutral_fun" | ...
target: "ajae" | "mz" | "senior"
```

---

## 캐릭터 이미지 등록 방법

**우선순위: gcsPath > imageUrl > referenceImageBase64**

```json
{
  "id": "character-id",
  "name": "캐릭터 이름",
  "description": "캐릭터 설명 (프롬프트용)",
  "gcsPath": "temp/image.png",        // GCS 경로 (1순위)
  "imageUrl": "https://...",          // 외부 URL (2순위)
  "referenceImageBase64": "data:..."  // Base64 (3순위)
}
```

---

## 비디오 생성 요청 예시

```json
{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },
  "scenes": [
    {
      "text": "까미가 방에 들어온다",
      "scenePrompt": "Black cat entering room",
      "characterIds": ["kami"]
    },
    {
      "text": "딸기가 눈을 뜬다",
      "scenePrompt": "White cat waking up",
      "characterIds": ["dalgi"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useFrameInterpolation": true
  }
}
```

---

## YouTube 업로드 요청 예시

```json
{
  "videoId": "생성된_비디오_ID",
  "channelName": "why_cat",
  "metadata": {
    "title": "비디오 제목",
    "description": "설명",
    "tags": ["고양이", "shorts"],
    "privacyStatus": "private"
  }
}
```

---

## 프로젝트 구조

```
src/
├── character-store/     # 캐릭터/프로필 관리
│   ├── CharacterStorageService.ts
│   └── types.ts
├── server/              # API 서버
│   ├── api/             # API 라우트
│   └── parsers/         # 요청 파서
├── short-creator/       # 영상 생성
│   ├── ShortCreatorRefactored.ts
│   ├── ConsistentShortsWorkflow.ts
│   └── libraries/
│       └── GoogleVeo.ts  # VEO 2/3/3.1 API
├── youtube-upload/      # YouTube 업로드
│   ├── services/
│   │   ├── YouTubeUploader.ts
│   │   └── YouTubeChannelManager.ts
│   └── routes/
├── storage/             # GCS 저장소
└── types/               # 타입 정의
    └── shorts.ts
```

---

## 배포

```bash
# Cloud Run 배포
gcloud builds submit --config=cloudbuild.yaml

# Secret Manager (YouTube 토큰)
gcloud secrets versions add YOUTUBE_DATA --data-file=youtube-data.tar.gz
```

---

## 관련 문서

- `docs/CHARACTER-MANAGEMENT-GUIDE.md` - 캐릭터 관리 전체 가이드
- `docs/2025-12-23-character-image-registration.md` - 이미지 등록 기능 상세
- `docs/2025-12-22-scene-character-and-frame-interpolation.md` - Scene별 캐릭터 + VEO 3.1
- `src/YTB-news-project/README.md` - 뉴스 비디오 생성 가이드 (Gemini TTS, 한글 자막)
- `src/YTB-ffmpeg/README.md` - FFmpeg 모듈 (비디오 합성, loop 처리)
- `docs/Update/NEWS_CHANNEL_SETUP.md` - 🔴🔵 빨강나라/파랑나라 뉴스 채널 설정
- `docs/Update/YOUTUBE_TOKEN_UPDATE.md` - YouTube 토큰 업데이트 가이드
- `docs/NewsProject/news_channel_config.js` - n8n 채널 설정 참조

---

## 자주 사용하는 명령어

```bash
# 프로필 목록
curl -s ".../api/characters/profiles"

# 캐릭터 추가
curl -X POST ".../api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{"id":"nabi", "name":"나비", "description":"...", "imageUrl":"..."}'

# 캐릭터 삭제
curl -X DELETE ".../api/characters/profiles/cat-couple/characters/nabi"

# 비디오 생성
curl -X POST ".../api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{"characterReference":{"profileId":"cat-couple"}, "scenes":[...], "config":{...}}'

# YouTube 채널 목록
curl -s ".../api/youtube/channels"

# 뉴스 비디오 생성 (finalNode.json 사용)
curl -X POST ".../api/news/create" \
  -H "Content-Type: application/json" \
  -d @docs/NewsProject/finalNode.json

# 뉴스 비디오 상태 확인
curl -s ".../api/news/status/{videoId}"

# 뉴스 비디오 다운로드
curl -L -o output.mp4 ".../api/news/download/{videoId}"
```
