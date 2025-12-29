# 고양이 커플 Shorts 완전 가이드

## 🎯 전체 기능 요약

| 기능 | 파라미터 | 설명 |
|------|----------|------|
| **캐릭터 일관성** | `characterReference` | 저장된 캐릭터 프로필 사용 |
| **상단 제목** | `titleText` | 숏츠 어그로용 대문짝 제목 |
| **이중 자막** | `text` + `textEn` + `dualLanguageSubtitles: true` | 한국어 + 영어 자막 (문장 단위) |
| **AI 비디오** | `generateVideos` + `useFrameInterpolation` | Runway VEO 3.1 First+Last Frame |
| **장면 전환** | `useSceneTransitions` | fade, dissolve 등 효과 |
| **배경음악** | `audio_config.backgroundMusic` | Loudly BGM 자동 생성 |
| **효과음** | `audio_config.soundEffects` | 프리셋 또는 Freesound |
| **TTS 스킵** | `config.skipTTS: true` | ✅ 권장! BGM+효과음만 사용 |

---

## 📋 완전한 JSON 요청 예시

```json
{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },

  "titleText": {
    "ko": "호텔 조식에 진심인 고양이 커플 특징",
    "en": "Cat couple's hotel breakfast enthusiasm",
    "position": "top",
    "style": "highlight",
    "duration": "full",
    "fontSize": 44,
    "backgroundColor": "#FFEB3B",
    "textColor": "#000000"
  },

  "scenes": [
    {
      "text": "까미가 조식 뷔페에서 눈을 반짝인다",
      "textEnglish": "Kami's eyes sparkle at the breakfast buffet",
      "scenePrompt": "Black cat with sparkling eyes looking at hotel breakfast buffet, excited expression, morning sunlight",
      "characterIds": ["kami"],
      "duration": 4
    },
    {
      "text": "딸기가 연어를 발견하고 달려간다",
      "textEnglish": "Dalgi spots salmon and rushes over",
      "scenePrompt": "White cat running excitedly toward salmon dish at buffet, determined expression",
      "characterIds": ["dalgi"],
      "duration": 4
    },
    {
      "text": "둘이서 행복하게 같이 먹는다",
      "textEnglish": "They happily eat together",
      "scenePrompt": "Black and white cats eating breakfast together at hotel, happy satisfied expressions, cozy atmosphere",
      "characterIds": ["kami", "dalgi"],
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
    "skipTTS": true
  },

  // TTS 완전 스킵 - BGM + 효과음만 사용 (권장!)
  // elevenlabs_config 생략 + skipTTS: true

  "audio_config": {
    "backgroundMusic": {
      "source": "chill",
      "volume": 0.2,
      "loop": true
    },
    "soundEffects": [
      {
        "type": "preset",
        "value": "CAT_MEOW",
        "startTime": 1.5,
        "volume": 0.4
      },
      {
        "type": "freesound",
        "prompt": "gentle bell",
        "startTime": 5.0,
        "volume": 0.3
      }
    ]
  },

  "youtubeUpload": {
    "enabled": true,
    "channelName": "why_cat",
    "title": "호텔 조식에 진심인 고양이 커플 #shorts",
    "description": "까미와 딸기의 호텔 조식 모험",
    "tags": ["고양이", "cat", "shorts", "호텔조식", "커플"],
    "privacyStatus": "unlisted"
  }
}
```

---

## ⚠️ 서버 환경변수 설정 (중요!)

**VIDEO_SOURCE 설정 - 반드시 `runway` 사용!**

```bash
# ✅ 올바른 설정 (Runway VEO 3.1)
VIDEO_SOURCE=runway
RUNWAY_MODEL=veo3.1
RUNWAY_API_KEY=<Secret Manager에서 관리>

# ❌ 잘못된 설정 (Google VEO 직접 호출 - 실패함!)
VIDEO_SOURCE=veo
VEO_MODEL=veo-3.1-fast-generate-preview
```

