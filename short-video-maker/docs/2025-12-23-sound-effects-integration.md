# Sound Effects Integration Summary

**Date:** 2025-12-23
**Feature:** ElevenLabs Sound Effects API Integration

---

## 개요

ElevenLabs Sound Effects API를 Consistent Shorts Workflow에 통합하여, 비디오 생성 시 효과음과 장면 전환음을 자동으로 추가할 수 있게 됨.

---

## API 사용법

### Request Body (audio_config 추가)

```json
{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },
  "scenes": [
    {
      "text": "까미가 방에 들어온다",
      "textEnglish": "Kkam-i enters the room",
      "scenePrompt": "Black cat entering room"
    },
    {
      "text": "딸기가 눈을 뜬다",
      "textEnglish": "Dalgi opens her eyes",
      "scenePrompt": "White cat waking up"
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true
  },
  "audio_config": {
    "transitionSound": {
      "type": "whoosh",
      "volume": 0.5
    },
    "soundEffects": [
      {
        "type": "preset",
        "value": "CAT_MEOW",
        "startTime": 2.5,
        "volume": 0.7
      },
      {
        "type": "custom",
        "value": "soft footsteps on wooden floor",
        "startTime": 0,
        "duration": 3,
        "volume": 0.4
      }
    ]
  }
}
```

---

## 지원되는 Sound Effect Presets

| Preset | 설명 |
|--------|------|
| `WHOOSH` | 빠른 전환 효과음 |
| `DING` | 알림음 |
| `POP` | 팝 효과음 |
| `SWIPE` | 스와이프 전환음 |
| `CAT_MEOW` | 고양이 야옹 소리 |
| `CAT_PURR` | 고양이 골골 소리 |
| `CAT_HISS` | 고양이 하악 소리 |
| `CAT_PAW` | 고양이 발자국 소리 |
| `FOOTSTEPS` | 발자국 소리 |
| `DOOR_OPEN` | 문 여는 소리 |
| `RAIN` | 비 오는 소리 (ambient) |
| `COFFEE_SHOP` | 카페 분위기 (ambient) |

---

## 데이터 플로우

```
POST /api/video/consistent-shorts
│
├─ audio_config 추출 (req.body)
│
└─ metadata.audioConfig로 전달
    │
    ▼
ShortCreator.addToQueue()
│
└─ VideoQueue → createShort(metadata)
    │
    ▼
ConsistentShortsWorkflow.process()
│
├─ context.metadata.audioConfig 접근
│
├─ generateSoundEffects()
│   ├─ ElevenLabsSoundEffects.generateTransition() - 장면 전환음
│   └─ ElevenLabsSoundEffects.generate() - 커스텀 효과음
│
└─ FFmpeg.mixAudioTracks()
    └─ adelay + volume + amix 필터로 TTS + 효과음 믹싱
```

---

## 필요한 환경변수

```bash
# Sound Effects를 위해 필요 (ElevenLabs API)
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# VEO 비디오 생성에 필요 (Google Gemini - 무료)
GOOGLE_GEMINI_API_KEY=your_gemini_api_key
```

> ⚠️ **주의:** Sound Effects는 **ElevenLabs API**를 사용합니다 (유료).
> GOOGLE_GEMINI_API_KEY는 VEO 비디오 생성에만 사용됩니다.

---

## 구현된 파일

| 파일 | 역할 |
|------|------|
| `src/server/api/consistent-shorts.ts` | API 엔드포인트, audio_config 파싱 |
| `src/types/shorts.ts` | `AudioConfig`, `SoundEffectConfig` 타입 정의 |
| `src/short-creator/workflows/ConsistentShortsWorkflow.ts` | 효과음 생성 및 믹싱 로직 |
| `src/short-creator/libraries/elevenlabs-tts/ElevenLabsSoundEffects.ts` | ElevenLabs Sound Effects API 래퍼 |
| `src/short-creator/libraries/FFmpeg.ts` | `mixAudioTracks()` 오디오 믹싱 |
| `src/short-creator/processors/VideoProcessor.ts` | `getFFmpeg()` 헬퍼 메서드 |

---

## 테스트 방법

### 1. 환경변수 확인

```bash
# .env 파일에 ELEVENLABS_API_KEY 설정 필요
cat .env | grep ELEVENLABS
```

### 2. curl 테스트

```bash
curl -X POST http://localhost:3124/api/video/consistent-shorts \
  -H "Content-Type: application/json" \
  -d '{
    "characterReference": {
      "profileId": "cat-couple",
      "characterIds": ["kami"]
    },
    "scenes": [
      {
        "text": "까미가 기지개를 켠다",
        "scenePrompt": "Black cat stretching"
      }
    ],
    "config": {
      "orientation": "portrait",
      "generateVideos": false
    },
    "audio_config": {
      "transitionSound": { "type": "whoosh", "volume": 0.3 },
      "soundEffects": [
        { "type": "preset", "value": "CAT_MEOW", "startTime": 1, "volume": 0.6 }
      ]
    }
  }'
```

### 3. 로그 확인

```
🎵 Sound effects configuration detected, processing...
🎵 Generating transition sounds
🎵 Generating custom sound effects
✅ Sound effects mixed with TTS audio
```

---

## 향후 개선 사항

- [ ] Background Music 지원 (`audio_config.backgroundMusic`)
- [ ] Sound effect 캐싱 (같은 preset은 재사용)
- [ ] Volume normalization (loudnorm 필터)
- [ ] 무료 대안: Freesound.org API 연동
