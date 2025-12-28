# Video Source 전환 가이드 (VEO ↔ Runway)

> 날짜: 2025-12-28
> 목적: n8n 자동화 연동을 위한 비디오 소스 전환 가이드

---

## 개요

Google VEO API의 할당량 제한(429 RESOURCE_EXHAUSTED)에 대응하기 위해 **Runway Gen-3 Alpha Turbo**를 대체 프로바이더로 사용할 수 있습니다.

---

## 현재 상태 확인

### 서버 상태
```bash
# Base URL
https://short-video-maker-7qtnitbuvq-uc.a.run.app

# Health Check
curl https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/health
```

### 현재 VIDEO_SOURCE 확인
```bash
gcloud run services describe short-video-maker \
  --region=us-central1 \
  --format="value(spec.template.spec.containers[0].env)"
```

---

## 전환 명령어

### VEO → Runway 전환 (429 할당량 초과 시)
```bash
gcloud run services update short-video-maker \
  --set-env-vars="VIDEO_SOURCE=runway" \
  --region=us-central1
```

### Runway → VEO 복귀 (할당량 복구 후)
```bash
gcloud run services update short-video-maker \
  --set-env-vars="VIDEO_SOURCE=veo" \
  --region=us-central1
```

---

## API 비교

| 항목 | VEO 3.1 (Google) | Runway Gen-3 Turbo |
|------|------------------|-------------------|
| First+Last Frame 지원 | O | O |
| 가격 (5초) | ~$0.10 | $0.25 |
| 가격 (10초) | ~$0.20 | $0.50 |
| 해상도 | 720p/1080p | 720p |
| Ratio 포맷 | `9:16`, `16:9` | `768:1280`, `1280:768` |
| API 할당량 | 제한적 (분당/일당 제한) | 크레딧 기반 (무제한) |
| 생성 시간 | ~30-60초 | ~60-90초 |

---

## n8n 연동 가이드

### 1. 비디오 생성 요청 (동일 API)
```json
POST /api/video/consistent-shorts
Content-Type: application/json

{
  "characterReference": {
    "profileId": "cat-couple",
    "characterIds": ["kami", "dalgi"]
  },
  "scenes": [
    {
      "text": "까미가 방에 들어온다",
      "scenePrompt": "Black cat entering room",
      "characterIds": ["kami"],
      "soundEffect": {
        "type": "freesound",
        "query": "cat footsteps"
      }
    }
  ],
  "config": {
    "orientation": "portrait",
    "generateVideos": true,
    "useFrameInterpolation": true,
    "dualSubtitles": true,
    "bgm": {
      "preset": "CAT_CUTE"
    }
  }
}
```

### 2. 상태 폴링
```
GET /api/video/consistent-shorts/{videoId}/status
```

**응답 예시:**
```json
{
  "videoId": "cmjpd2dfl00000es66q8o1y59",
  "status": "ready",
  "progress": 100,
  "videoUrl": "https://storage.googleapis.com/...",
  "fileSize": 1486281
}
```

### 3. 429 에러 감지 및 자동 전환 (n8n 워크플로우)

```
IF 에러코드 == 429 OR 에러메시지.contains("RESOURCE_EXHAUSTED"):
  1. gcloud run services update → VIDEO_SOURCE=runway
  2. 30초 대기 (서비스 재시작)
  3. 비디오 생성 재시도
  4. 성공 후 → VIDEO_SOURCE=veo 로 복구 (선택)
```

### 4. n8n HTTP Request 노드 설정

**비디오 생성:**
- Method: POST
- URL: `https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts`
- Authentication: None (내부 API)
- Body: JSON

**상태 확인:**
- Method: GET
- URL: `https://short-video-maker-7qtnitbuvq-uc.a.run.app/api/video/consistent-shorts/{{ $json.videoId }}/status`

---

## Secret Manager 키

| 키 이름 | 용도 |
|---------|------|
| `GOOGLE_GEMINI_API_KEY` | VEO 3.1 API |
| `RUNWAY_API_KEY` | Runway Gen-3 Turbo API |
| `PEXELS_API_KEY` | Pexels 스톡 영상 (fallback) |
| `ELEVENLABS_API_KEY` | TTS 음성 생성 |
| `FREESOUND_API_KEY` | 효과음 검색 |

---

## 트러블슈팅

### VEO 429 에러
```
Error: 429 RESOURCE_EXHAUSTED: Quota exceeded
```
→ Runway로 전환: `VIDEO_SOURCE=runway`

### Runway 401 에러
```
Runway API error: 401 - Unauthorized
```
→ RUNWAY_API_KEY 확인: `gcloud secrets versions access latest --secret=RUNWAY_API_KEY`

### 서비스 재시작 필요 시
```bash
gcloud run services update short-video-maker \
  --region=us-central1 \
  --no-traffic
gcloud run services update short-video-maker \
  --region=us-central1 \
  --to-latest
```

---

## 테스트 결과 (2025-12-28)

### Runway 테스트 성공
- **Video ID**: `cmjpd2dfl00000es66q8o1y59`
- **로컬 파일**: `test-outputs/runway-test-2025-12-28.mp4`
- **포함 기능**:
  - 캐릭터 일관성 (kami, dalgi)
  - Frame Interpolation
  - 한글 이중 자막
  - 효과음 (Freesound)
  - BGM (CAT_CUTE)

---

## 빠른 참조

```bash
# Runway로 전환
gcloud run services update short-video-maker --set-env-vars="VIDEO_SOURCE=runway" --region=us-central1

# VEO로 복귀
gcloud run services update short-video-maker --set-env-vars="VIDEO_SOURCE=veo" --region=us-central1

# 현재 상태 확인
gcloud run services describe short-video-maker --region=us-central1 --format="value(spec.template.spec.containers[0].env)" | grep VIDEO_SOURCE
```
