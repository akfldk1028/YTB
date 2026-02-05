# API - REST 엔드포인트

> Last Updated: 2026-02-03
> Status: **v3.4.1 MathJax SVG fill + 씬간 텀 축소 + FFmpeg 인코딩 최적화** ✅
>
> **v3.4.1 변경**: FFmpeg 인코딩 옵션 추가 (`-preset ultrafast -crf 23` → 500MB+ → ~10MB), MathJax `fill="currentColor"` → `fill="white"` 대체, 씬간 텀 0.15초 → 0.05초

---

## 구현 현황

| 파일 | 상태 | 설명 |
|------|:----:|------|
| `BooksRouter.ts` | ✅ | Books API + Episode/Scene API |

---

## API 엔드포인트

Base URL: `http://localhost:3124/api/books`

### 연결 및 상태
| Method | Endpoint | 설명 | 상태 |
|--------|----------|------|:----:|
| `GET` | `/connection` | Neo4j 연결 테스트 | ✅ |
| `GET` | `/stats` | 그래프 통계 | ✅ |
| `GET` | `/` | 책 목록 | ✅ |
| `GET` | `/pending` | 미처리 문서 | ✅ |

### 책 데이터
| Method | Endpoint | 설명 | 상태 |
|--------|----------|------|:----:|
| `GET` | `/:bookId` | 책 상세 + 청크 | ✅ |
| `GET` | `/:bookId/chunks` | 청크 목록만 | ✅ |
| `POST` | `/search` | 유사 청크 검색 | ✅ |

### AI 분석 및 Shorts 생성
| Method | Endpoint | 설명 | 상태 |
|--------|----------|------|:----:|
| `POST` | `/:bookId/curriculum` | **🆕 순차적 커리큘럼 (권장)** | ✅ v2.5.0 |
| `POST` | `/:bookId/entities` | 엔티티 기반 (독립적) | ✅ |
| `POST` | `/:bookId/analyze` | AI 분석 → ShortsPlan | ✅ |
| `POST` | `/:bookId/generate-video` | 비디오 생성 | ✅ |
| `GET` | `/download/:videoId` | 비디오 다운로드 | ✅ |

### Episode/Scene (v2.1 ✅)
| Method | Endpoint | 설명 | 상태 |
|--------|----------|------|:----:|
| `GET` | `/:bookId/series` | 시리즈 전체 조회 | ✅ |
| `GET` | `/:bookId/episodes` | 에피소드 목록 | ✅ |
| `POST` | `/:bookId/episodes` | 에피소드 생성 (Plan→자동) | ✅ |
| `GET` | `/episodes/stats` | Episode/Scene 통계 | ✅ |
| `GET` | `/episodes/pending` | 다음 처리할 Episode | ✅ |
| `GET` | `/episodes/:episodeId` | 에피소드 상세 | ✅ |
| `PUT` | `/episodes/:episodeId/status` | 상태 업데이트 | ✅ |

### Phase 3: 비디오 생성 (v2.2 신규 ✅)
| Method | Endpoint | 설명 | 상태 |
|--------|----------|------|:----:|
| `POST` | `/episodes/:episodeId/generate-video` | Episode → 비디오 생성 | ✅ |
| `POST` | `/episodes/:episodeId/generate-images` | Episode → 이미지만 생성 | ✅ |

### 상태 관리
| Method | Endpoint | 설명 | 상태 |
|--------|----------|------|:----:|
| `PUT` | `/:bookId/status` | 상태 업데이트 | ✅ |

---

## 요청/응답 예시

### AI 분석
```bash
curl -X POST http://localhost:3124/api/books/AR_TALK.pdf/analyze \
  -H "Content-Type: application/json" \
  -d '{"episodeCount": 1, "scenesPerEpisode": 5}'
```

**Response:**
```json
{
  "success": true,
  "plan": {
    "bookId": "AR_TALK.pdf",
    "totalShorts": 1,
    "character": {
      "description": "A friendly narrator...",
      "style": "ghibli"
    },
    "shorts": [{
      "title": "말하는 3D 아바타!",
      "hook": "AI가 얼굴을 움직인다면?",
      "scenes": [...]
    }]
  }
}
```

---

## Phase 3: 비디오 생성 예시

### Episode 비디오 생성 (이미지 + TTS + FFmpeg)
```bash
curl -X POST http://localhost:3124/api/books/episodes/{episodeId}/generate-video \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "orientation": "portrait",
      "ttsVoice": "Kore",
      "mood": "whimsical",
      "timeOfDay": "day"
    }
  }'
```

**응답:**
```json
{
  "success": true,
  "episodeId": "ep_xxx",
  "videoId": "video_xxx",
  "videoPath": "/path/to/video.mp4",
  "duration": 45.5,
  "message": "Episode video generated successfully"
}
```

### Episode 이미지만 생성 (비디오 제외)
```bash
curl -X POST http://localhost:3124/api/books/episodes/{episodeId}/generate-images \
  -H "Content-Type: application/json" \
  -d '{
    "config": {
      "orientation": "portrait",
      "mood": "whimsical"
    }
  }'
```

---

## v3.4.1 변경사항 (2026-02-03)

### 1. FFmpeg 인코딩 최적화 ⭐ 핵심
- **문제**: VideoEditor의 여러 함수에서 `-preset`, `-crf` 옵션 누락 → 60초 영상이 500MB+ 출력
- **해결**: 모든 비디오 생성 함수에 `-preset ultrafast -crf 23 -pix_fmt yuv420p` 추가
- **적용 함수**: `combineVideoWithAudioAndCaptions`, `createStaticVideoFromImage`, `createStaticVideoWithFormulaOverlay`, `createVideoWithFormulaOverlayPng`
- **효과**: 500MB+ → ~10MB, 인코딩 30분+ → 2-3분

