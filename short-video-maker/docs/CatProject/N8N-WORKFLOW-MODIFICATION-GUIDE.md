# N8N 워크플로우 수정 가이드 - 까미딸기 꽁냥꽁냥

기존 PLEASE251020 워크플로우를 까미딸기 콘텐츠용으로 수정하는 단계별 가이드.

---

## 수정 개요

```
[기존] RL API → LangChain → nano-banana/to-veo3
[변경] 테마 선택 → GPT → consistent-shorts
```

---

## 1. Channel Data 노드 수정

### 위치
`Channel Data` (Set 노드)

### 현재
```javascript
channel_type: "ATT"
```

### 변경
```javascript
channel_type: "why_cat"
```

---

## 2. Channel Mapper 노드 수정

### 위치
`Channel Mapper` (Code 노드)

### 현재 코드에서 channelSettings 수정

```javascript
const channelSettings = {
  // 기존 ATT 삭제하거나 유지

  // 까미딸기 채널 추가
  "why_cat": {
    language: "korean",
    voice: "baRq1qg6PxLsnSQ04d8c",  // ElevenLabs 한국어 voice
    style: "cute",
    name: "why_cat",
    veo3Priority: true,
    description: "까미딸기 꽁냥꽁냥"
  }
};
```

---

## 3. Random 노드 수정 - 테마/시나리오 풍부하게

### 위치
`Random` (Code 노드)

### 현재
시간대별 비즈니스 카테고리 선택

### 변경 - 까미딸기 시나리오 뱅크

