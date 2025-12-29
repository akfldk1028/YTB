# N8N 까미딸기 꽁냥꽁냥 자동화 가이드

## 개요

N8N으로 까미와 딸기의 연애/일상 콘텐츠를 자동 생성하는 워크플로우.

**Base URL**: `https://short-video-maker-7qtnitbuvq-uc.a.run.app`
**Profile ID**: `cat-couple`
**Channel**: `why_cat` (왜저러냥)

---

## 1. N8N 워크플로우 구조

```
[Schedule Trigger] → [Google Sheets] → [OpenAI GPT] → [Code: JSON 파싱] → [HTTP Request] → [Wait] → [상태 확인] → [결과 기록]
```

---

## 2. GPT System Prompt (꽁냥꽁냥 전용)

### 2.1 N8N OpenAI 노드에 복사

```text
당신은 고양이 커플 "까미와 딸기"의 귀여운 일상/연애 스토리를 만드는 전문가입니다.

## 캐릭터 정보

**까미 (kami)** - 검은 고양이 남편
- Black cat wearing light blue t-shirt
- Big round brown eyes, pink nose, chubby cute body
- 성격: 듬직하고 다정함, 딸기를 챙김

**딸기 (dalgi)** - 흰/크림색 고양이 아내
- White/cream cat wearing pink strawberry pattern dress
- Pink bow on right ear, fluffy fur, big round eyes
- 성격: 귀엽고 애교 많음, 까미에게 응석부림

## 출력 규칙

1. 반드시 유효한 JSON만 출력 (마크다운 코드블록 없이)
2. scenes 배열에 3-4개 장면 포함
3. 각 장면 text는 한국어 나레이션 (15-25자)
4. scenePrompt는 영어로 시각적 묘사 (3D Pixar style 필수)
5. characterIds로 각 장면에 등장하는 캐릭터 지정

## 스토리 테마 예시

- 아침에 같이 일어나기
- 소파에서 낮잠자다 깨기
- 함께 간식 먹기
- 창가에서 비오는 날 보기
- 서로 그루밍해주기
- 까미가 딸기 놀래키기
- 딸기가 까미에게 응석부리기

## JSON 출력 형식 (정확히 따르세요)

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
      "scenePrompt": "Both cats together, romantic moment, 3D Pixar style",
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
    "title": "매력적인 제목 #shorts",
    "description": "까미와 딸기의 달달한 일상\n\n#shorts #고양이 #커플 #꽁냥꽁냥",
    "tags": ["shorts", "고양이", "cat", "커플", "꽁냥꽁냥", "pixar", "애니메이션"],
    "privacy": "unlisted"
  }
}

## 효과음 (audio_config) 규칙

1. audio_config는 반드시 포함
2. transitionSound: 장면 전환음 (pop, whoosh, ding, swipe)
3. soundEffects: 시나리오에 맞는 효과음 추가

### 사용 가능한 프리셋
| 프리셋 | 상황 |
|--------|------|
| CAT_MEOW | 야옹, 눈뜰때, 반응할때 |
| CAT_PURR | 골골송, 포옹 (duration 필요) |
| CAT_PAW | 발자국, 다가올때 |
| HAPPY_JINGLE | 해피엔딩 |
| DRAMATIC_STING | 반전, 놀라움 |

### startTime 계산
- Scene 1: 0~8초 → startTime 0~8
- Scene 2: 8~16초 → startTime 8~16
- Scene 3: 16~24초 → startTime 16~24

## 중요 규칙

- generateVideos: true (VEO 영상 생성)
- useFrameInterpolation: true (부드러운 전환)
- channelName: "why_cat" (왜저러냥 채널)
- 마지막 장면은 반드시 둘이 함께 (characterIds: ["kami", "dalgi"])
- scenePrompt에 항상 "3D Pixar animation style" 포함
- audio_config로 효과음 추가 (CAT_MEOW, CAT_PURR 활용)
```

---

## 3. N8N HTTP Request 노드 설정

### 3.1 영상 생성 요청

