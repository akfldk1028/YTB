# Short Video Maker - n8n API Integration Guide

## Base URL
```
https://short-video-maker-7qtnitbuvq-uc.a.run.app
```

---

## 1. 영상 생성 요청

### Endpoint
```
POST /api/video/consistent-shorts
```

### Headers
```json
{
  "Content-Type": "application/json"
}
```

### Request Body (Working Template)
```json
{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },
  "titleText": {
    "ko": "Morning Coffee Battle",
    "en": "Morning Coffee Battle",
    "style": "highlight",
    "position": "top",
    "duration": "full"
  },
  "scenes": [
    {
      "characterIds": ["kami"],
      "text": "Kami enjoying his morning coffee",
      "textEn": "Kami enjoying his morning coffee",
      "scenePrompt": "Adorable black cat wearing light blue t-shirt sitting at kitchen table drinking coffee from cute mug, happy relaxed cat expression, morning sunlight through window, cozy kitchen, 3D Pixar animation style, cute cat face, round brown eyes, soft fluffy fur, adorable cat proportions, cinematic warm lighting",
      "duration": 5
    },
    {
      "characterIds": ["kami", "dalgi"],
      "text": "Dalgi steals the coffee!",
      "textEn": "Dalgi steals the coffee!",
      "scenePrompt": "Black cat wearing light blue t-shirt looking shocked as cute white cat wearing pink strawberry pattern dress with pink bow on right ear snatches coffee mug and runs away, funny playful chase moment, kitchen background, 3D Pixar animation style, cute cat faces, round brown eyes, soft fluffy fur, adorable cat expressions, dramatic lighting",
      "duration": 5
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useFrameInterpolation": true,
    "useSceneTransitions": true,
    "sceneTransitionType": "fade",
    "sceneTransitionDuration": 0.5,
    "dualLanguageSubtitles": true,
    "skipTTS": true,
    "useStoredImageForVeo": true
  },
  "audio_config": {
    "backgroundMusic": {
      "source": "https://archive.org/download/10.-la-violette-africaine/03.%20Les%20Champs-Elysees.mp3",
      "volume": 0.25,
      "loop": true
    },
    "soundEffects": [
      { "type": "preset", "value": "CAT_PURR", "startTime": 1, "volume": 0.25 },
      { "type": "preset", "value": "WHOOSH", "startTime": 5, "volume": 0.25 },
      { "type": "preset", "value": "CAT_MEOW", "startTime": 6, "volume": 0.3 }
    ]
  },
  "youtubeUpload": {
    "enabled": false,
    "channelName": "why_cat",
    "title": "Morning Coffee Battle #shorts",
    "description": "Kami and Dalgi's morning coffee adventure!\n\n#cat #shorts #funny #cute #coffee",
    "tags": ["cat", "shorts", "funny", "cute", "coffee", "kami", "dalgi"],
    "privacyStatus": "unlisted"
  }
}
```

### Response
```json
{
  "videoId": "cmjwe8nqj00000es6dwxq825w",
  "mode": "consistent-shorts",
  "sceneCount": 2,
  "characterProfileId": "cat-couple",
  "characterIds": ["kami", "dalgi"],
  "generateVideos": true,
  "useFrameInterpolation": true,
  "useStoredImageForVeo": true,
  "titleText": {
    "ko": "Morning Coffee Battle",
    "en": "Morning Coffee Battle"
  },
  "veoMode": "VEO 3.1 (First+Last Frame)",
  "imageMode": "Stored Character Image → VEO",
  "message": "Consistent character video generation started using stored profile 'cat-couple'."
}
```

---

## 2. 상태 확인 (Polling)

### Endpoint
```
GET /api/video/consistent-shorts/{videoId}/status
```

### Example
```
GET /api/video/consistent-shorts/cmjwe8nqj00000es6dwxq825w/status
```

### Response (Processing)
```json
{
  "mode": "consistent-shorts",
  "status": "processing",
  "videoId": "cmjwe8nqj00000es6dwxq825w",
  "progress": 50,
  "currentStep": "Generating VEO videos"
}
```