```javascript
// 까미딸기 시나리오 뱅크 - 여기서 풍부하게 추가!
const catCoupleScenarios = {

  // ============================================
  // 1. 아침/기상 시나리오
  // ============================================
  "morning_wake": [
    {
      theme: "까미가 먼저 일어나서 자고있는 딸기를 바라보다가 딸기가 깨는 장면",
      mood: "peaceful",
      keywords: ["아침", "기상", "사랑스러운"]
    },
    {
      theme: "딸기가 까미를 깨우려고 얼굴에 앞발을 대는 장면",
      mood: "playful",
      keywords: ["아침", "장난", "귀여운"]
    },
    {
      theme: "알람 소리에 둘이 동시에 깨서 서로 바라보는 장면",
      mood: "cozy",
      keywords: ["아침", "동시에", "눈맞춤"]
    }
  ],

  // ============================================
  // 2. 식사/간식 시나리오
  // ============================================
  "eating": [
    {
      theme: "까미가 간식을 딸기에게 양보하는 장면",
      mood: "sweet",
      keywords: ["간식", "양보", "배려"]
    },
    {
      theme: "딸기가 까미 몰래 간식 먹다가 들키는 장면",
      mood: "funny",
      keywords: ["간식", "들킴", "귀여운"]
    },
    {
      theme: "둘이 같은 그릇에서 밥 먹다가 코가 부딪히는 장면",
      mood: "romantic",
      keywords: ["식사", "스파게티", "로맨틱"]
    },
    {
      theme: "까미가 딸기 먹는 모습 흐뭇하게 바라보는 장면",
      mood: "warm",
      keywords: ["식사", "바라봄", "사랑"]
    }
  ],

  // ============================================
  // 3. 낮잠/휴식 시나리오
  // ============================================
  "nap": [
    {
      theme: "소파에서 서로 기대어 낮잠자다가 함께 깨는 장면",
      mood: "cozy",
      keywords: ["낮잠", "소파", "포근"]
    },
    {
      theme: "햇살 아래서 까미 배 위에 딸기가 올라가 자는 장면",
      mood: "peaceful",
      keywords: ["햇살", "낮잠", "귀여운"]
    },
    {
      theme: "이불 속에서 서로 꼬리 감고 자는 장면",
      mood: "warm",
      keywords: ["이불", "꼬리", "사랑"]
    },
    {
      theme: "까미가 자다가 딸기 꿈꾸며 미소짓는 장면",
      mood: "sweet",
      keywords: ["꿈", "미소", "사랑"]
    }
  ],

  // ============================================
  // 4. 응석/애교 시나리오
  // ============================================
  "affection": [
    {
      theme: "딸기가 까미에게 다가와 머리를 비비며 응석부리는 장면",
      mood: "sweet",
      keywords: ["응석", "머리비비기", "애교"]
    },
    {
      theme: "까미가 딸기를 그루밍해주는 장면",
      mood: "caring",
      keywords: ["그루밍", "돌봄", "사랑"]
    },
    {
      theme: "딸기가 삐쳤다가 까미가 달래서 화해하는 장면",
      mood: "dramatic",
      keywords: ["삐짐", "화해", "달램"]
    },
    {
      theme: "까미가 딸기 이마에 코를 대고 인사하는 장면",
      mood: "tender",
      keywords: ["코인사", "사랑", "인사"]
    },
    {
      theme: "딸기가 까미 옆에 딱 붙어앉아서 안떨어지려는 장면",
      mood: "clingy",
      keywords: ["밀착", "애교", "귀여운"]
    }
  ],

  // ============================================
  // 5. 장난/놀이 시나리오
  // ============================================
  "play": [
    {
      theme: "까미가 숨어있다가 딸기를 놀래키는 장면",
      mood: "playful",
      keywords: ["장난", "놀래킴", "재미"]
    },
    {
      theme: "딸기가 까미 꼬리를 잡으려고 쫓아다니는 장면",
      mood: "energetic",
      keywords: ["꼬리", "쫓기", "장난"]
    },
    {
      theme: "둘이 같은 장난감 가지고 놀다가 양보하는 장면",
      mood: "sweet",
      keywords: ["장난감", "양보", "사랑"]
    },
    {
      theme: "숨바꼭질하다가 까미가 딸기 찾아서 기뻐하는 장면",
      mood: "joyful",
      keywords: ["숨바꼭질", "찾음", "기쁨"]
    },
    {
      theme: "레이저 포인터 둘이 같이 쫓다가 부딪히는 장면",
      mood: "funny",
      keywords: ["레이저", "부딪힘", "웃김"]
    }
  ],

  // ============================================
  // 6. 창가/날씨 시나리오
  // ============================================
  "window": [
    {
      theme: "비오는 날 창가에서 둘이 비 구경하는 장면",
      mood: "cozy",
      keywords: ["비", "창가", "포근"]
    },
    {
      theme: "눈 오는 날 창밖 보며 신기해하는 장면",
      mood: "wonder",
      keywords: ["눈", "창가", "신기"]
    },
    {
      theme: "노을 지는 창가에서 서로 기대어 있는 장면",
      mood: "romantic",
      keywords: ["노을", "로맨틱", "사랑"]
    },
    {
      theme: "새 구경하며 까미가 딸기에게 설명해주는 장면",
      mood: "cute",
      keywords: ["새", "설명", "귀여운"]
    }
  ],

  // ============================================
  // 7. 특별한 날 시나리오
  // ============================================
  "special": [
    {
      theme: "까미가 딸기에게 깜짝 선물 주는 장면",
      mood: "surprise",
      keywords: ["선물", "깜짝", "감동"]
    },
    {
      theme: "기념일에 둘이 특별한 간식 먹는 장면",
      mood: "celebration",
      keywords: ["기념일", "축하", "행복"]
    },
    {
      theme: "크리스마스에 트리 앞에서 함께 있는 장면",
      mood: "festive",
      keywords: ["크리스마스", "트리", "행복"]
    },
    {
      theme: "생일에 까미가 딸기 위해 준비한 서프라이즈 장면",
      mood: "touching",
      keywords: ["생일", "서프라이즈", "감동"]
    }
  ],

  // ============================================
  // 8. 일상 소소한 시나리오
  // ============================================
  "daily": [
    {
      theme: "TV 보다가 둘이 같이 잠드는 장면",
      mood: "cozy",
      keywords: ["TV", "잠듦", "일상"]
    },
    {
      theme: "까미가 일하는 척하다가 딸기 보며 웃는 장면",
      mood: "warm",
      keywords: ["일상", "웃음", "사랑"]
    },
    {
      theme: "딸기가 혼자 심심해하다가 까미 오면 반가워하는 장면",
      mood: "joyful",
      keywords: ["기다림", "반가움", "사랑"]
    },
    {
      theme: "둘이 같은 방향 보며 뒹굴뒹굴하는 장면",
      mood: "lazy",
      keywords: ["뒹굴", "일상", "편안"]
    },
    {
      theme: "까미가 딸기 사진 찍어주는 장면",
      mood: "cute",
      keywords: ["사진", "추억", "귀여운"]
    }
  ],

  // ============================================
  // 9. 감정 표현 시나리오
  // ============================================
  "emotion": [
    {
      theme: "까미가 힘들어하는 딸기를 위로해주는 장면",
      mood: "comforting",
      keywords: ["위로", "힘듦", "사랑"]
    },
    {
      theme: "딸기가 까미 보고 너무 좋아서 눈물나는 장면",
      mood: "touching",
      keywords: ["감동", "눈물", "사랑"]
    },
    {
      theme: "오랜만에 만나서 둘이 뛰어와 포옹하는 장면",
      mood: "emotional",
      keywords: ["재회", "포옹", "그리움"]
    },
    {
      theme: "까미가 딸기한테 사랑한다고 고백하는 장면",
      mood: "romantic",
      keywords: ["고백", "사랑", "로맨틱"]
    }
  ],

  // ============================================
  // 10. 밤/잠자리 시나리오
  // ============================================
  "night": [
    {
      theme: "잠들기 전 서로 굿나잇 인사하는 장면",
      mood: "peaceful",
      keywords: ["굿나잇", "잠자리", "사랑"]
    },
    {
      theme: "별 보며 둘이 소원 비는 장면",
      mood: "dreamy",
      keywords: ["별", "소원", "로맨틱"]
    },
    {
      theme: "까미가 딸기에게 자장가 불러주는 장면",
      mood: "tender",
      keywords: ["자장가", "잠", "사랑"]
    },
    {
      theme: "무서운 꿈 꾼 딸기를 까미가 안아주는 장면",
      mood: "comforting",
      keywords: ["악몽", "위로", "안아줌"]
    }
  ]
};

// 시간대 매핑
const timeSlot = getTimeSlot(hour);
const timeToCategory = {
  "morning": ["morning_wake", "eating"],
  "afternoon": ["nap", "play", "daily"],
  "evening": ["window", "affection", "emotion"],
  "night": ["night", "affection", "special"]
};

// 카테고리 선택
const availableCategories = timeToCategory[timeSlot];
const selectedCategory = availableCategories[Math.floor(Math.random() * availableCategories.length)];

// 해당 카테고리에서 시나리오 선택
const scenarios = catCoupleScenarios[selectedCategory];
const selectedScenario = scenarios[Math.floor(Math.random() * scenarios.length)];

return [{
  json: {
    format_type: "timeline",
    selected_category: selectedCategory,
    selected_theme: selectedScenario.theme,
    mood: selectedScenario.mood,
    keywords: selectedScenario.keywords,
    target_language: "korean",
    channel_name: "why_cat",
    channel_type: "why_cat",
    time_slot: timeSlot,
    hour: hour,
    timestamp: new Date().toISOString()
  }
}];
```

