# Short Video Maker - AI Context

> **전체 README 목차**: [`README_INDEX.md`](./README_INDEX.md) - 모든 모듈 README 연결

## 인프라 현황

| 서비스 | 타입 | URL | Region |
|--------|------|-----|--------|
| **YTB API** | Cloud Run | https://short-video-maker-550996044521.us-central1.run.app | us-central1 |
| **YTB API (Asia)** | Cloud Run | https://short-video-maker-550996044521.asia-northeast3.run.app | asia-northeast3 |
| **Neo4j DB** | VM (e2-small) | bolt://34.47.112.49:7687 | asia-northeast3 |
| **GCS Bucket** | Storage | gs://dkdk-474008-short-videos | us-central1 |

### Cloud Run 스펙
```
Memory: 8Gi
CPU: 4
Timeout: 3600s (1시간)
Min/Max Instances: 0/10
Port: 3124
```

### 배포 명령
```bash
cd D:\Data\00_Personal\YTB\short-video-maker
gcloud builds submit --config cloudbuild.yaml
```

---

## 프로젝트 개요

YouTube Shorts 자동 생성 시스템. 캐릭터 기반 일관성 있는 영상을 생성하고 YouTube에 업로드.

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

### 이미지 생성 (GPT-to-NanoBanana)

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/gpt-to-nanobanana/generate` | GPT 지브리 → NanoBanana 동일성 이미지 |
| `GET` | `/api/gpt-to-nanobanana/:testId` | 생성된 이미지 결과 조회 |

**워크플로우:**
1. **Scene 1**: GPT-4o로 지브리 스타일 첫 이미지 생성 (~45초)
2. **Scene 2~N**: NanoBanana로 GPT 이미지를 레퍼런스로 동일성 유지 이미지 생성 (~10초/장)

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
| `blue_news` | ~~파랑나라 진보왕자~~ (삭제됨) | 🔵 News |
| `blue_news_2` | 진보나라파랑왕자 | 🔵 News |

**계정**: clickaround8@gmail.com (전체 동일)

---

## 뉴스 채널 (NewsProject)

| channelName | YouTube 채널 | Channel ID | 성향 |
|-------------|-------------|------------|------|
| `red_news` | 빨강나라 보수공주 | UC8wQlyHC7iYjzZYBoOAYaKw | 🔴 보수 |
| `blue_news` | ~~파랑나라 진보왕자~~ (삭제됨) | UC7Pj-MJOYkYgONLsk3uejSA | 🔵 진보 |
| `blue_news_2` | 진보나라파랑왕자 | UCI8D5MdaoNzhSXWUaFAZb8g | 🔵 진보 |

**n8n 워크플로우**: `docs/NewsProject/YTB_260118_NEWS_VIDEO_v1.9.json`

### 뉴스 워크플로우 옵션

```javascript
// Set Channel Type 노드에서 설정
channel_type: "red_news" | "blue_news_2" | "news_politics" | "news_economy" | "news_social"
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

## GPT-to-NanoBanana 요청/응답 예시

**요청:**
```json
{
  "character": {
    "description": "A cute orange tabby cat with green eyes, fluffy fur, anime style"
  },
  "scenes": [
    { "text": "Cat sitting in a magical forest with glowing mushrooms" },
    { "text": "Cat walking along a riverbank at sunset" }
  ],
  "config": {
    "aspectRatio": "9:16"
  }
}
```

**응답:**
```json
{
  "success": true,
  "testId": "gpt2nano_1768972263931",
  "outputDir": ".../.ai-agents-az-video-generator/temp/gpt-to-nanobanana/gpt2nano_xxx",
  "images": [
    { "scene": 0, "path": ".../scene_1_gpt.png", "method": "gpt", "timeMs": 47589, "success": true },
    { "scene": 1, "path": ".../scene_2_nano.png", "method": "nanoBanana", "timeMs": 10377, "success": true }
  ],
  "summary": { "total": 2, "success": 2, "failed": 0 },
  "totalTimeMs": 57971
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
cd D:\Data\00_Personal\YTB\short-video-maker
gcloud builds submit --config cloudbuild.yaml --project=dkdk-474008
```

### YouTube 토큰 Secret Manager 업데이트

**주의: 반드시 base64 인코딩 후 업로드! tar.gz 직접 업로드 시 "non-UTF8 data" 에러 발생**

