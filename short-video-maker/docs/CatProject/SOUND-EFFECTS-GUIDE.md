# 효과음 가이드 (Freesound API)

## 개요

Freesound API를 사용한 무료 효과음 시스템. 씬과 자동 싱크되어 정확한 타이밍에 효과음 재생.

**API**: Freesound.org (무료, Creative Commons)
**무료 한도**: 60 req/분, 500 다운로드/일

---

## 1. 효과음 타이밍 방식

### 1.1 씬 기반 타이밍 (권장)

씬 인덱스와 오프셋으로 자동 싱크:

```json
{
  "type": "preset",
  "value": "CAT_MEOW",
  "sceneIndex": 0,
  "offset": 1.0,
  "volume": 0.6
}
```

| 필드 | 설명 | 예시 |
|------|------|------|
| `sceneIndex` | 씬 인덱스 (0부터) | `0` = 첫 번째 씬 |
| `offset` | 씬 시작 기준 오프셋 (초) | `1.0` = 씬 시작 1초 후 |

**장점**: 씬 길이가 동적으로 변해도 정확한 타이밍 유지

### 1.2 절대 시간 타이밍 (레거시)

전체 영상 기준 절대 시간:

```json
{
  "type": "preset",
  "value": "CAT_MEOW",
  "startTime": 5.0,
  "volume": 0.6
}
```

**주의**: 씬 길이 변경 시 타이밍 틀릴 수 있음

---

## 2. 사용 가능한 프리셋

### 고양이 관련
| 프리셋 | 설명 | 사용 상황 |
|--------|------|----------|
| `CAT_MEOW` | 귀여운 야옹 소리 | 눈뜰 때, 반응할 때 |
| `CAT_PURR` | 골골송 | 포옹, 행복할 때 (duration 권장) |
| `CAT_PAW` | 발자국 소리 | 다가올 때, 걸어올 때 |
| `CAT_HISS` | 하악 소리 | 놀랐을 때, 화났을 때 |

### 전환 효과
| 프리셋 | 설명 |
|--------|------|
| `WHOOSH` | 빠른 전환음 |
| `POP` | 부드러운 팝 |
| `DING` | 알림 딩 |
| `SWIPE` | 스와이프 |

### 감정 표현
| 프리셋 | 설명 |
|--------|------|
| `DRAMATIC_STING` | 극적인 효과 |
| `HAPPY_JINGLE` | 해피엔딩 징글 |
| `SAD_PIANO` | 슬픈 피아노 |
| `SUSPENSE` | 서스펜스 |

### 배경음
| 프리셋 | 설명 |
|--------|------|
| `RAIN` | 비 내리는 소리 |
| `FOREST` | 숲 소리, 새 지저귐 |
| `COFFEE_SHOP` | 카페 배경음 |
| `CITY` | 도시 거리 소리 |

---

## 3. audio_config 전체 구조

```json
{
  "audio_config": {
    "transitionSound": {
      "type": "pop",
      "volume": 0.4
    },
    "soundEffects": [
      {
        "type": "preset",
        "value": "CAT_MEOW",
        "sceneIndex": 0,
        "offset": 1.0,
        "volume": 0.6
      },
      {
        "type": "preset",
        "value": "CAT_PURR",
        "sceneIndex": 1,
        "offset": 0,
        "volume": 0.5,
        "duration": 5
      }
    ]
  }
}
```

### 필드 설명

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `type` | `preset` \| `custom` | O | 프리셋 또는 커스텀 검색 |
| `value` | string | O | 프리셋 이름 또는 검색어 |
| `sceneIndex` | number | △ | 씬 인덱스 (0부터) |
| `offset` | number | X | 씬 시작 기준 오프셋 (기본: 0) |
| `startTime` | number | △ | 절대 시간 (sceneIndex 없을 때) |
| `volume` | number | X | 볼륨 0.0~1.0 (기본: 0.5) |
| `duration` | number | X | 효과음 길이 (초) |

---

## 4. 씬별 타이밍 계산 예시

### 시나리오

