# Character Registration Guide

새 캐릭터 생성부터 영상 제작까지의 완전 가이드

---

## 중요: 빌드 vs 업로드

| 작업 | 빌드(Cloud Build) 필요? | 설명 |
|------|------------------------|------|
| 나노바나나로 이미지 생성 | X | 로컬에서 생성 |
| GCS에 이미지 업로드 | X | gsutil로 업로드만 |
| API로 캐릭터 등록 | X | curl로 API 호출만 |
| 소스코드 수정 | O | gcloud builds submit |

**핵심: 새 캐릭터 추가는 빌드 없이 GCS 업로드 + API 호출만으로 완료!**

---

## 1. 캐릭터 이미지 생성 (나노바나나)

### Step 1: 나노바나나에서 이미지 생성

나노바나나(또는 다른 AI 이미지 생성 도구)에서 캐릭터 이미지 생성 후 **로컬에 저장**

### Step 2: 프롬프트 작성

추천 프롬프트 구조:
```
[동물 종류] [색상/무늬] [의상] [표정] [스타일], 3D Pixar animation style, cute proportions, expressive eyes
```

예시:
```
Orange tabby cat with red collar and heart charm, confident expression, 3D Pixar animation style, bright amber eyes, distinctive stripes
```

### Step 3: 이미지 저장

- 파일명: `캐릭터id.png` (예: `nabi.png`)
- 크기: 1024x1024 권장
- 형식: PNG (투명 배경 가능) 또는 JPG
- 스타일: 3D Pixar 일관성 유지

---

## 2. 이미지 업로드 (3가지 방법)

### 방법 1: GCS 직접 업로드 (권장)

```bash
# gsutil 사용
gsutil cp ./my-character.png gs://dkdk-474008-short-videos/characters/cat-couple/images/

# 또는 gcloud storage
gcloud storage cp ./my-character.png gs://dkdk-474008-short-videos/characters/cat-couple/images/
```

결과 경로: `gs://dkdk-474008-short-videos/characters/cat-couple/images/my-character.png`

### 방법 2: imageUrl (외부 URL)

이미지가 이미 웹에 있는 경우:
```json
{
  "imageUrl": "https://example.com/path/to/image.png"
}
```

### 방법 3: Base64 인코딩

이미지를 직접 포함:
```json
{
  "referenceImageBase64": "data:image/png;base64,iVBORw0KGgo..."
}
```

---

## 3. 캐릭터 API 등록

### 새 캐릭터 추가

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple/characters" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "nabi",
    "name": "나비",
    "description": "Orange tabby cat neighbor with red collar and heart charm, confident flirty expression, 3D Pixar style, bright amber eyes",
    "style": "pixar",
    "distinguishingFeatures": ["orange tabby stripes", "red collar with heart charm", "amber eyes"],
    "gcsPath": "characters/cat-couple/images/nabi.png"
  }'
```

### 등록 옵션 (우선순위)

| 필드 | 설명 | 우선순위 |
|------|------|----------|
| `gcsPath` | GCS 버킷 내 경로 | 1순위 |
| `imageUrl` | 외부 이미지 URL | 2순위 |
| `referenceImageBase64` | Base64 인코딩 | 3순위 |

---

## 4. 캐릭터 수정/삭제

### 캐릭터 수정

```bash
curl -X PUT "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple/characters/nabi" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description here",
    "gcsPath": "characters/cat-couple/images/nabi-v2.png"
  }'
```

### 캐릭터 삭제

```bash
curl -X DELETE "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple/characters/nabi"
```

### 프로필 전체 조회

```bash
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/characters/profiles/cat-couple"
```

---

## 5. 빌드/배포 필요 여부

### 빌드가 필요 없는 경우

| 작업 | 빌드 필요? |
|------|----------|
| 캐릭터 API 등록/수정/삭제 | X (즉시 적용) |
| GCS 이미지 업로드 | X (즉시 적용) |
| 프로필 데이터 변경 | X (GCS JSON 자동 업데이트) |

### 빌드가 필요한 경우

| 작업 | 빌드 필요? |
|------|----------|
| 소스 코드 변경 | O |
| API 엔드포인트 추가 | O |
| 새로운 기능 추가 | O |

**결론: 캐릭터 추가는 빌드 없이 API 호출만으로 가능!**

---

## 6. 영상 생성 (새 캐릭터 포함)

### 중요: useStoredImageForVeo 설정

새로 등록한 캐릭터가 **GCS에 업로드한 이미지**를 사용하려면 반드시:

```json
"config": {
  "useStoredImageForVeo": true,  // ← 필수!
  "useFrameInterpolation": true   // ← VEO 3.1 사용
}
```

**이 설정이 없으면**: VEO가 description만 보고 자체 해석한 이미지를 생성 → 원하는 캐릭터와 다름!

---

### 새 캐릭터만 등장하는 영상

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{
    "characterReference": {
      "profileId": "cat-couple",
      "characterIds": ["nabi"]
    },
    "titleText": {
      "ko": "새 이웃 등장!",
      "en": "New Neighbor!",
      "style": "highlight",
      "position": "top",
      "duration": "full"
    },
    "scenes": [
      {
        "characterIds": ["nabi"],
        "text": "A new neighbor appears!",
        "textEnglish": "A new neighbor appears!",
        "scenePrompt": "Orange tabby cat with red collar looking through window confidently, bright amber eyes, 3D Pixar animation style",
        "duration": 5
      }
    ],
    "config": {
      "orientation": "portrait",
      "generateVideos": true,
      "useFrameInterpolation": true,
      "useStoredImageForVeo": true,
      "skipTTS": true
    }
  }'
```

