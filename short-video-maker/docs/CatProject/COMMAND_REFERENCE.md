# Cat Project 명령어 레퍼런스

**API Base URL:** `https://short-video-maker-7qtnitbuvq-uc.a.run.app`
**프로필 ID:** `cat-couple`
**채널명:** `why_cat`

---

## Quick Reference (AI용)

### 캐릭터 관리

| 작업 | Method | Endpoint |
|------|--------|----------|
| 추가 | `POST` | `/api/characters/profiles/cat-couple/characters` |
| 수정 | `PUT` | `/api/characters/profiles/cat-couple/characters/:id` |
| 삭제 | `DELETE` | `/api/characters/profiles/cat-couple/characters/:id` |
| 조회 | `GET` | `/api/characters/profiles/cat-couple` |

### 현재 캐릭터 목록

| ID | 이름 | 특징 |
|----|------|------|
| `kami` | 까미 | 검은 고양이, 파란 티셔츠 |
| `dalgi` | 딸기 | 흰 고양이, 핑크 리본, 딸기 드레스 |
| `gureum` | 구름 | 하얀 솜털 고양이, 하늘색 스카프 |

---

## 1. 캐릭터 추가

### 방법 A: 외부 URL로 추가 (imageUrl)

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "nabi",
    "name": "나비",
    "description": "Gray persian cat with green eyes, 3D Pixar style",
    "style": "pixar",
    "distinguishingFeatures": "gray fluffy fur, green eyes",
    "imageUrl": "https://example.com/nabi-cat.png"
  }'
```

### 방법 B: GCS 경로로 추가 (gcsPath)

```bash
# 1. 먼저 이미지를 GCS에 업로드
gcloud storage cp my-cat.png gs://dkdk-474008-short-videos/temp/

# 2. API로 캐릭터 등록
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "nabi",
    "name": "나비",
    "description": "Gray persian cat...",
    "gcsPath": "temp/my-cat.png"
  }'
```

### 방법 C: 설명만으로 추가 (이미지 없이)

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "gureum",
    "name": "구름",
    "description": "White fluffy cloud-like cat with sky blue eyes, wearing a light blue scarf, 3D Pixar style",
    "style": "pixar",
    "distinguishingFeatures": "extremely fluffy white fur, sky blue eyes, light blue scarf"
  }'
```

---

## 2. 캐릭터 삭제

```bash
# 구름 캐릭터 삭제
curl -X DELETE "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple/characters/gureum"

# 나비 캐릭터 삭제
curl -X DELETE "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple/characters/nabi"
```

**응답 예시:**
```json
{
  "success": true,
  "message": "Character gureum deleted from profile cat-couple"
}
```

---

## 3. 캐릭터 수정

### 설명/스타일 수정

```bash
curl -X PUT "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple/characters/kami" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Black cat husband wearing dark blue hoodie, 3D Pixar style",
    "distinguishingFeatures": "black fur, dark blue hoodie, yellow eyes"
  }'
```

### 이미지 교체

```bash
curl -X PUT "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple/characters/kami" \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://new-image-url.com/kami-new.png"
  }'
```

---

## 4. 캐릭터 조회

### 전체 프로필 조회

```bash
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple"
```

### 캐릭터 ID만 추출

```bash
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple" | grep -o '"id":"[^"]*"'
```

---

## 5. 영상 생성 (VEO 3.1)

### 기본: 2개 씬

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{
    "characterReference": {
      "profileId": "cat-couple"
    },
    "scenes": [
      {
        "text": "까미가 창가에 앉아있어요",
        "scenePrompt": "Black cat in blue shirt sitting by window, 3D Pixar style",
        "characterIds": ["kami"]
      },
      {
        "text": "딸기가 다가와요",
        "scenePrompt": "White cat with pink bow approaches black cat, 3D Pixar style",
        "characterIds": ["kami", "dalgi"]
      }
    ],
    "config": {
      "orientation": "portrait",
      "generateVideos": true,
      "useFrameInterpolation": true
    }
  }'
