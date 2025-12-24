# useStoredImageForVeo 기능 구현

**날짜:** 2025-12-23
**기능:** 저장된 캐릭터 이미지를 VEO에 직접 전달

---

## 배경 및 문제점

### 기존 플로우 (문제)
```
GCS 저장된 캐릭터 이미지 (kami.png, dalgi.png)
          ↓
NANO BANANA에 "참조"로 전달
          ↓
NANO BANANA가 새 이미지 생성 ← ❌ 캐릭터가 달라질 수 있음!
          ↓
VEO가 새 이미지로 영상 생성
```

**문제:** NANO BANANA가 참조 이미지를 기반으로 새 이미지를 생성하지만, 캐릭터 일관성이 유지되지 않음. 특히 다른 캐릭터(예: dalgi)의 경우 완전히 다른 이미지가 생성됨.

### 새로운 플로우 (해결)
```
GCS 저장된 캐릭터 이미지 (kami.png, dalgi.png)
          ↓
useStoredImageForVeo: true 확인
          ↓
NANO BANANA 건너뜀 ✅
          ↓
저장된 이미지 직접 VEO로 전달 ✅
          ↓
VEO가 저장된 캐릭터 이미지 애니메이션
```

---

## 구현 내용

### 1. API 옵션 추가

**파일:** `src/server/api/consistent-shorts.ts`

```json
{
  "config": {
    "generateVideos": true,
    "useFrameInterpolation": true,
    "useStoredImageForVeo": true  // ⭐ NEW
  }
}
```

### 2. Workflow 수정

**파일:** `src/short-creator/workflows/ConsistentShortsWorkflow.ts`

#### 2.1 캐릭터 이미지 맵 추가
```typescript
// characterId → 이미지 데이터 매핑
const storedCharacterImageMap: Map<string, {
  data: Buffer;
  mimeType: string;
  description: string
}> = new Map();
```

#### 2.2 이미지 로드 시 맵에 저장
```typescript
storedCharacterImageMap.set(stored.characterId, {
  data: stored.data,
  mimeType: stored.mimeType,
  description: stored.description
});
```

#### 2.3 씬별 이미지 선택 로직 (다중 캐릭터 지원)
```typescript
// ⭐ 모든 캐릭터 이미지 가져오기
const sceneCharacterImages = this.getSceneCharacterImages(
  sceneCharacterIds || [],
  storedCharacterImageMap
);

// Decision Tree:
const shouldUseDirectStoredImage = useStoredImageForVeo && sceneCharacterImages.isSingleCharacter;
const shouldUseMultiCharacterReference = useStoredImageForVeo && sceneCharacterImages.isMultiCharacter;

if (shouldUseDirectStoredImage) {
  // 단일 캐릭터: 저장된 이미지 직접 VEO (NANO BANANA 건너뜀)
} else if (shouldUseMultiCharacterReference) {
  // 다중 캐릭터: NANO BANANA로 모든 캐릭터 이미지를 reference로 합성
} else {
  // 기존 플로우: NANO BANANA 생성
}
```

---

## API 사용법

### 요청 예시
```json
{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },
  "scenes": [
    {
      "text": "안녕 나는 까미야",
      "scenePrompt": "Black cat looking at camera",
      "characterIds": ["kami"]
    },
    {
      "text": "안녕 나는 딸기야",
      "scenePrompt": "White cat looking at camera",
      "characterIds": ["dalgi"]
    },
    {
      "text": "우리 둘이서 행복해",
      "scenePrompt": "Two cats together",
      "characterIds": ["kami", "dalgi"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useFrameInterpolation": true,
    "useStoredImageForVeo": true
  }
}
```

### 응답 예시
```json
{
  "videoId": "cmjianop000000es61xfdagmh",
  "mode": "consistent-shorts",
  "sceneCount": 3,
  "characterProfileId": "cat-couple",
  "characterIds": ["kami", "dalgi"],
  "generateVideos": true,
  "useFrameInterpolation": true,
  "useStoredImageForVeo": true,
  "veoMode": "VEO 3.1 (First+Last Frame)",
  "imageMode": "Stored Character Image → VEO"
}
```

---

## 로그 확인

`useStoredImageForVeo: true`가 정상 작동하면 다음 로그가 출력됩니다:

```
🎯 Using STORED character image directly for VEO (skipping NANO BANANA)
  - sceneIndex: 1
  - characterId: kami
  - imageSize: 2628260

🎯 Using STORED character image directly for VEO (skipping NANO BANANA)
  - sceneIndex: 2
  - characterId: dalgi
  - imageSize: 2663538
```

---

## 다중 캐릭터 씬 지원 (N개 캐릭터)

### 동작 방식

`characterIds: ["kami", "dalgi"]`처럼 여러 캐릭터가 지정된 경우, **모든 캐릭터 이미지를 NANO BANANA의 reference로 전달**하여 합성된 이미지를 생성합니다.

```
다중 캐릭터 씬 플로우:
┌─────────────────────────────────────────────────────────────┐
│  characterIds: ["kami", "dalgi"]                            │
│           ↓                                                 │
│  storedCharacterImageMap에서 모든 캐릭터 이미지 조회        │
│           ↓                                                 │
│  NANO BANANA에 reference 배열로 전달                        │
│  (kami.png, dalgi.png 모두 reference로 포함)                │
│           ↓                                                 │
│  합성된 이미지 생성 (두 캐릭터가 함께 등장)                 │
│           ↓                                                 │
│  VEO로 전달하여 영상 생성                                   │
└─────────────────────────────────────────────────────────────┘
```

### 헬퍼 함수

```typescript
// 씬별 캐릭터 이미지 조회 (N개 지원)
private getSceneCharacterImages(
  characterIds: string[],
  imageMap: Map<string, { data: Buffer; mimeType: string; description: string }>
): SceneCharacterImages {
  const images: CharacterImageInfo[] = [];
  for (const characterId of characterIds) {
    const imageData = imageMap.get(characterId);
    if (imageData) {
      images.push({ characterId, ...imageData });
    }
  }
  return {
    characterIds,
    images,
    isSingleCharacter: images.length === 1,
    isMultiCharacter: images.length > 1,
    characterCount: images.length
  };
}

// 다중 캐릭터 프롬프트 생성
private buildMultiCharacterPrompt(
  sceneCharacters: SceneCharacterImages,
  scenePrompt: string
): string {
  const descriptions = sceneCharacters.images
    .map(img => `[${img.characterId}]: ${img.description}`)
    .join('\n');

  return `Scene with ${sceneCharacters.characterCount} characters together:
${descriptions}

Scene: ${scenePrompt}

IMPORTANT: Show ALL ${sceneCharacters.characterCount} characters together.`;
}
```

### 다중 캐릭터 씬 로그

```
🎨 Using MULTI-CHARACTER reference mode for scene
  - sceneIndex: 3
  - characterCount: 2
  - characterIds: kami, dalgi
  - referenceImages: 2
```

### VEO API 제한사항

> **참고:** VEO API는 단일 firstFrame 이미지만 지원합니다.
> 따라서 다중 캐릭터 씬에서는 NANO BANANA를 통해 합성된 이미지를 생성한 후 VEO로 전달합니다.

---

## 옵션 비교

| 옵션 | 단일 캐릭터 씬 | 다중 캐릭터 씬 | 용도 |
|------|---------------|---------------|------|
| `useStoredImageForVeo: false` (기본) | NANO BANANA 새 이미지 생성 → VEO | NANO BANANA 새 이미지 생성 → VEO | 다양한 포즈/배경 원할 때 |
| `useStoredImageForVeo: true` | 저장된 이미지 직접 → VEO (NANO BANANA 건너뜀) | 모든 캐릭터 이미지를 reference로 NANO BANANA 합성 → VEO | 캐릭터 일관성 최우선일 때 |

---

## 테스트 결과

- **테스트 날짜:** 2025-12-23
- **Video ID:** `cmjianop000000es61xfdagmh`
- **YouTube URL:** https://www.youtube.com/watch?v=sml6qSTzfGY
- **결과:** 각 씬에서 저장된 캐릭터 이미지가 정확히 사용됨 ✅

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/server/api/consistent-shorts.ts` | API 엔드포인트, 옵션 파싱 |
| `src/short-creator/workflows/ConsistentShortsWorkflow.ts` | 핵심 로직 구현 (다중 캐릭터 헬퍼 함수 포함) |
| `src/character-store/CharacterStorageService.ts` | GCS 이미지 로드 |
| `src/types/shorts.ts` | 다중 캐릭터 타입 정의 (`SceneCharacterImages`, `CharacterImageInfo`) |