```bash
# 1. 마스터 토큰 폴더에서 tar.gz 생성
cd D:\Data\00_Personal\YTB\temp-yt
tar -czvf youtube-data.tar.gz youtube-*.json

# 2. base64 인코딩 (필수! index.ts에서 Buffer.from(YOUTUBE_DATA, "base64")로 디코딩)
base64 -w 0 youtube-data.tar.gz > youtube-data-base64.txt

# 3. Secret Manager 업데이트
gcloud secrets versions add YOUTUBE_DATA --data-file=youtube-data-base64.txt --project=dkdk-474008

# 4. 로컬에도 동기화
cp youtube-*.json D:\Data\00_Personal\YTB\short-video-maker/

# 5. Cloud Run 재배포
cd D:\Data\00_Personal\YTB\short-video-maker
gcloud builds submit --config cloudbuild.yaml --project=dkdk-474008
```

**토큰 파일 위치**:
- 마스터: `D:\Data\00_Personal\YTB\temp-yt\youtube-*.json`
- 로컬 백업: `D:\Data\00_Personal\YTB\short-video-maker\youtube-*.json`
- Cloud Run: Secret Manager `YOUTUBE_DATA` (base64 encoded tar.gz)

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

# GPT-to-NanoBanana 이미지 생성 (동일성 테스트)
curl -X POST ".../api/gpt-to-nanobanana/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "character": {"description": "A cute orange cat, anime style"},
    "scenes": [
      {"text": "Cat in a forest"},
      {"text": "Cat by a river"}
    ]
  }'

# 뉴스 비디오 생성 (finalNode.json 사용)
curl -X POST ".../api/news/create" \
  -H "Content-Type: application/json" \
  -d @docs/NewsProject/finalNode.json

# 뉴스 비디오 상태 확인
curl -s ".../api/news/status/{videoId}"

# 뉴스 비디오 다운로드
curl -L -o output.mp4 ".../api/news/download/{videoId}"
```

---

## 트러블슈팅

### GPT Image 400 에러 (moderation_blocked)

OpenAI 모더레이션이 **생존 아티스트 이름**을 차단함.

| 차단됨 ❌ | 허용됨 ✅ |
|----------|----------|
| "Studio Ghibli" | "Ghibli-style" |
| "Hayao Miyazaki" | "hand-painted aesthetic" |
| "Makoto Shinkai" | "whimsical dreamlike" |

**파일**: `src/image-generation/services/GPTImageService.ts`
**참고**: https://docs.aihubmix.com/en/api/GPT-Image-1

---

## 뉴스 프로젝트 (NewsProject) 변경 이력

### 2026-02-05 - YouTube 토큰 Secret Manager 수정 (base64 인코딩)

**문제**: `blue_news_2`에서 YouTube 업로드는 되는데 첫 댓글이 안 달림
**원인**: Secret Manager에 `blue_news_2` 토큰이 누락되어 있었음 (구 토큰 파일만 배포)
**추가 발견**: tar.gz 직접 업로드 시 "non-UTF8 data" 에러로 Cloud Run 시작 실패

**수정 내용:**
1. `temp-yt/` 폴더의 최신 토큰(5채널) → tar.gz → **base64 인코딩** → Secret Manager v700
2. Cloud Run 재배포 성공
3. `red_news`, `blue_news_2` 모두 `authenticated: true` 확인

**핵심 규칙**: Secret Manager 업로드 시 반드시 `base64 -w 0 youtube-data.tar.gz > youtube-data-base64.txt` 후 base64 파일 업로드!

### 2026-02-02 - YouTube 첫 댓글 자동 등록

업로드 후 **첫 댓글(출처 고지)** 자동 등록 기능 추가.

**데이터 흐름:**
```
n8n Final Payload → videos[0].firstComment: "이 영상은 ... AI가 작성..."
  → NewsProjectService.processAsync()
  → YouTubeUploader.uploadVideo() → youtubeVideoId
  → YouTubeUploader.postComment(youtubeVideoId, channelName, firstComment)
  → youtube.commentThreads.insert({ videoId, textOriginal })
  → 완료 (댓글 실패해도 업로드는 이미 성공, 파이프라인 중단 없음)
