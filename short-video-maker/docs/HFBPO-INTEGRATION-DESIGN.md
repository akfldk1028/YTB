# HFBPO Integration Design

## Overview

HFBPO (Human-Feedback-Driven Bandit Prompt Optimization) 시스템을 short-video-maker와 통합하는 설계 문서.

```
┌─────────────────────────────────────────────────────────────────┐
│                        N8N (오케스트레이터)                       │
│  - 스케줄링 (10:00 생성, 18:00 보상)                             │
│  - 워크플로우 관리                                                │
└─────────────┬───────────────────────────────┬───────────────────┘
              │                               │
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│   HFBPO (프롬프트 두뇌)   │     │  ShortVideoMaker (비디오 실행)   │
│                         │     │                                 │
│  - Thompson Sampling    │     │  - VEO3 영상 생성                │
│  - 프롬프트 최적화        │     │  - YouTube 업로드               │
│  - 보상 학습             │     │  - Google Sheets 기록           │
│                         │     │                                 │
│  Port: 8888             │     │  Port: 8080                     │
│  asia-northeast3        │     │  us-central1                    │
└─────────────────────────┘     └─────────────────────────────────┘
```

## Endpoints

### HFBPO API (hfbpo-api-7qtnitbuvq-du.a.run.app)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/generate` | POST | topic → prompt + combination_key |
| `/reward` | POST | combination_key + reward → Thompson Sampling update |
| `/batch-reward` | POST | 다중 보상 업데이트 |
| `/calculate-reward` | POST | YouTube Analytics → reward 변환 |
| `/stats` | GET | 밴딧 통계 |

### ShortVideoMaker API (short-video-maker-7qtnitbuvq-uc.a.run.app)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/video/consistent-shorts` | POST | 영상 생성 (combination_key 수신) |
| `/api/sheet/videos` | GET | 비디오 목록 (보상 미전송 필터) |
| `/api/analytics/video/:videoId` | GET | YouTube Analytics 조회 |

---

## Phase 1: YTB-sheet 확장

### 추가할 필드

| Field | Type | Description |
|-------|------|-------------|
| `combinationKey` | string | HFBPO 조합 키 (place\|verb\|scenario) |
| `rewardSent` | boolean | HFBPO 보상 전송 여부 |
| `rewardSentAt` | string | 보상 전송 시간 (ISO 8601) |

### types/index.ts 수정

```typescript
export interface VideoGenerationRecord {
  // ... existing fields ...

  // HFBPO 연동 필드
  combinationKey?: string;      // HFBPO combination key (place|verb|scenario)
  rewardSent?: boolean;         // Whether reward was sent to HFBPO
  rewardSentAt?: string;        // When reward was sent (ISO 8601)
}

export const SHEET_HEADERS = [
  // ... existing headers ...
  'combinationKey',
  'rewardSent',
  'rewardSentAt',
];
```

---

## Phase 2: consistent-shorts API 수정

### 요청 스키마 확장

```typescript
interface ConsistentShortsRequest {
  scenes: Scene[];
  config: RenderConfig;
  youtubeUpload?: YouTubeUploadConfig;

  // HFBPO 연동
  hfbpo?: {
    combinationKey: string;     // HFBPO에서 생성된 조합 키
    prompt?: string;            // 원본 프롬프트 (디버깅용)
    estimatedReward?: number;   // 예상 보상값
  };
}
```

### 데이터 흐름

```
N8N → HFBPO /generate
        │
        ├── prompt: "A breathtaking night at Han River..."
        ├── combination_key: "han_river|zoom|romantic"
        └── estimated_reward: 0.72
        │
        ▼
N8N → ShortVideoMaker /api/video/consistent-shorts
        │
        ├── scenes: [...]
        ├── config: {...}
        └── hfbpo: {
              combinationKey: "han_river|zoom|romantic",
              prompt: "A breathtaking night...",
              estimatedReward: 0.72
            }
        │
        ▼
ShortVideoMaker → Google Sheets
        │
        └── combinationKey: "han_river|zoom|romantic"
```

---

## Phase 3: 보상 전송 API

### GET /api/sheet/videos (확장)

```typescript
// 쿼리 파라미터
{
  rewardSent?: 'true' | 'false';  // 보상 전송 여부 필터
  minAge?: string;                 // 최소 경과 시간 (예: '6h', '1d')
  maxResults?: number;             // 최대 결과 수
}

// 응답 예시
{
  "videos": [
    {
      "videoId": "abc123",
      "combinationKey": "han_river|zoom|romantic",
      "createdAt": "2025-01-08T10:00:00Z",
      "youtubeUrl": "https://youtu.be/abc123",
      "rewardSent": false
    }
  ],
  "total": 1
}
```

### POST /api/sheet/videos/:videoId/reward-sent

```typescript
// 요청
{
  "reward": 0.85,
  "breakdown": {
    "ctr_score": 0.15,
    "watch_score": 0.26,
    "engagement_score": 0.18,
    "growth_score": 0.14
  }
}

// 응답
{
  "success": true,
  "videoId": "abc123",
  "rewardSent": true,
  "rewardSentAt": "2025-01-08T18:00:00Z"
}
```

---

## N8N 워크플로우 설계

### 워크플로우 1: 비디오 생성 (10:00)

```
Schedule Trigger (10:00)
    ↓
Set Variables (토픽: "한강 야경")
    ↓
HTTP Request → HFBPO /generate
    ↓
Set Variables (prompt, combination_key 추출)
    ↓
HTTP Request → ShortVideoMaker /api/video/consistent-shorts
    { scenes: [...], hfbpo: { combinationKey: "..." } }
    ↓
IF success → Slack 알림
```

### 워크플로우 2: 보상 업데이트 (18:00)

```
Schedule Trigger (18:00)
    ↓
HTTP Request → ShortVideoMaker /api/sheet/videos?rewardSent=false&minAge=6h
    ↓
Loop Items
    │
    ├─► HTTP Request → ShortVideoMaker /api/analytics/video/:videoId
    │       ↓
    ├─► HTTP Request → HFBPO /calculate-reward
    │       ↓
    ├─► HTTP Request → HFBPO /reward
    │       ↓
    └─► HTTP Request → ShortVideoMaker /api/sheet/videos/:videoId/reward-sent
```

---

## 구현 순서

### Phase 1 (즉시)
1. [ ] YTB-sheet/types/index.ts - HFBPO 필드 추가
2. [ ] SHEET_HEADERS 업데이트

### Phase 2 (다음)
3. [ ] consistent-shorts API - hfbpo 파라미터 수신
4. [ ] GoogleSheetsService - combinationKey 저장

### Phase 3 (개선)
5. [ ] sheetRoutes - 보상 필터 쿼리 추가
6. [ ] sheetRoutes - reward-sent 엔드포인트 추가

---

## 보상 계산 공식 (HFBPO)

```
reward = 0.20 * CTR_score      # 5% CTR = 1.0
       + 0.40 * watch_score    # 100% 시청 = 1.0
       + 0.20 * engagement     # 10% 참여율 = 1.0
       + 0.20 * growth         # 10명 구독 = 1.0
```

YTB-sheet의 기존 필드 매핑:
- `retentionScore` → watch_score
- `engagementScore` → engagement
- `growthScore` → growth
- `totalReward` → reward

---

Last Updated: 2026-01-08