```

### 3개 씬 (3캐릭터)

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{
    "characterReference": {
      "profileId": "cat-couple"
    },
    "scenes": [
      {
        "text": "까미가 소파에 앉아있어요",
        "scenePrompt": "Black cat in blue shirt on sofa, 3D Pixar",
        "characterIds": ["kami"]
      },
      {
        "text": "구름이가 들어와요",
        "scenePrompt": "White fluffy cat with blue scarf enters, 3D Pixar",
        "characterIds": ["gureum"]
      },
      {
        "text": "셋이 함께 앉아요",
        "scenePrompt": "Three cats together on sofa, 3D Pixar",
        "characterIds": ["kami", "gureum", "dalgi"]
      }
    ],
    "config": {
      "orientation": "portrait",
      "generateVideos": true,
      "useFrameInterpolation": true
    }
  }'
```

### 🔥 부드러운 씬 전환 (xfade) 영상 생성

**기본값: 활성화 (fade 효과 0.5초)**

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{
    "characterReference": {
      "profileId": "cat-couple"
    },
    "scenes": [
      {
        "text": "까미가 창가에 앉아있어요",
        "scenePrompt": "Black cat in blue shirt sitting by window, 3D Pixar style",
        "characterIds": ["kami"]
      },
      {
        "text": "딸기가 다가와요",
        "scenePrompt": "White cat with pink bow approaches black cat, 3D Pixar style",
        "characterIds": ["kami", "dalgi"]
      }
    ],
    "config": {
      "orientation": "portrait",
      "generateVideos": true,
      "useFrameInterpolation": true,
      "useSceneTransitions": true,
      "sceneTransitionType": "fade",
      "sceneTransitionDuration": 0.5
    }
  }'
```

**전환 효과 옵션:**

| sceneTransitionType | 설명 |
|---------------------|------|
| `fade` | 페이드 인/아웃 (기본값) |
| `dissolve` | 디졸브 효과 |
| `wipeleft` | 왼쪽으로 와이프 |
| `wiperight` | 오른쪽으로 와이프 |
| `wipeup` | 위로 와이프 |
| `wipedown` | 아래로 와이프 |
| `slideup` | 위로 슬라이드 |
| `slidedown` | 아래로 슬라이드 |
| `circlecrop` | 원형 크롭 |

### 영상 상태 확인

```bash
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/{videoId}/status"
```

---

## 6. YouTube 업로드

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/youtube/upload" \
  -H "Content-Type: application/json" \
  -d '{
    "videoId": "{생성된_videoId}",
    "channelName": "why_cat",
    "metadata": {
      "title": "영상 제목",
      "description": "영상 설명\n\n#shorts #고양이",
      "tags": ["고양이", "shorts", "cat"],
      "categoryId": "22",
      "privacyStatus": "private"
    },
    "notifySubscribers": false
  }'
```

**privacyStatus 옵션:**
- `private`: 비공개
- `unlisted`: 일부 공개
- `public`: 전체 공개

---

## 7. 실제 사용 예시

### 2025-12-23 테스트

**구름 캐릭터 추가:**
```bash
curl -X POST ".../api/characters/profiles/cat-couple/characters" \
  -d '{"id":"gureum","name":"구름","description":"White fluffy cloud-like cat..."}'
```

**3캐릭터 3씬 영상 생성:**
- videoId: `cmji0i6ql00040es60bf91vty`
- YouTube: https://www.youtube.com/watch?v=Xtua7LqEqzs

---

## 이미지 등록 우선순위

| 순위 | 필드 | 설명 |
|------|------|------|
| 1 | `gcsPath` | GCS 경로 (이미 업로드된 이미지) |
| 2 | `imageUrl` | 외부 URL (서버가 다운로드) |
| 3 | `referenceImageBase64` | Base64 인코딩 |
| - | 없음 | 설명만으로 Nano Banana가 생성 |

---

## 관련 문서

- [[Consistent-Shorts-API-Guide]] - API 전체 가이드
- [[2025-12-23-character-image-registration]] - 이미지 등록 상세
- [[2025-12-22-scene-character-and-frame-interpolation]] - VEO 3.1 인터폴레이션
