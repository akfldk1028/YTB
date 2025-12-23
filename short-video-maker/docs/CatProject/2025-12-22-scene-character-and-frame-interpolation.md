# Scene별 캐릭터 지정 + VEO 3.1 First+Last Frame 구현

**날짜:** 2025-12-22
**상태:** 구현 완료 및 배포됨

---

## 개요

Consistent Shorts API에 두 가지 핵심 기능을 추가:
1. **Scene별 캐릭터 지정** - 각 scene마다 다른 캐릭터 조합 사용
2. **VEO 3.1 First+Last Frame** - 부드러운 scene 전환을 위한 프레임 보간

---

## 1. Scene별 캐릭터 지정

### 문제점
기존에는 전체 비디오에 동일한 캐릭터만 적용 가능했음:
```json
{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kkam-i", "ddal-gi"]  // 전체 비디오에 적용
  }
}
```

### 해결책
각 scene에 `characterIds` 필드 추가:
```json
{
  "characterReference": { "profileId": "cat-couple" },
  "scenes": [
    {
      "text": "까미가 방에 들어온다",
      "characterIds": ["kkam-i"]          // Scene 1: 까미만
    },
    {
      "text": "딸기가 눈을 뜬다",
      "characterIds": ["ddal-gi"]         // Scene 2: 딸기만
    },
    {
      "text": "둘이 마주본다",
      "characterIds": ["kkam-i", "ddal-gi"]  // Scene 3: 둘 다
    }
  ]
}
```

### 구현 위치
- `ConsistentShortsWorkflow.ts` (Line 250-280)
- scene의 characterIds가 있으면 해당 캐릭터만 로드
- 없으면 기존처럼 전체 characterIds 사용

---

## 2. VEO 3.1 First+Last Frame Interpolation

### 기능
- VEO 3.1 모델의 First+Last Frame 보간 기능 활용
- 현재 scene 이미지 → 다음 scene 이미지로 부드럽게 전환
- 영상 간 자연스러운 모핑 효과

### 활성화 방법
```json
{
  "config": {
    "generateVideos": true,
    "useFrameInterpolation": true   // 이 플래그 추가
  }
}
```

### 동작 방식
| Scene | First Frame (이미지) | Last Frame (이미지) |
|-------|---------------------|---------------------|
| 1     | Scene 1 이미지      | Scene 2 이미지      |
| 2     | Scene 2 이미지      | Scene 3 이미지      |
| 3     | Scene 3 이미지      | (없음 - 마지막)     |

### 구현 위치
- `ConsistentShortsWorkflow.ts` (Line 416-457)
- `GoogleVeo.ts` - findVideo()에 lastImage 파라미터

### 주의사항
- VEO 3.1 모델 필요 (`veo-3.1-generate-preview`)
- duration=8 자동 강제 (API 요구사항)
- 마지막 scene은 lastFrame 없이 처리

---

## 전체 API 요청 예시

```json
{
  "characterReference": {
    "profileId": "cat-couple"
  },
  "scenes": [
    {
      "text": "까미가 방에 들어온다",
      "scenePrompt": "A black cat entering a cozy room",
      "characterIds": ["kkam-i"]
    },
    {
      "text": "딸기가 눈을 뜬다",
      "scenePrompt": "A ginger cat waking up slowly",
      "characterIds": ["ddal-gi"]
    },
    {
      "text": "둘이 마주본다",
      "scenePrompt": "Two cats looking at each other affectionately",
      "characterIds": ["kkam-i", "ddal-gi"]
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

## 수정된 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `types/shorts.ts` | sceneInput에 characterIds 필드 (기존) |
| `consistent-shorts.ts` | scene.characterIds 파싱 (기존) |
| `ConsistentShortsWorkflow.ts` | Scene별 캐릭터 로딩 + VEO 3.1 lastImage 전달 (신규) |
| `GoogleVeo.ts` | First+Last Frame API 호출 (기존) |

---

## 배포 정보

- **URL:** https://short-video-maker-550996044521.us-central1.run.app
- **Revision:** short-video-maker-00102-zmf
- **배포 시간:** 2025-12-22T13:22:19Z