### 2. MathJax SVG fill 수정 (MathFormulaService.ts)
- **문제**: MathJax가 `fill="currentColor"` 속성을 이미 포함 → 기존 `<g fill="white">` 추가 방식은 XML 에러
- **해결**: `fill="currentColor"` → `fill="white"` 대체
- **효과**: β, ψ, θ 등 그리스 문자가 PNG로 정상 렌더링

### 3. 씬간 텀 축소 (AudioProcessor.ts, BooksVideoService.ts)
- PCM 무음 패딩: 0.15초 → 0.05초
- 크로스페이드: 0.15초 → 0.05초
- **효과**: 자연스러운 씬 전환

---

## v3.0.0 변경사항

### Neo4j contentType 아키텍처
`/curriculum` API 호출 시 문서 분야를 자동 판별하여 Neo4j에 캐싱:

```
/curriculum 호출 → Neo4j 캐시 확인 → (없으면) AI 판별 → Neo4j 저장 → ContentPlanner에 전달
```

- 응답에 `contentType` 필드 추가 (`'math_science' | 'humanities' | 'social_science'`)
- `ContentType` import from ContentPlannerService
- `getContentPlannerService({ contentType })` 옵션 추가

### BOOKS_PROJECT_CONFIG 도입
BooksRouter에서 `BOOKS_PROJECT_CONFIG`를 import하여 비디오 생성 시 프로젝트별 설정(orientation, language, subtitleYPosition, enableMathFormulas, reuseImageForSameType)을 일괄 적용.

### generateSceneImages() 헬퍼 메서드
기존 3곳에 중복되던 이미지 생성 루프를 `generateSceneImages()` 헬퍼로 추출:

```typescript
// BooksRouter.ts 내부 헬퍼
async function generateSceneImages(scenes, ghibliService, config) {
  // streak-limited reuse: 연속 동일 sceneType은 이미지 재사용 (streak=1 제한)
  // streak > 1이면 새 이미지 생성
}
```

- **streak-limited reuse**: 연속 동일 `sceneType`인 씬은 이전 이미지를 재사용하되, streak=1까지만 허용
- 코드 중복 제거 (3곳 -> 1곳)

---

## 파이프라인 플로우

```
Episode → Scenes
    │
    ├── generateSceneImages() (v2.9.1 헬퍼)
    │   ├── GhibliImageService
    │   │   └── Scene 0: GPT-4o → 마스터 이미지
    │   │   └── Scene 1+: NanoBanana + 레퍼런스 → 일관성 유지
    │   └── streak-limited reuse (동일 sceneType → 이미지 재사용, streak=1)
    │
    ├── BooksVideoService (BOOKS_PROJECT_CONFIG 적용)
    │   └── GeminiTTS → 나레이션 오디오 (Kore voice)
    │   └── FFmpeg → 이미지 + 오디오 + 자막 합성 (subtitleY: h*0.88)
    │
    └── Neo4j 상태 업데이트
        └── approved → producing → completed
```

---

## 테스트 결과 (2026-01-24)

### AR_TALK.pdf 비디오 생성 성공
| 항목 | 결과 |
|------|------|
| 테스트 문서 | AR_TALK.pdf |
| 총 에피소드 | 19개 생성, 9개 완료 |
| 총 용량 | 74MB (9개 영상) |
| 해상도 | 1080x1920 (Portrait) |
| TTS | Gemini Kore (한국어) |
| 이미지 | GPT(1장) + NanoBanana(7장/에피소드) |

### v2.9.1 변경사항
| 변경 | 설명 |
|------|------|
| BOOKS_PROJECT_CONFIG import | 프로젝트별 중앙 설정 적용 |
| generateSceneImages() 헬퍼 | 3곳 중복 루프 → 1개 헬퍼 추출 |
| streak-limited reuse | 연속 동일 sceneType 이미지 재사용 (streak=1) |

### v2.5.0 수정사항
| 문제 | 해결 |
|------|------|
| Episode 생성 후 "not found" | `createEpisodeWithScenes()` 단일 트랜잭션 |
| TTS 400 에러 (명령 오해) | 프롬프트 프리픽스 추가 |

### 테스트 커맨드
```bash
# 이미지 생성
curl -X POST "http://localhost:3124/api/books/episodes/ep_short_0_zoh96/generate-images" \
  -H "Content-Type: application/json" \
  -d '{"config":{"orientation":"portrait"}}'
# 결과: 8/8 이미지 생성 성공

# 비디오 생성 (기존 이미지 사용)
curl -X POST "http://localhost:3124/api/books/AR_TALK.pdf/generate-video" \
  -H "Content-Type: application/json" \
  -d '{"imagePaths":["...8개_이미지_경로..."],"shortPlan":{...}}'
# 결과: 54초 비디오 생성 성공
```

---

## 다음 단계

- [x] Episode/Scene API 엔드포인트 추가
- [x] 시리즈 연속성 API 구현
- [x] Phase 3: Episode → Video 생성 파이프라인
- [ ] n8n 웹훅 연동 (Phase 4)

---

## 관련 파일

- [../services/README.md](../services/README.md) - 서비스 계층
- [../types/index.ts](../types/index.ts) - 타입 정의