---

## 4. Duration & Scenes Adjuster 노드 수정

### 위치
`Duration & Scenes Adjuster` (Code 노드)

### 수정 포인트

```javascript
const USER_CONFIG = {
  target_duration: 24,    // 3-4개 씬 × 6-8초
  scenes_count: 3,        // 까미딸기는 3-4개 씬이 적당

  // VEO 3.1 사용 (8초 권장)
  veo3_duration_options: [6, 8],
  force_veo3_compliance: true,

  // 채널별 오버라이드
  channel_overrides: {
    'why_cat': {
      scenes_count: 3,
      target_duration: 24
    }
  }
};
```

---

## 5. RL HTTP Request 노드 제거 또는 교체

### 현재
```
HTTP Request → hfbpo-api (RL 프롬프트 생성)
```

### 변경 옵션

**옵션 A: 노드 삭제**
- RL HTTP Request 노드 삭제
- Random 노드 출력을 바로 GPT Agent로 연결

**옵션 B: 테마 API로 교체 (나중에)**
- 자체 테마 API 만들면 여기에 연결

---

## 6. Generate Creative Video Idea 노드 수정 (핵심!)

### 위치
`Generate Creative Video Idea` (LangChain Agent)

### System Prompt 전체 교체

```text
당신은 고양이 커플 "까미와 딸기"의 귀여운 일상 스토리를 만드는 전문가입니다.

## 캐릭터 정보 (절대 변경 금지)

**까미 (kami)** - 검은 고양이 남편
- 외형: Black cat wearing light blue t-shirt, big round brown eyes, pink nose, chubby cute body
- 성격: 듬직하고 다정함, 딸기를 항상 챙김, 장난기 있음

**딸기 (dalgi)** - 흰/크림색 고양이 아내
- 외형: White/cream cat wearing pink strawberry pattern dress, pink bow on right ear, fluffy fur
- 성격: 귀엽고 애교 많음, 까미에게 응석부림, 가끔 삐짐

## 입력 정보

테마: {{ $('Random').item.json.selected_theme }}
분위기: {{ $('Random').item.json.mood }}
키워드: {{ $('Random').item.json.keywords }}
씬 개수: {{ $('Duration & Scenes Adjuster').item.json.target_scenes_count }}
씬별 길이: {{ $('Duration & Scenes Adjuster').item.json.individual_scene_durations }}

## 출력 규칙

1. 반드시 유효한 JSON만 출력 (마크다운 없이)
2. scenes 배열에 정확히 {{ $('Duration & Scenes Adjuster').item.json.target_scenes_count }}개 장면
3. 각 장면 text는 한국어 나레이션 (15-25자)
4. scenePrompt는 영어로 시각적 묘사 (3D Pixar style 필수)
5. characterIds로 각 장면에 등장하는 캐릭터 지정
6. 마지막 장면은 반드시 둘이 함께

## 스토리 구조 (Hook → Build → Payoff)

- Scene 1: 상황 설정 (한 캐릭터 또는 둘)
- Scene 2: 전개/리액션 (감정 표현)
- Scene 3: 클라이맥스/해피엔딩 (반드시 둘 함께)

## JSON 출력 형식

{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },
  "scenes": [
    {
      "text": "한국어 나레이션 (15-25자)",
      "scenePrompt": "English visual description, 3D Pixar animation style, warm lighting",
      "characterIds": ["kami"],
      "duration": 8
    },
    {
      "text": "한국어 나레이션",
      "scenePrompt": "English description, 3D Pixar style",
      "characterIds": ["dalgi"],
      "duration": 8
    },
    {
      "text": "한국어 나레이션",
      "scenePrompt": "Both cats together, sweet moment, 3D Pixar style",
      "characterIds": ["kami", "dalgi"],
      "duration": 8
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useFrameInterpolation": true,
    "subtitlePosition": "bottom"
  },
  "audio_config": {
    "transitionSound": { "type": "pop", "volume": 0.4 },
    "soundEffects": [
      { "type": "preset", "value": "CAT_MEOW", "startTime": 2.0, "volume": 0.6 },
      { "type": "preset", "value": "CAT_PURR", "startTime": 18.0, "volume": 0.5, "duration": 5 }
    ]
  },
  "youtubeUpload": {
    "enabled": true,
    "channelName": "why_cat",
    "title": "감정적인 제목 #shorts",
    "description": "까미와 딸기의 달달한 일상\n\n#shorts #고양이 #커플 #꽁냥꽁냥",
    "tags": ["shorts", "고양이", "cat", "커플", "꽁냥꽁냥", "pixar"],
    "privacy": "unlisted"
  }
}

## 효과음 (audio_config) 규칙

1. audio_config는 반드시 포함
2. transitionSound: 장면 전환음 (pop, whoosh, ding, swipe 중 택1)
3. soundEffects: 각 씬에 맞는 효과음 1-2개 추가

### 사용 가능한 고양이 프리셋
| 프리셋 | 상황 |
|--------|------|
| CAT_MEOW | 야옹, 눈뜰때, 반응할때, 부를때 |
| CAT_PURR | 골골송, 포옹, 행복할때 (duration 필요) |
| CAT_PAW | 발자국, 다가올때, 걸어갈때 |

### 사용 가능한 감정 프리셋
| 프리셋 | 상황 |
|--------|------|
| HAPPY_JINGLE | 해피엔딩, 성공 |
| DRAMATIC_STING | 반전, 놀라움 |
| SAD_PIANO | 삐짐, 아쉬움 |

### startTime 계산법 (중요!)
전체 영상 기준 초 단위:
- Scene 1 (0-8초): startTime 0~8
- Scene 2 (8-16초): startTime 8~16
- Scene 3 (16-24초): startTime 16~24

### 시나리오별 효과음 예시

**아침/기상**: CAT_MEOW(1초) + CAT_PURR(18초, 마지막씬)
**응석/애교**: CAT_PAW(0.5초) + CAT_PURR(12초)
**장난/놀이**: CAT_PAW(0.5초) + CAT_MEOW(5초) + HAPPY_JINGLE(18초)
**감동/특별**: 커스텀("Soft magical sparkle", 3초) + CAT_PURR(15초)

## scenePrompt 작성 규칙

1. 항상 캐릭터 외형 포함:
   - 까미: "Black cat Kami in light blue t-shirt"
   - 딸기: "White cat Dalgi in pink strawberry dress with pink bow"

2. 3D Pixar animation style 필수

3. 감정/분위기 표현:
   - loving eyes, gentle smile, excited expression
   - cozy atmosphere, warm lighting, soft glow

4. 카메라/구도 (선택):
   - close-up shot, medium shot, wide shot
   - from above, eye level, low angle

## 제목 작성 규칙

- 감정을 자극하는 표현 사용
- 궁금증 유발
- 예시:
  - "까미가 딸기 깨울때까지 기다려요"
  - "딸기가 까미한테 삐졌어요"
  - "둘이 처음으로..."
  - "까미의 깜짝 선물"
```

