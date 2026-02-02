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
- 기존 OAuth2 scope(`youtube.upload` + `youtube`)에 댓글 권한 이미 포함
- n8n에서 `firstComment` 필드를 안 보내면 아무 동작 안 함 (하위 호환)

---

## Books 프로젝트 (v3.2.4 ✅)

책/논문 → Neo4j GraphRAG → Ghibli Shorts 자동 생성

### 핵심 철학: 논문 영상의 본질
- **논문/학술 콘텐츠**: 수학 수식과 원리 설명이 핵심. 캐릭터는 보조 수단
- **이미지 전략**: 캐릭터 위주 OR 수식 일관성 위주 - 콘텐츠에 따라 유동적
- **수식 파이프라인**: BookChunk → LaTeX 추출 → MathJax v4 PNG 렌더링 → FFmpeg overlay (적응형 크기, 최상단 1%)

**문서**: `src/YTB-books-project/README.md`
**NEB 연동**: [`D:\Data\00_Personal\YTB\NEB\CLAUDE.md`](../NEB/CLAUDE.md) - LLM Graph Builder 엔티티 기반 멀티 에피소드
**Neo4j**: `bolt://34.47.112.49:7687` (user: neo4j)
**테스트 결과**: ICS 프레임워크로 커리큘럼 재생성 (13 에피소드, 117 씬)
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
