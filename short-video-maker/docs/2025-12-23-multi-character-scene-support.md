# 다중 캐릭터 씬 지원 구현

**날짜:** 2025-12-23
**기능:** N개 캐릭터가 함께 등장하는 씬 지원
**테스트 결과:** ✅ 성공

---

## 배경

### 문제점
VEO API는 단일 `firstFrame` 이미지만 지원하므로, 다중 캐릭터 씬에서 모든 캐릭터가 처음부터 함께 등장하는 영상을 직접 생성할 수 없었음.

### 해결책
다중 캐릭터 씬에서는 **NANO BANANA에 모든 캐릭터 이미지를 reference로 전달**하여 합성된 이미지를 생성한 후 VEO로 전달.

---

## 처리 플로우

### Decision Tree

```
useStoredImageForVeo: true + 단일 캐릭터
  → 저장된 이미지 직접 VEO (NANO BANANA 건너뜀) ✅

useStoredImageForVeo: true + 다중 캐릭터
  → NANO BANANA (모든 캐릭터 이미지 reference) → VEO ✅

useStoredImageForVeo: false
  → 기존 플로우 (NANO BANANA 새 이미지 생성)
```

### 다중 캐릭터 씬 플로우

```
┌─────────────────────────────────────────────────────────────┐
│  characterIds: ["kami", "dalgi"]                            │
│           ↓                                                 │
│  storedCharacterImageMap에서 모든 캐릭터 이미지 조회        │
│  (kami.png: 2.6MB, dalgi.png: 2.7MB)                       │
│           ↓                                                 │
│  NANO BANANA에 reference 배열로 전달                        │
│           ↓                                                 │
│  합성된 이미지 생성 (두 캐릭터가 함께 등장)                 │
│           ↓                                                 │
│  VEO 3.1로 전달하여 영상 생성                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 구현 내용

### 1. 타입 정의 추가

**파일:** `src/types/shorts.ts`

```typescript
/** 개별 캐릭터 이미지 정보 */
export type CharacterImageInfo = {
  characterId: string;
  data: Buffer;
  mimeType: string;
  description: string;
};

/** 씬별 캐릭터 이미지 정보 (N개 캐릭터 지원) */
export type SceneCharacterImages = {
  characterIds: string[];
  images: CharacterImageInfo[];
  isSingleCharacter: boolean;
  isMultiCharacter: boolean;
  characterCount: number;
};
```

### 2. 헬퍼 함수 추가

**파일:** `src/short-creator/workflows/ConsistentShortsWorkflow.ts`

```typescript
// 씬별 캐릭터 이미지 조회 (N개 지원)
private getSceneCharacterImages(
  characterIds: string[],
  imageMap: Map<string, { data: Buffer; mimeType: string; description: string }>
): SceneCharacterImages

// 다중 캐릭터 프롬프트 생성
private buildMultiCharacterPrompt(
  sceneCharacters: SceneCharacterImages,
  scenePrompt: string,
  style?: string,
  mood?: string
): string
```

### 3. 씬 처리 로직 수정

```typescript
const sceneCharacterImages = this.getSceneCharacterImages(
  sceneCharacterIds || [],
  storedCharacterImageMap
);

const shouldUseDirectStoredImage = useStoredImageForVeo && sceneCharacterImages.isSingleCharacter;
const shouldUseMultiCharacterReference = useStoredImageForVeo && sceneCharacterImages.isMultiCharacter;

if (shouldUseDirectStoredImage) {
  // 단일 캐릭터: 저장된 이미지 직접 VEO
} else if (shouldUseMultiCharacterReference) {
  // 다중 캐릭터: NANO BANANA로 모든 캐릭터 이미지를 reference로 합성
  const referenceImages = sceneCharacterImages.images.map(img => ({
    data: img.data,
    mimeType: img.mimeType
  }));
  // ... NANO BANANA 호출
} else {
  // 기존 플로우
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
      "scenePrompt": "Black cat with golden eyes looking at camera",
      "characterIds": ["kami"]
    },
    {
      "text": "안녕 나는 딸기야",
      "scenePrompt": "White cat with blue eyes looking at camera",
      "characterIds": ["dalgi"]
    },
    {
      "text": "우리 둘이 함께 있으면 행복해",
      "scenePrompt": "Two cats cuddling together on a cozy blanket",
      "characterIds": ["kami", "dalgi"]
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useFrameInterpolation": true,
    "useStoredImageForVeo": true
  },
  "youtubeUpload": {
    "enabled": true,
    "channelName": "why_cat",
    "metadata": {
      "title": "까미와 딸기의 행복한 하루",
      "privacyStatus": "unlisted"
    }
  }
}
```

---

## 로그 출력

### 단일 캐릭터 씬
```
🎯 Using STORED single character image directly for VEO (skipping NANO BANANA)
  - sceneIndex: 1
  - characterId: kami
  - imageSize: 2628260
```

### 다중 캐릭터 씬
```
🎭 Multi-character scene: Using NANO BANANA with ALL character images as references
  - sceneIndex: 3
  - characterCount: 2
  - characterIds: ['kami', 'dalgi']
  - imageSizes: [2628260, 2663538]

✅ Multi-character combined image generated and saved
  - usedReferences: 2
```

---

## 테스트 결과

### 테스트 정보
- **테스트 날짜:** 2025-12-23
- **Video ID:** `cmjid0pso00000es66cu83cqt`
- **YouTube URL:** https://www.youtube.com/watch?v=jUYrO0QeDQI
- **프로필:** `cat-couple` (까미, 딸기)

### 씬별 처리 결과

| 씬 | characterIds | 처리 방식 | 결과 |
|---|-------------|----------|------|
| 1 | `["kami"]` | 저장된 이미지 직접 VEO | ✅ |
| 2 | `["dalgi"]` | 저장된 이미지 직접 VEO | ✅ |
| 3 | `["kami", "dalgi"]` | NANO BANANA (2개 reference) → VEO | ✅ |

---

## 옵션 비교

| 옵션 | 단일 캐릭터 씬 | 다중 캐릭터 씬 |
|------|---------------|---------------|
| `useStoredImageForVeo: false` | NANO BANANA 생성 → VEO | NANO BANANA 생성 → VEO |
| `useStoredImageForVeo: true` | 저장된 이미지 직접 → VEO | 모든 캐릭터 reference로 NANO BANANA 합성 → VEO |

---

## 관련 파일

| 파일 | 역할 |
|------|------|
| `src/types/shorts.ts` | `SceneCharacterImages`, `CharacterImageInfo` 타입 정의 |
| `src/short-creator/workflows/ConsistentShortsWorkflow.ts` | 다중 캐릭터 헬퍼 함수 및 처리 로직 |
| `src/server/api/consistent-shorts.ts` | API 엔드포인트 |

---

## 제한사항 및 참고

1. **VEO API 제한:** VEO는 단일 firstFrame만 지원하므로, 다중 캐릭터는 반드시 NANO BANANA로 합성 후 전달
2. **N개 캐릭터 지원:** 2개뿐 아니라 3개 이상의 캐릭터도 지원 (유연한 구조)
3. **캐릭터 순서:** `characterIds` 배열 순서대로 프롬프트에 포함됨