### User Prompt 수정

```text
테마: {{ $('Random').item.json.selected_theme }}

위 테마로 까미와 딸기의 귀여운 스토리를 만들어주세요.
```

---

## 7. Create AI Video 노드 수정

### 위치
`Create AI Video` (HTTP Request)

### 현재
```
URL: https://short-video-maker-550996044521.us-central1.run.app/api/video/nano-banana/to-veo3
```

### 변경
```
URL: https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts
Method: POST
Body: {{ $json }}
```

---

## 8. 추가: 상태 확인 노드 (선택)

영상 생성 후 상태 확인하려면 추가:

### Wait 노드
- 5분 대기 (영상 생성 시간)

### HTTP Request (상태 확인)
```
URL: https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/{{ $json.videoId }}/status
Method: GET
```

---

## 9. 자막 설정

### config 옵션에 자막 설정 추가

```json
"config": {
  "orientation": "portrait",
  "generateVideos": true,
  "useFrameInterpolation": true,

  // 자막 설정
  "subtitlePosition": "bottom",      // top, center, bottom
  "subtitleStyle": "default",        // default, bold, outline

  // 이중자막 (한글 + 영어)
  "dualSubtitles": {
    "enabled": true,
    "primaryLanguage": "korean",
    "secondaryLanguage": "english"
  }
}
```

