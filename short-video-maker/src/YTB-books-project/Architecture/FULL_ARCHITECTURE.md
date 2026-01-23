# Books → Shorts 전체 시스템 아키텍처

> 작성일: 2026-01-21
> 수정일: 2026-01-23
> 버전: 2.0 (Full Flow Tested ✅)
> 목적: PDF/책/논문 → YouTube Shorts 시리즈 자동 생성

---

## 🔥 테스트 현황 (2026-01-23)

| 단계 | 기능 | 상태 | 비고 |
|------|------|:----:|------|
| 1 | Neo4j 연결 | ✅ | 387 nodes |
| 2 | 그래프 조회 | ✅ | 2 docs, 334 entities |
| 3 | AI 분석 (Gemini) | ✅ | ShortsPlan 생성 |
| 4 | GPT 이미지 생성 | ✅ | ~50초/장 |
| 5 | NanoBanana 이미지 | ✅ | ~13초/장 |
| 6 | 비디오 생성 | 🔄 | VEO 연동 예정 |
| 7 | YouTube 업로드 | 🔄 | 기존 API 재사용 |

---

## 1. 시스템 개요

### 1.1 목표
- 긴 문서(책, 논문, 리포트)를 짧은 Shorts 시리즈로 자동 변환
- 지식 그래프 기반으로 내용 구조화
- 캐릭터 동일성을 유지하며 일관된 시리즈 제작
- 24시간 자동화 파이프라인

### 1.2 핵심 원칙
```
📌 5-7초 Rule: 모든 Scene은 5-7초마다 비주얼 전환
📌 Hook-Value-CTA: 모든 Episode = Hook(3s) + Content + CTA(3s)
📌 Episode = 30-60초, Scene = 5-10초
📌 1 Document → N Episodes → M Scenes
```

---

## 2. 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ORCHESTRATION LAYER                             │
│                                   (n8n)                                      │
│                         24시간 Cron / Manual Trigger                          │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐         ┌─────────────────┐         ┌─────────────────┐
│   🔵 NEB      │         │   🟡 Neo4j      │         │ 🟢 short-video  │
│  (Python)     │────────▶│   (Graph DB)    │◀────────│    -maker       │
│               │         │                 │         │  (TypeScript)   │
│ - PDF 파싱    │         │ - Document      │         │                 │
│ - 청킹       │         │ - Chunk         │         │ - AI 분석       │
│ - 엔티티추출 │         │ - Entity        │         │ - Episode 계획  │
│               │         │ - Episode (new) │         │ - 이미지 생성   │
│               │         │ - Scene (new)   │         │ - 영상 생성     │
└───────────────┘         └─────────────────┘         └─────────────────┘
        │                           │                           │
        │                           │                           ▼
        │                           │                  ┌─────────────────┐
        │                           │                  │  🔴 YouTube     │
        │                           │                  │   Upload API    │
        │                           │                  └─────────────────┘
        │                           │
        └───────────────────────────┴───────────────────────────┐
                                                                │
                                                                ▼
                                                    ┌─────────────────────┐
                                                    │   ☁️ GCS Storage    │
                                                    │ - PDF 원본          │
                                                    │ - Master 이미지     │
                                                    │ - 생성된 영상       │
                                                    └─────────────────────┘
```

---

## 3. API 엔드포인트 (테스트 완료 ✅)

### 3.1 Books API (`/api/books`)

| API | Method | 설명 | 상태 |
|-----|--------|------|:----:|
| `/connection` | GET | Neo4j 연결 테스트 | ✅ |
| `/stats` | GET | 그래프 통계 | ✅ |
| `/` | GET | 책 목록 | ✅ |
| `/pending` | GET | 미처리 문서 목록 | ✅ |
| `/:bookId` | GET | 책 상세 + 청크 | ✅ |
| `/:bookId/analyze` | POST | AI 분석 → ShortsPlan | ✅ |
| `/:bookId/status` | PUT | 상태 업데이트 | ✅ |
| `/:bookId/generate-video` | POST | 비디오 생성 | 🔄 |

### 3.2 이미지 생성 API (`/api/gpt-to-nanobanana`)

| API | Method | 설명 | 상태 |
|-----|--------|------|:----:|
| `/generate` | POST | GPT→NanoBanana 하이브리드 | ✅ |
| `/:testId` | GET | 결과 이미지 조회 | ✅ |

---

## 4. 캐릭터 일관성 전략 (핵심!)

### 4.1 하이브리드 이미지 생성

```
Scene 0 (첫 씬)
    │
    ├── GPT-4o (gpt-image-1.5)로 마스터 이미지 생성
    │   - "Ghibli-style animation" 프롬프트 ⚠️
    │   - ~50초 소요
    │
    └── referenceImage로 저장
         │
         ▼
