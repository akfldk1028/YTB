# Runway Gen-3 Alpha Turbo API Integration

> 날짜: 2025-12-28
> 작업자: Claude AI
> 목적: Google VEO 대안으로 Runway API 통합

---

## 개요

Google VEO API의 할당량 제한(429 Quota Exceeded)에 대응하기 위해 **Runway Gen-3 Alpha Turbo**를 대체 비디오 생성 프로바이더로 추가했습니다.

### 핵심 특징

| 항목 | VEO 3.1 | Runway Gen-3 Turbo |
|------|---------|-------------------|
| First+Last Frame 지원 | O | O |
| 가격 (5초) | ~$0.10 | $0.25 |
| 가격 (10초) | ~$0.20 | $0.50 |
| 해상도 | 720p/1080p | 720p |
| API 할당량 | 제한적 | 크레딧 기반 |

---

## 구현 내용

### 1. 신규 파일

**`src/short-creator/libraries/RunwayAPI.ts`** (~330 lines)
```typescript
export class RunwayAPI {
  private apiKey: string;
  private baseUrl = 'https://api.dev.runwayml.com/v1';
  private apiVersion = '2024-11-06';

  constructor(apiKey: string) { ... }

  // GoogleVeoAPI와 동일한 인터페이스
  async findVideo(
    searchTerms: string[],
    minDurationSeconds: number,
    excludeIds: string[],
    orientation: OrientationEnum,
    timeout: number,
    retryCounter: number,
    initialImage?: { data: string; mimeType: string },
    lastImage?: { data: string; mimeType: string }
  ): Promise<Video> { ... }

  supportsFrameInterpolation(): boolean {
    return true; // Gen-3 Turbo always supports keyframes
  }
}
```

### 2. 수정된 파일

#### `src/config.ts`
```typescript
// 추가된 속성
public runwayApiKey?: string;
public videoSource: "pexels" | "veo" | "runway" | "leonardo" | "both" | "ffmpeg";

// 생성자에서 환경변수 로드
this.runwayApiKey = process.env.RUNWAY_API_KEY;

// 유효성 검사
if (this.videoSource === "runway") {
  if (!this.runwayApiKey) {
    throw new Error("RUNWAY_API_KEY environment variable is missing...");
  }
}
```

#### `src/index.ts`
```typescript
// Import 추가
import { RunwayAPI } from "./short-creator/libraries/RunwayAPI";

// 타입 변경
let veoApi: GoogleVeoAPI | RunwayAPI | null = null;

// Runway 초기화 블록 추가
if (config.videoSource === "runway") {
  if (config.runwayApiKey) {
    veoApi = new RunwayAPI(config.runwayApiKey);
  }
}
```

#### `src/short-creator/ShortCreatorRefactored.ts`
```typescript
// Import 추가
import { RunwayAPI } from "./libraries/RunwayAPI";

// 생성자 타입 변경
private googleVeoApi?: GoogleVeoAPI | RunwayAPI,
```

#### `src/short-creator/workflows/ConsistentShortsWorkflow.ts`
```typescript
// Import 추가
import { RunwayAPI } from "../libraries/RunwayAPI";

// 생성자 타입 변경
private veoAPI?: GoogleVeoAPI | RunwayAPI,
```

#### `cloudbuild.yaml`
```yaml
- '--set-secrets'
- 'PEXELS_API_KEY=...,RUNWAY_API_KEY=RUNWAY_API_KEY:latest'
```

---

## 사용 방법

### 1. 환경변수 설정

```bash
# .env 파일
RUNWAY_API_KEY=key_05e99e7c...
VIDEO_SOURCE=runway  # veo 대신 runway 사용
```

### 2. GCP Secret Manager 설정 (배포용)

```bash
# Runway API 키를 Secret Manager에 등록
echo -n "YOUR_RUNWAY_API_KEY" | gcloud secrets create RUNWAY_API_KEY --data-file=-

# Cloud Run 서비스 계정에 접근 권한 부여
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 3. 프로바이더 전환

```bash
# VEO 사용 (기본)
VIDEO_SOURCE=veo

# Runway 사용
VIDEO_SOURCE=runway

# VEO 할당량 초과 시 → Runway로 전환
gcloud run services update short-video-maker \
  --set-env-vars="VIDEO_SOURCE=runway" \
  --region=us-central1
```

---

## API 비교

### VEO 3.1 (Google)
```json
{
  "model": "veo-3.1-generate-preview",
  "instances": [{
    "prompt": "...",
    "image": { "bytesBase64Encoded": "..." }
  }],
  "parameters": {
    "sampleCount": 1,
    "aspectRatio": "9:16",
    "personGeneration": "allow_adult"
  }
}
```

### Runway Gen-3 Turbo
```json
{
  "model": "gen3a_turbo",
  "promptText": "...",
  "ratio": "720:1280",
  "duration": 5,
  "promptImage": "data:image/png;base64,...",
  "keyframes": [
    { "image": "...", "timestamp": 0 },
    { "image": "...", "timestamp": 1 }
  ]
}
```

---

## 주의사항

### 1. Runway 제한사항
- **Prompt 길이**: 최대 512자
- **Duration**: 5초 또는 10초만 지원
- **해상도**: 720p (portrait: 720x1280)
- **Keyframes**: first, middle, last 3개 지점 지원

### 2. 비용 고려
- Runway는 크레딧 기반 (https://app.runwayml.com/)
- 5초 영상 = $0.25, 10초 영상 = $0.50
- VEO보다 비싸지만 할당량 제한 없음

### 3. 인터페이스 호환성
- `findVideo()` 메서드 시그니처 동일
- `supportsFrameInterpolation()` 지원
- ConsistentShortsWorkflow 코드 변경 없이 작동

---

## 트러블슈팅

### Runway API 오류
```
Runway API error: 401 - Unauthorized
```
→ API 키 확인, https://app.runwayml.com/account/api-keys

### Keyframes 오류
```
Runway task failed: Invalid keyframes format
```
→ timestamp는 0~1 범위, image는 data URI 형식 필수

### 할당량 전환
```bash
# VEO 429 발생 시 → Runway로 임시 전환
gcloud run services update short-video-maker \
  --set-env-vars="VIDEO_SOURCE=runway"

# 할당량 복구 후 → VEO로 복귀
gcloud run services update short-video-maker \
  --set-env-vars="VIDEO_SOURCE=veo"
```

---

## 참고 자료

- [Runway API Documentation](https://docs.dev.runwayml.com/)
- [Runway API Keys](https://app.runwayml.com/account/api-keys)
- [Google VEO Documentation](https://cloud.google.com/vertex-ai/generative-ai/docs/video/video-generation)

---

## 체크리스트

- [x] RunwayAPI.ts 생성
- [x] config.ts 수정 (runwayApiKey, videoSource)
- [x] cloudbuild.yaml 시크릿 추가
- [x] index.ts 초기화 로직
- [x] ShortCreatorRefactored.ts 타입 업데이트
- [x] ConsistentShortsWorkflow.ts 타입 업데이트
- [ ] GCP Secret Manager에 RUNWAY_API_KEY 등록
- [ ] 로컬 테스트
- [ ] 프로덕션 배포

---

## 메모리 태그

`ytb, runway, veo, video-api, gen3-turbo, fallback`