### 자막 위치 옵션

| 값 | 위치 | 권장 용도 |
|----|------|----------|
| `top` | 상단 | 화면 하단에 중요 요소 있을 때 |
| `center` | 중앙 | 강조 효과 |
| `bottom` | 하단 (기본) | 일반적인 숏츠 |

### 이중자막 설정

까미딸기는 해외 시청자도 타겟이므로 이중자막 권장:

```json
"dualSubtitles": {
  "enabled": true,
  "primaryLanguage": "korean",      // 메인 자막 (위)
  "secondaryLanguage": "english"    // 보조 자막 (아래)
}
```

### System Prompt에 자막용 영어 번역 추가

GPT가 scenes 생성 시 영어 번역도 함께 생성하도록:

```json
{
  "scenes": [
    {
      "text": "까미가 딸기를 바라봐요",
      "textEn": "Kami looks at Dalgi",  // 영어 자막용
      "scenePrompt": "...",
      "characterIds": ["kami", "dalgi"]
    }
  ]
}
```

---

## 10. 효과음 설정 (audio_config) - ElevenLabs Sound Effects

### 10.1 기본 구조

```json
{
  "audio_config": {
    "transitionSound": {
      "type": "pop",
      "volume": 0.5
    },
    "soundEffects": [
      {
        "type": "preset",
        "value": "CAT_MEOW",
        "startTime": 2.5,
        "volume": 0.7
      }
    ]
  }
}
```