| 필드 | 값 |
|------|-----|
| **Method** | POST |
| **URL** | `https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts` |
| **Body Content Type** | JSON |
| **JSON** | `={{ $json }}` |

### 3.2 상태 확인

| 필드 | 값 |
|------|-----|
| **Method** | GET |
| **URL** | `https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/{{ $json.videoId }}/status` |

---

## 4. 테마별 User Prompt 예시

N8N의 OpenAI 노드 User Message에 사용:

### 4.1 아침 일상
```
주제: 까미가 먼저 일어나서 자고있는 딸기를 바라보다가 딸기가 깨서 서로 인사하는 장면
```

### 4.2 비오는 날
```
주제: 비오는 날 창가에서 까미와 딸기가 함께 비를 구경하며 포근한 시간 보내기
```

### 4.3 간식 시간
```
주제: 딸기가 간식을 혼자 먹다가 까미가 와서 나눠먹고 행복해하는 장면
```

### 4.4 낮잠
```
주제: 소파에서 까미와 딸기가 서로 기대어 낮잠자다가 함께 깨는 장면
```

### 4.5 장난
```
주제: 까미가 숨어있다가 딸기를 놀래키고, 딸기가 삐졌다가 금방 화해하는 장면
```

### 4.6 응석
```
주제: 딸기가 까미에게 다가와서 머리를 비비며 응석부리고 까미가 다정하게 받아주는 장면
```

---

## 5. Google Sheets 연동

### 5.1 입력 시트 구조

| A: THEME | B: STATUS | C: VIDEO_ID | D: YOUTUBE_URL | E: CREATED_AT |
|----------|-----------|-------------|----------------|---------------|
| 아침에 같이 일어나기 | | | | |
| 비오는 날 창가 | | | | |

### 5.2 N8N Google Sheets 노드

**읽기**:
- Operation: Get Many
- Filter: STATUS = empty (비어있는 행만)

**쓰기**:
- Operation: Update
- Columns: STATUS, VIDEO_ID, YOUTUBE_URL, CREATED_AT

---

## 6. 직접 테스트용 curl

### 6.1 기본 테스트 (아침 일상)

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
      "text": "까미가 먼저 눈을 떴어요",
      "scenePrompt": "Black cat Kami in light blue shirt waking up in bed, morning sunlight through window, cozy bedroom, 3D Pixar animation style",
      "characterIds": ["kami"]
    },
    {
      "text": "옆에서 딸기가 아직 자고 있어요",
      "scenePrompt": "White cat Dalgi in pink strawberry dress sleeping peacefully, soft blanket, adorable sleeping face, 3D Pixar animation style",
      "characterIds": ["dalgi"]
    },
    {
      "text": "까미가 딸기를 바라보며 미소지어요",
      "scenePrompt": "Black cat Kami looking at sleeping Dalgi with loving smile, warm morning light, romantic atmosphere, 3D Pixar animation style",
      "characterIds": ["kami", "dalgi"]
    },
    {
      "text": "딸기가 깨어나 까미와 눈을 마주쳐요",
      "scenePrompt": "Both cats looking at each other with loving eyes, Dalgi just woke up, sweet morning moment, 3D Pixar animation style",
      "characterIds": ["kami", "dalgi"]
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
      { "type": "preset", "value": "CAT_MEOW", "startTime": 1.0, "volume": 0.6 },
      { "type": "preset", "value": "CAT_PURR", "startTime": 18.0, "volume": 0.5, "duration": 4 }
    ]
  },
  "youtubeUpload": {
    "enabled": true,
    "channelName": "why_cat",
    "title": "까미가 딸기 깨울때까지 기다려요 #shorts",
    "description": "까미와 딸기의 달달한 아침\n\n#shorts #고양이 #커플",
    "tags": ["shorts", "고양이", "cat", "커플", "꽁냥꽁냥"],
    "privacy": "unlisted"
  }
}'
```

### 6.2 응석 테마

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
      "text": "딸기가 까미에게 다가와요",
      "scenePrompt": "White cat Dalgi walking towards Kami, cute expression, wanting attention, living room, 3D Pixar animation style",
      "characterIds": ["dalgi"]
    },
    {
      "text": "까미 옆에서 머리를 비벼요",
      "scenePrompt": "Dalgi rubbing her head against Kami affectionately, head bunting, sweet moment, 3D Pixar animation style",
      "characterIds": ["kami", "dalgi"]
    },
    {
      "text": "까미가 딸기를 다정하게 안아줘요",
      "scenePrompt": "Kami gently hugging Dalgi, both cats happy and content, warm loving atmosphere, 3D Pixar animation style",
      "characterIds": ["kami", "dalgi"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useFrameInterpolation": true
  },
  "audio_config": {
    "transitionSound": { "type": "ding", "volume": 0.3 },
    "soundEffects": [
      { "type": "preset", "value": "CAT_PAW", "startTime": 0.5, "volume": 0.5 },
      { "type": "preset", "value": "CAT_PURR", "startTime": 12.0, "volume": 0.6, "duration": 6 }
    ]
  },
  "youtubeUpload": {
    "enabled": true,
    "channelName": "why_cat",
    "title": "딸기가 까미한테 응석부릴때 #shorts",
    "description": "귀여운 고양이 커플의 일상\n\n#shorts #고양이",
    "tags": ["shorts", "고양이", "커플"],
    "privacy": "unlisted"
  }
}'
```

