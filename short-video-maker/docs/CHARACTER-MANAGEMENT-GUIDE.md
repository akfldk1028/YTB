# 캐릭터 관리 가이드

**날짜:** 2025-12-23
**API Base URL:** `https://short-video-maker-7qtnitbuvq-uc.a.run.app`

---

## 목차

1. [캐릭터 확인 방법](#1-캐릭터-확인-방법)
2. [캐릭터 추가 방법](#2-캐릭터-추가-방법)
3. [비디오 생성 시 캐릭터 지정](#3-비디오-생성-시-캐릭터-지정)
4. [유튜브 업로드](#4-유튜브-업로드)

---

## 1. 캐릭터 확인 방법

### 방법 1: API로 프로필 조회

```bash
# 모든 프로필 목록
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles"

# 특정 프로필 상세 (캐릭터 목록 포함)
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple"
```

**응답 예시:**
```json
{
  "success": true,
  "data": {
    "profileId": "cat-couple",
    "name": "까미와 딸기",
    "characters": [
      {"id": "kami", "name": "까미", "description": "Black cat..."},
      {"id": "dalgi", "name": "딸기", "description": "White cat..."},
      {"id": "chingu", "name": "친구", "description": "Orange tabby..."}
    ]
  }
}
```

### 방법 2: GCS에서 이미지 목록 확인

```bash
# 이미지 목록 (파일 크기 포함)
gcloud storage ls -l "gs://dkdk-474008-short-videos/characters/cat-couple/images/"

# 결과 예시:
#   215264  2025-12-23T00:44:31Z  .../chingu.jpg
#  2663538  2025-12-22T11:48:33Z  .../dalgi.png
#  2628260  2025-12-22T11:48:15Z  .../kami.png
```

### 방법 3: 이미지 다운로드해서 보기

```bash
# 특정 캐릭터 이미지 다운로드
gcloud storage cp "gs://dkdk-474008-short-videos/characters/cat-couple/images/kami.png" ./kami.png

# 모든 캐릭터 이미지 다운로드
gcloud storage cp "gs://dkdk-474008-short-videos/characters/cat-couple/images/*" ./characters/
```

### 방법 4: GCP Console에서 확인

1. https://console.cloud.google.com/storage/browser 접속
2. `dkdk-474008-short-videos` 버킷 선택
3. `characters/cat-couple/images/` 폴더로 이동
4. 이미지 클릭하여 미리보기

---

## 2. 캐릭터 추가 방법

### 방법 A: 외부 URL로 추가 (imageUrl) ⭐ 추천

서버가 이미지를 자동으로 다운로드하여 GCS에 저장합니다.

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "nabi",
    "name": "나비",
    "description": "Gray persian cat, fluffy, 3D Pixar style, blue eyes",
    "style": "pixar",
    "distinguishingFeatures": "gray fluffy fur, blue eyes",
    "imageUrl": "https://example.com/nabi-cat.png"
  }'
```

### 방법 B: GCS에 먼저 업로드 후 등록 (gcsPath)

```bash
# 1. 이미지를 GCS에 직접 업로드
gcloud storage cp my-cat.png gs://dkdk-474008-short-videos/temp/

# 2. API로 캐릭터 등록 (gcsPath 사용)
curl -X POST ".../api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "nabi",
    "name": "나비",
    "description": "Gray persian cat...",
    "gcsPath": "temp/my-cat.png"
  }'
```

**gcsPath 형식:**
- 전체 경로: `gs://bucket-name/path/to/image.png`
- 상대 경로: `path/to/image.png` (현재 버킷 내)

### 방법 C: Base64로 추가 (기존 방식)

```bash
curl -X POST ".../api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "nabi",
    "name": "나비",
    "description": "Gray persian cat...",
    "referenceImageBase64": "data:image/png;base64,iVBORw0KGgo..."
  }'
```

### 캐릭터 삭제

```bash
curl -X DELETE "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple/characters/nabi"
```

---

## 3. 비디오 생성 시 캐릭터 지정

### 기본: 특정 캐릭터만 사용

```bash
curl -X POST ".../api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{
    "characterReference": {
      "profileId": "cat-couple",
      "characterIds": ["kami", "dalgi"]  # 까미, 딸기만 사용
    },
    "scenes": [
      {"text": "까미와 딸기가 만났어요", "scenePrompt": "Two cats meeting"}
    ],
    "config": {"orientation": "portrait", "generateVideos": true}
  }'
```

### characterIds 옵션

| 설정 | 결과 |
|------|------|
| `"characterIds": ["kami"]` | 까미만 나옴 |
| `"characterIds": ["kami", "dalgi"]` | 까미, 딸기 나옴 |
| `"characterIds": ["kami", "dalgi", "chingu"]` | 3마리 다 나옴 |
| `characterIds` 생략 | 프로필의 모든 캐릭터 사용 |

### Scene별 다른 캐릭터 지정

```json
{
  "characterReference": {"profileId": "cat-couple"},
  "scenes": [
    {
      "text": "까미가 들어온다",
      "scenePrompt": "Black cat entering",
      "characterIds": ["kami"]           // Scene 1: 까미만
    },
    {
      "text": "딸기가 눈을 뜬다",
      "scenePrompt": "White cat waking up",
      "characterIds": ["dalgi"]          // Scene 2: 딸기만
    },
    {
      "text": "둘이 마주본다",
      "scenePrompt": "Two cats looking at each other",
      "characterIds": ["kami", "dalgi"]  // Scene 3: 둘 다
    }
  ]
}
```

---

## 4. 유튜브 업로드

### 채널 목록 확인

```bash
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/channels"
```

### 비디오 업로드

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/upload" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "생성된_비디오_ID",
    "channelName": "why_cat",
    "metadata": {
      "title": "비디오 제목",
      "description": "비디오 설명\n\n#해시태그",
      "tags": ["고양이", "shorts"],
      "categoryId": "22",
      "privacyStatus": "private"
    },
    "notifySubscribers": false
  }'
```

**privacyStatus 옵션:**
- `private`: 비공개 (테스트용)
- `unlisted`: 일부 공개
- `public`: 전체 공개

### 비디오 생성과 동시에 업로드

```json
{
  "characterReference": {"profileId": "cat-couple"},
  "scenes": [...],
  "config": {"generateVideos": true},
  "youtubeUpload": {
    "channelName": "why_cat",
    "title": "자동 업로드 비디오",
    "description": "설명...",
    "privacyStatus": "private"
  }
}
```

---

## 부록: 자주 쓰는 명령어 모음

```bash
# === 캐릭터 확인 ===
# 프로필 목록
curl -s ".../api/characters/profiles" | jq '.data.profiles[].profileId'

# 캐릭터 목록
curl -s ".../api/characters/profiles/cat-couple" | jq '.data.characters[].id'

# === 이미지 관리 ===
# GCS 이미지 목록
gcloud storage ls gs://dkdk-474008-short-videos/characters/cat-couple/images/

# 이미지 다운로드
gcloud storage cp "gs://.../kami.png" ./

# === 비디오 상태 ===
curl -s ".../api/video/consistent-shorts/{videoId}/status"

# === 유튜브 ===
curl -s ".../api/youtube/channels"
```

---

## 관련 문서

- [[2025-12-23-character-image-registration]] - 이미지 등록 기능 상세
- [[2025-12-22-scene-character-and-frame-interpolation]] - Scene별 캐릭터 + VEO 3.1
- [[Consistent-Shorts-API-Guide]] - API 전체 가이드