```

**수정 파일 3개:**

| 파일 | 변경 내용 |
|------|-----------|
| `src/YTB-news-project/types.ts:39` | `NewsVideo.firstComment?: string` 필드 추가 |
| `src/youtube-upload/services/YouTubeUploader.ts:463` | `postComment()` 메서드 추가 - `commentThreads.insert()` 호출, 실패시 null 반환 (throw 안 함) |
| `src/YTB-news-project/NewsProjectService.ts:796` | 업로드 직후 `video.firstComment` 존재하면 `postComment()` 호출 |

**설계 원칙:**
- `postComment()`는 실패해도 throw하지 않음 → `null` 반환 (댓글 실패로 전체 파이프라인 중단 방지)
- OAuth2 scope: `youtube.upload` + `youtube` + `yt-analytics.readonly` → **`youtube` scope에 댓글 권한 포함**
- n8n에서 `firstComment` 필드를 안 보내면 아무 동작 안 함 (하위 호환)

**OAuth Scope 참고 (전 채널 동일):**
```
https://www.googleapis.com/auth/youtube.upload    → 비디오 업로드
https://www.googleapis.com/auth/youtube            → 전체 권한 (댓글, 좋아요, 플레이리스트 등)
https://www.googleapis.com/auth/yt-analytics.readonly → 분석 읽기
```

---

## Books 프로젝트 (v3.5.0 ✅)

책/논문 → Neo4j GraphRAG → Ghibli Shorts 자동 생성

### 핵심 철학: 논문 영상의 본질
- **수식이 주인공**: math_science 문서는 수식 중심 커리큘럼 자동 전환 (수식 3개 이상 감지 시)
- **수식 파이프라인**: BookChunk → LaTeX 추출 → 수식별 에피소드 그룹화 → assignedFormula per scene → MathJax v4 PNG 렌더링 → FFmpeg overlay
- **이미지 전략 (v3.5.0)**: 씬 타입별 3분기 — narrative(캐릭터 Ghibli), educational(교육 일러스트, 캐릭터 없음), formula(수식 비유 이미지, 캐릭터 없음)
- **씬간 타이밍 (v3.5.0)**: TTS 기반 duration (hintDuration 무음 패딩 제거), PCM 0.1초 + 크로스페이드 0.1초
- **TTS 자연스러움**: 비수식 중간 씬만 연결어 적용, 수식 씬 스킵

**문서**: `src/YTB-books-project/README.md`
**NEB 연동**: [`D:\Data\00_Personal\YTB\NEB\CLAUDE.md`](../NEB/CLAUDE.md) - LLM Graph Builder 엔티티 기반 멀티 에피소드
**Neo4j**: `bolt://34.47.112.49:7687` (user: neo4j)
**테스트 결과**: 수식 중심 커리큘럼 3 에피소드, assignedFormula 정상 저장/조회, 32초 테스트 영상 생성
**로컬 다운로드**: `downloads/books/`

### 🆕 v2.6.0 핵심: 점진적 비디오 생성 (Incremental Mode)

**목적**: 한 번에 모든 에피소드를 생성하지 않고, 진행 상황을 기억하며 하나씩 생성
**장점**: YouTube 점진적 업로드 가능, Cloud Run 과부하 방지

| API | 용도 | 특징 |
|-----|------|------|
| `/generate-next-episode` ⭐ | **점진적 생성** | 다음 대기 에피소드 자동 처리 |
| `/curriculum` | 순차적 커리큘럼 | 에피소드 계획 생성 |
| `/episodes/:id/generate-video` | 특정 에피소드 | 지정 에피소드 생성 |

```bash
# 🆕 점진적 비디오 생성 (다음 대기 에피소드 자동 처리)
curl -X POST http://localhost:3124/api/books/generate-next-episode \
  -H "Content-Type: application/json" \
  -d '{"documentId": "AR_TALK.pdf"}'

# 응답 예시:
# {
#   "success": true,
#   "completed": false,  // 아직 더 있음
#   "episodeNumber": 35,
#   "progress": {
#     "totalEpisodes": 40,
#     "completedEpisodes": 35,
#     "remainingEpisodes": 5,
#     "nextPendingEpisode": { "id": "...", "episodeNumber": 36 }
#   }
# }

# 반복 호출하여 모든 에피소드 완료까지 진행
# completed: true 가 될 때까지 반복

# 순차적 커리큘럼 (에피소드 계획 생성)
curl -X POST http://localhost:3124/api/books/AR_TALK.pdf/curriculum \
  -H "Content-Type: application/json" \
  -d '{"saveToNeo4j": true, "forceRefresh": true}'

# 특정 에피소드 비디오 생성
curl -X POST http://localhost:3124/api/books/episodes/{episodeId}/generate-video
```

### v3.5.0 이미지 전략 연구 근거 (논문/공식 문서 검증 완료)

현재 전략(narrative/educational/formula 3분기)은 아래 연구에 의해 **검증 완료**:

| 원칙 | 출처 | 우리 전략과의 관계 |
|------|------|-------------------|
| **Mayer Image Principle** | Mayer, *Multimedia Learning* | 교육 씬에서 캐릭터(화자 이미지) 제거 → 학습 효과 저하 없음, 오히려 콘텐츠 집중도 향상 |
| **Interference Hypothesis** | 메타분석 35연구 6,339명 (ScienceDirect) | 화자 이미지가 있으면 학습 콘텐츠에 대한 시선 체류 시간(dwell time) **유의미하게 감소** |
| **Dual Coding Theory** | Paivio | 나레이션(청각) + 내용 관련 이미지(시각) 조합이 최적 → 캐릭터가 아닌 **개념 시각화**가 맞음 |
| **Coherence Principle** | Mayer 12원칙 | 학습 목표와 무관한 시각 요소(캐릭터) 제거 → 인지 부하 감소 |
| **YouTube Shorts 실전** | Content Whale 2026 | 하이브리드(캐릭터 bookend + 교육 비주얼 중간)가 최적, 나레이션 리텐션 1.9x |

**캐릭터 사용 적합 시점** (연구 기반):
- hook/conclusion: 감정 연결, 동기부여, 스토리텔링 → **캐릭터 O**
- explanation/formula: 시스템 설명, 추상 개념, 데이터 → **캐릭터 X, 다이어그램/비유 이미지**

**30-50초 숏폼에서 중간 캐릭터 부재(20-30초)**: TTS 나레이션이 engagement 유지하므로 문제 없음.