### 10.2 사용 가능한 프리셋

#### 고양이 효과음 (까미딸기 필수!)

| 프리셋 | 설명 | 권장 상황 |
|--------|------|----------|
| `CAT_MEOW` | 귀여운 야옹 소리 | 눈 뜰 때, 부를 때, 반응할 때 |
| `CAT_PURR` | 편안한 골골송 | 포옹, 낮잠, 행복할 때 |
| `CAT_PAW` | 고양이 발자국 | 걸어갈 때, 다가올 때 |
| `CAT_HISS` | 하악 소리 | 놀랐을 때 (거의 안씀) |

#### 전환 효과음

| 프리셋 | 설명 | 권장 상황 |
|--------|------|----------|
| `WHOOSH` | 슉 전환음 | 빠른 장면 전환 |
| `POP` | 뽁 소리 | 귀여운 장면 전환 |
| `DING` | 딩 알림음 | 깨닫는 순간, 아이디어 |
| `SWIPE` | 스와이프음 | 숏츠 스타일 전환 |

#### 감정 효과음

| 프리셋 | 설명 | 권장 상황 |
|--------|------|----------|
| `HAPPY_JINGLE` | 신나는 짧은 멜로디 | 해피엔딩, 성공 |
| `DRAMATIC_STING` | 극적인 효과음 | 반전, 놀라움 |
| `SAD_PIANO` | 슬픈 피아노 | 삐침, 아쉬움 |

### 10.3 시나리오별 권장 설정

#### 아침/기상 시나리오

```json
{
  "audio_config": {
    "transitionSound": { "type": "pop", "volume": 0.4 },
    "soundEffects": [
      { "type": "preset", "value": "CAT_MEOW", "startTime": 1.0, "volume": 0.6 },
      { "type": "custom", "value": "Gentle morning stretch sound", "startTime": 3.0, "volume": 0.4 }
    ]
  }
}
```

#### 응석/애교 시나리오

```json
{
  "audio_config": {
    "transitionSound": { "type": "ding", "volume": 0.3 },
    "soundEffects": [
      { "type": "preset", "value": "CAT_PURR", "startTime": 4.0, "volume": 0.7, "duration": 5 },
      { "type": "preset", "value": "CAT_PAW", "startTime": 1.0, "volume": 0.5 }
    ]
  }
}
```

#### 장난/놀이 시나리오

```json
{
  "audio_config": {
    "transitionSound": { "type": "whoosh", "volume": 0.5 },
    "soundEffects": [
      { "type": "preset", "value": "CAT_PAW", "startTime": 0.5, "volume": 0.6 },
      { "type": "preset", "value": "CAT_MEOW", "startTime": 5.0, "volume": 0.7 },
      { "type": "preset", "value": "HAPPY_JINGLE", "startTime": 15.0, "volume": 0.5 }
    ]
  }
}
```

#### 특별한 날/감동 시나리오

```json
{
  "audio_config": {
    "transitionSound": { "type": "ding", "volume": 0.4 },
    "soundEffects": [
      { "type": "custom", "value": "Soft magical sparkle sound", "startTime": 3.0, "volume": 0.5 },
      { "type": "preset", "value": "CAT_PURR", "startTime": 8.0, "volume": 0.6 }
    ]
  }
}
```

### 10.4 커스텀 효과음

프리셋 외에 원하는 효과음 직접 지정:

```json
{
  "type": "custom",
  "value": "Soft heartbeat sound, romantic",
  "startTime": 5.0,
  "duration": 3,
  "volume": 0.5
}
```

#### 까미딸기용 커스텀 효과음 예시