**왜 중요한가?**
- `VIDEO_SOURCE=veo`: Google Vertex AI VEO API 직접 호출 → `personGeneration` 오류 발생
- `VIDEO_SOURCE=runway`: Runway API를 통한 VEO 3.1 → **정상 작동!**

**Cloud Run 환경변수 업데이트 명령어:**
```bash
gcloud run services update short-video-maker \
  --update-env-vars="VIDEO_SOURCE=runway,RUNWAY_MODEL=veo3.1"
```

**VIDEO_SOURCE 옵션:**
| 값 | 설명 | 상태 |
|----|------|------|
| `runway` | Runway API (VEO 3.1 또는 Gen-3 Turbo) | ✅ 권장 |
| `veo` | Google Vertex AI VEO 직접 | ❌ 사용 금지 |
| `pexels` | Pexels 스톡 비디오 | OK (테스트용) |
| `leonardo` | Leonardo AI | OK |
| `ffmpeg` | 이미지만 사용 | OK |

---

## 🔧 파라미터 상세 설명

### 1. characterReference (필수)

```json
{
  "characterReference": {
    "profileId": "cat-couple",      // 프로필 ID (필수)
    "characterIds": ["kami", "dalgi"]  // 사용할 캐릭터들 (선택)
  }
}
```

| 프로필 | 채널 | 캐릭터들 |
|--------|------|----------|
| `cat-couple` | why_cat | `kami` (까미), `dalgi` (딸기) |
| `otter-couple` | 수달TV | `husband`, `wife` |

### 2. titleText (상단 제목)

```json
{
  "titleText": {
    "ko": "호텔 조식에 진심인 고양이 커플 특징",  // 한국어 제목 (필수)
    "en": "Cat couple's breakfast habits",         // 영어 (선택)
    "position": "top",           // top | center
    "style": "highlight",        // highlight (노란배경) | default (흰텍스트)
    "duration": "full",          // "full" | 숫자 (초)
    "fontSize": 44,              // 기본: portrait=42, landscape=48
    "backgroundColor": "#FFEB3B", // 배경색 (highlight 스타일)
    "textColor": "#000000"       // 텍스트 색상
  }
}
```

**스타일 비교:**
- `highlight`: 노란 배경 + 검은 글씨 (숏츠 어그로용)
- `default`: 흰 글씨 + 검은 테두리 (일반)

### 3. scenes (장면 배열)

```json
{
  "scenes": [
    {
      "text": "한국어 자막 (TTS 읽음)",           // 필수
      "textEnglish": "English subtitle",        // 이중 자막용 (선택)
      "scenePrompt": "AI 이미지/비디오 생성용 프롬프트",  // 선택
      "characterIds": ["kami"],                 // 이 장면에 등장하는 캐릭터
      "duration": 4                             // 장면 길이 (초)
    }
  ]
}
```

### 4. config (비디오 설정)

```json
{
  "config": {
    "orientation": "portrait",       // portrait | landscape
    "generateVideos": true,          // true: AI 비디오, false: 이미지만
    "useFrameInterpolation": true,   // VEO 3.1 First+Last Frame
    "useSceneTransitions": true,     // 장면 전환 효과
    "sceneTransitionType": "fade",   // fade | dissolve | wipeleft | slideright
    "sceneTransitionDuration": 0.5,  // 전환 시간 (초)
    "skipTTS": true,                 // TTS 스킵 (권장!) - BGM+효과음만
    "dualLanguageSubtitles": true    // 이중 자막 (한/영)
  }
}
```

**sceneTransitionType 옵션:**
- `fade`: 부드러운 페이드
- `dissolve`: 디졸브 효과
- `wipeleft` / `wiperight`: 와이프 효과
- `slideright` / `slideleft`: 슬라이드 효과

**⚠️ videoSource 참고:**
- 서버 환경변수 `VIDEO_SOURCE=runway`로 설정됨
- 요청에 포함 불필요 (서버에서 자동 적용)
- Runway VEO 3.1: First+Last Frame 지원, 고품질

### 5. elevenlabs_config (TTS 설정 - 선택사항)

