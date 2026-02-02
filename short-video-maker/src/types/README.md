# Types

> 전역 타입 정의 모듈
> 프로젝트 전체에서 공유되는 TypeScript 타입

---

## 핵심 파일

| 파일 | 설명 |
|------|------|
| `shorts.ts` | Shorts 비디오 관련 핵심 타입 |

---

## 주요 타입 (shorts.ts)

### Scene
```typescript
interface Scene {
  text: string;           // 나레이션 텍스트
  scenePrompt?: string;   // 이미지 생성 프롬프트
  characterIds?: string[]; // 씬에 등장할 캐릭터
  duration?: number;      // 씬 길이 (초)
}
```

### ShortsConfig
```typescript
interface ShortsConfig {
  orientation?: 'portrait' | 'landscape';  // 9:16 or 16:9
  generateVideos?: boolean;                // VEO로 비디오 생성
  useFrameInterpolation?: boolean;         // VEO 3.1 보간
  language?: 'ko' | 'en';                  // TTS 언어
  ttsVoice?: string;                       // TTS 음성
  ttsGender?: 'female' | 'male';           // TTS 성별
}
```

### ConsistentShortsRequest
```typescript
interface ConsistentShortsRequest {
  characterReference: {
    profileId: string;
    characterIds?: string[];
  };
  scenes: Scene[];
  config?: ShortsConfig;
}
```

### VideoResult
```typescript
interface VideoResult {
  videoId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputPath?: string;
  gcsUrl?: string;
  duration?: number;
  error?: string;
}
```

---

## 사용 예시

```typescript
import { Scene, ShortsConfig, ConsistentShortsRequest } from '../types/shorts';

const request: ConsistentShortsRequest = {
  characterReference: {
    profileId: 'cat-couple',
    characterIds: ['kami', 'dalgi']
  },
  scenes: [
    {
      text: '까미가 창문을 바라본다',
      scenePrompt: 'Black cat looking out window',
      characterIds: ['kami']
    }
  ],
  config: {
    orientation: 'portrait',
    language: 'ko'
  }
};
```

---

## 다른 모듈의 타입

각 모듈은 자체 types 폴더를 가짐:

| 모듈 | 타입 파일 |
|------|----------|
| character-store | `character-store/types.ts` |
| image-generation | `image-generation/types/` |
| youtube-upload | `youtube-upload/types/` |
| YTB-books-project | `YTB-books-project/src/types/` |
| YTB-news-project | `YTB-news-project/types/` |