| 씬 | 텍스트 | TTS 길이 | 씬 시작 시간 |
|----|--------|----------|-------------|
| Scene 0 | "까미가 눈을 떴어요" | 2초 → 5초 (최소) | 0초 |
| Scene 1 | "딸기가 다가왔어요" | 3초 → 5초 (최소) | 5초 |
| Scene 2 | "둘이 함께 웃어요" | 2.5초 → 5초 (최소) | 10초 |

### 효과음 설정

```json
"soundEffects": [
  { "type": "preset", "value": "CAT_MEOW", "sceneIndex": 0, "offset": 0.5 },
  { "type": "preset", "value": "CAT_PAW", "sceneIndex": 1, "offset": 0 },
  { "type": "preset", "value": "HAPPY_JINGLE", "sceneIndex": 2, "offset": 2.0 }
]
```

### 결과 타이밍

| 효과음 | 계산 | 재생 시간 |
|--------|------|----------|
| CAT_MEOW | Scene 0 (0초) + 0.5초 | **0.5초** |
| CAT_PAW | Scene 1 (5초) + 0초 | **5.0초** |
| HAPPY_JINGLE | Scene 2 (10초) + 2초 | **12.0초** |

---

## 5. transitionSound (자동 전환음)

씬과 씬 사이에 자동으로 전환음 삽입:

```json
"transitionSound": {
  "type": "pop",
  "volume": 0.4
}
```

| type | 설명 |
|------|------|
| `whoosh` | 빠른 스우시 |
| `pop` | 부드러운 팝 |
| `ding` | 딩 소리 |
| `swipe` | 스와이프 |

**위치**: 각 씬 경계 0.3초 전에 자동 배치

---

## 6. 커스텀 효과음 (검색어)

프리셋에 없는 효과음은 검색어로 찾기:

```json
{
  "type": "custom",
  "value": "dog barking",
  "sceneIndex": 0,
  "offset": 2.0,
  "volume": 0.5
}
```

Freesound에서 "dog barking" 검색 후 가장 높은 평점 결과 사용.

---

## 7. 까미딸기 예시

### 아침 일상 스토리

```json
{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },
  "scenes": [
    {
      "text": "까미가 먼저 눈을 떴어요",
      "scenePrompt": "Black cat Kami waking up in morning light, 3D Pixar style",
      "characterIds": ["kami"]
    },
    {
      "text": "옆에서 딸기가 아직 자고 있어요",
      "scenePrompt": "White cat Dalgi sleeping peacefully, 3D Pixar style",
      "characterIds": ["dalgi"]
    },
    {
      "text": "까미가 딸기를 바라보며 미소지어요",
      "scenePrompt": "Kami looking at sleeping Dalgi with loving eyes, 3D Pixar style",
      "characterIds": ["kami", "dalgi"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": false
  },
  "audio_config": {
    "transitionSound": { "type": "pop", "volume": 0.3 },
    "soundEffects": [
      { "type": "preset", "value": "CAT_MEOW", "sceneIndex": 0, "offset": 0.5, "volume": 0.6 },
      { "type": "preset", "value": "CAT_PURR", "sceneIndex": 2, "offset": 1.0, "volume": 0.4, "duration": 4 }
    ]
  }
}
```

---

## 8. 주의사항

1. **sceneIndex는 0부터** 시작 (첫 씬 = 0)
2. **offset은 음수 불가** - 씬 시작 이전에 재생 불가
3. **duration 권장** - CAT_PURR 같은 지속음은 duration 지정
4. **볼륨 조절** - TTS와 겹치면 0.3~0.5 권장
5. **Freesound 한도** - 하루 500 다운로드, 분당 60회 요청

---

## 9. 로그 확인

효과음 싱크 로그:

```
🎯 Sound effect synced to scene
  sceneIndex: 0
  sceneStartTime: 0
  offset: 0.5
  calculatedStartTime: 0.5

✅ Sound effect from Freesound
  preset: CAT_MEOW
  soundName: Cat_Festus_Meow_7
  soundId: 729027
  startTime: 0.5
```

---

Last Updated: 2025-12-25
