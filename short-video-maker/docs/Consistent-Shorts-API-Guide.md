---
aliases:
  - Consistent Shorts API
  - 캐릭터 일관성 API
  - Scene별 캐릭터 가이드
tags:
  - dev/api
  - dev/video-generation
  - short-video-maker
  - veo3
date: 2025-12-22
status: active
---

# Consistent Shorts API 사용 가이드

>[!abstract] 개요
>[[Consistent Shorts API]]는 **캐릭터 일관성**을 유지하면서 여러 scene을 생성하는 API입니다.
>- Scene별로 다른 캐릭터 조합 지정 가능
>- [[VEO 3.1]] First+Last Frame 보간으로 부드러운 전환
>- [[NANO BANANA]] 이미지 생성 + VEO I2V 변환

---

## 1. 기본 구조

>[!info] API 엔드포인트
>```
>POST https://short-video-maker-550996044521.us-central1.run.app/api/video/consistent-shorts
>```

### 필수 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `characterReference.profileId` | string | GCS에 저장된 캐릭터 프로필 ID |
| `scenes` | array | scene 배열 (최소 1개) |
| `scenes[].text` | string | 나레이션 텍스트 |

---

## 2. Scene별 캐릭터 지정

>[!tip] 핵심 기능
>각 scene마다 `characterIds` 배열로 **다른 캐릭터 조합**을 지정할 수 있습니다.

### 예시: 고양이 커플 스토리

```json
{
  "characterReference": {
    "profileId": "cat-couple"
  },
  "scenes": [
    {
      "text": "까미가 조용히 방에 들어온다",
      "scenePrompt": "A black cat in blue shirt quietly entering a cozy living room",
      "characterIds": ["kami"]
    },
    {
      "text": "딸기가 소파에서 눈을 뜬다",
      "scenePrompt": "A white cat in pink dress waking up on a soft sofa",
      "characterIds": ["dalgi"]
    },
    {
      "text": "둘이 사랑스럽게 마주본다",
      "scenePrompt": "Two cats looking at each other with loving smiles",
      "characterIds": ["kami", "dalgi"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true
  }
}
```

>[!example] characterIds 사용 패턴
>- `["kami"]` - 까미 혼자 등장
>- `["dalgi"]` - 딸기 혼자 등장
>- `["kami", "dalgi"]` - 둘 다 등장
>- 생략 시 - `characterReference.characterIds` 전체 사용

---

## 3. VEO 3.1 First+Last Frame 보간

>[!success] 현재 상태 (2025-12-22 최종)
>**First+Last Frame 활성화됨!**
>- 배포 모델: `veo-3.1-fast-generate-preview`
>- Revision: `short-video-maker-00106-px5`
>- 가격: $0.15/초 (VEO 3.0 Fast와 동일)

>[!info] VEO 모델별 First+Last Frame 지원
>| 모델 | 지원 | 가격 |
>|------|------|------|
>| `veo-3.0-fast-generate-001` | ❌ | $0.15/초 |
>| `veo-3.1-fast-generate-preview` | ✅ | $0.15/초 |
>| `veo-3.0-generate-001` | ❌ | $0.40/초 |
>| `veo-3.1-generate-preview` | ✅ | $0.40/초 |

### 활성화 방법

```json
{
  "config": {
    "generateVideos": true,
    "useFrameInterpolation": true
  }
}
```

### 동작 방식

| Scene | First Frame | Last Frame | 효과 |
|-------|-------------|------------|------|
| 1 | Scene 1 이미지 | Scene 2 이미지 | 1→2 부드러운 전환 |
| 2 | Scene 2 이미지 | Scene 3 이미지 | 2→3 부드러운 전환 |
| 3 | Scene 3 이미지 | (없음) | 일반 I2V |

>[!info] VEO 3.1 API 요구사항
>- First+Last Frame 사용 시 `duration=8` 자동 강제
>- 마지막 scene은 lastFrame 없이 처리

---

## 4. 전체 Config 옵션

```json
{
  "config": {
    "orientation": "portrait",
    "voice": "baRq1qg6PxLsnSQ04d8c",
    "musicVolume": "low",
    "generateVideos": true,
    "useFrameInterpolation": true,
    "captionBackgroundColor": "#FFEB3B"
  }
}
```

| 옵션 | 기본값 | 설명 |
|------|--------|------|
| `orientation` | `portrait` | `portrait` / `landscape` |
| `voice` | ElevenLabs Axl | TTS 음성 ID |
| `musicVolume` | `low` | `muted` / `low` / `medium` / `high` |
| `generateVideos` | `false` | VEO I2V 변환 여부 |
| `useFrameInterpolation` | `false` | VEO 3.1 First+Last Frame |