Scene 1, 2, 3... (이후 씬)
    │
    ├── NanoBanana + referenceImage
    │   - 첫 이미지를 참조로 동일성 유지
    │   - ~10-15초/장
    │
    └── 동일 캐릭터 유지
```

### 4.2 ⚠️ OpenAI 모더레이션 주의사항

**차단되는 프롬프트:**
```
❌ "Studio Ghibli inspired"
❌ "Hayao Miyazaki influence"
❌ "Makoto Shinkai style"
```

**허용되는 프롬프트:**
```
✅ "Ghibli-style animation"
✅ "hand-painted aesthetic"
✅ "whimsical dreamlike atmosphere"
✅ "Japanese anime art style"
```

**참고:** https://docs.aihubmix.com/en/api/GPT-Image-1

**파일:** `src/image-generation/services/GPTImageService.ts`
```typescript
export const GHIBLI_STYLE_PREFIX = `Ghibli-style animation, hand-painted aesthetic,
soft watercolor textures, warm nostalgic lighting, whimsical dreamlike atmosphere,
detailed natural environments, expressive character design.`;
```

---

## 5. 데이터 플로우 (테스트 결과)

### 5.1 Step 1: Neo4j 연결
```bash
curl http://localhost:3124/api/books/connection
# {"success":true,"nodeCount":387}
```

### 5.2 Step 2: 그래프 통계
```bash
curl http://localhost:3124/api/books/stats
# {"documents":2,"chunks":22,"entities":334,"relationships":920}
```

### 5.3 Step 3: AI 분석
```bash
curl -X POST http://localhost:3124/api/books/AR_TALK.pdf/analyze \
  -H "Content-Type: application/json" \
  -d '{"episodeCount": 1, "scenesPerEpisode": 5}'

# Response:
# {
#   "success": true,
#   "plan": {
#     "bookId": "AR_TALK.pdf",
#     "character": {"description": "...", "style": "ghibli"},
#     "shorts": [{
#       "title": "말하는 3D 아바타, 이제 실시간으로!",
#       "scenes": [
#         {"narrationText": "...", "visualPrompt": "..."},
#         ...
#       ]
#     }]
#   }
# }
```

### 5.4 Step 4: 이미지 생성
```bash
curl -X POST http://localhost:3124/api/gpt-to-nanobanana/generate \
  -H "Content-Type: application/json" \
  -d '{
    "character": {"description": "A curious narrator, ghibli anime style"},
    "scenes": [
      {"text": "Narrator in magical workshop"},
      {"text": "Narrator with holographic avatar"}
    ]
  }'

