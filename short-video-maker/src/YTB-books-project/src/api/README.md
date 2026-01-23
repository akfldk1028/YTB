# API - REST 엔드포인트

> Last Updated: 2026-01-23
> Status: **v2.1 Episode/Scene API 완료**

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
| `POST` | `/:bookId/analyze` | AI 분석 → ShortsPlan | ✅ |
| `POST` | `/:bookId/generate-video` | 비디오 생성 | 🔄 |
| `GET` | `/download/:videoId` | 비디오 다운로드 | 🔄 |

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

## 파이프라인 플로우

```
Episode → Scenes
    │
    ├── GhibliImageService
    │   └── Scene 0: GPT-4o → 마스터 이미지
    │   └── Scene 1+: NanoBanana + 레퍼런스 → 일관성 유지
    │
    ├── BooksVideoService
    │   └── GeminiTTS → 나레이션 오디오 (Kore voice)
    │   └── FFmpeg → 이미지 + 오디오 + 자막 합성
    │
    └── Neo4j 상태 업데이트
        └── approved → producing → completed
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