---

## 5. YouTube 자동 업로드

>[!tip] 업로드 설정
>요청에 `youtubeUpload` 객체를 추가하면 생성 완료 후 자동 업로드됩니다.

```json
{
  "youtubeUpload": {
    "title": "까미와 딸기의 하루",
    "description": "귀여운 고양이 커플 이야기",
    "tags": ["cat", "animation", "pixar"],
    "privacyStatus": "unlisted",
    "channelId": "UC896wwJyux9yn89pQ453CtQ"
  }
}
```

---

## 6. 완전한 요청 예시

```json
{
  "characterReference": {
    "profileId": "cat-couple"
  },
  "scenes": [
    {
      "text": "까미가 조용히 방에 들어온다",
      "scenePrompt": "A black cat in blue shirt quietly entering a cozy living room, Pixar 3D style",
      "characterIds": ["kami"]
    },
    {
      "text": "딸기가 소파에서 눈을 뜬다",
      "scenePrompt": "A white cat in pink dress waking up on a soft sofa, Pixar 3D style",
      "characterIds": ["dalgi"]
    },
    {
      "text": "둘이 사랑스럽게 마주본다",
      "scenePrompt": "Two cats looking at each other with loving smiles in a warm living room, Pixar 3D style",
      "characterIds": ["kami", "dalgi"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useFrameInterpolation": true
  },
  "youtubeUpload": {
    "title": "까미와 딸기 - Scene별 캐릭터 테스트",
    "description": "Scene별로 다른 캐릭터가 등장하는 테스트 영상",
    "tags": ["cat", "pixar", "test"],
    "privacyStatus": "unlisted",
    "channelId": "UC896wwJyux9yn89pQ453CtQ"
  }
}
```

---

## 7. 응답 예시

```json
{
  "videoId": "cmjh71t0v00000es6d6qu2kr7",
  "mode": "consistent-shorts",
  "sceneCount": 3,
  "characterProfileId": "cat-couple",
  "generateVideos": true,
  "useFrameInterpolation": true,
  "veoMode": "VEO 3.1 (First+Last Frame)",
  "message": "Consistent character video generation started using stored profile 'cat-couple'."
}
```

---

## 8. 상태 확인

```bash
curl https://short-video-maker-550996044521.us-central1.run.app/api/video/consistent-shorts/{videoId}/status
```

---

## 9. 구현 핵심 (다음 AI 참고용)

>[!important] 코드 수정 위치
>First+Last Frame 기능을 수정할 때 확인해야 할 파일들:

### 핵심 파일

| 파일 | 역할 | 주요 함수/변수 |
|------|------|---------------|
| `src/short-creator/libraries/GoogleVeo.ts` | VEO API 호출 | `supportsFrameInterpolation()`, `isVeo31`, `findVideo()` |
| `src/short-creator/workflows/ConsistentShortsWorkflow.ts` | 워크플로우 | `convertImagesToVideosWithVeo()` - lastImage 전달 |
| `src/server/api/consistent-shorts.ts` | API 라우터 | `useFrameInterpolation` 플래그 처리 |
| `cloudbuild.yaml` | 배포 설정 | `VEO_MODEL` 환경변수 |

### 주의사항

>[!warning] VEO 3.1 Fast 지원 체크포인트
>1. `GoogleVeo.ts`의 `isVeo31` 변수에 Fast 버전 포함 필수
>2. `supportsFrameInterpolation()`에 Fast 버전 포함 필수
>3. `cloudbuild.yaml`의 `VEO_MODEL` 환경변수 확인

```typescript
// GoogleVeo.ts - 핵심 체크 (Line 57)
const isVeo31 = this.veoModel === "veo-3.1-generate-preview" ||
                this.veoModel === "veo-3.1-fast-generate-preview";

// supportsFrameInterpolation() - Line 43-46
supportsFrameInterpolation(): boolean {
  return this.veoModel === "veo-3.1-generate-preview" ||
         this.veoModel === "veo-3.1-fast-generate-preview";
}
```

---

## Related Notes

- [[VEO 3.1 First+Last Frame]]
- [[NANO BANANA 이미지 생성]]
- [[캐릭터 프로필 등록]]
- [[YouTube 자동 업로드]]
- [[2025-12-22-scene-character-and-frame-interpolation]]