---

## 7. N8N Code 노드 (JSON 파싱)

OpenAI 노드 다음에 추가:

```javascript
const content = $input.first().json.message.content;

// 마크다운 코드블록 제거
let jsonString = content
  .replace(/```json\n?/g, '')
  .replace(/```\n?/g, '')
  .trim();

// JSON 파싱
try {
  const parsed = JSON.parse(jsonString);
  return { json: parsed };
} catch (error) {
  return { json: { error: 'JSON 파싱 실패', raw: content } };
}
```

---

## 8. 예상 결과

### 8.1 성공 응답 (영상 생성 시작)

```json
{
  "videoId": "cmjxxxxx",
  "mode": "consistent-shorts",
  "sceneCount": 4,
  "characterProfileId": "cat-couple",
  "generateVideos": true,
  "useFrameInterpolation": true,
  "message": "Consistent character video generation started"
}
```

### 8.2 완료 상태

```json
{
  "status": "ready",
  "videoId": "cmjxxxxx",
  "youtubeVideoId": "xxxxxxxxxxx",
  "youtubeUrl": "https://www.youtube.com/watch?v=xxxxxxxxxxx"
}
```

---

## 9. 주의사항

1. **VEO 생성 시간**: 3-4개 scene 기준 5-10분 소요
2. **useFrameInterpolation**: true로 설정 시 장면 전환이 부드러움
3. **channelName**: 반드시 `why_cat` 사용 (토큰 등록된 채널)
4. **privacy**: 테스트 시 `unlisted`, 완성 후 `public`으로 변경
5. **캐릭터 ID**: `kami` (까미), `dalgi` (딸기) 정확히 사용

---

## 10. 등록된 캐릭터 (cat-couple 프로필)

| ID | 이름 | 특징 |
|----|------|------|
| `kami` | 까미 | 검은 고양이, 하늘색 티셔츠 |
| `dalgi` | 딸기 | 흰/크림색 고양이, 딸기 무늬 분홍 원피스, 귀에 리본 |
| `oreo` | 오레오 | 오렌지 줄무늬 고양이, 파란 목줄+방울 |
| `gureum` | 구름 | 흰색 솜털 고양이, 하늘색 스카프 |

---

## 관련 문서

- [[2025-12-25-complete-workflow-guide]] - 전체 워크플로우
- [[CAT-COUPLE-GUIDE]] - 까미딸기 기본 가이드
- [[Consistent-Shorts-API-Guide]] - API 상세
- [[../templates/environment-variables]] - 채널 추가 방법 (섹션 11)

---

Last Updated: 2025-12-25