**⚠️ TTS 스킵 권장!** BGM + 효과음만 사용 시 생략

```json
{
  "elevenlabs_config": {
    "voice": "baRq1qg6PxLsnSQ04d8c",  // 한국어 여성 목소리
    "model_id": "eleven_multilingual_v2",
    "voice_settings": {
      "stability": 0.7,
      "similarity_boost": 0.8,
      "speed": 1.0
    }
  }
}
```

**TTS 사용 시:**
- word-by-word 자막 스타일 활성화
- 음성 + 자막이 싱크됨
- `dualLanguageSubtitles: false` 권장

**TTS 미사용 시 (권장):**
- `elevenlabs_config` 생략
- `dualLanguageSubtitles: true` 설정
- 문장 단위 자막 표시

### 6. audio_config (오디오 설정)

```json
{
  "audio_config": {
    "backgroundMusic": {
      "source": "chill",     // chill | upbeat | dramatic | ambient
      "volume": 0.2,         // 0.15~0.25 권장 (서버에서 x8 증폭)
      "loop": true
    },
    "soundEffects": [
      {
        "type": "preset",    // preset: 미리 정의된 효과음
        "value": "CAT_MEOW",
        "startTime": 1.5,    // 시작 시간 (초)
        "volume": 0.4        // 0.3~0.5 권장 (서버에서 x1.5 증폭)
      },
      {
        "type": "freesound", // freesound: 검색 기반
        "prompt": "gentle bell",
        "startTime": 5.0,
        "volume": 0.3
      }
    ]
  }
}
```

**프리셋 효과음 (Freesound 검색 기반):**
| 프리셋 | 검색어 | 비고 |
|--------|--------|------|
| `CAT_MEOW` | "cat meow cute" | ✅ 권장 |
| `CAT_PURR` | "cat purring" | ✅ 권장 |
| `WHOOSH` | "whoosh transition fast" | ✅ 권장 |
| `POP` | "pop bubble" | ✅ 권장 |
| `DING` | "notification ding bell" | ⚠️ 긴 울림 소리 포함 가능 |
| `SWIPE` | "swipe swoosh" | OK |

**⚠️ 효과음 주의사항:**
- Freesound에서 검색 후 첫 번째 결과 자동 선택
- 예상과 다른 소리가 선택될 수 있음 (드르를~ 같은 노이즈)
- `DING` 프리셋 사용 비권장 (긴 울림 소리 문제)

**✅ 효과음 배치 가이드 (숏츠 최적화):**
```json
"soundEffects": [
  { "type": "preset", "value": "CAT_MEOW", "startTime": 1, "volume": 0.4 },
  { "type": "preset", "value": "WHOOSH", "startTime": 3.5, "volume": 0.3 },
  { "type": "preset", "value": "POP", "startTime": 5, "volume": 0.4 },
  { "type": "preset", "value": "WHOOSH", "startTime": 7, "volume": 0.3 },
  { "type": "preset", "value": "CAT_PURR", "startTime": 9, "volume": 0.4 },
  { "type": "preset", "value": "POP", "startTime": 11, "volume": 0.4 }
]
```
- **짧게**: 1-2초 효과음만 사용
- **자주**: 2-3초마다 효과음 배치
- **다양하게**: MEOW, WHOOSH, POP, PURR 섞어서
- **장면 전환**: WHOOSH로 전환 강조

**BGM source 옵션:**
- `chill`: 편안한 음악
- `upbeat`: 신나는 음악
- `dramatic`: 극적인 음악
- `ambient`: 배경 분위기

### 7. youtubeUpload (자동 업로드)

```json
{
  "youtubeUpload": {
    "enabled": true,           // ⚠️ 필수! false면 업로드 안됨
    "channelName": "why_cat",
    "title": "영상 제목 #shorts",
    "description": "영상 설명",
    "tags": ["태그1", "태그2"],
    "privacyStatus": "unlisted"  // public | unlisted | private
  }
}
```

**⚠️ 중요: `enabled: true` 없으면 YouTube 업로드가 스킵됩니다!**