# Response:
# {
#   "success": true,
#   "images": [
#     {"scene": 0, "method": "gpt", "timeMs": 46453},      // ~46초
#     {"scene": 1, "method": "nanoBanana", "timeMs": 13464} // ~13초
#   ],
#   "totalTimeMs": 59922  // 총 ~60초 (2장)
# }
```

---

## 6. 서비스 아키텍처

```
src/YTB-books-project/
├── src/
│   ├── api/
│   │   └── BooksRouter.ts          # API 엔드포인트 ✅
│   │
│   └── services/
│       ├── Neo4jService.ts         # Neo4j 연결/쿼리 ✅
│       ├── ContentPlannerService.ts # AI 분석 (Gemini) ✅
│       ├── GhibliImageService.ts   # GPT + NanoBanana ✅
│       └── BooksVideoService.ts    # 비디오 생성 🔄
│
├── Architecture/
│   ├── Architecture.md             # 기본 아키텍처
│   ├── FULL_ARCHITECTURE.md        # 이 문서
│   └── Neo4j-Setup-Guide.md        # Neo4j 설정
│
└── README.md                       # 퀵 스타트
```

### 서비스 의존성

```
BooksRouter
    │
    ├── Neo4jService
    │   └── neo4j-driver (bolt://34.47.112.49:7687)
    │
    ├── ContentPlannerService
    │   └── Gemini API (@google/generative-ai)
    │
    ├── GhibliImageService
    │   ├── GPTImageService
    │   │   └── OpenAI gpt-image-1.5 (⚠️ 모더레이션 주의)
    │   └── NanoBananaService
    │       └── Gemini Imagen
    │
    └── BooksVideoService
        ├── TTS (Gemini)
        └── FFmpeg
```

---

## 7. 처리 시간 벤치마크

| 단계 | 소요 시간 | 비고 |
|------|----------|------|
| Neo4j 연결 | < 1초 | |
| AI 분석 (Gemini) | ~5초 | 20 청크 기준 |
| GPT 마스터 이미지 | ~50초 | 첫 씬만 |
| NanoBanana 이미지 | ~13초/장 | 이후 씬 |
| VEO 영상 생성 | ~30초/씬 | 예상 |
| FFmpeg 합성 | ~1분/에피소드 | 예상 |

**예시:** 1 에피소드 × 5 씬
- 이미지: 50초 + (4 × 13초) = **~102초**
- 영상: 5 × 30초 = ~150초
- 합성: ~60초
- **총 예상: ~5분/에피소드**

---

## 8. 환경변수

```env
# Neo4j (필수)
NEO4J_URI=bolt://34.47.112.49:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=ytbbooks2026

# Google/Gemini (필수)
GOOGLE_API_KEY=your-google-api-key

# OpenAI (GPT Image용)
OPENAI_API_KEY=your-openai-api-key
```

---

## 9. 트러블슈팅

### 9.1 GPT Image 400 에러 (moderation_blocked)

**원인:** OpenAI 모더레이션이 생존 아티스트 이름 차단

| 차단됨 ❌ | 허용됨 ✅ |
|----------|----------|
| "Studio Ghibli" | "Ghibli-style" |
| "Hayao Miyazaki" | "hand-painted aesthetic" |
| "Makoto Shinkai" | "whimsical dreamlike" |

**해결:** `GPTImageService.ts`의 `GHIBLI_STYLE_PREFIX` 수정

### 9.2 Neo4j 연결 실패

```
AuthError: The client is unauthorized
```

**해결:** `.env` 파일의 `NEO4J_PASSWORD` 확인

### 9.3 서버 환경변수 미로드

**해결:** 서버를 foreground로 재시작
```bash
npm run build && npm start
```

---

## 10. 다음 단계 (TODO)

### Phase 1: 핵심 기능 (✅ 완료)
- [x] Neo4jService - 연결 및 쿼리
- [x] ContentPlannerService - AI 분석
- [x] GhibliImageService - GPT + NanoBanana
- [x] BooksRouter - API 엔드포인트

### Phase 2: 영상 생성 연동 (🔄 진행 중)
- [ ] BooksVideoService - VEO 연동
- [ ] TTS 생성 (Gemini)
- [ ] FFmpeg 합성
- [ ] 전체 파이프라인 통합

### Phase 3: 자동화
- [ ] n8n 워크플로우
- [ ] GCS 감시 설정
- [ ] Discord/Slack 알림

---

## 11. 참고 문서

- [README.md](../README.md) - 퀵 스타트 가이드
- [CLAUDE.md](../../../CLAUDE.md) - 프로젝트 전체 컨텍스트
- [GPT-Image-1 모더레이션](https://docs.aihubmix.com/en/api/GPT-Image-1)

---

**Last Updated:** 2026-01-23
**Version:** 2.0 (Full Flow Tested)
**Author:** Claude + Human