참고 문헌:
- [Mayer's 12 Principles](https://www.digitallearninginstitute.com/blog/mayers-principles-multimedia-learning)
- [Instructor Presence Meta-Analysis](https://www.sciencedirect.com/science/article/pii/S1747938X2300057X)
- [Eye-tracking Talking Head Study](https://www.researchgate.net/publication/377767716)
- [PNAS: Onscreen Instructor Effect](https://www.pnas.org/doi/10.1073/pnas.2309054121)
- [Short-Form Video Strategy 2026](https://content-whale.com/blog/master-short-form-video-content-guide/)

---

### v3.5.0 변경사항 (2026-02-04) - 씬 타입별 이미지 전략 + 씬간 텀 최적화

#### 1. 씬 타입별 이미지 생성 전략 (핵심 변경)

**문제**: 모든 씬에 동일한 캐릭터 이미지만 생성됨. 수식/교육 씬에서도 캐릭터만 나옴.

**해결**: 씬 타입을 3가지로 분류하여 각각 다른 이미지 전략 적용

| 씬 타입 | 해당 sceneType | 이미지 전략 | 캐릭터 |
|---------|---------------|------------|--------|
| `narrative` | hook, intro, conclusion | GPT-4o Ghibli + NanoBanana characterRef | O |
| `educational` | explanation, example, data, comparison, deep_dive | GPT-4o Educational (캐릭터 없음) | X |
| `formula` | assignedFormula 있는 씬 | GPT-4o Educational (수식 비유 이미지) | X |

**이미지 일관성 전략**:
- 교육/수식 씬: 주제가 바뀌면 GPT-4o로 새 이미지 생성, 같은 주제면 NanoBanana `referenceMode: 'style'` (스타일만 참조, 캐릭터 없음)
- 캐릭터 씬: 기존 NanoBanana `referenceMode: 'character'` (캐릭터 동일성 유지)
- 2개의 별도 reference 추적: `characterReference` (캐릭터용) + `educationalReference` (교육용)

**수정 파일 4개**:

| 파일 | 변경 |
|------|------|
| `BooksRouter.ts` | `getSceneImageStrategy()` 메서드 추가, `generateSceneImages()` 씬 타입별 분기, 주제 변경 감지(`lastEducationalTopic`) |
| `GhibliImageService.ts` | `EDUCATIONAL_STYLE_PREFIX` 추가, `GhibliStyleConfig`에 `imageMode`/`forceGpt`/`educationalReference` 추가, `buildStyledPrompt()` 모드별 프리픽스, `generateSceneImage()` 전략 분기 |
| `NanoBananaService.ts` | `referenceMode: 'character' \| 'style'` 추가. style 모드: 스타일만 참조 + "Do NOT include any characters" 지시 |
| `ContentPlannerService.ts` | 교육/수식 씬 visualPrompt에 캐릭터 금지 규칙 추가 (AI 프롬프트 강화) |

**테스트 결과 (EP41 - 3DMM 얼굴 모델링, 5씬 3수식)**:
```
Scene 0 (hook):        캐릭터 등장 (GPT Ghibli)      ← narrative
Scene 1 (β formula):   뼈대 모핑 다이어그램 (GPT)     ← formula, 캐릭터 없음
Scene 2 (ψ formula):   표정 변환 일러스트 (GPT)       ← formula, 캐릭터 없음
Scene 3 (θ formula):   3D 헤드 회전 화살표 (GPT)      ← formula, 캐릭터 없음
Scene 4 (conclusion):  캐릭터 마무리 (NanoBanana)     ← narrative, Scene 0과 일관
```

#### 2. 씬간 텀 최적화 (dead air 제거)

**문제**: 씬과 씬 사이에 2~4초 무음 구간 발생 → 답답하고 늘어지는 느낌

**근본 원인**: `effectiveDuration = Math.max(mp3Duration, hintDuration)` — TTS가 4초인데 hintDuration이 7초면 3초 무음 패딩이 붙음

**해결**:
- `effectiveDuration`을 `hintDuration` 기반 → **mp3Duration(TTS 실제 길이) 기반**으로 변경
- 마지막 씬만 +0.5초 fadeout 여유
- 중간 씬은 무음 패딩 없음 (PCM 0.1초 패딩만)
- 크로스페이드 0.1초

**최종 타이밍 설정**:
```
PCM 무음 패딩: 0.1초 (AudioProcessor.savePcmToMp3)
크로스페이드:  0.1초 (BooksVideoService.concatAudiosWithCrossfade)
hintDuration 패딩: 제거 (BooksVideoService effectiveDuration)
마지막 씬 여유: +0.5초
```

**수정 파일 2개**:

| 파일 | 변경 |
|------|------|
| `AudioProcessor.ts:189` | `paddingSeconds = 0.1` (0.05→0.1) |
| `BooksVideoService.ts:438-457` | `effectiveDuration = mp3Duration` (hintDuration 패딩 제거), 마지막 씬만 무음 패딩, 크로스페이드 0.1초 |

**결과**: 49초 → 32초 (dead air 17초 제거)

**튜닝 히스토리** (참고용):
| 시도 | PCM패딩 | 크로스페이드 | hintDuration패딩 | 결과 |
|------|---------|------------|-----------------|------|
| v3.4.1 | 0.05초 | 0.05초 | O (7초) | 답답 + 늘어짐 |
| 시도1 | 0.5초 | 0.1초 | O (7초) | 더 늘어짐 |
| 시도2 | 0.25초 | 0.1초 | O (7초) | 여전히 느림 |
| 시도3 | 0.15초 | 0.1초 | X | 빠릿빠릿 |
| **최종** | **0.1초** | **0.1초** | **X** | **자연스러운 리듬** |

---

### v3.4.2 변경사항 (2026-02-04) - MathJax AllPackages 크래시 수정 (수식 렌더링 완전 복구)
- **MathJax AllPackages 제거**: `new TeX({ packages: AllPackages })` → `new TeX({})` 변경
  - **근본 원인**: AllPackages가 Node.js CommonJS 환경에서 null reference 크래시 유발 (`Cannot read properties of null (reading '4')` in BaseConfiguration.js)
  - MathJax 초기화 자체가 실패 → renderLatexToPng() 에러 → drawtext fallback 사용 → `$b$` 표시
  - 기본 TeX({})만으로 그리스 문자(β,ψ,θ), 분수(\frac), 위첨자/아래첨자, hat 등 모두 정상 렌더링
- **`<mjx-container>` wrapper 제거**: MathJax `adaptor.outerHTML(node)`는 `<mjx-container><svg>...</svg></mjx-container>` 반환
  - sharp는 `<svg>` root만 파싱 가능 → `svgString.match(/<svg[\s\S]*<\/svg>/)` 로 SVG 추출
- **`$` 구분자 제거**: `convertLatexToDisplayText()`에서 `$`/`$$` 구분자 strip 추가
  - 이전: `convertLatexToDisplayText("$\beta$")` → `$b$` (구분자 미제거)
  - 수정: `$` strip 후 변환 → `b`
- **에러 로깅 강화**: `initMathJax()` try-catch + logger.info/error 추가
- **테스트 확인**: β, ψ, θ, L_{rec}=||M̂-M||_1 모두 PNG 렌더링 성공 (7.6KB~35.5KB)
- **파일 변경**: `MathFormulaService.ts`
- **빌드 주의**: TS 변경 후 반드시 `npx tsc --project tsconfig.build.json` 실행 필요 (`npm start`는 `dist/` 사용)

### v3.4.1 변경사항 (2026-02-03) - MathJax SVG fill 수정 + 씬간 텀 축소 + FFmpeg 인코딩 최적화
- **MathJax SVG fill 중복 수정**: `fill="currentColor"` → `fill="white"` 대체 (기존 `<g fill="white"` 추가 방식은 XML 에러 발생)
  - MathJax가 이미 `fill="currentColor"` 포함 → 새 속성 추가 대신 기존 속성 대체로 변경
  - β, ψ, θ 등 그리스 문자가 제대로 PNG로 렌더링됨
- **씬간 텀 축소**: 0.15초 → 0.05초
  - PCM 무음 패딩: 0.15초 → 0.05초 (`AudioProcessor.savePcmToMp3`)
  - 크로스페이드: 0.15초 → 0.05초 (`BooksVideoService.concatAudiosWithCrossfade`)
  - 씬과 씬 사이 어색한 공백 해결
- **FFmpeg 인코딩 옵션 추가**: 모든 비디오 생성 함수에 `-preset ultrafast -crf 23` 추가
  - `VideoEditor.ts`: `combineVideoWithAudioAndCaptions`, `createStaticVideoFromImage`, `createStaticVideoWithFormulaOverlay`, `createVideoWithFormulaOverlayPng`
  - **문제**: 기존 코드는 preset/crf 없이 FFmpeg 기본값 사용 → 60초 영상이 500MB+ 출력, 인코딩 30분+
  - **해결**: `-preset ultrafast -crf 23 -pix_fmt yuv420p` 옵션 추가 → 파일 크기 대폭 감소, 인코딩 속도 향상
- **파일 변경**: `MathFormulaService.ts`, `AudioProcessor.ts`, `BooksVideoService.ts`, `VideoEditor.ts`

### v3.3.0 변경사항 (2026-02-02) - 수식 중심 파이프라인 + TTS 자연스러움 개선
- **수식 중심 커리큘럼**: math_science 문서 + 수식 3개 이상 → 자동 분기
  - `ContentPlannerService.analyzeAndPlanFormulaCentricCurriculum()`: AI가 모든 수식 추출 → 그룹화 → 에피소드당 2-3개 수식
  - 각 explanation 씬에 `assignedFormula`, `formulaName`, `formulaMetaphor` 필드 필수
  - 프롬프트: 씬 최소 7개, 50-65초 목표, 같은 수식 반복 배정 금지
- **라운드로빈 제거**: BooksRouter에서 `assignedFormula` 우선 사용, fallback만 기존 로직
- **Neo4j 수식 저장**: Scene 노드에 `assignedFormula`/`formulaName`/`formulaMetaphor` 저장/조회
  - `CreateSceneInput`, `Neo4jService.createScene()`, `recordToScene()` 수정
- **수식 이미지**: 수식 씬에 `Educational concept illustration` 키워드 주입 → `FORMULA_CONCEPT_PREFIX` 적용
- **TTS 개선**: 수식 씬은 connector 스킵, 비수식 중간 씬만 연결어 적용
- **나레이션 길이**: 수식 씬 60자, hook/conclusion 60자, 일반 씬 24자 (conclusion 잘림 방지)
- **씬간 패딩**: 0.5초 → 0.15초 (자연스러운 호흡 간격)
- **MathFormulaService**: 나레이션 40-60자, 고등학생 수준, 변수별 설명 필수
- **Gemini JSON 파싱**: `extractJSON()` 헬퍼 추가 (markdown code fence 제거)
- **수정 파일**: `ContentPlannerService.ts`, `BooksRouter.ts`, `BooksVideoService.ts`, `GhibliImageService.ts`, `MathFormulaService.ts`, `Neo4jService.ts`, `AudioProcessor.ts`, `types/index.ts`
- **테스트**: Cloud Run 배포, EP49 32초 영상 생성 성공 (수식 2개, 자막 11개)

### v3.2.4 변경사항 (2026-02-02) - 수식 적응형 스케일링 + TTS 정합 + 이미지 다양성
- **수식 크기 적응형 스케일링**: 짧은 수식(β 등) 25% 이하, 중간 40-60%, 긴 수식만 85%
  - 기존: 모든 수식 85% → 짧은 수식도 화면 가득. 수정: pngWidth 기반 4단계
- **수식 위치 최상단(1%)**: 기존 25% → 1% (자막 88%과 최대 분리)
- **자막 싱크 개선**: captionDuration = min(ttsDuration, effectiveDuration) → 음성 길이에 맞춤
- **TTS 나레이션 길이-시간 정합**: `maxNarrationLength: 50→30` (6초≈24자)
  - 기존: 50자→12초TTS→6초 잘림→나레이션 절반 미재생. 수정: 30자→6초 자연 완료
- **이미지 다양성**: `enhanceExplanationPrompt` 획일화 제거 (모든 씬 "infographic on cream bg" → 원래 visualDesc 유지)
- **파일**: `VideoEditor.ts`, `BooksVideoService.ts`, `BooksRouter.ts`
- **테스트**: EP21 55.8초 수식6개, EP22 56.7초 수식5개
- **영향 범위**: Books 프로젝트만 (News/Cat 영향 없음)

### v3.2.3 변경사항 (2026-02-02) - 이미지 다양성 + 수식 풍부화 + 마지막 끊김 수정
- **이미지 다양성 확보**: 3중 재사용 제거 (수식씬 fs.copy, 같은타입 streak 재사용, NanoBanana 동질화)
  - `BooksRouter.ts`: `formulaBackgroundPath` 삭제, 모든 수식씬 개별 `generateSceneImage()` 호출
  - `BooksRouter.ts`: `sameTypeStreak` 재사용 로직 삭제
  - `BooksVideoService.ts`: `reuseImageForSameType: false`
  - `GhibliImageService.ts`: 씬별 구도 힌트(compositions) 10가지 순환 → NanoBanana 다양성
- **수식 풍부화**: `f.length > 5` → `f.trim().length > 2` (짧은 수식도 포함)
  - 라운드로빈 배분: 수식 부족해도 모든 eligible 씬에 순환 재사용
  - `usedFormulas` 중복필터 제거 (BooksRouter 라운드로빈이 이미 배분)
- **마지막 나레이션 끊김 수정**: 마지막 씬 maxDuration +2초 (6→8초), 60초 총합 초과 불가
  - 마지막 씬 끝에 0.3초 무음 패딩 추가 → 자연스러운 종료

### v3.2.2 변경사항 (2026-02-01) - 수식 씬 품질 전면 개선
- **수식 배경 개선**: `FORMULA_BG_PROMPT`(빈 그라데이션) 삭제 → `visualDesc` + GhibliImageService(GPT→NanoBanana) 파이프라인 사용
  - 첫 수식 씬: GhibliImageService로 동화풍 배경 생성 → `formulaBackgroundPath` 저장
  - 이후 수식 씬: `formulaBackgroundPath` 복사 재사용 (일관성)
- **수식 크기+위치 개선**: 수식 PNG/drawtext 위치 8%→25%(중상단), PNG를 화면 너비 85%로 스케일링
  - 자막(88%)과 충분히 분리, 수식이 화면 중앙에 크게 표시
- **나레이션 끊김 수정**: `maxNarrationLength: 35→50` (≈12초), 한국어 종결어미 감지 개선
  - 정규식에 `|[^.!?。！？]+$` 추가 (마침표 없는 문장 감지)
  - 첫 문장이 maxLen 초과 시 마지막 공백/쉼표에서 자르기 (어절 단위 절단)
- **테스트**: EP22 58.6초, 수식 6개, 나레이션 정상 종결

### v3.2.0 변경사항 (2026-02-01) - MathJax PNG 수식 렌더링 + 영상 60초 제한
- **MathJax v4 수식 렌더링**: drawtext 완전 대체 → LaTeX → MathJax SVG → sharp PNG → FFmpeg overlay
  - 그리스 문자, 분수, 위첨자/아래첨자 완전한 수학 조판 (외부 API 없음, 워터마크 없음)
  - 반투명 검정 배경 박스 합성 (rgba(0,0,0,0.6), padding 24px, border-radius 16px)
- **영상 길이 60초 제한**: `maxNarrationLength: 35` (전체 씬 적용) + `maxSceneDuration: 6` + 오디오 실제 트리밍
- **AI 이미지 텍스트 제거**: ContentPlannerService 34개 "labeled" 교체, GhibliImageService 텍스트 제거 regex 강화
- **의존성**: `mathjax-full`, `sharp`, `@types/sharp`
- **테스트**: EP22 54초, 수식 6개 MathJax PNG 오버레이 성공

### v3.1.3 변경사항 (2026-02-01) - CodeCogs 제거 + drawtext 전환
- **CodeCogs API 완전 제거**: 워터마크 문제 해결, 외부 API 의존성 제거
- **FFmpeg drawtext 수식 렌더링**: LaTeX → displayText(유니코드) → drawtext 필터 (반투명 검정 배경 박스)
- **MathFormulaService**: `renderLatexToImage()` 삭제, `convertLatexToDisplayText()` + `generateDisplayTextsForScene()` 추가
- **VideoEditor**: PNG 오버레이 → drawtext 필터 전환 (fontfile + textfile 방식)
- **씬 수 제한**: `maxScenesPerEpisode: 10` 추가 (숏츠 60초 초과 방지)
- **MathRenderOptions 인터페이스 삭제**: color, backgroundColor, dpi, bold, format 필드 불필요

### v3.1.2 변경사항 (2026-02-01) - 수식 영상 품질 개선
- **수식 스타일 변경**: 노란 글씨+검정 배경 → 흰색 글씨+투명 배경 (일러스트와 자연스러운 블렌딩)
- **적응형 수식 크기**: LaTeX 길이 기반 동적 크기 (≤20자: 40%, ≤50자: 55%, 50자+: 70%)
- **드롭쉐도우 추가**: 투명 배경 수식 가독성을 위한 FFmpeg 그림자 효과
- **이미지 한국어 텍스트**: 모든 프롬프트에 "No English text / 한국어 라벨" 지시 추가
- **씬 간 일관성 강화**: buildStyledPrompt에 일관성 지시문 추가

### v3.1.1 변경사항 (2026-01-31) - FFmpeg ENAMETOOLONG 수정
- **FFmpeg filter_complex_script**: 자막 필터 230+개 시 Windows 명령줄 길이 초과 크래시 수정
  - `VideoEditor.ts`: 필터 8KB 이상이면 파일로 저장 후 `-filter_complex_script` 옵션 사용
  - 84개 캡션 × 3줄 = 230개 drawtext 필터 → 명령줄 32KB 초과 문제 해결

### v3.1.0 변경사항 (2026-01-31) - 수식 설명 품질 개선 + 모듈화
- **BookChunk latexFormulas 파이프라인**: BookChunk 타입에 latexFormulas/sectionTitle 추가, Neo4jService.getChunks() 반환, 커리큘럼 AI에 수식+맥락 전달
- **수식 설명 수준 변경 (5살→중학생)**: MathFormulaService 40-70자→80-150자, 변수별 의미 설명 필수
- **MathFormulaService 모듈화**: FormulaWithContext 인터페이스, extractFormulasWithContext() 메서드
- **ContentPlannerService 수식 인식 커리큘럼**: extractFormulasFromChunks() 헬퍼, mathOrTechnical에 실제 LaTeX, 수식별 설명 필수 규칙

### v2.9.1 변경사항 (2026-01-30)
- **BOOKS_PROJECT_CONFIG**: BooksVideoService에 프로젝트별 중앙 설정 (orientation, language, subtitleYPosition, enableMathFormulas, mathFormulaPosition, reuseImageForSameType)
- **자막 위치 수정**: `subtitleYPosition: 'h*0.88'` 하단 배치 (Books만, Cat/News 영향 없음)
- **SubtitleFilter 수정**: `createSimplifiedSubtitleFilter()`도 `config.yPosition` 반영 (기존 30+ drawtext 필터 시 h*0.55 하드코딩 문제 해결)
- **수식-나레이션 정렬**: `getMathContentGuide()` action alignment 원칙 재작성 (비유 동작 = 수식 동작)
- **이미지 재사용**: `generateSceneImages()` 헬퍼 + streak-limited reuse (streak=1)
- **MathFormulaService**: CodeCogs 렌더링 노란색 텍스트 + 검정 배경
- **커리큘럼 재생성**: 18개 삭제 후 ICS로 13 에피소드, 117 씬 재생성

### v2.7.0 수정사항 (2026-01-25)
- **수학 수식 LaTeX 렌더링**: 나레이션에서 수식 자동 감지 → LaTeX → PNG → 비디오 오버레이
- **MathFormulaService**: AI(Gemini) 기반 수식 감지 + CodeCogs API로 렌더링
- **FFmpeg 오버레이**: `createStaticVideoWithFormulaOverlay()` 메서드 추가
- **NEB Nougat 활성화**: Memory 8Gi, CPU 4, USE_NOUGAT_FOR_PDF=true

### v2.6.0 수정사항
- **🆕 점진적 비디오 생성**: `/episodes/next/generate-video` - 어디까지 했는지 기억하고 다음 에피소드 자동 생성
- **진행 상황 추적**: `progress.completedEpisodes`, `progress.remainingEpisodes`
- **YouTube 점진적 업로드 지원**: 한 번에 다 올리지 않아도 됨

### v2.5.0 수정사항
- **순차적 커리큘럼**: `analyzeAndPlanSequentialCurriculum()` - 에피소드 연결 + 수학 상세 설명
- **Neo4j 트랜잭션 수정**: `createEpisodeWithScenes()` 단일 트랜잭션
- **에피소드 연결**: `linkEpisodes()` - previousEpisodeId ↔ nextEpisodeId
- **TTS 안정화**: Gemini TTS 프롬프트 프리픽스 추가