---

### 기존 캐릭터 + 새 캐릭터 함께 등장

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{
    "characterReference": {
      "profileId": "cat-couple",
      "characterIds": ["kami", "dalgi", "nabi"]
    },
    "titleText": {
      "ko": "새 이웃을 만나다",
      "en": "Meeting New Neighbor",
      "style": "highlight",
      "position": "top",
      "duration": "full"
    },
    "scenes": [
      {
        "characterIds": ["nabi"],
        "text": "A new neighbor appears!",
        "textEnglish": "A new neighbor appears!",
        "scenePrompt": "Orange tabby cat with red collar looking through window confidently, 3D Pixar style",
        "duration": 5
      },
      {
        "characterIds": ["kami", "dalgi"],
        "text": "Who is that?",
        "textEnglish": "Who is that?",
        "scenePrompt": "Black cat in light blue t-shirt and white cat in pink strawberry dress looking curious at window, 3D Pixar style",
        "duration": 5
      },
      {
        "characterIds": ["kami", "dalgi", "nabi"],
        "text": "Let'\''s be friends!",
        "textEnglish": "Let'\''s be friends!",
        "scenePrompt": "Black cat, white cat, and orange tabby cat meeting each other happily, friendly introduction, 3D Pixar style",
        "duration": 5
      }
    ],
    "config": {
      "orientation": "portrait",
      "generateVideos": true,
      "useFrameInterpolation": true,
      "useSceneTransitions": true,
      "sceneTransitionType": "fade",
      "sceneTransitionDuration": 0.3,
      "useStoredImageForVeo": true,
      "skipTTS": true
    },
    "audio_config": {
      "backgroundMusic": {
        "source": "https://archive.org/download/10.-la-violette-africaine/03.%20Les%20Champs-Elysees.mp3",
        "volume": 0.25,
        "loop": true,
        "seekStart": 2
      },
      "soundEffects": [
        { "type": "preset", "value": "CAT_MEOW", "startTime": 1, "volume": 0.3 },
        { "type": "preset", "value": "WHOOSH", "startTime": 5, "volume": 0.25 },
        { "type": "preset", "value": "CAT_PURR", "startTime": 8, "volume": 0.25 }
      ]
    }
  }'
```

---

### 상태 확인

```bash
# VIDEO_ID는 생성 요청 응답에서 받은 ID
curl -s "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/VIDEO_ID/status"
```

응답 예시:
```json
{
  "status": "completed",
  "videoUrl": "gs://dkdk-474008-short-videos/videos/VIDEO_ID.mp4"
}
```

---

### 영상 다운로드

**방법 1: GCS에서 직접 다운로드 (권장)**
```bash
gcloud storage cp "gs://dkdk-474008-short-videos/videos/VIDEO_ID.mp4" ./output.mp4
```

**방법 2: Signed URL 생성 후 브라우저에서 다운로드**
```bash
gcloud storage sign-url "gs://dkdk-474008-short-videos/videos/VIDEO_ID.mp4" --duration=1h
```

**주의**: API 다운로드 엔드포인트는 현재 HTML을 반환할 수 있음 → GCS 직접 다운로드 권장

---

## 7. 전체 워크플로우

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 나노바나나에서 캐릭터 이미지 생성                    │
│          → 로컬에 nabi.png 저장                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: GCS에 이미지 업로드 (빌드 불필요)                    │
│          gsutil cp nabi.png gs://dkdk-474008-.../images/    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: API로 캐릭터 등록 (빌드 불필요)                      │
│          POST /api/characters/profiles/cat-couple/characters │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 4: 프로필 조회로 확인                                   │
│          GET /api/characters/profiles/cat-couple             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 5: 영상 생성 테스트                                     │
│          POST /api/video/consistent-shorts                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 6: GCS에서 영상 다운로드                                │
│          gcloud storage cp gs://.../videos/ID.mp4 ./         │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. 트러블슈팅

### 이미지가 영상에 반영 안 됨

1. `useStoredImageForVeo: true` 설정 확인
2. `gcsPath` 경로 확인 (앞에 gs:// 제외)
3. GCS 버킷에 이미지 존재 확인:
   ```bash
   gsutil ls gs://dkdk-474008-short-videos/characters/cat-couple/images/
   ```

### 캐릭터 등록 실패

1. profileId 확인 (`cat-couple`)
2. JSON 형식 검증
3. id 중복 확인

### VEO 3.1이 적용 안 됨

`useFrameInterpolation: true` 설정 필요

---

## 9. 현재 등록된 캐릭터

| ID | 이름 | 설명 |
|----|------|------|
| kami | 까미 | Black cat, light blue t-shirt |
| dalgi | 딸기 | White cat, pink strawberry dress |
| gureum | 구름 | White fluffy cloud cat, blue scarf |
| oreo | 오레오 | Orange tabby, blue collar |
| nabi | 나비 | Orange tabby neighbor, red collar |

---

## 10. 게스트 캐릭터 시스템

N8N Category Selector에 정의된 게스트 캐릭터:

| ID | 이름 | 용도 |
|----|------|------|
| nabi | Nabi | 이웃 고양이 아크 |
| momo | Momo | 아기 고양이 아크 |
| choco | Choco | 강아지 아크 |
| boss | Boss | 동네 대장 고양이 |

게스트 캐릭터도 동일한 방식으로 프로필에 등록하면 영상 생성 가능!