---

## 🎬 사용 시나리오별 예시

### 시나리오 1: 기본 (이미지만, 자막)

```json
{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },
  "scenes": [
    { "text": "까미가 잠에서 깬다", "scenePrompt": "Black cat waking up", "characterIds": ["kami"] },
    { "text": "딸기가 밥을 달라고 운다", "scenePrompt": "White cat meowing for food", "characterIds": ["dalgi"] }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": false
  }
}
```

### 시나리오 2: Runway VEO 3.1 AI 비디오 + 전체 기능

```json
{
  "characterReference": { "profileId": "cat-couple" },
  "titleText": {
    "ko": "고양이가 주인 깨우는 방법",
    "style": "highlight",
    "position": "top"
  },
  "scenes": [
    {
      "text": "까미가 주인 얼굴을 콕콕 찌른다",
      "textEnglish": "Kami pokes owner's face",
      "scenePrompt": "Black cat gently poking sleeping human's face with paw",
      "characterIds": ["kami"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useFrameInterpolation": true,
    "useSceneTransitions": true,
    "videoSource": "runway"
  },
  "audio_config": {
    "backgroundMusic": { "source": "chill", "volume": 0.2, "loop": true },
    "soundEffects": [{ "type": "preset", "value": "CAT_MEOW", "startTime": 2, "volume": 0.4 }]
  }
}
```

---

## 📡 API 엔드포인트

**Base URL:** `https://short-video-maker-7qtnitbuvq-uc.a.run.app`

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/video/consistent-shorts` | 영상 생성 |
| GET | `/api/video/consistent-shorts/:videoId/status` | 상태 확인 |
| GET | `/api/characters/profiles` | 프로필 목록 |
| GET | `/api/youtube/channels` | YouTube 채널 목록 |

### ⚠️ Windows에서 한글 테스트

**Windows curl은 UTF-8 인코딩 문제가 있음!** Node.js 사용 권장:

```javascript
// send-request.js
const https = require('https');
const data = JSON.stringify({
  characterReference: { profileId: "cat-couple" },
  titleText: { ko: "호텔 조식에 진심인 커플 특징" },
  scenes: [{ text: "까미가 눈을 뜬다", scenePrompt: "Black cat waking up" }],
  config: { orientation: "portrait", generateVideos: true },
  elevenlabs_config: { voice: "baRq1qg6PxLsnSQ04d8c" }
});

const req = https.request({
  hostname: 'short-video-maker-7qtnitbuvq-uc.a.run.app',
  path: '/api/video/consistent-shorts',
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' }
}, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => console.log(body));
});
req.write(data, 'utf8');
req.end();
```

```bash
node send-request.js
```

### curl 명령어 (Linux/Mac)

```bash
# 영상 생성
curl -X POST "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts" \
  -H "Content-Type: application/json" \
  -d '@request.json'