| 상황 | 커스텀 프롬프트 |
|------|----------------|
| 눈 맞춤 | `"Soft magical sparkle, romantic"` |
| 심장 두근 | `"Gentle heartbeat sound, love"` |
| 포옹 | `"Warm cozy cuddle sound effect"` |
| 장난 | `"Playful cartoon boing sound"` |
| 깜짝 | `"Cute surprised squeak sound"` |
| 행복 | `"Happy twinkle chime sound"` |

### 10.5 N8N에서 audio_config 추가 방법

#### GPT System Prompt에 추가

```text
## JSON 출력 형식

{
  "characterReference": { ... },
  "scenes": [ ... ],
  "config": { ... },
  "audio_config": {
    "transitionSound": { "type": "pop", "volume": 0.4 },
    "soundEffects": [
      { "type": "preset", "value": "CAT_MEOW", "startTime": 2.0, "volume": 0.6 }
    ]
  },
  "youtubeUpload": { ... }
}
```

#### GPT에게 효과음 선택 지시

System Prompt에 추가:

```text
## 효과음 규칙

1. audio_config는 반드시 포함
2. transitionSound는 장면 전환에 사용 (pop 또는 whoosh)
3. 각 씬에 1-2개 soundEffects 추가
4. 고양이 효과음 활용: CAT_MEOW, CAT_PURR, CAT_PAW
5. startTime은 해당 씬의 감정 포인트에 맞춤
6. volume은 0.4~0.7 권장 (너무 크면 시끄러움)
```

### 10.6 효과음 타이밍 계산

```
전체 영상: 24초 (8초 × 3씬)
Scene 1: 0-8초
Scene 2: 8-16초
Scene 3: 16-24초

startTime은 전체 영상 기준:
- Scene 1에서 3초 지점 효과음 → startTime: 3
- Scene 2에서 3초 지점 효과음 → startTime: 11 (8+3)
- Scene 3에서 3초 지점 효과음 → startTime: 19 (16+3)
```

### 10.7 비용 안내

- ElevenLabs Sound Effects는 기존 TTS와 동일한 API 키 사용
- 추가 비용 없음 (기존 플랜 내 크레딧 사용)
- 효과음당 약 0.1-0.5 크레딧 소모

---

## 체크리스트

- [ ] Channel Data: `why_cat`으로 변경
- [ ] Channel Mapper: why_cat 채널 설정 추가
- [ ] Random: 까미딸기 시나리오 뱅크 추가
- [ ] Duration & Scenes Adjuster: 3씬, 24초로 설정
- [ ] RL HTTP Request: 제거 또는 우회
- [ ] Generate Creative Video Idea: System Prompt 교체
- [ ] Generate Creative Video Idea: 영어 번역(textEn) 추가
- [ ] config: 자막 설정 추가 (subtitlePosition, dualSubtitles)
- [ ] audio_config: 효과음 설정 추가 (transitionSound, soundEffects)
- [ ] Create AI Video: URL + 엔드포인트 변경

---

## 시나리오 확장 팁

### 새 시나리오 추가 방법

Random 노드의 `catCoupleScenarios`에 새 카테고리 추가:

```javascript
"새카테고리": [
  {
    theme: "시나리오 설명",
    mood: "분위기",
    keywords: ["키워드1", "키워드2"]
  }
]
```

### 시즌/이벤트 시나리오

```javascript
// 크리스마스 시즌
"christmas": [
  { theme: "산타 모자 쓴 까미가 딸기에게 선물 주는 장면", mood: "festive" },
  { theme: "눈 오는 창가에서 핫초코 마시는 장면", mood: "cozy" }
],

// 발렌타인
"valentine": [
  { theme: "까미가 딸기에게 초콜릿 주는 장면", mood: "romantic" },
  { theme: "하트 모양 쿠션에서 함께 있는 장면", mood: "sweet" }
]
```

---

## 관련 문서

- [[N8N-CAT-COUPLE-AUTOMATION]] - 자동화 상세 가이드
- [[2025-12-25-complete-workflow-guide]] - 전체 워크플로우
- [[CAT-COUPLE-GUIDE]] - 까미딸기 기본 가이드

---

Last Updated: 2025-12-25
