# Types - 타입 정의

> Last Updated: 2026-02-03
> Status: **v3.4.1** (Scene assignedFormula/formulaName/formulaMetaphor + DocumentVideoConfig)

---

## 구현 현황

| 파일 | 상태 | 설명 |
|------|:----:|------|
| `index.ts` | ✅ | 전체 타입 정의 (Episode/Scene 포함) |

---

## 타입 목록

### 기본 타입
| 타입 | 설명 |
|------|------|
| `BookChunk` | Neo4j 청크 정보 |
| `BookMetadata` | 책 메타데이터 |
| `ShortsStatus` | Shorts 생성 상태 |
| `ShortsGenerationConfig` | 생성 설정 |
| `GhibliScene` | 지브리 스타일 씬 |

### ContentType (v3.0.0 신규)
| 타입 | 설명 |
|------|------|
| `ContentType` | `'math_science' \| 'humanities' \| 'social_science' \| 'auto'` - 문서 분야 분류 |

### Episode/Scene 타입 (v2.0 신규)
| 타입 | 설명 |
|------|------|
| `Episode` | 에피소드 노드 (1 Shorts = 1 Episode) |
| `Scene` | 씬 노드 (5-10초 단위) |
| `EpisodeStatus` | `draft` \| `approved` \| `producing` \| `completed` \| `uploaded` |
| `SceneType` | `hook` \| `intro` \| `problem` \| ... |
| `VisualType` | `text_overlay` \| `animation` \| ... |
| `CameraType` | `wide` \| `close_up` \| ... |
| `TransitionType` | `cut` \| `fade` \| ... |
| `CreateEpisodeInput` | Episode 생성 입력 |
| `CreateSceneInput` | Scene 생성 입력 (v3.3.0: assignedFormula/formulaName/formulaMetaphor) |
| `EpisodeWithScenes` | Episode + Scenes 조합 |
| `DocumentSeries` | Document의 전체 시리즈 |

---

## Episode 타입 상세

```typescript
interface Episode {
  id: string;
  documentId: string;
  episodeNumber: number;
  title: string;
  hook: string;
  cta: string;
  ctaAction: 'subscribe' | 'next_episode' | 'like' | 'comment';
  durationSec: number;
  sceneCount: number;
  keywords: string[];
  hashtags: string[];
  status: EpisodeStatus;

  // 시리즈 연결
  previousEpisodeId?: string;
  nextEpisodeId?: string;

  // 생성 결과
  masterImagePath?: string;
  videoPath?: string;
  youtubeId?: string;
}
```

## Scene 타입 상세

```typescript
interface Scene {
  id: string;
  episodeId: string;
  sceneNumber: number;
  type: SceneType;
  narration: string;
  onScreenText?: string;
  durationSec: number;
  visualType: VisualType;
  visualDesc: string;
  camera: CameraType;
  transition: TransitionType;

  // 참조
  sourceChunkIds?: string[];
  mentionedEntities?: string[];

  // 생성 결과
  imagePath?: string;
  audioPath?: string;
  clipPath?: string;
}
```

---

## 관련 파일

- [../services/Neo4jService.ts](../services/Neo4jService.ts) - 타입 사용처
- [../services/ContentPlannerService.ts](../services/ContentPlannerService.ts) - ShortsPlan 타입
