# AI Context: Short Video Maker API (2026-01-02)

## QUICK START - 영상 생성

### 1. POST 요청
```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d @WORKING-ENGLISH-TEMPLATE.json
```

### 2. 상태 확인 (videoId로 polling)
```bash
curl "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/{videoId}/status"
```

### 3. 완료 시 영상 URL
```
https://storage.googleapis.com/dkdk-474008-short-videos/videos/{videoId}.mp4
```

---

## CRITICAL CONFIG OPTIONS (반드시 포함)

```json
{
  "config": {
    "useStoredImageForVeo": true,
    "useFrameInterpolation": true,
    "useSceneTransitions": true,
    "sceneTransitionType": "fade"
  }
}
```

| 옵션 | 필수값 | 이유 |
|------|--------|------|
| `useStoredImageForVeo` | `true` | 캐릭터 일관성 유지 |
| `useFrameInterpolation` | `true` | VEO 3.1 First+Last Frame |
| `titleText.ko` | 표시할 텍스트 | Yellow box는 ko 필드 표시 |

---

## WORKING TEMPLATE 구조

```json
{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },
  "titleText": {
    "ko": "영어도 여기에",
    "en": "English here too"
  },
  "scenes": [
    {
      "characterIds": ["kami"],
      "text": "자막 텍스트",
      "textEn": "Subtitle text",
      "scenePrompt": "상세한 씬 프롬프트...",
      "duration": 5
    }
  ],
  "config": { ... },
  "audio_config": { ... }
}
```

---

## CHARACTERS (cat-couple)

| ID | Name | Description |
|----|------|-------------|
| `kami` | 까미 | Black cat, light blue t-shirt, brown eyes |
| `dalgi` | 딸기 | White cat, pink strawberry dress, pink bow on right ear |

---

## SOUND EFFECTS

```json
"soundEffects": [
  { "type": "preset", "value": "CAT_PURR", "startTime": 1, "volume": 0.25 },
  { "type": "preset", "value": "WHOOSH", "startTime": 5, "volume": 0.25 },
  { "type": "preset", "value": "CAT_MEOW", "startTime": 6, "volume": 0.3 }
]
```

Presets: `CAT_PURR`, `CAT_MEOW`, `WHOOSH`, `POP`, `MAGIC`

---

## API RESPONSE

### 생성 요청 응답
```json
{
  "videoId": "cmjwe8nqj00000es6dwxq825w",
  "veoMode": "VEO 3.1 (First+Last Frame)",
  "imageMode": "Stored Character Image → VEO"
}
```

### 상태 확인 응답
```json
{
  "status": "completed|processing|failed",
  "videoUrl": "https://storage.googleapis.com/..."
}
```

---

## TIMELINE

- 영상 생성: 3-5분
- Polling 간격: 15초 권장
- VEO 생성: 씬당 ~60초

---

## TROUBLESHOOTING

| 문제 | 해결 |
|------|------|
| 캐릭터 다름 | `useStoredImageForVeo: true` |
| Yellow box 없음 | `titleText.ko`에 텍스트 |
| status=failed but video exists | GCS 직접 확인 |

---

## FILES

- Template: `WORKING-ENGLISH-TEMPLATE.json`
- Full Guide: `N8N-API-GUIDE.md`
- Example Video: `coffee-english-v8.mp4`