# 상태 확인
curl "https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/VIDEO_ID/status"
```

---

## 🔤 자막 스타일

### 1. Word-by-word (기본 - TTS 기반)
```json
{
  "config": {
    "dualLanguageSubtitles": false  // 기본값
  },
  "elevenlabs_config": { ... }  // TTS 필수!
}
```
- TikTok/Shorts 스타일
- 단어별로 노란색 하이라이트
- TTS 음성의 타이밍에 맞춰 표시
- **TTS 필수** - elevenlabs_config 없으면 자막 없음

### 2. Dual Language (문장 단위)
```json
{
  "config": {
    "dualLanguageSubtitles": true
  },
  "scenes": [
    {
      "text": "한국어 자막",
      "textEn": "English subtitle"  // 또는 textEnglish
    }
  ]
}
```
- 문장 단위로 표시
- 한국어 (위) + 영어 (아래)
- 영어 없으면 한국어만 표시

---

## ⚠️ 주의사항

1. **TTS 필수**: `elevenlabs_config` 없으면 word-by-word 자막 생성 안됨!
2. **효과음 검색**: Freesound 검색은 간단한 영어 키워드 사용 (예: "bell", "meow", "whoosh")
3. **복잡한 검색 실패**: "cat stretching yawn" 같은 복합 검색은 실패할 수 있음 → 프리셋 사용 권장
4. **Runway VEO 3.1 시간**: AI 비디오 생성은 장면당 약 40-60초 소요
5. **BGM 볼륨**: 0.15~0.25 권장 (skipTTS 모드에서는 0.2 추천)
6. **한국어 자막**: UTF-8 자동 처리됨 (2025-12-28 Docker 로케일 수정)

---

## 🎬 테스트 결과

### ✅ skipTTS 테스트 (2025-12-29)
| 항목 | 값 |
|------|-----|
| **YouTube** | https://www.youtube.com/watch?v=KyfG0Y7UnmI |
| **videoId** | `cmjqfbwsq00060es63ukpakbu` |
| **Video Source** | Runway VEO 3.1 (First+Last Frame) |
| **설정** | **`skipTTS: true`** + BGM + 효과음 |
| **결과** | TTS 스킵 성공 ✓ |
| **이슈** | ⚠️ DING 효과음에서 "드르를" 노이즈 발생 - Freesound 검색 결과 문제 |

### 이전 테스트 (2025-12-29)
| 항목 | 값 |
|------|-----|
| **YouTube** | https://www.youtube.com/watch?v=QDmBEktSsMw |
| **videoId** | `cmjqeul5700000es6955q272y` |
| **Video Source** | Runway VEO 3.1 (First+Last Frame) |
| **설정** | dualLanguageSubtitles, BGM + 효과음 |
| **결과** | 3장면 모두 AI 영상 생성 성공 |

---

## 📅 최종 업데이트

2025-12-29 (v8)
- ✅ **VIDEO_SOURCE 설정 명확화** - 반드시 `runway` 사용!
- ✅ Cloud Run 환경변수 설정 가이드 추가
- ⚠️ `VIDEO_SOURCE=veo` 사용 금지 (Google VEO 직접 호출 실패)
- ✅ 성공 로그 패턴 문서화: `🎬 RunwayAPI initialized` → `✅ Runway task completed`

2025-12-29 (v7)
- ✅ **BGM/SFX 볼륨 밸런스 최적화**
  - BGM: 서버에서 x8 증폭 (0.2 → 1.6)
  - SFX: 서버에서 x1.5 증폭 (0.4 → 0.6)
- ✅ 권장 볼륨값: BGM 0.15~0.25, SFX 0.3~0.5

2025-12-29 (v6)
- ⚠️ `DING` 프리셋 비권장 (Freesound에서 "드르를" 노이즈 검색됨)
- ✅ 효과음 배치 가이드 추가: 짧게/자주/다양하게
- ✅ 권장 프리셋: CAT_MEOW, WHOOSH, POP, CAT_PURR

2025-12-29 (v5)
- ✅ **`skipTTS: true` 플래그 추가** - TTS 완전 스킵
- ✅ BGM + 효과음만 사용하는 권장 설정 확립
- ⚠️ `videoSource`는 서버 환경변수로 관리 (요청에서 제거)

2025-12-29 (v4)
- ✅ Runway VEO 3.1 안정화 확인
- ✅ 테스트: https://www.youtube.com/watch?v=QDmBEktSsMw

2025-12-28 (v3)
- ✅ **Runway VEO 3.1 기본 설정** - Google VEO 할당량 문제 해결
- ✅ 3장면 모두 AI 영상 생성 성공 확인

2025-12-28 (v2)
- ✅ UTF-8 한국어 인코딩 수정 (Docker 로케일)
- ✅ Windows curl 대신 Node.js 테스트 방법 추가
- ✅ TTS 스킵 권장 - BGM + 효과음만 사용
- ✅ dualLanguageSubtitles 기본값으로 변경

2025-12-28 (v1)
- VEO 3.1 First+Last Frame 지원
- Runway API 통합
- titleText (상단 제목) 기능
- audio_config (BGM + 효과음)
