# Services - 비즈니스 로직 계층

> Last Updated: 2026-01-23
> Status: **Phase 1 완료, Phase 2 진행 중**

---

## 구현 현황

| 서비스 | 파일 | 상태 | 설명 |
|--------|------|:----:|------|
| Neo4jService | `Neo4jService.ts` | ✅ | Neo4j 연결/쿼리 + Episode/Scene CRUD |
| ContentPlannerService | `ContentPlannerService.ts` | ✅ | AI 분석 (Gemini) → ShortsPlan |
| GhibliImageService | `GhibliImageService.ts` | ✅ | GPT + NanoBanana 하이브리드 이미지 |
| BooksVideoService | `BooksVideoService.ts` | 🔄 | TTS + FFmpeg 비디오 생성 |

---

## 서비스 의존성

```
BooksRouter (API)
    │
    ├── Neo4jService
    │   └── neo4j-driver (bolt://34.47.112.49:7687)
    │
    ├── ContentPlannerService
    │   └── Gemini API (@google/generative-ai)
    │
    ├── GhibliImageService
    │   ├── GPTImageService (OpenAI gpt-image-1.5)
    │   └── NanoBananaService (Gemini Imagen)
    │
    └── BooksVideoService
        ├── GeminiTTS
        └── FFmpeg
```

---

## Neo4jService (v2.0)

### 기본 메서드
- `testConnection()` - 연결 테스트
- `getBooks()` - 책 목록 조회
- `getChunks(bookId)` - 청크 조회
- `getGraphStats()` - 통계 조회

### Shorts 상태 관리
- `getUnprocessedDocuments()` - 미처리 문서 조회
- `updateDocumentShortsStatus()` - 상태 업데이트
- `savePlan()` / `getPlan()` - ShortsPlan JSON 저장/조회

### Episode/Scene CRUD (신규 v2.0)
```typescript
// Episode 생성 (Document와 연결, 이전 Episode와 NEXT 관계)
createEpisode(input: CreateEpisodeInput): Promise<Episode>

// Scene 생성 (Episode와 연결, Chunk와 BASED_ON 관계)
createScene(input: CreateSceneInput): Promise<Scene>

// 조회
getEpisode(episodeId): Promise<Episode | null>
getEpisodeWithScenes(episodeId): Promise<EpisodeWithScenes | null>
getDocumentEpisodes(documentId): Promise<Episode[]>
getDocumentSeries(documentId): Promise<DocumentSeries | null>
getLastEpisodeNumber(documentId): Promise<number>

// 상태 업데이트
updateEpisodeStatus(episodeId, status, metadata?)
updateSceneAssets(sceneId, { imagePath, audioPath, clipPath })

// 자동화용
getNextPendingEpisode(documentId?): Promise<Episode | null>
getEpisodeStats(): Promise<{...}>
```

---

## ContentPlannerService

AI (Gemini)를 사용해 청크를 분석하고 ShortsPlan 생성

### 주요 메서드
```typescript
analyzeAndPlan(options: PlanningOptions): Promise<ShortsPlan>
```

### 출력: ShortsPlan
```typescript
{
  bookId: string;
  totalShorts: number;
  character: { description, style };
  shorts: [{
    shortIndex: number;
    title: string;
    hook: string;
    scenes: [{
      sceneIndex: number;
      sceneType: 'hook' | 'intro' | 'problem' | ...;
      narrationText: string;
      visualPrompt: string;
      durationHint: number;
      sourceChunkIds: string[];
    }]
  }]
}
```

---

## GhibliImageService

하이브리드 이미지 생성 (캐릭터 일관성)

### 전략
```
Scene 0 → GPT-4o로 마스터 이미지 (~50초)
Scene 1+ → NanoBanana + referenceImage (~10초/장)
```

### 주요 메서드
```typescript
generateScenesImages(options: {
  character: { description, style };
  scenes: Array<{ text, visualPrompt }>;
}): Promise<SceneImageResult[]>
```

---

## BooksVideoService (🔄 진행 중)

TTS + FFmpeg로 최종 비디오 생성

### 주요 메서드
```typescript
createShortVideo(input: {
  shortPlan: ShortPlan;
  imagePaths: string[];
}): Promise<BooksVideoResult>
```

---

## 다음 단계

- [ ] BooksVideoService VEO 연동
- [ ] Episode/Scene → Video 파이프라인 통합
- [ ] n8n 워크플로우 연동

---

## 관련 파일

- [../types/index.ts](../types/index.ts) - 타입 정의
- [../api/BooksRouter.ts](../api/BooksRouter.ts) - API 라우트
- [../../Architecture/FULL_ARCHITECTURE.md](../../Architecture/FULL_ARCHITECTURE.md) - 전체 아키텍처
