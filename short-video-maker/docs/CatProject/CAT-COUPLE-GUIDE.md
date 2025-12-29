# Cat Couple (까미와 딸기) 비디오 생성 가이드

## 프로필 정보

| 항목 | 값 |
|------|-----|
| Profile ID | `cat-couple` |
| Channel Name | `why_cat` |
| Style | Pixar 3D |
| Characters | 까미(kami), 딸기(dalgi) |

### 캐릭터 상세

**까미 (kami)** - 검은 고양이 남편
- Black cat husband wearing light blue t-shirt
- 3D Pixar style, cute round eyes, small pink nose
- Features: black fur, light blue shirt, round cute eyes

**딸기 (dalgi)** - 흰 고양이 아내
- White/cream cat wife wearing pink strawberry pattern dress
- Pink bow on ear, 3D Pixar style, fluffy fur
- Features: white/cream fur, pink strawberry dress, pink bow on ear, fluffy

---

## API 호출 방법

### Base URL
```
https://short-video-maker-7qtnitbuvq-uc.a.run.app
```

### Endpoint
```
POST /api/video/consistent-shorts
```

---

## VEO 3.1 First+Last Frame Interpolation

### 작동 원리
```
Scene 1 이미지 ──┬──> VEO 3.1 ──> 8초 전환 영상 1
Scene 2 이미지 ──┘
                ┬──> VEO 3.1 ──> 8초 전환 영상 2
Scene 3 이미지 ──┘
                ──> VEO 3.1 ──> 8초 영상 3 (마지막은 First Frame only)
```

### 중요 사항
- **Duration은 반드시 8초** (API 요구사항)
- 마지막 Scene은 다음 이미지가 없어서 First Frame only로 생성
- 각 Scene 사이가 부드럽게 연결됨

---

## 프롬프트 예시

### 1. 두 캐릭터 함께 등장

```json
{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },
  "scenes": [
    {
      "text": "까미와 딸기가 함께 소파에 앉아 있어요",
      "scenePrompt": "Kami and Dalgi sitting together on a cozy sofa, warm living room, 3D Pixar style"
    },
    {
      "text": "두 고양이가 서로를 바라보며 웃어요",
      "scenePrompt": "Two cats looking at each other and smiling, romantic moment, 3D Pixar style"
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useFrameInterpolation": true
  },
  "youtubeUpload": {
    "enabled": true,
    "privacy": "unlisted",
    "channelName": "why_cat"
  }
}
```

### 2. 캐릭터 개별 등장 (Scene별 캐릭터 지정)

```json
{
  "characterReference": {
    "profileId": "cat-couple"
  },
  "scenes": [
    {
      "text": "까미가 방에 들어온다",
      "scenePrompt": "Black cat Kami entering the room alone, curious expression, 3D Pixar style",
      "characterIds": ["kami"]
    },
    {
      "text": "딸기가 눈을 뜬다",
      "scenePrompt": "White cat Dalgi waking up in bed, sleepy cute expression, 3D Pixar style",
      "characterIds": ["dalgi"]
    },
    {
      "text": "둘이 함께 아침을 먹는다",
      "scenePrompt": "Kami and Dalgi eating breakfast together happily, kitchen scene, 3D Pixar style",
      "characterIds": ["kami", "dalgi"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useFrameInterpolation": true
  },
  "youtubeUpload": {
    "enabled": true,
    "privacy": "unlisted",
    "channelName": "why_cat"
  }
}
```

### 3. 까미만 등장하는 영상

```json
{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami"]
  },
  "scenes": [
    {
      "text": "까미가 혼자 산책을 한다",
      "scenePrompt": "Black cat Kami walking alone in a beautiful park, peaceful mood, 3D Pixar style"
    },
    {
      "text": "까미가 나비를 발견한다",
      "scenePrompt": "Kami discovering a butterfly, curious and playful expression, 3D Pixar style"
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

## Config 옵션 설명

| 옵션 | 값 | 설명 |
|------|-----|------|
| `orientation` | `portrait` / `landscape` | 영상 방향 (숏츠는 portrait) |
| `generateVideos` | `true` / `false` | VEO로 비디오 생성 여부 |
| `useFrameInterpolation` | `true` / `false` | VEO 3.1 First+Last Frame 사용 |
| `voice` | ElevenLabs voice ID | TTS 목소리 |

---

## YouTube 업로드 옵션

```json
"youtubeUpload": {
  "enabled": true,
  "privacy": "unlisted",  // "private", "unlisted", "public"
  "channelName": "why_cat"
}
```

---

## 실행 예시 (curl)

```bash
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '{
    "characterReference": {
      "profileId": "cat-couple",
      "characterIds": ["kami", "dalgi"]
    },
    "scenes": [
      {
        "text": "까미와 딸기가 함께 있어요",
        "scenePrompt": "Kami and Dalgi together, 3D Pixar style"
      }
    ],
    "config": {
      "orientation": "portrait",
      "generateVideos": true,
      "useFrameInterpolation": true
    },
    "youtubeUpload": {
      "enabled": true,
      "privacy": "unlisted",
      "channelName": "why_cat"
    }
  }'
```

---

## 상태 확인

```bash
curl "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/{videoId}/status"
```

---

## GCS 저장 위치

```
gs://dkdk-474008-short-videos/characters/cat-couple/
├── profile.json
└── images/
    ├── kami.png
    └── dalgi.png
```

---

## 시나리오 팁

### 부드러운 전환을 위한 Scene 구성
1. 연속된 Scene은 비슷한 배경/구도 유지
2. 캐릭터 위치가 크게 바뀌지 않도록 구성
3. 감정/표정 변화는 점진적으로

### Scene별 캐릭터 지정 활용
- 독백 장면: 한 캐릭터만
- 대화 장면: 두 캐릭터 함께
- 드라마틱 전환: 캐릭터 교체

### 좋은 프롬프트 작성법
```
[캐릭터명] [행동/상태], [감정], [배경], 3D Pixar style
```

예시:
- "Kami looking surprised, big eyes, living room, 3D Pixar style"
- "Dalgi sleeping peacefully, soft blanket, bedroom, 3D Pixar style"
- "Kami and Dalgi hugging, happy, sunset background, 3D Pixar style"

---

## 테스트 결과

| 날짜 | videoId | YouTube URL | 비고 |
|------|---------|-------------|------|
| 2025-12-22 | cmjh4clzi00000es6cy6jdqzr | https://www.youtube.com/watch?v=jLkbNBs9ERo | VEO 3.1 성공 |