### Response (Completed)
```json
{
  "mode": "consistent-shorts",
  "status": "completed",
  "videoId": "cmjwe8nqj00000es6dwxq825w",
  "videoPath": "gs://dkdk-474008-short-videos/videos/cmjwe8nqj00000es6dwxq825w.mp4",
  "videoUrl": "https://storage.googleapis.com/dkdk-474008-short-videos/videos/cmjwe8nqj00000es6dwxq825w.mp4"
}
```

### Response (Failed)
```json
{
  "mode": "consistent-shorts",
  "status": "failed",
  "videoId": "cmjwe8nqj00000es6dwxq825w",
  "errorInfo": {
    "message": "Error description"
  }
}
```

---

## 3. n8n Workflow 설정

### Step 1: HTTP Request (영상 생성)
- **Method:** POST
- **URL:** `https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts`
- **Body Type:** JSON
- **Body:** (위의 Request Body 참조)

### Step 2: Wait
- **Wait Time:** 30 seconds (초기 대기)

### Step 3: HTTP Request (상태 확인) - Loop
- **Method:** GET
- **URL:** `https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/{{ $node["Step1"].json.videoId }}/status`

### Step 4: IF Condition
- **Condition:** `{{ $json.status }}` equals `completed`
- **True:** Continue to next step
- **False:** Wait 15 seconds → Loop back to Step 3

### Step 5: 완료 처리
- Video URL: `{{ $json.videoUrl }}`
- GCS Path: `{{ $json.videoPath }}`

---

## 4. 핵심 Config 옵션 설명

| 옵션 | 값 | 설명 |
|------|-----|------|
| `useStoredImageForVeo` | `true` | GCS 저장된 캐릭터 이미지 사용 (필수!) |
| `useFrameInterpolation` | `true` | VEO First+Last Frame 모드 |
| `useSceneTransitions` | `true` | 씬 간 트랜지션 |
| `sceneTransitionType` | `"fade"` | 트랜지션 타입 |
| `dualLanguageSubtitles` | `true` | 이중 언어 자막 |
| `skipTTS` | `true` | TTS 생략 (BGM만 사용) |
| `titleText.ko` | 영어 텍스트 | Yellow box에 표시되는 텍스트 |

---

## 5. 등록된 캐릭터

### Profile: cat-couple
| characterId | 이름 | 설명 |
|-------------|------|------|
| `kami` | 까미 | 검은 고양이, 하늘색 티셔츠 |
| `dalgi` | 딸기 | 흰 고양이, 분홍 딸기무늬 원피스, 분홍 리본 |

---

## 6. Sound Effect Presets

| Preset | 설명 |
|--------|------|
| `CAT_PURR` | 고양이 골골 |
| `CAT_MEOW` | 고양이 야옹 |
| `WHOOSH` | 휙 효과음 |
| `POP` | 팝 효과음 |
| `MAGIC` | 마법 효과음 |

---

## 7. 예상 처리 시간

- 2개 씬 영상: **약 3-5분**
- VEO 3.1 생성: 씬당 약 60초
- FFmpeg 처리: 약 30초
- GCS 업로드: 약 10초

---

## 8. GCS 영상 다운로드

### Direct URL
```
https://storage.googleapis.com/dkdk-474008-short-videos/videos/{videoId}.mp4
```

### gsutil 명령어
```bash
gsutil cp gs://dkdk-474008-short-videos/videos/{videoId}.mp4 ./output.mp4
```

---

## 9. 문제 해결

### 캐릭터가 다르게 나올 때
- `useStoredImageForVeo: true` 확인

### Yellow title이 안 나올 때
- `titleText.ko`에 텍스트 입력 (영어도 ko 필드에!)

### 영상이 짧게 나올 때
- VEO 3.1 + Frame Interpolation = 자동으로 8초 생성 후 트림

### status가 failed인데 영상이 있을 때
- 인스턴스 재시작으로 상태 유실
- GCS에서 직접 확인: `gs://dkdk-474008-short-videos/videos/{videoId}.mp4`
